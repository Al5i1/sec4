// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: bb-sync-worker
// 100% Server-Side Cloud Sync Worker for Blackboard Learn Ultra
// Runs 24/7 via pg_cron (every 1-5 mins) or Webhook/Manual Trigger
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_KEY_HEX    = Deno.env.get("BB_ENCRYPTION_KEY")!; // 64 hex chars (32 bytes)
const CRON_SECRET           = Deno.env.get("CRON_SECRET")!;
const ALERT_WEBHOOK_URL     = Deno.env.get("ALERT_WEBHOOK_URL") || ""; // Optional email/WhatsApp alert

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "mp3", "wav", "mp4", "mov", "png", "jpg", "jpeg", "webp", "zip", "txt"
]);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

/* ── AES-256-GCM Decryption for Stored Blackboard Credentials ── */
async function decryptSecret(cipherB64: string, ivB64: string): Promise<Record<string, string>> {
  const keyBytes = new Uint8Array(ENCRYPTION_KEY_HEX.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipherBytes);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function detectSubject(courseCode: string, courseName: string): string {
  const s = `${courseCode} ${courseName}`.toUpperCase();
  if (/011|ENG\s*11|READING\s*&\s*VOCAB/.test(s)) return "ENG11";
  if (/012|ENG\s*12|WRITING|GRAMMAR/.test(s)) return "ENG12";
  if (/013|ENG\s*13|LISTENING\s*&\s*SPEAKING/.test(s)) return "ENG13";
  if (/014|ENG\s*14|DIGITAL|INTEGRATED/.test(s)) return "ENG14";
  if (/SSO|STUDY\s*SKILLS|ORIENTATION/.test(s)) return "SSO";
  return "ENG13";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF ]/g, "_").trim();
}

/* ── Build Blackboard Auth Headers (Supports OAuth2 Bearer OR Session Cookie) ── */
async function buildBbAuthHeaders(
  baseUrl: string,
  authMode: string,
  secret: Record<string, string>
): Promise<Record<string, string>> {
  if (authMode === "oauth2") {
    // Exchange client_credentials or refresh_token for a fresh Bearer token
    const tokenUrl = `${baseUrl}/learn/api/public/v1/oauth2/token`;
    const body = secret.refresh_token
      ? new URLSearchParams({ grant_type: "refresh_token", refresh_token: secret.refresh_token })
      : new URLSearchParams({ grant_type: "client_credentials" });

    const basic = btoa(`${secret.client_id}:${secret.client_secret}`);
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!res.ok) throw new Error(`BB_AUTH_EXPIRED: OAuth2 HTTP ${res.status}`);
    const tok = await res.json();
    return {
      Authorization: `Bearer ${tok.access_token}`,
      Accept: "application/json"
    };
  }

  // Fallback for Student SSO accounts (encrypted cookie header)
  return {
    Cookie: secret.cookie_header || "",
    Accept: "application/json",
    "User-Agent": "SEC4-CloudSync/2.0"
  };
}

async function bbFetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`BB_AUTH_EXPIRED: HTTP ${res.status} on ${url}`);
  }
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("BB_AUTH_EXPIRED: Redirected to SSO login page");
  }
  return res.json();
}

