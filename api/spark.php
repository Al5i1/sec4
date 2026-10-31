<?php
/* ═══════════════════════════════════════════════════════════════════
   api/spark.php — SPARK Subscription Codes & Atomic Activation Engine
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

/* ── Helper: Generate Cryptographically Secure Random Code ── */
function generateSecureSparkCode(string $prefix = 'SPARK'): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $part1 = '';
    $part2 = '';
    for ($i = 0; $i < 4; $i++) $part1 .= $chars[random_int(0, strlen($chars) - 1)];
    for ($i = 0; $i < 4; $i++) $part2 .= $chars[random_int(0, strlen($chars) - 1)];
    return strtoupper($prefix) . '-' . $part1 . '-' . $part2;
}

/* ── GET: Check Student Status OR Admin List All Codes ── */
if ($method === 'GET') {
    $user = requireAuth();
    $uid  = (int)$user['id'];
    $mode = $_GET['mode'] ?? 'status';

    /* 1. Check current user's SPARK subscription status */
    if ($mode === 'status') {
        $subscribed = hasSparkSubscription($uid, $user['role']);
        $subInfo = null;
        if ($subscribed && $user['role'] !== 'admin') {
            $res = $db->query("
                SELECT ss.activated_at, sc.code
                FROM spark_subscriptions ss
                INNER JOIN spark_codes sc ON sc.id = ss.code_id
                WHERE ss.user_id = $uid
                LIMIT 1
            ");
            if ($res) $subInfo = $res->fetch_assoc();
        }
        exit(json_encode([
            'success'      => true,
            'subscribed'   => $subscribed,
            'subscription' => $subInfo,
            'watermark'    => $user['first_name'] . ' ' . $user['last_name'] . ' • ID#' . $uid
        ]));
    }

    /* 2. Admin: List all SPARK codes with student details */
    if ($mode === 'admin_list') {
        requireAdmin();
        $res = $db->query("
            SELECT sc.*,
                   CONCAT(u.first_name, ' ', u.last_name) AS student_name,
                   u.email AS student_email,
                   u.phone AS student_phone
            FROM spark_codes sc
            LEFT JOIN users u ON u.id = sc.used_by
            ORDER BY sc.created_at DESC, sc.id DESC
        ");
        $codes = [];
        $summary = ['total' => 0, 'available' => 0, 'used' => 0, 'disabled' => 0];
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $r['id']      = (int)$r['id'];
                $r['used_by'] = $r['used_by'] ? (int)$r['used_by'] : null;
                $codes[]      = $r;
                $summary['total']++;
                if (isset($summary[$r['status']])) $summary[$r['status']]++;
            }
        }
        exit(json_encode([
            'success' => true,
            'summary' => $summary,
            'codes'   => $codes
        ]));
    }
}

