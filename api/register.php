<?php
/* ═══════════════════════════════════════
   api/register.php  —  New user sign-up
   ═══════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['success' => false, 'message' => 'Method not allowed']));
}

/* ── Read JSON or form body ── */
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true) ?? $_POST;

$firstName = trim($data['first_name'] ?? '');
$lastName  = trim($data['last_name']  ?? '');
$email     = trim($data['email']      ?? '');
$phone     = trim($data['phone']      ?? '');
$password  = $data['password']        ?? '';
$confirm   = $data['confirm_password']?? '';

/* ── Validate ── */
$errors = [];

if (!preg_match('/^[A-Za-z\s\'\-]+$/', $firstName)) $errors[] = 'First name must be English letters only.';
if (!preg_match('/^[A-Za-z\s\'\-]+$/', $lastName))  $errors[] = 'Last name must be English letters only.';
if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email address.';
if (!$email && !$phone) $errors[] = 'Email or phone is required.';
if (strlen($password) < 8) $errors[] = 'Password must be at least 8 characters.';
if ($password !== $confirm) $errors[] = 'Passwords do not match.';

if (!empty($errors)) {
    http_response_code(422);
    exit(json_encode(['success' => false, 'errors' => $errors]));
}

/* ── Check duplicates ── */
$db   = getDB();
$stmt = $db->prepare('SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1');
$stmt->bind_param('ss', $email, $phone);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    http_response_code(409);
    exit(json_encode(['success' => false, 'message' => 'Email or phone already registered.']));
}
$stmt->close();

/* ── Insert ── */
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$ins  = $db->prepare(
    'INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)'
);
$ins->bind_param('sssss', $firstName, $lastName, $email, $phone, $hash);

if ($ins->execute()) {
    http_response_code(201);
    echo json_encode(['success' => true, 'message' => 'Account created successfully.', 'id' => $ins->insert_id]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
$ins->close();
