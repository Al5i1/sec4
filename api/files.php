<?php
/* ═══════════════════════════════════════════════════════════════════
   api/files.php — Full Hierarchical File Manager, SPARK Guard & Limits
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$db     = getDB();

function formatFileOutput(array $r): array {
    $r['id']          = (int)$r['id'];
    $r['folder_id']   = isset($r['folder_id']) && $r['folder_id'] !== null ? (int)$r['folder_id'] : null;
    $r['file_size']   = (int)($r['file_size'] ?? 0);
    $r['is_favorite'] = (int)($r['is_favorite'] ?? 0);
    if (($r['section'] ?? '') === 'spark' && ($r['item_type'] ?? 'file') === 'file') {
        $r['stream_url']   = '../api/spark_stream.php?type=file&id=' . $r['id'];
        $r['download_url'] = '../api/spark_stream.php?type=file&id=' . $r['id'] . '&download=1';
    } else {
        $r['stream_url']   = !empty($r['file_path']) ? ('../' . $r['file_path']) : '';
        $r['download_url'] = !empty($r['file_path']) ? ('../' . $r['file_path']) : '';
    }
    return $r;
}

/* ── GET: Browse folders/files, recent files, or favorites ── */
if ($method === 'GET') {
    $user = requireAuth();
    $uid  = (int)$user['id'];
    $mode = $_GET['mode'] ?? 'browse';

    /* 1. Recent files across platform (excludes SPARK unless subscribed) */
    if ($mode === 'recent') {
        $limit = min(50, max(1, intval($_GET['limit'] ?? 10)));
        $sparkAllowed = hasSparkSubscription($uid, $user['role']);
        $sparkCond = $sparkAllowed ? "" : "WHERE f.section != 'spark'";

        $res = $db->query("
            SELECT f.*,
                   CASE WHEN fav.id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
            FROM files f
            LEFT JOIN favorites fav ON fav.file_id = f.id AND fav.user_id = $uid
            $sparkCond
            ORDER BY f.created_at DESC
            LIMIT $limit
        ");
        $files = [];
        if ($res) {
            while ($r = $res->fetch_assoc()) $files[] = formatFileOutput($r);
        }
        exit(json_encode(['success' => true, 'files' => $files]));
    }

    /* 2. Student's favorites list */
    if ($mode === 'favorites') {
        $sparkAllowed = hasSparkSubscription($uid, $user['role']);
        $sparkCond = $sparkAllowed ? "" : "AND f.section != 'spark'";
        $res = $db->query("
            SELECT f.*, 1 AS is_favorite
            FROM favorites fav
            INNER JOIN files f ON f.id = fav.file_id
            WHERE fav.user_id = $uid $sparkCond
            ORDER BY fav.created_at DESC
        ");
        $files = [];
        if ($res) {
            while ($r = $res->fetch_assoc()) $files[] = formatFileOutput($r);
        }
        exit(json_encode(['success' => true, 'files' => $files]));
    }

    /* 3. All folders in a section/subject (for Upload / Move Folder Picker) */
    if ($mode === 'all_folders') {
        $section = trim($_GET['section'] ?? '');
        $subject = trim($_GET['subject'] ?? '');
        if ($section === 'spark') requireSparkAccess();

        $sql = "SELECT id, parent_id, name, section, subject FROM folders WHERE 1=1";
        if ($section !== '') {
            $secEsc = $db->real_escape_string($section);
            $sql .= " AND section = '$secEsc'";
        }
        if ($subject !== '') {
            $subEsc = $db->real_escape_string($subject);
            $sql .= " AND subject = '$subEsc'";
        } else {
            $sql .= " AND (subject IS NULL OR subject = '')";
        }
        $sql .= " ORDER BY sort_order ASC, name ASC";
        $res = $db->query($sql);
        $folders = [];
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $r['id']        = (int)$r['id'];
                $r['parent_id'] = $r['parent_id'] ? (int)$r['parent_id'] : null;
                $folders[]      = $r;
            }
        }
        exit(json_encode(['success' => true, 'folders' => $folders]));
    }

    /* 4. Standard File Manager Browse */
    $section = trim($_GET['section'] ?? 'resources');
    if ($section === 'spark') {
        requireSparkAccess();
    }

    $subject  = trim($_GET['subject'] ?? '');
    $folderId = isset($_GET['folder_id']) && $_GET['folder_id'] !== '' && $_GET['folder_id'] !== 'null'
                ? intval($_GET['folder_id'])
                : null;
    $sort     = $_GET['sort'] ?? 'date_desc';

    $orderByFolder = ($sort === 'name_asc') ? "name ASC" : "sort_order ASC, name ASC";
    $orderByFile   = "f.sort_order ASC, f.created_at DESC";
    if ($sort === 'name_asc')  $orderByFile = "f.title ASC";
    if ($sort === 'date_asc')  $orderByFile = "f.created_at ASC";
    if ($sort === 'date_desc') $orderByFile = "f.created_at DESC";

    $secEsc = $db->real_escape_string($section);
    $subCond = ($subject !== '')
        ? "AND subject = '" . $db->real_escape_string($subject) . "'"
        : "AND (subject IS NULL OR subject = '')";

    $parentCond = ($folderId !== null && $folderId > 0)
        ? "AND parent_id = $folderId"
        : "AND parent_id IS NULL";

    $fileFolderCond = ($folderId !== null && $folderId > 0)
        ? "AND f.folder_id = $folderId"
        : "AND f.folder_id IS NULL";

    /* Fetch folders */
    $folders = [];
    $fRes = $db->query("SELECT * FROM folders WHERE section = '$secEsc' $subCond $parentCond ORDER BY $orderByFolder");
    if ($fRes) {
        while ($r = $fRes->fetch_assoc()) {
            $r['id']        = (int)$r['id'];
            $r['parent_id'] = $r['parent_id'] ? (int)$r['parent_id'] : null;
            $folders[] = $r;
        }
    }
    if ($sort === 'name_asc' || $section === 'spark') {
        usort($folders, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
    }

    /* Fetch files & links */
    $files = [];
    $flRes = $db->query("
        SELECT f.*,
               CASE WHEN fav.id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
        FROM files f
        LEFT JOIN favorites fav ON fav.file_id = f.id AND fav.user_id = $uid
        WHERE f.section = '$secEsc' " . str_replace('subject', 'f.subject', $subCond) . " $fileFolderCond
        ORDER BY $orderByFile
    ");
    if ($flRes) {
        while ($r = $flRes->fetch_assoc()) {
            $files[] = formatFileOutput($r);
        }
    }
    if ($sort === 'name_asc' || $section === 'spark') {
        usort($files, fn($a, $b) => strnatcasecmp($a['title'], $b['title']));
    }

    /* Build Breadcrumbs trail */
    $breadcrumbs = [];
    $currId = $folderId;
    $guard = 0;
    while ($currId && $guard < 25) {
        $guard++;
        $bRes = $db->query("SELECT id, parent_id, name FROM folders WHERE id = " . intval($currId) . " LIMIT 1");
        if ($bRes && ($bRow = $bRes->fetch_assoc())) {
            array_unshift($breadcrumbs, [
                'id'   => (int)$bRow['id'],
                'name' => $bRow['name']
            ]);
            $currId = $bRow['parent_id'] ? (int)$bRow['parent_id'] : null;
        } else {
            break;
        }
    }

    exit(json_encode([
        'success'     => true,
        'folders'     => $folders,
        'files'       => $files,
        'breadcrumbs' => $breadcrumbs,
        'limits'      => [
            'max_size_mb' => MAX_FILE_SIZE_BYTES / (1024 * 1024),
            'allowed_ext' => ALLOWED_EXTENSIONS
        ]
    ]));
}

/* ── POST: File Manager Operations ── */
if ($method === 'POST') {
    $raw    = file_get_contents('php://input');
    $json   = json_decode($raw, true);
    $data   = is_array($json) ? $json : $_POST;
    $action = $data['action'] ?? '';

    /* Student/User allowed actions: toggle_favorite & track_download */
    if ($action === 'toggle_favorite') {
        $user   = requireAuth();
        $uid    = (int)$user['id'];
        $fileId = intval($data['file_id'] ?? 0);
        if ($fileId <= 0) {
            http_response_code(400);
            exit(json_encode(['success' => false, 'message' => 'ملف غير صالح.']));
        }
        $chk = $db->query("SELECT id FROM favorites WHERE user_id = $uid AND file_id = $fileId LIMIT 1");
        if ($chk && $chk->num_rows > 0) {
            $db->query("DELETE FROM favorites WHERE user_id = $uid AND file_id = $fileId");
            exit(json_encode(['success' => true, 'is_favorite' => 0, 'message' => 'تمت الإزالة من المفضلة.']));
        } else {
            $stmt = $db->prepare("INSERT IGNORE INTO favorites (user_id, file_id) VALUES (?, ?)");
            $stmt->bind_param('ii', $uid, $fileId);
            $stmt->execute();
            $stmt->close();
            exit(json_encode(['success' => true, 'is_favorite' => 1, 'message' => '⭐ تمت الإضافة إلى المفضلة.']));
        }
    }

    if ($action === 'track_download') {
        requireAuth();
        $fileId = intval($data['file_id'] ?? 0);
        if ($fileId > 0) {
            $db->query("UPDATE files SET downloads = downloads + 1 WHERE id = $fileId");
        }
        exit(json_encode(['success' => true]));
    }

    /* ════════════════════════════════════════════════════════════════
       ALL ACTIONS BELOW ARE STRICTLY ADMIN ONLY (Server-side enforced)
       ════════════════════════════════════════════════════════════════ */
    requireAdmin();

    /* 1. Create Folder */
    if ($action === 'create_folder') {
        $section  = trim($data['section'] ?? 'resources');
        $subject  = trim($data['subject'] ?? '') ?: null;
        $parentId = !empty($data['parent_id']) && $data['parent_id'] !== 'null' ? intval($data['parent_id']) : null;
        $name     = trim($data['name'] ?? '');

        if ($name === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'اسم المجلد مطلوب.']));
        }

        $stmt = $db->prepare("INSERT INTO folders (section, subject, parent_id, name) VALUES (?, ?, ?, ?)");
        $stmt->bind_param('ssis', $section, $subject, $parentId, $name);
        $stmt->execute();
        $newId = (int)$stmt->insert_id;
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '📁 تم إنشاء المجلد بنجاح.', 'folder_id' => $newId]));
    }

    /* 2. Rename / Reorder Folder */
    if ($action === 'update_folder') {
        $id        = intval($data['id'] ?? 0);
        $name      = trim($data['name'] ?? '');
        $sortOrder = intval($data['sort_order'] ?? 0);

        if ($id <= 0 || $name === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'بيانات المجلد غير صالحة.']));
        }

        $stmt = $db->prepare("UPDATE folders SET name = ?, sort_order = ? WHERE id = ?");
        $stmt->bind_param('sii', $name, $sortOrder, $id);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '✅ تم تحديث اسم المجلد.']));
    }

    /* 3. Delete Folder (and recursively remove stored files) */
    if ($action === 'delete_folder') {
        $id = intval($data['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            exit(json_encode(['success' => false, 'message' => 'معرف غير صالح.']));
        }

        $toVisit = [$id];
        $allFolderIds = [];
        while (!empty($toVisit)) {
            $curr = array_pop($toVisit);
            $allFolderIds[] = $curr;
            $sub = $db->query("SELECT id FROM folders WHERE parent_id = " . intval($curr));
            while ($s = $sub->fetch_assoc()) $toVisit[] = (int)$s['id'];
        }
        $idList = implode(',', $allFolderIds);
        $fRes = $db->query("SELECT file_path FROM files WHERE folder_id IN ($idList) AND file_path IS NOT NULL");
        while ($f = $fRes->fetch_assoc()) {
            $full = __DIR__ . '/../' . $f['file_path'];
            if (is_file($full)) @unlink($full);
        }

        $stmt = $db->prepare("DELETE FROM folders WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف المجلد وجميع محتوياته.']));
    }

    /* 4. Upload One or Multiple Files */
    if ($action === 'upload_files') {
        $section     = trim($_POST['section'] ?? 'resources');
        $subject     = trim($_POST['subject'] ?? '') ?: null;
        $folderId    = !empty($_POST['folder_id']) && $_POST['folder_id'] !== 'null' ? intval($_POST['folder_id']) : null;
        $customTitle = trim($_POST['title'] ?? '');
        $description = trim($_POST['description'] ?? '');

        if (empty($_FILES['files']['name'])) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'يرجى اختيار ملف واحد على الأقل.']));
        }

        $subDir  = ($section === 'spark') ? 'uploads/spark/' : 'uploads/files/';
        $destDir = __DIR__ . '/../' . $subDir;
        if (!is_dir($destDir)) mkdir($destDir, 0775, true);

        $names = (array)$_FILES['files']['name'];
        $tmps  = (array)$_FILES['files']['tmp_name'];
        $errs  = (array)$_FILES['files']['error'];
        $sizes = (array)$_FILES['files']['size'];
        $types = (array)$_FILES['files']['type'];

        $uploadedCount = 0;
        $rejectedReasons = [];

        for ($i = 0; $i < count($names); $i++) {
            if (empty($names[$i])) continue;
            $origName = basename($names[$i]);

            if ($errs[$i] !== UPLOAD_ERR_OK) {
                $rejectedReasons[] = "$origName: خطأ أثناء الرفع (كود {$errs[$i]})";
                continue;
            }

            $fSize = (int)$sizes[$i];
            if ($fSize > MAX_FILE_SIZE_BYTES) {
                $maxMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
                $rejectedReasons[] = "$origName: يتجاوز الحد الأقصى المسموح ({$maxMb}MB)";
                continue;
            }

            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (in_array($ext, BLOCKED_EXTENSIONS)) {
                $rejectedReasons[] = "$origName: صيغة الملف (.$ext) غير مسموحة أمنياً";
                continue;
            }

            $storedName = $section . '_' . uniqid() . '_' . time() . ($ext ? '.' . $ext : '');
            if (move_uploaded_file($tmps[$i], $destDir . $storedName)) {
                $relPath   = $subDir . $storedName;
                $fMime     = $types[$i] ?: 'application/octet-stream';
                $fileTitle = (count($names) === 1 && $customTitle !== '')
                             ? $customTitle
                             : ($customTitle !== '' ? ($customTitle . ' (' . ($i + 1) . ')') : pathinfo($origName, PATHINFO_FILENAME));

                $stmt = $db->prepare("
                    INSERT INTO files
                        (section, subject, folder_id, item_type, title, description, original_name, stored_name, file_path, file_size, mime_type, extension)
                    VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->bind_param(
                    'ssisssssiss',
                    $section, $subject, $folderId, $fileTitle, $description,
                    $origName, $storedName, $relPath, $fSize, $fMime, $ext
                );
                $stmt->execute();
                $stmt->close();
                $uploadedCount++;
            }
        }

        if ($uploadedCount === 0) {
            http_response_code(422);
            $errMsg = !empty($rejectedReasons) ? implode(' | ', $rejectedReasons) : 'تعذّر رفع الملفات، تأكد من الحجم والصيغة.';
            exit(json_encode(['success' => false, 'message' => '❌ ' . $errMsg]));
        }

        $msg = "✅ تم رفع $uploadedCount ملف بنجاح!";
        if (!empty($rejectedReasons)) {
            $msg .= ' (تم استبعاد: ' . implode(', ', $rejectedReasons) . ')';
        }
        exit(json_encode([
            'success' => true,
            'message' => $msg
        ]));
    }

    /* 5. Add Direct Link */
    if ($action === 'add_link') {
        $section     = trim($data['section'] ?? 'blackboard');
        $subject     = trim($data['subject'] ?? '') ?: null;
        $folderId    = !empty($data['folder_id']) && $data['folder_id'] !== 'null' ? intval($data['folder_id']) : null;
        $title       = trim($data['title'] ?? '');
        $url         = trim($data['external_url'] ?? '');
        $description = trim($data['description'] ?? '');

        if ($title === '' || $url === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'عنوان الرابط والرابط نفسه مطلوبان.']));
        }

        $stmt = $db->prepare("
            INSERT INTO files (section, subject, folder_id, item_type, title, description, external_url, extension)
            VALUES (?, ?, ?, 'link', ?, ?, ?, 'link')
        ");
        $stmt->bind_param('ssisss', $section, $subject, $folderId, $title, $description, $url);
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '🔗 تمت إضافة الرابط بنجاح.']));
    }

    /* 6. Update / Rename / Move File or Link */
    if ($action === 'update_file') {
        $id          = intval($data['id'] ?? 0);
        $title       = trim($data['title'] ?? '');
        $description = trim($data['description'] ?? '');
        $externalUrl = trim($data['external_url'] ?? '');
        $sortOrder   = intval($data['sort_order'] ?? 0);
        $hasFolder   = array_key_exists('folder_id', $data);
        $folderId    = ($hasFolder && $data['folder_id'] !== '' && $data['folder_id'] !== null && $data['folder_id'] !== 'null')
                       ? intval($data['folder_id'])
                       : null;

        if ($id <= 0 || $title === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'اسم الملف مطلوب.']));
        }

        if ($hasFolder) {
            $stmt = $db->prepare("UPDATE files SET title = ?, description = ?, external_url = ?, folder_id = ?, sort_order = ? WHERE id = ?");
            $stmt->bind_param('sssiii', $title, $description, $externalUrl, $folderId, $sortOrder, $id);
        } else {
            $stmt = $db->prepare("UPDATE files SET title = ?, description = ?, external_url = ?, sort_order = ? WHERE id = ?");
            $stmt->bind_param('sssii', $title, $description, $externalUrl, $sortOrder, $id);
        }
        $stmt->execute();
        $stmt->close();

        exit(json_encode(['success' => true, 'message' => '✅ تم تحديث بيانات الملف بنجاح.']));
    }

    /* 7. Delete File or Link */
    if ($action === 'delete_file') {
        $id = intval($data['id'] ?? 0);
        $res = $db->query("SELECT file_path FROM files WHERE id = $id LIMIT 1");
        if ($row = $res->fetch_assoc()) {
            if (!empty($row['file_path'])) {
                $full = __DIR__ . '/../' . $row['file_path'];
                if (is_file($full)) @unlink($full);
            }
            $db->query("DELETE FROM files WHERE id = $id");
        }
        exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف العنصر بنجاح.']));
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
