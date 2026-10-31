<?php
/* ═══════════════════════════════════════
   api/login.php  —  User authentication
   ═══════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['success' => false, 'message' => 'Method not allowed']));
}

$raw        = file_get_contents('php://input');
$data       = json_decode($raw, true) ?? $_POST;
$identifier = trim($data['identifier'] ?? '');
$password   = $data['password'] ?? '';

if (empty($identifier) || empty($password)) {
    http_response_code(422);
    exit(json_encode(['success' => false, 'message' => 'جميع الحقول مطلوبة.']));
}

/* ── Look up by email or phone ── */
$db   = getDB();
$stmt = $db->prepare(
    'SELECT id, first_name, last_name, email, phone, password_hash, role, is_active, avatar
     FROM users
     WHERE email = ? OR phone = ?
     LIMIT 1'
);
$stmt->bind_param('ss', $identifier, $identifier);
$stmt->execute();
$result = $stmt->get_result();
$user   = $result->fetch_assoc();
$stmt->close();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    exit(json_encode(['success' => false, 'message' => 'البريد/الهاتف أو كلمة المرور غير صحيحة.']));
}

if ((int)$user['is_active'] !== 1) {
    http_response_code(403);
    exit(json_encode(['success' => false, 'message' => 'تم تعطيل هذا الحساب من قِبل الإدارة.']));
}

/* ── Start session ── */
session_start();
$_SESSION['user_id']   = $user['id'];
$_SESSION['user_name'] = $user['first_name'] . ' ' . $user['last_name'];
$_SESSION['user_role'] = $user['role'];

/* ── Respond ── */
echo json_encode([
    'success'  => true,
    'message'  => 'تم تسجيل الدخول بنجاح.',
    'redirect' => '../html/home.html',
    'user'     => [
        'id'         => (int)$user['id'],
        'first_name' => $user['first_name'],
        'last_name'  => $user['last_name'],
        'name'       => $user['first_name'] . ' ' . $user['last_name'],
        'email'      => $user['email'],
        'phone'      => $user['phone'],
        'role'       => $user['role'],
        'avatar'     => $user['avatar'],
    ]
]);
