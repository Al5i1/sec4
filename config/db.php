<?php
/* ═══════════════════════════════════════════════════════════════════
   config/db.php — Database connection, Auto-Schema & Auth Guards
   ═══════════════════════════════════════════════════════════════════ */

define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'auth_app');

/* File Upload Limits & Allowed Formats */
define('MAX_FILE_SIZE_BYTES', 150 * 1024 * 1024); // 150 MB per file
define('ALLOWED_EXTENSIONS', [
    'pdf', 'zip', 'rar', '7z',
    'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'mp4', 'webm', 'mp3', 'wav',
    'txt', 'md', 'json'
]);
define('BLOCKED_EXTENSIONS', [
    'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'phar',
    'cgi', 'pl', 'py', 'sh', 'bat', 'cmd', 'exe', 'msi', 'vbs', 'htaccess'
]);

mysqli_report(MYSQLI_REPORT_OFF);

function getDB(): mysqli {
    static $conn = null;
    if ($conn === null) {
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS);
        if ($conn->connect_error) {
            http_response_code(500);
            die(json_encode(['success' => false, 'message' => 'MySQL error: ' . $conn->connect_error]));
        }
        $conn->set_charset('utf8mb4');

        /* Auto-create database */
        $conn->query("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $conn->select_db(DB_NAME);

        /* 1. Users table */
        $conn->query("CREATE TABLE IF NOT EXISTS users (
            id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            first_name    VARCHAR(60)  NOT NULL,
            last_name     VARCHAR(60)  NOT NULL,
            email         VARCHAR(180) UNIQUE,
            phone         VARCHAR(20)  UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role          ENUM('user','admin') NOT NULL DEFAULT 'user',
            is_active     TINYINT(1)   NOT NULL DEFAULT 1,
            avatar        VARCHAR(255) DEFAULT NULL,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* Add columns safely if upgrading */
        $cols = [];
        $resCols = $conn->query("SHOW COLUMNS FROM users");
        if ($resCols) {
            while ($c = $resCols->fetch_assoc()) $cols[$c['Field']] = true;
        }
        if (!isset($cols['is_active'])) {
            $conn->query("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role");
        }
        if (!isset($cols['avatar'])) {
            $conn->query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL AFTER is_active");
        }

        /* Seed default admin if not exists */
        $check = $conn->query("SELECT COUNT(*) AS cnt FROM users WHERE email = 'admin@admin.com'");
        if ($check && ($row = $check->fetch_assoc()) && (int)$row['cnt'] === 0) {
            $hash = password_hash('Admin@1234', PASSWORD_BCRYPT);
            $stmt = $conn->prepare("INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active) VALUES ('Admin', 'SEC4', 'admin@admin.com', '+97330000000', ?, 'admin', 1)");
            if ($stmt) {
                $stmt->bind_param('s', $hash);
                $stmt->execute();
                $stmt->close();
            }
        }

        /* 2. Posts / Announcements table */
        $conn->query("CREATE TABLE IF NOT EXISTS posts (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            section     VARCHAR(50)  NOT NULL DEFAULT 'general', /* general or spark */
            title       VARCHAR(255) NOT NULL,
            content     TEXT         NOT NULL,
            is_pinned   TINYINT(1)   NOT NULL DEFAULT 0,
            notify_all  TINYINT(1)   NOT NULL DEFAULT 0,
            author_id   INT UNSIGNED DEFAULT NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $pCols = [];
        if ($rP = $conn->query("SHOW COLUMNS FROM posts")) {
            while ($c = $rP->fetch_assoc()) $pCols[$c['Field']] = true;
        }
        if (!isset($pCols['section'])) {
            $conn->query("ALTER TABLE posts ADD COLUMN section VARCHAR(50) NOT NULL DEFAULT 'general' AFTER id");
        }

        /* 3. Post attachments */
        $conn->query("CREATE TABLE IF NOT EXISTS post_files (
            id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            post_id       INT UNSIGNED NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name   VARCHAR(255) NOT NULL,
            file_path     VARCHAR(500) NOT NULL,
            file_size     BIGINT UNSIGNED NOT NULL DEFAULT 0,
            mime_type     VARCHAR(120) DEFAULT NULL,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 4. Notifications */
        $conn->query("CREATE TABLE IF NOT EXISTS notifications (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            title       VARCHAR(255) NOT NULL,
            message     TEXT         NOT NULL,
            post_id     INT UNSIGNED DEFAULT NULL,
            link_url    VARCHAR(500) DEFAULT NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 5. Notification read status */
        $conn->query("CREATE TABLE IF NOT EXISTS notification_reads (
            id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            notification_id INT UNSIGNED NOT NULL,
            user_id         INT UNSIGNED NOT NULL,
            read_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_read (notification_id, user_id),
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 6. Folders (projects, exams, handouts, blackboard, resources, spark) */
        $conn->query("CREATE TABLE IF NOT EXISTS folders (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            section     VARCHAR(50)  NOT NULL,
            subject     VARCHAR(50)  DEFAULT NULL,
            parent_id   INT UNSIGNED DEFAULT NULL,
            name        VARCHAR(255) NOT NULL,
            sort_order  INT          NOT NULL DEFAULT 0,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 7. Files & Links */
        $conn->query("CREATE TABLE IF NOT EXISTS files (
            id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            section       VARCHAR(50)  NOT NULL,
            subject       VARCHAR(50)  DEFAULT NULL,
            folder_id     INT UNSIGNED DEFAULT NULL,
            item_type     ENUM('file','link') NOT NULL DEFAULT 'file',
            title         VARCHAR(255) NOT NULL,
            description   TEXT         DEFAULT NULL,
            original_name VARCHAR(255) DEFAULT NULL,
            stored_name   VARCHAR(255) DEFAULT NULL,
            file_path     VARCHAR(500) DEFAULT NULL,
            external_url  VARCHAR(1000) DEFAULT NULL,
            file_size     BIGINT UNSIGNED NOT NULL DEFAULT 0,
            mime_type     VARCHAR(120) DEFAULT NULL,
            extension     VARCHAR(30)  DEFAULT NULL,
            sort_order    INT          NOT NULL DEFAULT 0,
            downloads     INT UNSIGNED NOT NULL DEFAULT 0,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 8. Favorites */
        $conn->query("CREATE TABLE IF NOT EXISTS favorites (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id     INT UNSIGNED NOT NULL,
            file_id     INT UNSIGNED NOT NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_fav (user_id, file_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 9. Class Schedule entries */
        $conn->query("CREATE TABLE IF NOT EXISTS schedule_entries (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            day_name    VARCHAR(40)  NOT NULL,
            start_time  VARCHAR(20)  NOT NULL,
            end_time    VARCHAR(20)  NOT NULL,
            subject     VARCHAR(100) NOT NULL,
            room        VARCHAR(100) DEFAULT NULL,
            instructor  VARCHAR(120) DEFAULT NULL,
            notes       VARCHAR(255) DEFAULT NULL,
            sort_order  INT          NOT NULL DEFAULT 0,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 10. SPARK Subscription Codes */
        $conn->query("CREATE TABLE IF NOT EXISTS spark_codes (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            code        VARCHAR(80)  NOT NULL UNIQUE,
            status      ENUM('available','used','disabled') NOT NULL DEFAULT 'available',
            used_by     INT UNSIGNED DEFAULT NULL,
            used_at     DATETIME     DEFAULT NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        /* 11. SPARK User Subscriptions (Permanent DB Link) */
        $conn->query("CREATE TABLE IF NOT EXISTS spark_subscriptions (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id     INT UNSIGNED NOT NULL UNIQUE,
            code_id     INT UNSIGNED NOT NULL,
            activated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (code_id) REFERENCES spark_codes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    return $conn;
}

/* ── Server-Side Auth Verification ── */
function requireAuth(): array {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        exit(json_encode(['success' => false, 'message' => 'يرجى تسجيل الدخول أولاً.']));
    }
    $db = getDB();
    $uid = (int)$_SESSION['user_id'];
    $stmt = $db->prepare("SELECT id, first_name, last_name, email, phone, role, is_active, avatar, created_at FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user || (int)$user['is_active'] !== 1) {
        session_destroy();
        http_response_code(403);
        exit(json_encode(['success' => false, 'message' => 'الحساب معطّل أو غير موجود.']));
    }
    $_SESSION['user_role'] = $user['role'];
    return $user;
}

/* ── Strict Admin Guard ── */
function requireAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        http_response_code(403);
        exit(json_encode(['success' => false, 'message' => 'صلاحية مرفوضة — هذا الإجراء مخصص لإدارة SEC4 فقط.']));
    }
    return $user;
}

/* ── Check if user has active SPARK subscription (Admin always has access) ── */
function hasSparkSubscription(int $userId, string $role): bool {
    if ($role === 'admin') return true;
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM spark_subscriptions WHERE user_id = ? LIMIT 1");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok  = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

/* ── Guard for SPARK Content ── */
function requireSparkAccess(): array {
    $user = requireAuth();
    if (!hasSparkSubscription((int)$user['id'], $user['role'])) {
        http_response_code(403);
        exit(json_encode([
            'success' => false,
            'spark_locked' => true,
            'message' => 'قسم SPARK مخصص للمشتركين فقط. يرجى إدخال كود الاشتراك لتفعيل القسم.'
        ]));
    }
    return $user;
}