/* ── Main Sync Handler ── */
Deno.serve(async req => {
  // 1. Strict Server-to-Server Secret Verification
  const providedSecret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const startedAt = Date.now();
  const reqBody = await req.json().catch(() => ({}));
  const triggerSource = reqBody.trigger || "cron";

  const stats = {
    courses_scanned: 0,
    folders_upserted: 0,
    files_added: 0,
    files_updated: 0,
    files_skipped: 0
  };

  try {
    // 2. Load active encrypted Blackboard credentials from Vault table
    const { data: cred, error: credErr } = await supabase
      .from("bb_credentials")
      .select("*")
      .eq("status", "active")
      .limit(1)
      .single();

    if (credErr || !cred) {
      return new Response(JSON.stringify({ ok: false, message: "No active BB credentials" }), { status: 200 });
    }

    const baseUrl = cred.bb_base_url.replace(/\/+$/, "");
    const secret  = await decryptSecret(cred.encrypted_secret, cred.iv_b64);
    const headers = await buildBbAuthHeaders(baseUrl, cred.auth_mode, secret);

    // 3. Fetch enrolled courses
    const coursesData = await bbFetchJson(
      `${baseUrl}/learn/api/public/v1/users/me/courses?expand=course&limit=50`,
      headers
    );
    const memberships = coursesData?.results || [];

    for (const m of memberships) {
      const course = m.course || {};
      const courseId = course.id || m.courseId;
      if (!courseId) continue;
      stats.courses_scanned++;

      const subject = detectSubject(course.courseId || "", course.name || "");
      const topData = await bbFetchJson(
        `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents?limit=100`,
        headers
      );

      async function walkItems(items: any[], parentFolderId: number | null) {
        let sortIdx = 1;
        for (const item of items) {
          const title = (item.title || "").trim();
          const handlerId = item.contentHandler?.id || "";
          const bbModified = item.modified || item.created || null;

          // A. Handle Folders / Learning Modules
          if (item.hasChildren || handlerId.includes("folder") || handlerId.includes("lesson") || handlerId.includes("module")) {
            const childRes = await bbFetchJson(
              `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/children?limit=100`,
              headers
            );
            const children = childRes?.results || [];
            if (children.length > 0 && title !== "ultraDocumentBody") {
              const { data: folderRow } = await supabase
                .from("bb_folders")
                .upsert({
                  bb_course_id: courseId,
                  bb_content_id: item.id,
                  section: "blackboard",
                  subject,
                  parent_id: parentFolderId,
                  name: title,
                  sort_order: sortIdx++,
                  bb_modified_at: bbModified,
                  updated_at: new Date().toISOString()
                }, { onConflict: "bb_course_id,bb_content_id" })
                .select("id")
                .single();

              if (folderRow?.id) {
                stats.folders_upserted++;
                await walkItems(children, folderRow.id);
              }
            }
          }

          // B. Handle File Attachments
          const attRes = await bbFetchJson(
            `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments`,
            headers
          );
          const attachments = attRes?.results || [];

          for (const att of attachments) {
            const rawName = att.fileName || `${title}.pdf`;
            const ext = (rawName.split(".").pop() || "pdf").toLowerCase();
            if (!ALLOWED_EXTS.has(ext)) {
              stats.files_skipped++;
              continue;
            }

            // Deduplication check: Content ID + Attachment ID + Modified Date
            const { data: existing } = await supabase
              .from("bb_files")
              .select("id, bb_modified_at, storage_path")
              .eq("bb_course_id", courseId)
              .eq("bb_content_id", item.id)
              .eq("bb_attachment_id", att.id)
              .maybeSingle();

            const sameModified = existing &&
              existing.bb_modified_at &&
              bbModified &&
              new Date(existing.bb_modified_at).getTime() === new Date(bbModified).getTime();

            if (existing && (sameModified || !bbModified)) {
              stats.files_skipped++;
              continue;
            }

            // Download binary file server-side (automatically follows 302 to alt-learn CDN)
            const dlUrl = `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments/${att.id}/download`;
            const fileRes = await fetch(dlUrl, { headers, redirect: "follow" });
            if (!fileRes.ok) {
              stats.files_skipped++;
              continue;
            }

            const buf = await fileRes.arrayBuffer();
            if (buf.byteLength === 0 || buf.byteLength > MAX_FILE_BYTES) {
              stats.files_skipped++;
              continue;
            }

            const contentHash = await sha256Hex(buf);
            const safeName = sanitizeFileName(rawName);
            const storagePath = `${subject}/${courseId}/${item.id}_${att.id}_${safeName}`;

            // Upload binary directly to Supabase Storage (upsert = true overwrites updated version)
            const { error: upErr } = await supabase.storage
              .from("sec4-blackboard-files")
              .upload(storagePath, buf, {
                contentType: att.mimeType || "application/octet-stream",
                upsert: true
              });

            if (upErr) {
              console.error("Storage upload failed:", upErr.message);
              continue;
            }

            // Upsert file metadata into PostgreSQL so it appears instantly in the SEC4 UI
            await supabase.from("bb_files").upsert({
              bb_course_id: courseId,
              bb_content_id: item.id,
              bb_attachment_id: att.id,
              bb_modified_at: bbModified,
              section: "blackboard",
              subject,
              folder_id: parentFolderId,
              title: title || rawName.replace(/\.[^/.]+$/, ""),
              description: `مرفوع تلقائياً من البلاكبورد (${course.name || subject})`,
              original_name: rawName,
              storage_bucket: "sec4-blackboard-files",
              storage_path: storagePath,
              external_url: dlUrl,
              file_size: buf.byteLength,
              mime_type: att.mimeType || "application/octet-stream",
              extension: ext,
              content_sha256: contentHash,
              sort_order: sortIdx++,
              updated_at: new Date().toISOString()
            }, { onConflict: "bb_course_id,bb_content_id,bb_attachment_id" });

            if (existing) stats.files_updated++;
            else stats.files_added++;
          }
        }
      }

      await walkItems(topData?.results || [], null);
    }

    await supabase.from("bb_credentials").update({
      last_synced_at: new Date().toISOString(),
      last_error: null
    }).eq("id", cred.id);

    await supabase.from("bb_sync_logs").insert({
      trigger_source: triggerSource,
      status: "success",
      ...stats,
      duration_ms: Date.now() - startedAt
    });

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    const msg = String(err?.message || err);
    const isAuthExpired = msg.includes("BB_AUTH_EXPIRED");

    if (isAuthExpired) {
      await supabase.from("bb_credentials")
        .update({ status: "expired", last_error: msg })
        .eq("status", "active");

      // Notify Admin via Email/Webhook to refresh session
      if (ALERT_WEBHOOK_URL) {
        await fetch(ALERT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "aliabdulghani20071217@gmail.com",
            subject: "⚠️ تنبيه SEC4: انتهت جلسة مزامنة البلاكبورد السحابية",
            html: `<div dir="rtl">انتهت صلاحية جلسة البلاكبورد في السيرفر السحابي. يرجى تجديد التوكن من لوحة تحكم الأدمن لاستئناف المزامنة التلقائية.<br/>الخطأ: ${msg}</div>`
          })
        }).catch(() => {});
      }
    }

    await supabase.from("bb_sync_logs").insert({
      trigger_source: triggerSource,
      status: isAuthExpired ? "auth_expired" : "error",
      ...stats,
      duration_ms: Date.now() - startedAt,
      error_message: msg.slice(0, 500)
    });

    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
});
