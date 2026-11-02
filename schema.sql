-- ========================================================
-- Database Schema: Job Tracker dengan Sistem Multi-User
-- Sesuai Materi Kuliah FPEB - Universitas Pendidikan Indonesia
-- ========================================================

CREATE DATABASE IF NOT EXISTS job_tracker;

-- Buat user database jika belum ada
CREATE USER IF NOT EXISTS 'user_job'@'localhost' IDENTIFIED BY 'passwordku';
GRANT ALL PRIVILEGES ON job_tracker.* TO 'user_job'@'localhost';
FLUSH PRIVILEGES;

USE job_tracker;

-- 1. Tabel Pengguna (Users Authentication)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Utama: Daftar Lamaran Kerja (Milik Masing-Masing User)
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company VARCHAR(150) NOT NULL,
    position VARCHAR(150) NOT NULL,
    location VARCHAR(100) DEFAULT '',
    salary VARCHAR(100) DEFAULT '',
    job_type VARCHAR(50) DEFAULT '',
    description TEXT,
    source VARCHAR(100) DEFAULT '',
    url TEXT,
    status VARCHAR(50) DEFAULT 'Applied',
    notes TEXT,
    applied_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Tabel Riwayat Status (Timeline Tracking Progress)
CREATE TABLE IF NOT EXISTS status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 4. Tabel Pengaturan Sistem per User (API Key Gemini)
CREATE TABLE IF NOT EXISTS settings (
    user_id INT NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT,
    PRIMARY KEY (user_id, `key`),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
