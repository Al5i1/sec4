<?php
/* ═══════════════════════════════════════════════════════════════════
   api/schedule.php — Class Schedule Table & Schedule Files (PDF/Images)
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

/* ── GET: Fetch schedule table entries + uploaded schedule PDF/images ── */
if ($method === 'GET') {
    requireAuth();

    $entries = [];
    $eRes = $db->query("SELECT * FROM schedule_entries ORDER BY sort_order ASC, id ASC");
    if ($eRes) {
        while ($r = $eRes->fetch_assoc()) {
            $r['id'] = (int)$r['id'];
            $entries[] = $r;
        }
    }

    $files = [];
    $fRes = $db->query("SELECT * FROM files WHERE section = 'schedule' ORDER BY created_at DESC");
    if ($fRes) {
        while ($r = $fRes->fetch_assoc()) {
            $r['id']        = (int)$r['id'];
            $r['file_size'] = (int)$r['file_size'];
            $files[] = $r;
        }
    }

    exit(json_encode([
        'success' => true,
        'entries' => $entries,
        'files'   => $files
    ]));
}

/* ── POST: Add / Update / Delete schedule entry (STRICT ADMIN ONLY) ── */
if ($method === 'POST') {
    requireAdmin();

    $raw    = file_get_contents('php://input');
    $data   = json_decode($raw, true) ?? $_POST;
    $action = $data['action'] ?? '';

    if ($action === 'save_entry') {
        $id         = intval($data['id'] ?? 0);
        $dayName    = trim($data['day_name'] ?? '');
        $startTime  = trim($data['start_time'] ?? '');
        $endTime    = trim($data['end_time'] ?? '');
        $subject    = trim($data['subject'] ?? '');
        $room       = trim($data['room'] ?? '');
        $instructor = trim($data['instructor'] ?? '');
        $notes      = trim($data['notes'] ?? '');
        $sortOrder  = intval($data['sort_order'] ?? 0);

        if ($dayName === '' || $startTime === '' || $subject === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'اليوم والوقت والمادة مطلوبة.']));
        }

        if ($id > 0) {
            $stmt = $db->prepare("UPDATE schedule_entries SET day_name=?, start_time=?, end_time=?, subject=?, room=?, instructor=?, notes=?, sort_order=? WHERE id=?");
            $stmt->bind_param('sssssssii', $dayName, $startTime, $endTime, $subject, $room, $instructor, $notes, $sortOrder, $id);
        } else {
            $stmt = $db->prepare("INSERT INTO schedule_entries (day_name, start_time, end_time, subject, room, instructor, notes, sort_order) VALUES (?,?,?,?,?,?,?,?)");
            $stmt->bind_param('sssssssi', $dayName, $startTime, $endTime, $subject, $room, $instructor, $notes, $sortOrder);
        }
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '✅ تم حفظ الحصة في الجدول.']));
    }

    if ($action === 'delete_entry') {
        $id = intval($data['id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM schedule_entries WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف الحصة من الجدول.']));
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
