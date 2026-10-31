-- ═══════════════════════════════════════
--  database.sql  —  Run this once in phpMyAdmin
-- ═══════════════════════════════════════

CREATE DATABASE IF NOT EXISTS auth_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE auth_app;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name    VARCHAR(60)  NOT NULL,
    last_name     VARCHAR(60)  NOT NULL,
    email         VARCHAR(180) UNIQUE,
    phone         VARCHAR(20)  UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default admin account  (password: Admin@1234)
INSERT INTO users (first_name, last_name, email, phone, password_hash, role)
VALUES (
    'Admin', 'User',
    'admin@admin.com',
    '0500000000',
    '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin@1234
    'admin'
);
