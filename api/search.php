<?php
/* ═══════════════════════════════════════════════════════════════════
   api/search.php — Global Search & Platform Statistics
   ═══════════════════════════════════════════════════════════════════ */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$user = requireAuth();
$uid  = (int)$user['id'];
$db   = getDB();
$mode = $_GET['mode'] ?? 'search';

/* ── Platform Stats (for Admin Dashboard & Home Counters) ── */
if ($mode === 'stats') {
    $stats = [
        'total_users'       => 0,
        'active_users'      => 0,
        'disabled_users'    => 0,
        'total_posts'       => 0,
        'pinned_posts'      => 0,
        'total_files'       => 0,
        'total_folders'     => 0,
        'total_downloads'   => 0,
        'projects_count'    => 0,
        'exams_count'       => 0,
        'handouts_count'    => 0,
        'bb_count'          => 0,
        'resources_count'   => 0,
        'spark_files_count' => 0,
        'spark_subs_count'  => 0,
        'spark_codes_avail' => 0,
        'notifs_count'      => 0,
    ];

    if ($r = $db->query("SELECT COUNT(*) c, SUM(is_active=1) a, SUM(is_active=0) d FROM users")) {
        $row = $r->fetch_assoc();
        $stats['total_users']    = (int)$row['c'];
        $stats['active_users']   = (int)$row['a'];
        $stats['disabled_users'] = (int)$row['d'];
    }
    if ($r = $db->query("SELECT COUNT(*) c, SUM(is_pinned=1) p FROM posts WHERE section = 'general'")) {
        $row = $r->fetch_assoc();
        $stats['total_posts']  = (int)$row['c'];
        $stats['pinned_posts'] = (int)$row['p'];
    }
    if ($r = $db->query("SELECT COUNT(*) c, COALESCE(SUM(downloads),0) dl,
                                SUM(section='projects') pr,
                                SUM(section='exams') ex,
                                SUM(section='handouts') ha,
                                SUM(section='blackboard') bb,
                                SUM(section='resources') re,
                                SUM(section='spark') sp
                         FROM files")) {
        $row = $r->fetch_assoc();
        $stats['total_files']       = (int)$row['c'];
        $stats['total_downloads']   = (int)$row['dl'];
        $stats['projects_count']    = (int)$row['pr'];
        $stats['exams_count']       = (int)$row['ex'];
        $stats['handouts_count']    = (int)$row['ha'];
        $stats['bb_count']          = (int)$row['bb'];
        $stats['resources_count']   = (int)$row['re'];
        $stats['spark_files_count'] = (int)$row['sp'];
    }
    if ($r = $db->query("SELECT COUNT(*) c FROM folders")) {
        $stats['total_folders'] = (int)$r->fetch_assoc()['c'];
    }
    if ($r = $db->query("SELECT COUNT(*) c FROM notifications")) {
        $stats['notifs_count'] = (int)$r->fetch_assoc()['c'];
    }
    if ($r = $db->query("SELECT COUNT(*) c FROM spark_subscriptions")) {
        $stats['spark_subs_count'] = (int)$r->fetch_assoc()['c'];
    }
    if ($r = $db->query("SELECT COUNT(*) c FROM spark_codes WHERE status = 'available'")) {
        $stats['spark_codes_avail'] = (int)$r->fetch_assoc()['c'];
    }

    exit(json_encode(['success' => true, 'stats' => $stats]));
}

/* ── Global Search across Posts, Files, Links & Folders ── */
$q = trim($_GET['q'] ?? '');
if ($q === '') {
    exit(json_encode(['success' => true, 'posts' => [], 'files' => [], 'folders' => []]));
}

$like = '%' . $db->real_escape_string($q) . '%';
$sparkAllowed = hasSparkSubscription($uid, $user['role']);
$sparkFilter  = $sparkAllowed ? "" : "AND section != 'spark'";

/* 1. Search Posts */
$posts = [];
$pRes = $db->query("
    SELECT id, section, title, content, is_pinned, created_at
    FROM posts
    WHERE (title LIKE '$like' OR content LIKE '$like') $sparkFilter
    ORDER BY is_pinned DESC, created_at DESC
    LIMIT 20
");
if ($pRes) {
    while ($r = $pRes->fetch_assoc()) {
        $r['id'] = (int)$r['id'];
        $posts[] = $r;
    }
}

/* 2. Search Files & Links */
$files = [];
$fRes = $db->query("
    SELECT id, section, subject, folder_id, item_type, title, description, original_name, file_path, external_url, file_size, extension, created_at
    FROM files
    WHERE (title LIKE '$like' OR description LIKE '$like' OR original_name LIKE '$like' OR subject LIKE '$like') $sparkFilter
    ORDER BY created_at DESC
    LIMIT 40
");
if ($fRes) {
    while ($r = $fRes->fetch_assoc()) {
        $r['id']        = (int)$r['id'];
        $r['folder_id'] = $r['folder_id'] ? (int)$r['folder_id'] : null;
        $r['file_size'] = (int)$r['file_size'];
        $files[] = $r;
    }
}

/* 3. Search Folders */
$folders = [];
$flRes = $db->query("
    SELECT id, section, subject, parent_id, name, created_at
    FROM folders
    WHERE (name LIKE '$like' OR subject LIKE '$like') $sparkFilter
    ORDER BY name ASC
    LIMIT 20
");
if ($flRes) {
    while ($r = $flRes->fetch_assoc()) {
        $r['id']        = (int)$r['id'];
        $r['parent_id'] = $r['parent_id'] ? (int)$r['parent_id'] : null;
        $folders[] = $r;
    }
}

exit(json_encode([
    'success' => true,
    'posts'   => $posts,
    'files'   => $files,
    'folders' => $folders
]));
