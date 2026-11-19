/* ═══════════════════════════════════════════════════════════════════
   Node.js Standalone Cloud Worker (Railway / Render / Fly.io / VPS)
   - Runs 24/7 completely independent of user browser/laptop
   - Polls Blackboard Learn REST API every 5 minutes (configurable)
   - Decrypts stored credentials via AES-256-GCM from PostgreSQL
   - Uploads new/updated files to S3 / Cloudflare R2 / Supabase Storage
   - Exposes a signed POST /webhook/blackboard endpoint for real-time events
   ═══════════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import express from 'express';
import cron from 'node-cron';
import pg from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  PORT = 8080,
  DATABASE_URL,
  BB_ENCRYPTION_KEY,     // 64 hex chars (32 bytes)
  BB_WEBHOOK_SECRET,
  POLL_CRON = '*/5 * * * *', // Every 5 minutes
  S3_ENDPOINT,
  S3_REGION = 'auto',
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY
} = process.env;

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID || '',
    secretAccessKey: S3_SECRET_ACCESS_KEY || ''
  }
});

const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
  'mp3', 'wav', 'mp4', 'mov', 'png', 'jpg', 'jpeg', 'webp', 'zip', 'txt'
]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/* ── AES-256-GCM Encrypt / Decrypt Helpers ── */
export function encryptSecret(obj) {
  const key = Buffer.from(BB_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted_secret: Buffer.concat([enc, tag]).toString('base64'),
    iv_b64: iv.toString('base64')
  };
}

