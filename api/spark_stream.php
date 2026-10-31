<?php
/* ═══════════════════════════════════════════════════════════════════
   api/spark_stream.php — Protected File Streaming Gateway for SPARK
   Verifies active DB subscription on EVERY file preview or download
   ═══════════════════════════════════════════════════════════════════ */

require_once __DIR__ . '/../config/db.php';

/* Strictly verify SPARK subscription in DB */
$user = requireSparkAccess();
$db   = getDB();

$type = $_GET['type'] ?? 'file'; // 'file' or 'post_file'
$id   = intval($_GET['id'] ?? 0);
$dl   = !empty($_GET['download']);

if ($id <= 0) {
    http_response_code(400);
    exit('Invalid file ID');
}

if ($type === 'post_file') {
    $res = $db->query("
        SELECT pf.original_name, pf.file_path, pf.mime_type
        FROM post_files pf
        INNER JOIN posts p ON p.id = pf.post_id
        WHERE pf.id = $id
        LIMIT 1
    ");
} else {
    $res = $db->query("
        SELECT original_name, title, file_path, mime_type, extension
        FROM files
        WHERE id = $id
        LIMIT 1
    ");
}

$row = $res ? $res->fetch_assoc() : null;
if (!$row || empty($row['file_path'])) {
    http_response_code(404);
    exit('File not found');
}

$fullPath = realpath(__DIR__ . '/../' . $row['file_path']);
$uploadsRoot = realpath(__DIR__ . '/../uploads');

if (!$fullPath || !$uploadsRoot || strpos($fullPath, $uploadsRoot) !== 0 || !is_file($fullPath)) {
    http_response_code(404);
    exit('File missing on disk');
}

if ($dl && $type === 'file') {
    $db->query("UPDATE files SET downloads = downloads + 1 WHERE id = $id");
}

$mime = $row['mime_type'] ?: 'application/octet-stream';
$filename = $row['original_name'] ?: (($row['title'] ?? 'file') . '.' . ($row['extension'] ?? 'bin'));

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($fullPath));
header('Cache-Control: private, no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

$disp = $dl ? 'attachment' : 'inline';
header('Content-Disposition: ' . $disp . '; filename="' . rawurlencode($filename) . '"');

readfile($fullPath);
exit;
