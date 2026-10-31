<?php
/* ═══════════════════════════════════════════════════════════════════
   api/backup.php — Database Backup & Restore System (Admin Only)
   ═══════════════════════════════════════════════════════════════════ */

require_once __DIR__ . '/../config/db.php';

$admin  = requireAdmin();
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];

$tables = [
    'users',
    'posts',
    'post_files',
    'notifications',
    'notification_reads',
    'folders',
    'files',
    'favorites',
    'schedule_entries',
    'spark_codes',
    'spark_subscriptions'
];

function buildBackupPayload(mysqli $db, array $tables): array {
    $data = [
        'meta' => [
            'platform'   => 'SEC4 Academic Platform',
            'version'    => '2.0',
            'created_at' => date('c'),
        ],
        'tables' => []
    ];
    foreach ($tables as $t) {
        $rows = [];
        $res  = $db->query("SELECT * FROM `$t`");
        if ($res) {
            while ($r = $res->fetch_assoc()) $rows[] = $r;
        }
        $data['tables'][$t] = $rows;
    }
    return $data;
}

/* ── GET: Download backup file OR list saved server backups ── */
if ($method === 'GET') {
    $mode = $_GET['mode'] ?? 'list';

    if ($mode === 'download') {
        $payload  = buildBackupPayload($db, $tables);
        $filename = 'sec4_backup_' . date('Y-m-d_H-i-s') . '.json';
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    header('Content-Type: application/json; charset=utf-8');
    $backupDir = __DIR__ . '/../uploads/backups/';
    if (!is_dir($backupDir)) mkdir($backupDir, 0775, true);

    $list = [];
    foreach (glob($backupDir . '*.json') as $file) {
        $list[] = [
            'name'       => basename($file),
            'size'       => filesize($file),
            'created_at' => date('Y-m-d H:i:s', filemtime($file)),
        ];
    }
    usort($list, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));

    exit(json_encode(['success' => true, 'backups' => $list]));
}

/* ── POST: Create server snapshot OR Restore from snapshot / uploaded JSON ── */
header('Content-Type: application/json; charset=utf-8');

if ($method === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === '') {
        $raw  = file_get_contents('php://input');
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $action = $json['action'] ?? '';
            $_POST  = array_merge($_POST, $json);
        }
    }

    $backupDir = __DIR__ . '/../uploads/backups/';
    if (!is_dir($backupDir)) mkdir($backupDir, 0775, true);

    /* 1. Save backup snapshot on server */
    if ($action === 'create_snapshot') {
        $payload  = buildBackupPayload($db, $tables);
        $filename = 'sec4_snapshot_' . date('Y-m-d_H-i-s') . '.json';
        file_put_contents($backupDir . $filename, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        exit(json_encode([
            'success'  => true,
            'message'  => '✅ تم حفظ نسخة احتياطية جديدة على الخادم بنجاح.',
            'filename' => $filename
        ]));
    }

    /* 2. Delete server snapshot */
    if ($action === 'delete_snapshot') {
        $name = basename($_POST['name'] ?? '');
        $path = $backupDir . $name;
        if ($name !== '' && is_file($path)) {
            @unlink($path);
            exit(json_encode(['success' => true, 'message' => '🗑️ تم حذف النسخة الاحتياطية.']));
        }
        http_response_code(404);
        exit(json_encode(['success' => false, 'message' => 'الملف غير موجود.']));
    }

    /* 3. Restore backup (from server file OR uploaded JSON file) */
    if ($action === 'restore') {
        $rawContent = '';
        if (!empty($_FILES['backup_file']['tmp_name']) && $_FILES['backup_file']['error'] === UPLOAD_ERR_OK) {
            $rawContent = file_get_contents($_FILES['backup_file']['tmp_name']);
        } elseif (!empty($_POST['snapshot_name'])) {
            $snapPath = $backupDir . basename($_POST['snapshot_name']);
            if (is_file($snapPath)) {
                $rawContent = file_get_contents($snapPath);
            }
        }

        if ($rawContent === '') {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'لم يتم تحديد ملف نسخة احتياطية صالح.']));
        }

        $parsed = json_decode($rawContent, true);
        if (!is_array($parsed) || empty($parsed['tables']) || !is_array($parsed['tables'])) {
            http_response_code(422);
            exit(json_encode(['success' => false, 'message' => 'ملف النسخة الاحتياطية تالف أو غير متوافق.']));
        }

        $db->query("SET FOREIGN_KEY_CHECKS = 0");
        $db->begin_transaction();
        try {
            foreach ($tables as $t) {
                if (!isset($parsed['tables'][$t]) || !is_array($parsed['tables'][$t])) continue;
                $db->query("DELETE FROM `$t`");

                foreach ($parsed['tables'][$t] as $row) {
                    if (!is_array($row) || empty($row)) continue;
                    $cols = array_keys($row);
                    $colList = '`' . implode('`,`', array_map([$db, 'real_escape_string'], $cols)) . '`';
                    $vals = [];
                    foreach ($row as $v) {
                        $vals[] = ($v === null) ? 'NULL' : ("'" . $db->real_escape_string((string)$v) . "'");
                    }
                    $valList = implode(',', $vals);
                    $db->query("INSERT INTO `$t` ($colList) VALUES ($valList)");
                }
            }
            $db->commit();
            $db->query("SET FOREIGN_KEY_CHECKS = 1");
            exit(json_encode(['success' => true, 'message' => '🎉 تم استرجاع النسخة الاحتياطية وجميع البيانات بنجاح!']));
        } catch (Throwable $e) {
            $db->rollback();
            $db->query("SET FOREIGN_KEY_CHECKS = 1");
            http_response_code(500);
            exit(json_encode(['success' => false, 'message' => 'فشل الاسترجاع: ' . $e->getMessage()]));
        }
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
