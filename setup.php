<?php
/* ═══════════════════════════════════════
   setup.php — Auto-create database & admin
   ═══════════════════════════════════════ */

header('Content-Type: text/html; charset=utf-8');

$conn = new mysqli('localhost', 'root', '');
if ($conn->connect_error) {
    die('<h2>❌ فشل الاتصال بـ MySQL: ' . $conn->connect_error . '</h2>');
}

$conn->query("CREATE DATABASE IF NOT EXISTS auth_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$conn->select_db('auth_app');

$conn->query("CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name    VARCHAR(60)  NOT NULL,
    last_name     VARCHAR(60)  NOT NULL,
    email         VARCHAR(180) UNIQUE,
    phone         VARCHAR(20)  UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$adminEmail = 'admin@admin.com';
$adminPhone = '+97330000000';
$adminHash  = password_hash('Admin@1234', PASSWORD_BCRYPT);

$stmt = $conn->prepare("INSERT INTO users (first_name, last_name, email, phone, password_hash, role)
                        VALUES ('Admin', 'User', ?, ?, ?, 'admin')
                        ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin'");
$stmt->bind_param('sss', $adminEmail, $adminPhone, $adminHash);
$stmt->execute();

echo '<div style="font-family:sans-serif;text-align:center;margin-top:80px;direction:rtl;">
        <h2>✅ تم إنشاء قاعدة البيانات وحساب الـ Admin بنجاح!</h2>
        <p>البريد: <b>admin@admin.com</b> | كلمة المرور: <b>Admin@1234</b></p>
        <br>
        <a href="html/index.html" style="padding:12px 24px;background:#667eea;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
          🚀 اذهب لصفحة تسجيل الدخول
        </a>
      </div>';
