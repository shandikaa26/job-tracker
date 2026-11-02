-- ========================================================
-- Database Schema: Job Tracker (MySQL / MariaDB)
-- Sesuai Materi Kuliah FPEB - Universitas Pendidikan Indonesia
-- ========================================================

CREATE DATABASE IF NOT EXISTS job_tracker;

-- Buat user database sesuai slide PPT
CREATE USER IF NOT EXISTS 'user_job'@'localhost' IDENTIFIED BY 'passwordku';
GRANT ALL PRIVILEGES ON job_tracker.* TO 'user_job'@'localhost';
FLUSH PRIVILEGES;

USE job_tracker;

-- 1. Tabel Utama: Daftar Lamaran Kerja
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabel Riwayat Status (Timeline Tracking Progress)
CREATE TABLE IF NOT EXISTS status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 3. Tabel Pengaturan Sistem (API Key Gemini)
CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT
);
