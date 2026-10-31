<?php
/* ═══════════════════════════════════════════════════════════════════
   api/forgot_password.php — Password Recovery & Reset Verification
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['success' => false, 'message' => 'Method not allowed']));
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true) ?? $_POST;
$step = $data['step'] ?? 'verify';
$db   = getDB();

/* ── Step 1: Verify identity using Email + Phone (or Email + First Name) ── */
if ($step === 'verify') {
    $email = trim($data['email'] ?? '');
    $phone = trim($data['phone'] ?? '');

    if ($email === '' || $phone === '') {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'يرجى إدخال البريد الإلكتروني ورقم الهاتف المسجلين في حسابك للتحقق.']));
    }

    $stmt = $db->prepare("SELECT id, first_name, last_name, email, phone FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    /* Normalize phone comparison (match last 8 digits or exact match) */
    $cleanInputPhone = preg_replace('/[^0-9]/', '', $phone);
    $cleanDbPhone    = $user ? preg_replace('/[^0-9]/', '', (string)$user['phone']) : '';

    $phoneMatches = false;
    if ($user && $cleanInputPhone !== '' && $cleanDbPhone !== '') {
        if ($cleanInputPhone === $cleanDbPhone || substr($cleanDbPhone, -8) === substr($cleanInputPhone, -8)) {
            $phoneMatches = true;
        }
    }

    if (!$user || !$phoneMatches) {
        http_response_code(404);
        exit(json_encode(['success' => false, 'message' => '❌ لم يتم العثور على حساب يطابق هذا البريد الإلكتروني ورقم الهاتف معاً.']));
    }

    if (session_status() === PHP_SESSION_NONE) session_start();
    $_SESSION['reset_verified_uid']  = (int)$user['id'];
    $_SESSION['reset_verified_time'] = time();

    exit(json_encode([
        'success'   => true,
        'user_name' => $user['first_name'] . ' ' . $user['last_name'],
        'message'   => '✅ تم التحقق من هويتك بنجاح! يمكنك الآن تعيين كلمة مرور جديدة.'
    ]));
}

/* ── Step 2: Set New Password ── */
if ($step === 'reset') {
    if (session_status() === PHP_SESSION_NONE) session_start();
    $uid = (int)($_SESSION['reset_verified_uid'] ?? 0);
    $ts  = (int)($_SESSION['reset_verified_time'] ?? 0);

    if ($uid <= 0 || (time() - $ts) > 600) {
        http_response_code(403);
        exit(json_encode(['success' => false, 'message' => 'انتهت جلسة التحقق، يرجى إعادة المحاولة.']));
    }

    $newPass = $data['new_password'] ?? '';
    $confirm = $data['confirm_password'] ?? '';

    if (strlen($newPass) < 8) {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.']));
    }
    if ($newPass !== $confirm) {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'كلمتا المرور غير متطابقتين.']));
    }

    $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
    $stmt->bind_param('si', $hash, $uid);
    $stmt->execute();
    $stmt->close();

    unset($_SESSION['reset_verified_uid'], $_SESSION['reset_verified_time']);

    exit(json_encode([
        'success' => true,
        'message' => '🎉 تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.'
    ]));
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid step']);
