<?php
/* ═══════════════════════════════════════════════════════════════════
   api/users.php — Admin ONLY: Manage Students (Edit, Active/Disable, Delete)
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

/* Strictly verify admin role in database */
$admin  = requireAdmin();
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];

/* ── GET — list all users ── */
if ($method === 'GET') {
    $result = $db->query(
        'SELECT id, first_name, last_name, email, phone, role, is_active, avatar, created_at FROM users ORDER BY created_at DESC'
    );
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $row['id']        = (int)$row['id'];
        $row['is_active'] = (int)$row['is_active'];
        $users[] = $row;
    }
    exit(json_encode(['success' => true, 'users' => $users]));
}

/* ── PUT — Admin full update (name, email, phone, password, role, is_active) ── */
if ($method === 'PUT') {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];

    $id        = intval($data['id'] ?? 0);
    $firstName = trim($data['first_name'] ?? '');
    $lastName  = trim($data['last_name']  ?? '');
    $email     = trim($data['email']      ?? '');
    $phone     = trim($data['phone']      ?? '');
    $password  = $data['password']        ?? '';
    $role      = in_array($data['role'] ?? '', ['admin', 'user']) ? $data['role'] : 'user';
    $isActive  = isset($data['is_active']) ? (intval($data['is_active']) ? 1 : 0) : 1;

    if ($id <= 0 || $firstName === '' || $lastName === '') {
        http_response_code(400);
        exit(json_encode(['success' => false, 'message' => 'الاسم الأول والأخير مطلوبان.']));
    }

    /* Protect current admin from disabling or demoting themselves */
    if ($id === (int)$admin['id']) {
        $role     = 'admin';
        $isActive = 1;
    }

    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'البريد الإلكتروني غير صحيح.']));
    }

    /* Check duplicate email/phone on other users */
    $chk = $db->prepare('SELECT id FROM users WHERE ((email != "" AND email = ?) OR (phone != "" AND phone = ?)) AND id != ? LIMIT 1');
    $chk->bind_param('ssi', $email, $phone, $id);
    $chk->execute();
    $chk->store_result();
    if ($chk->num_rows > 0) {
        $chk->close();
        http_response_code(409);
        exit(json_encode(['success' => false, 'message' => 'البريد أو رقم الهاتف مستخدم لحساب آخر.']));
    }
    $chk->close();

    if ($password !== '') {
        if (strlen($password) < 4) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'كلمة المرور قصيرة جداً.']));
        }
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $stmt = $db->prepare(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, password_hash = ?, role = ?, is_active = ? WHERE id = ?'
        );
        $stmt->bind_param('ssssssii', $firstName, $lastName, $email, $phone, $hash, $role, $isActive, $id);
    } else {
        $stmt = $db->prepare(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, role = ?, is_active = ? WHERE id = ?'
        );
        $stmt->bind_param('sssssii', $firstName, $lastName, $email, $phone, $role, $isActive, $id);
    }

    if ($stmt->execute()) {
        $stmt->close();
        exit(json_encode(['success' => true, 'message' => '✅ تم تحديث بيانات الحساب بنجاح.']));
    } else {
        $err = $stmt->error;
        $stmt->close();
        http_response_code(500);
        exit(json_encode(['success' => false, 'message' => 'خطأ في التحديث: ' . $err]));
    }
}

/* ── DELETE — delete a user ── */
if ($method === 'DELETE') {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];
    $id   = intval($data['id'] ?? 0);

    if ($id <= 0 || $id === (int)$admin['id']) {
        http_response_code(400);
        exit(json_encode(['success' => false, 'message' => 'لا يمكنك حذف حساب الإدارة الأساسي.']));
    }

    $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    exit(json_encode(['success' => $affected > 0, 'message' => $affected > 0 ? '🗑️ تم حذف الحساب.' : 'المستخدم غير موجود.']));
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