/* ── POST: Redeem Code (Student) OR Manage Codes (Admin) ── */
if ($method === 'POST') {
    $raw    = file_get_contents('php://input');
    $data   = json_decode($raw, true) ?? $_POST;
    $action = $data['action'] ?? '';

    /* ════════════════════════════════════════════════════════════════
       1. STUDENT ACTION: Atomic Code Activation (Redeem)
       ════════════════════════════════════════════════════════════════ */
    if ($action === 'redeem') {
        $user = requireAuth();
        $uid  = (int)$user['id'];
        $code = strtoupper(trim($data['code'] ?? ''));

        if ($code === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'يرجى إدخال كود الاشتراك.']));
        }

        /* If already subscribed, return immediately without consuming another code */
        if (hasSparkSubscription($uid, $user['role'])) {
            exit(json_encode([
                'success'    => true,
                'subscribed' => true,
                'message'    => 'حسابك مشترك ومفعّل بالفعل في قسم SPARK!'
            ]));
        }

        /* Begin Atomic Transaction with Row Locking (SELECT ... FOR UPDATE) */
        $db->begin_transaction();
        try {
            $stmt = $db->prepare("SELECT id, code, status, used_by FROM spark_codes WHERE code = ? LIMIT 1 FOR UPDATE");
            $stmt->bind_param('s', $code);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row) {
                $db->rollback();
                http_response_code(404);
                exit(json_encode(['success' => false, 'message' => '❌ الكود الذي أدخلته غير صحيح. تأكد من كتابته بشكل سليم.']));
            }

            if ($row['status'] === 'used' || $row['used_by'] !== null) {
                $db->rollback();
                http_response_code(409);
                exit(json_encode(['success' => false, 'message' => '⚠️ هذا الكود سبق استخدامه ولا يمكن استخدامه مرة أخرى.']));
            }

            if ($row['status'] === 'disabled') {
                $db->rollback();
                http_response_code(403);
                exit(json_encode(['success' => false, 'message' => '🚫 هذا الكود معطّل من قِبل الإدارة.']));
            }

            $codeId = (int)$row['id'];

            /* Mark code as used by this student */
            $upStmt = $db->prepare("UPDATE spark_codes SET status = 'used', used_by = ?, used_at = NOW() WHERE id = ? AND status = 'available'");
            $upStmt->bind_param('ii', $uid, $codeId);
            $upStmt->execute();
            if ($upStmt->affected_rows !== 1) {
                $upStmt->close();
                $db->rollback();
                http_response_code(409);
                exit(json_encode(['success' => false, 'message' => '⚠️ تعذّر تفعيل الكود لأنه استُخدم للتو.']));
            }
            $upStmt->close();

            /* Create permanent subscription record linked to user_id */
            $subStmt = $db->prepare("INSERT INTO spark_subscriptions (user_id, code_id, activated_at) VALUES (?, ?, NOW())");
            $subStmt->bind_param('ii', $uid, $codeId);
            if (!$subStmt->execute()) {
                $subStmt->close();
                $db->rollback();
                http_response_code(500);
                exit(json_encode(['success' => false, 'message' => 'حدث خطأ أثناء تفعيل الاشتراك، لم يتم استهلاك الكود.']));
            }
            $subStmt->close();

            $db->commit();

            exit(json_encode([
                'success'    => true,
                'subscribed' => true,
                'message'    => '🎉 تم تفعيل اشتراكك في قسم SPARK بنجاح وبشكل دائم!'
            ]));
        } catch (Throwable $e) {
            $db->rollback();
            http_response_code(500);
            exit(json_encode(['success' => false, 'message' => 'خطأ في الخادم، لم يتم استهلاك الكود.']));
        }
    }

    /* ════════════════════════════════════════════════════════════════
       2. ADMIN ACTIONS: Generate / Custom / Disable / Delete Codes
       ════════════════════════════════════════════════════════════════ */
    requireAdmin();

    /* Generate single, bulk, or custom code */
    if ($action === 'generate') {
        $customCode = strtoupper(trim($data['custom_code'] ?? ''));
        $count      = min(100, max(1, intval($data['count'] ?? 1)));
        $prefix     = strtoupper(trim($data['prefix'] ?? 'SPARK')) ?: 'SPARK';
        $created    = [];

        if ($customCode !== '') {
            $stmt = $db->prepare("INSERT INTO spark_codes (code, status) VALUES (?, 'available')");
            $stmt->bind_param('s', $customCode);
            if (!$stmt->execute()) {
                $stmt->close();
                http_response_code(409);
                exit(json_encode(['success' => false, 'message' => 'هذا الكود موجود مسبقاً! اختر كوداً آخر.']));
            }
            $stmt->close();
            $created[] = $customCode;
        } else {
            $stmt = $db->prepare("INSERT IGNORE INTO spark_codes (code, status) VALUES (?, 'available')");
            $attempts = 0;
            while (count($created) < $count && $attempts < $count * 4) {
                $attempts++;
                $newCode = generateSecureSparkCode($prefix);
                $stmt->bind_param('s', $newCode);
                if ($stmt->execute() && $stmt->affected_rows > 0) {
                    $created[] = $newCode;
                }
            }
            $stmt->close();
        }

        exit(json_encode([
            'success' => true,
            'message' => '✅ تم إنشاء ' . count($created) . ' كود اشتراك بنجاح!',
            'codes'   => $created
        ]));
    }

    /* Toggle disable / enable an unused code */
    if ($action === 'toggle_status') {
        $id = intval($data['id'] ?? 0);
        $res = $db->query("SELECT id, status FROM spark_codes WHERE id = $id LIMIT 1");
        $row = $res ? $res->fetch_assoc() : null;
        if (!$row) {
            http_response_code(404);
            exit(json_encode(['success' => false, 'message' => 'الكود غير موجود.']));
        }
        if ($row['status'] === 'used') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'لا يمكن تعطيل كود تم استخدامه بالفعل.']));
        }
        $newStatus = ($row['status'] === 'available') ? 'disabled' : 'available';
        $stmt = $db->prepare("UPDATE spark_codes SET status = ? WHERE id = ?");
        $stmt->bind_param('si', $newStatus, $id);
        $stmt->execute();
        $stmt->close();

        exit(json_encode([
            'success'    => true,
            'new_status' => $newStatus,
            'message'    => $newStatus === 'disabled' ? '🚫 تم تعطيل الكود.' : '✅ تم إعادة تفعيل الكود.'
        ]));
    }

    /* Delete an unused code */
    if ($action === 'delete') {
        $id = intval($data['id'] ?? 0);
        $res = $db->query("SELECT status FROM spark_codes WHERE id = $id LIMIT 1");
        $row = $res ? $res->fetch_assoc() : null;
        if (!$row) {
            http_response_code(404);
            exit(json_encode(['success' => false, 'message' => 'الكود غير موجود.']));
        }
        if ($row['status'] === 'used') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'لا يمكن حذف كود مستخدم مرتبط بحساب طالب.']));
        }
        $db->query("DELETE FROM spark_codes WHERE id = $id");
        exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف الكود غير المستخدم.']));
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