function decryptSecret(cipherB64, ivB64) {
  const key = Buffer.from(BB_ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(cipherB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function detectSubject(code = '', name = '') {
  const s = `${code} ${name}`.toUpperCase();
  if (/011|ENG\s*11|READING/.test(s)) return 'ENG11';
  if (/012|ENG\s*12|WRITING|GRAMMAR/.test(s)) return 'ENG12';
  if (/013|ENG\s*13|LISTENING|SPEAKING/.test(s)) return 'ENG13';
  if (/014|ENG\s*14|DIGITAL/.test(s)) return 'ENG14';
  if (/SSO|STUDY\s*SKILLS/.test(s)) return 'SSO';
  return 'ENG13';
}

async function getBbHeaders(baseUrl, authMode, secret) {
  if (authMode === 'oauth2') {
    const body = secret.refresh_token
      ? new URLSearchParams({ grant_type: 'refresh_token', refresh_token: secret.refresh_token })
      : new URLSearchParams({ grant_type: 'client_credentials' });
    const basic = Buffer.from(`${secret.client_id}:${secret.client_secret}`).toString('base64');
    const r = await fetch(`${baseUrl}/learn/api/public/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!r.ok) throw new Error(`BB_AUTH_EXPIRED: OAuth2 HTTP ${r.status}`);
    const j = await r.json();
    return { Authorization: `Bearer ${j.access_token}`, Accept: 'application/json' };
  }
  return { Cookie: secret.cookie_header || '', Accept: 'application/json' };
}

async function bbJson(url, headers) {
  const r = await fetch(url, { headers });
  if (r.status === 401 || r.status === 403) throw new Error(`BB_AUTH_EXPIRED: HTTP ${r.status}`);
  if (!r.ok) return null;
  if (!(r.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('BB_AUTH_EXPIRED: Session redirected to SSO');
  }
  return r.json();
}

let isSyncRunning = false;

async function runSync(trigger = 'cron') {
  if (isSyncRunning) return { skipped: true, reason: 'Sync already in progress' };
  isSyncRunning = true;
  const started = Date.now();
  const stats = { courses_scanned: 0, folders_upserted: 0, files_added: 0, files_updated: 0, files_skipped: 0 };

  try {
    const { rows } = await pool.query(`SELECT * FROM bb_credentials WHERE status = 'active' LIMIT 1`);
    if (!rows.length) return { ok: false, message: 'No active credentials' };
    const cred = rows[0];
    const baseUrl = cred.bb_base_url.replace(/\/+$/, '');
    const secret = decryptSecret(cred.encrypted_secret, cred.iv_b64);
    const headers = await getBbHeaders(baseUrl, cred.auth_mode, secret);

    const courses = (await bbJson(`${baseUrl}/learn/api/public/v1/users/me/courses?expand=course&limit=50`, headers))?.results || [];

    for (const m of courses) {
      const course = m.course || {};
      const courseId = course.id || m.courseId;
      if (!courseId) continue;
      stats.courses_scanned++;
      const subject = detectSubject(course.courseId, course.name);

      async function walk(items, parentFolderId) {
        let sortOrder = 1;
        for (const item of items) {
          const title = (item.title || '').trim();
          const bbMod = item.modified || item.created || null;

          if (item.hasChildren) {
            const children = (await bbJson(`${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/children?limit=100`, headers))?.results || [];
            if (children.length && title !== 'ultraDocumentBody') {
              const fRes = await pool.query(
                `INSERT INTO bb_folders (bb_course_id, bb_content_id, subject, parent_id, name, sort_order, bb_modified_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                 ON CONFLICT (bb_course_id, bb_content_id)
                 DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, bb_modified_at = EXCLUDED.bb_modified_at, updated_at = NOW()
                 RETURNING id`,
                [courseId, item.id, subject, parentFolderId, title, sortOrder++, bbMod]
              );
              stats.folders_upserted++;
              await walk(children, fRes.rows[0].id);
            }
          }

          const atts = (await bbJson(`${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments`, headers))?.results || [];
          for (const att of atts) {
            const rawName = att.fileName || `${title}.pdf`;
            const ext = (rawName.split('.').pop() || 'pdf').toLowerCase();
            if (!ALLOWED_EXTS.has(ext)) { stats.files_skipped++; continue; }

            // Check Content ID + Attachment ID + Modified Date to avoid duplicates
            const ex = await pool.query(
              `SELECT id, bb_modified_at FROM bb_files WHERE bb_course_id=$1 AND bb_content_id=$2 AND bb_attachment_id=$3`,
              [courseId, item.id, att.id]
            );
            const existing = ex.rows[0];
            if (existing && (!bbMod || (existing.bb_modified_at && new Date(existing.bb_modified_at).getTime() === new Date(bbMod).getTime()))) {
              stats.files_skipped++;
              continue;
            }

            const dlUrl = `${baseUrl}/learn/api/public/v1/courses/${courseId}/contents/${item.id}/attachments/${att.id}/download`;
            const dlRes = await fetch(dlUrl, { headers, redirect: 'follow' });
            if (!dlRes.ok) { stats.files_skipped++; continue; }
            const buf = Buffer.from(await dlRes.arrayBuffer());
            if (!buf.length || buf.length > MAX_FILE_BYTES) { stats.files_skipped++; continue; }

            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            const safeName = rawName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF ]/g, '_');
            const storageKey = `blackboard/${subject}/${courseId}/${item.id}_${att.id}_${safeName}`;

            await s3.send(new PutObjectCommand({
              Bucket: S3_BUCKET,
              Key: storageKey,
              Body: buf,
              ContentType: att.mimeType || 'application/octet-stream'
            }));

            await pool.query(
              `INSERT INTO bb_files
                (bb_course_id, bb_content_id, bb_attachment_id, bb_modified_at, subject, folder_id,
                 title, description, original_name, storage_bucket, storage_path, external_url,
                 file_size, mime_type, extension, content_sha256, sort_order, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
               ON CONFLICT (bb_course_id, bb_content_id, bb_attachment_id)
               DO UPDATE SET
                 bb_modified_at=EXCLUDED.bb_modified_at, title=EXCLUDED.title,
                 storage_path=EXCLUDED.storage_path, file_size=EXCLUDED.file_size,
                 content_sha256=EXCLUDED.content_sha256, updated_at=NOW()`,
              [
                courseId, item.id, att.id, bbMod, subject, parentFolderId,
                title || rawName, `مرفوع تلقائياً من البلاكبورد (${course.name || subject})`,
                rawName, S3_BUCKET, storageKey, dlUrl,
                buf.length, att.mimeType || 'application/octet-stream', ext, sha256, sortOrder++
              ]
            );
            if (existing) stats.files_updated++;
            else stats.files_added++;
          }
        }
      }

      const top = (await bbJson(`${baseUrl}/learn/api/public/v1/courses/${courseId}/contents?limit=100`, headers))?.results || [];
      await walk(top, null);
    }

    await pool.query(`UPDATE bb_credentials SET last_synced_at = NOW(), last_error = NULL WHERE id = $1`, [cred.id]);
    await pool.query(
      `INSERT INTO bb_sync_logs (trigger_source, status, courses_scanned, folders_upserted, files_added, files_updated, files_skipped, duration_ms)
       VALUES ($1,'success',$2,$3,$4,$5,$6,$7)`,
      [trigger, stats.courses_scanned, stats.folders_upserted, stats.files_added, stats.files_updated, stats.files_skipped, Date.now() - started]
    );
    return { ok: true, stats };
  } catch (err) {
    const msg = String(err?.message || err);
    const expired = msg.includes('BB_AUTH_EXPIRED');
    if (expired) {
      await pool.query(`UPDATE bb_credentials SET status='expired', last_error=$1 WHERE status='active'`, [msg]);
    }
    await pool.query(
      `INSERT INTO bb_sync_logs (trigger_source, status, error_message, duration_ms) VALUES ($1,$2,$3,$4)`,
      [trigger, expired ? 'auth_expired' : 'error', msg.slice(0, 500), Date.now() - started]
    );
    return { ok: false, error: msg };
  } finally {
    isSyncRunning = false;
  }
}

/* ── HTTP Server (Health Check + Signed Webhook Endpoint) ── */
const app = express();
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'sec4-bb-sync-worker' }));

app.post('/webhook/blackboard', async (req, res) => {
  const sig = (req.headers['x-bb-signature'] || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', BB_WEBHOOK_SECRET || '').update(req.rawBody || '').digest('hex');
  if (!BB_WEBHOOK_SECRET || !sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const result = await runSync('webhook');
  res.json({ received: true, result });
});

// Start 24/7 Polling Cron Job (every 5 minutes by default)
cron.schedule(POLL_CRON, () => {
  runSync('cron').then(r => console.log('[SEC4 Cron Sync]', JSON.stringify(r)));
});

app.listen(PORT, () => console.log(`SEC4 Cloud Blackboard Worker running on port ${PORT} (cron: ${POLL_CRON})`));
