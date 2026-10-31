# 🎯 Job Tracker AI Website

Website pelacak lamaran kerja modern dengan fitur **Auto-Extract Otomatis Lowongan Kerja** menggunakan Google Gemini AI (teks & gambar screenshot loker), dilengkapi **Interactive Progress Stepper** dan **Kanban Board**.

---

## 🌟 Fitur Utama

1. **Auto-Extract dari Teks Lowongan**:
   - Salin dan tempel deskripsi lowongan kerja dari LinkedIn, Jobstreet, Glints, Kalibrr, atau email.
   - AI Gemini otomatis mendeteksi: Nama Perusahaan, Posisi, Lokasi, Range Gaji, Tipe Pekerjaan (Remote/Hybrid/Fulltime), Ringkasan Tanggung Jawab, dan Sumber Info.

2. **Auto-Extract dari Screenshot Gambar (AI Vision)**:
   - Upload screenshot postingan loker dari Instagram, flyer poster, atau LinkedIn.
   - Model Gemini Vision langsung membaca teks dalam gambar dan mengisi formulir secara instan.

3. **Pelacakan Progress Real-Time**:
   - **One-Click Step Advance**: Naik ke tahap berikutnya (`Applied` ➔ `Screening` ➔ `Interview/Test` ➔ `Offering` ➔ `Accepted` 🎉 / `Rejected`) hanya dengan satu klik!
   - Riwayat otomatis mencatat tanggal dan jam setiap kali terjadi perubahan status.

4. **Dua Mode Tampilan**:
   - **Tampilan Kartu (Grid View)**: Dilengkapi interactive progress stepper di setiap kartu.
   - **Tampilan Papan Kanban (Kanban Board)**: Drag/lihat pergerakan lamaran per kolom tahap seleksi.

5. **Pengaturan API Key Langsung di UI**:
   - Memasukkan Google Gemini API Key secara langsung melalui tombol pengaturan di antarmuka web tanpa perlu mengedit file secara manual.
   - Menggunakan SQLite database lokal (`sql.js`), data tersimpan rapi dan aman di komputer.

---

## 🚀 Cara Menjalankan

### Cara Cepat (Windows):
Cukup **double click** file `start.bat` di folder project `d:\job-tracker\`.
Browser akan terbuka otomatis di `http://localhost:3000`.

### Cara Manual via Terminal:
```bash
cd d:\job-tracker
npm install
node server.js
```
Lalu buka browser di [http://localhost:3000](http://localhost:3000).

---

## 🔑 Cara Mendapatkan Gemini API Key (Gratis)
1. Buka [Google AI Studio](https://aistudio.google.com/apikey).
2. Login dengan akun Google.
3. Klik tombol **"Create API Key"**.
4. Di website Job Tracker, klik tombol **"API Key Gemini"** di pojok kanan atas, tempel key tersebut lalu klik Simpan.

---

## 📁 Struktur Folder
```
d:\job-tracker/
├── server.js              # Entrypoint server Express
├── start.bat              # Script sekali klik untuk menjalankan di Windows
├── package.json           # Dependencies (express, @google/generative-ai, sql.js, multer)
├── db/
│   ├── database.js        # SQLite database engine (sql.js)
│   └── jobs.db            # File database tersimpan lokal
├── routes/
│   └── jobs.js            # API Endpoint (CRUD lamaran, auto-extract, stats, seed, settings)
├── services/
│   └── gemini.js          # Integrasi Google Gemini 2.0 Flash AI & Vision
└── public/
    ├── index.html         # Tampilan web utama
    ├── css/
    │   └── style.css      # Styling responsif, animasi, & tema
    └── js/
        └── app.js         # Logika interaktif frontend & progress tracking
```
