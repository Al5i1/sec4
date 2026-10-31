<?php
/* ═══════════════════════════════════════════════════════════════════
   api/notifications.php — Real-Time Notifications & @All Broadcasts
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

/* ── GET: Fetch notifications for current user + unread count ── */
if ($method === 'GET') {
    $user = requireAuth();
    $uid  = (int)$user['id'];

    $res = $db->query("
        SELECT n.*,
               CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END AS is_read
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id AND nr.user_id = $uid
        ORDER BY n.created_at DESC
        LIMIT 50
    ");

    $list   = [];
    $unread = 0;
    while ($row = $res->fetch_assoc()) {
        $row['id']      = (int)$row['id'];
        $row['post_id'] = $row['post_id'] ? (int)$row['post_id'] : null;
        $row['is_read'] = (int)$row['is_read'];
        if ($row['is_read'] === 0) $unread++;
        $list[] = $row;
    }

    exit(json_encode([
        'success'       => true,
        'unread_count'  => $unread,
        'notifications' => $list
    ]));
}

/* ── POST: Mark read OR Admin send standalone @All notification ── */
if ($method === 'POST') {
    $raw    = file_get_contents('php://input');
    $data   = json_decode($raw, true) ?? $_POST;
    $action = $data['action'] ?? '';

    /* Student/User actions: mark single or all notifications as read */
    if ($action === 'mark_read') {
        $user = requireAuth();
        $uid  = (int)$user['id'];
        $nid  = intval($data['notification_id'] ?? 0);

        if ($nid > 0) {
            $stmt = $db->prepare("INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)");
            $stmt->bind_param('ii', $nid, $uid);
            $stmt->execute();
            $stmt->close();
        } else {
            /* Mark all as read */
            $db->query("
                INSERT IGNORE INTO notification_reads (notification_id, user_id)
                SELECT id, $uid FROM notifications
            ");
        }
        exit(json_encode(['success' => true]));
    }

    /* Admin action: Send standalone broadcast notification to @All without post */
    if ($action === 'broadcast') {
        requireAdmin();
        $title   = trim($data['title'] ?? '');
        $message = trim($data['message'] ?? '');
        $linkUrl = trim($data['link_url'] ?? '');

        if ($title === '' || $message === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'عنوان الإشعار ونصه مطلوبان.']));
        }

        $fullTitle = '🔔 إشعار (@الكل): ' . $title;
        $stmt = $db->prepare("INSERT INTO notifications (title, message, link_url) VALUES (?, ?, ?)");
        $stmt->bind_param('sss', $fullTitle, $message, $linkUrl);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '✅ تم إرسال الإشعار العاجل إلى @الكل بنجاح!']));
    }

    /* Admin action: Delete notification */
    if ($action === 'delete') {
        requireAdmin();
        $nid = intval($data['id'] ?? 0);
        $stmt = $db->prepare("DELETE FROM notifications WHERE id = ?");
        $stmt->bind_param('i', $nid);
        $stmt->execute();
        $stmt->close();
        exit(json_encode(['success' => true, 'message' => 'تم حذف الإشعار.']));
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
