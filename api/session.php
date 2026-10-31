<?php
/* ═══════════════════════════════════════════════════
   api/session.php — Verify Session, Profile & Logout
   ═══════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];

/* ── GET: return current logged-in user from DB + SPARK subscription status ── */
if ($method === 'GET') {
    $user = requireAuth();
    $uid  = (int)$user['id'];
    $sparkSub = hasSparkSubscription($uid, $user['role']);

    exit(json_encode([
        'success' => true,
        'user' => [
            'id'               => $uid,
            'first_name'       => $user['first_name'],
            'last_name'        => $user['last_name'],
            'name'             => $user['first_name'] . ' ' . $user['last_name'],
            'email'            => $user['email'],
            'phone'            => $user['phone'],
            'role'             => $user['role'],
            'avatar'           => $user['avatar'],
            'spark_subscribed' => $sparkSub,
            'created_at'       => $user['created_at'],
        ]
    ]));
}

/* ── POST: update allowed profile info (avatar or password) or logout ── */
if ($method === 'POST') {
    $action = $_POST['action'] ?? ($_GET['action'] ?? '');

    if ($action === 'logout') {
        if (session_status() === PHP_SESSION_NONE) session_start();
        session_destroy();
        exit(json_encode(['success' => true, 'message' => 'تم تسجيل الخروج.']));
    }

    $user = requireAuth();
    $db   = getDB();
    $uid  = (int)$user['id'];

    /* Upload avatar image if provided */
    $avatarPath = $user['avatar'];
    if (!empty($_FILES['avatar']['name']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
        if ($_FILES['avatar']['size'] > 10 * 1024 * 1024) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'حجم الصورة يجب ألا يتجاوز 10 ميجابايت.']));
        }
        $ext = strtolower(pathinfo($_FILES['avatar']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg','jpeg','png','gif','webp'])) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'صيغة الصورة غير مدعومة (المسموح: JPG, PNG, WEBP, GIF).']));
        }
        $stored = 'avatar_' . $uid . '_' . time() . '.' . $ext;
        $destDir = __DIR__ . '/../uploads/avatars/';
        if (!is_dir($destDir)) mkdir($destDir, 0775, true);
        if (move_uploaded_file($_FILES['avatar']['tmp_name'], $destDir . $stored)) {
            $avatarPath = 'uploads/avatars/' . $stored;
        }
    }

    $firstName = trim($_POST['first_name'] ?? $user['first_name']);
    $lastName  = trim($_POST['last_name']  ?? $user['last_name']);
    $newPass   = $_POST['new_password'] ?? '';

    if ($firstName === '' || $lastName === '') {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'الاسم مطلوب.']));
    }

    if ($newPass !== '') {
        if (strlen($newPass) < 8) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.']));
        }
        $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
        $stmt = $db->prepare("UPDATE users SET first_name = ?, last_name = ?, avatar = ?, password_hash = ? WHERE id = ?");
        $stmt->bind_param('ssssi', $firstName, $lastName, $avatarPath, $hash, $uid);
    } else {
        $stmt = $db->prepare("UPDATE users SET first_name = ?, last_name = ?, avatar = ? WHERE id = ?");
        $stmt->bind_param('sssi', $firstName, $lastName, $avatarPath, $uid);
    }

    $stmt->execute();
    $stmt->close();

    $_SESSION['user_name'] = $firstName . ' ' . $lastName;

    exit(json_encode([
        'success' => true,
        'message' => 'تم تحديث الملف الشخصي بنجاح.',
        'user' => [
            'id'               => $uid,
            'first_name'       => $firstName,
            'last_name'        => $lastName,
            'name'             => $firstName . ' ' . $lastName,
            'email'            => $user['email'],
            'phone'            => $user['phone'],
            'role'             => $user['role'],
            'avatar'           => $avatarPath,
            'spark_subscribed' => hasSparkSubscription($uid, $user['role']),
        ]
    ]));
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
