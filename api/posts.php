<?php
/* ═══════════════════════════════════════════════════════════════════
   api/posts.php — Announcements, SPARK Posts, Attachments & @All
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

/* ── GET: Fetch posts (general or spark) ── */
if ($method === 'GET') {
    $section = trim($_GET['section'] ?? 'general');
    if ($section === 'spark') {
        requireSparkAccess();
    } else {
        requireAuth();
    }

    $secEsc = $db->real_escape_string($section);
    $res = $db->query("
        SELECT p.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name
        FROM posts p
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.section = '$secEsc'
        ORDER BY p.is_pinned DESC, p.created_at DESC
    ");

    $posts = [];
    $postIds = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $row['id']         = (int)$row['id'];
            $row['is_pinned']  = (int)$row['is_pinned'];
            $row['notify_all'] = (int)$row['notify_all'];
            $row['files']      = [];
            $posts[$row['id']] = $row;
            $postIds[]         = $row['id'];
        }
    }

    if (!empty($postIds)) {
        $idList = implode(',', $postIds);
        $fRes = $db->query("SELECT * FROM post_files WHERE post_id IN ($idList) ORDER BY id ASC");
        while ($f = $fRes->fetch_assoc()) {
            $pid = (int)$f['post_id'];
            if (isset($posts[$pid])) {
                $posts[$pid]['files'][] = [
                    'id'            => (int)$f['id'],
                    'original_name' => $f['original_name'],
                    'file_path'     => ($section === 'spark')
                                       ? ('api/spark_stream.php?type=post_file&id=' . (int)$f['id'])
                                       : $f['file_path'],
                    'file_size'     => (int)$f['file_size'],
                    'mime_type'     => $f['mime_type'],
                ];
            }
        }
    }

    exit(json_encode(['success' => true, 'posts' => array_values($posts)]));
}

/* ── POST: Create / Edit / Toggle Pin / Delete Post (STRICT ADMIN ONLY) ── */
if ($method === 'POST') {
    $admin  = requireAdmin();
    $action = $_POST['action'] ?? '';

    /* 1. Delete post */
    if ($action === 'delete') {
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            exit(json_encode(['success' => false, 'message' => 'معرف غير صالح.']));
        }
        $fRes = $db->query("SELECT file_path FROM post_files WHERE post_id = $id");
        while ($f = $fRes->fetch_assoc()) {
            $full = __DIR__ . '/../' . $f['file_path'];
            if (is_file($full)) @unlink($full);
        }
        $stmt = $db->prepare("DELETE FROM posts WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف المنشور ومرفقاته.']));
    }

    /* 2. Toggle pin */
    if ($action === 'toggle_pin') {
        $id  = intval($_POST['id'] ?? 0);
        $pin = intval($_POST['is_pinned'] ?? 0) ? 1 : 0;
        $stmt = $db->prepare("UPDATE posts SET is_pinned = ? WHERE id = ?");
        $stmt->bind_param('ii', $pin, $id);
        $stmt->execute();
        $stmt->close();
        exit(json_encode(['success' => true, 'message' => $pin ? '📌 تم تثبيت المنشور في الأعلى.' : 'تم إلغاء تثبيت المنشور.']));
    }

    /* 3. Delete single attachment */
    if ($action === 'delete_attachment') {
        $fid = intval($_POST['file_id'] ?? 0);
        $res = $db->query("SELECT file_path FROM post_files WHERE id = $fid LIMIT 1");
        if ($row = $res->fetch_assoc()) {
            $full = __DIR__ . '/../' . $row['file_path'];
            if (is_file($full)) @unlink($full);
            $db->query("DELETE FROM post_files WHERE id = $fid");
        }
        exit(json_encode(['success' => true, 'message' => 'تم حذف المرفق.']));
    }

    /* 4. Create or Update post */
    $postId    = intval($_POST['id'] ?? 0);
    $section   = trim($_POST['section'] ?? 'general') ?: 'general';
    $title     = trim($_POST['title'] ?? '');
    $content   = trim($_POST['content'] ?? '');
    $isPinned  = !empty($_POST['is_pinned']) ? 1 : 0;
    $notifyAll = !empty($_POST['notify_all']) ? 1 : 0;

    if ($title === '' || $content === '') {
        http_response_code(422);
        exit(json_encode(['success' => false, 'message' => 'عنوان المنشور ومحتواه مطلوبان.']));
    }

    if ($postId > 0) {
        $stmt = $db->prepare("UPDATE posts SET title = ?, content = ?, is_pinned = ? WHERE id = ?");
        $stmt->bind_param('ssii', $title, $content, $isPinned, $postId);
        $stmt->execute();
        $stmt->close();
    } else {
        $authorId = (int)$admin['id'];
        $stmt = $db->prepare("INSERT INTO posts (section, title, content, is_pinned, notify_all, author_id) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sssiii', $section, $title, $content, $isPinned, $notifyAll, $authorId);
        $stmt->execute();
        $postId = (int)$stmt->insert_id;
        $stmt->close();

        if ($notifyAll === 1 && $postId > 0) {
            $nTitle = ($section === 'spark' ? '⚡ منشور SPARK (@الكل): ' : '📢 إعلان جديد (@الكل): ') . $title;
            $nMsg   = mb_substr($content, 0, 180);
            $nLink  = $section === 'spark' ? 'home.html#spark' : ('home.html#post-' . $postId);
            $nStmt  = $db->prepare("INSERT INTO notifications (title, message, post_id, link_url) VALUES (?, ?, ?, ?)");
            $nStmt->bind_param('ssis', $nTitle, $nMsg, $postId, $nLink);
            $nStmt->execute();
            $nStmt->close();
        }
    }

    /* Handle multiple file uploads if attached */
    if (!empty($_FILES['attachments']['name'])) {
        $subDir  = ($section === 'spark') ? 'uploads/spark/' : 'uploads/posts/';
        $destDir = __DIR__ . '/../' . $subDir;
        if (!is_dir($destDir)) mkdir($destDir, 0775, true);

        $names = (array)$_FILES['attachments']['name'];
        $tmps  = (array)$_FILES['attachments']['tmp_name'];
        $errs  = (array)$_FILES['attachments']['error'];
        $sizes = (array)$_FILES['attachments']['size'];
        $types = (array)$_FILES['attachments']['type'];

        for ($i = 0; $i < count($names); $i++) {
            if (empty($names[$i]) || $errs[$i] !== UPLOAD_ERR_OK) continue;
            if ((int)$sizes[$i] > MAX_FILE_SIZE_BYTES) continue;

            $origName = basename($names[$i]);
            $ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (in_array($ext, BLOCKED_EXTENSIONS)) continue;

            $storedName = 'post_' . $postId . '_' . uniqid() . ($ext ? '.' . $ext : '');
            if (move_uploaded_file($tmps[$i], $destDir . $storedName)) {
                $relPath = $subDir . $storedName;
                $fSize   = (int)$sizes[$i];
                $fMime   = $types[$i] ?: 'application/octet-stream';

                $fStmt = $db->prepare("INSERT INTO post_files (post_id, original_name, stored_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)");
                $fStmt->bind_param('isssis', $postId, $origName, $storedName, $relPath, $fSize, $fMime);
                $fStmt->execute();
                $fStmt->close();
            }
        }
    }

    exit(json_encode([
        'success' => true,
        'message' => $notifyAll ? '✅ تم نشر المنشور وإرسال إشعار إلى @الكل!' : '✅ تم حفظ المنشور بنجاح!',
        'post_id' => $postId
    ]));
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
