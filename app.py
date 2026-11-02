import os
import json
import base64
import re
import sqlite3
from datetime import date, datetime
import requests
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

try:
    import pymysql
    import pymysql.cursors
except ImportError:
    pymysql = None

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'job-tracker-upi-super-secret-key-2026')
CORS(app, supports_credentials=True)

# ─── Configuration ──────────────────────────────────────────
PORT = int(os.environ.get('PORT', 8000))
DB_TYPE = os.environ.get('DB_TYPE', 'auto')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_USER = os.environ.get('DB_USER', 'user_job')
DB_PASS = os.environ.get('DB_PASS', 'passwordku')
DB_NAME = os.environ.get('DB_NAME', 'job_tracker')
SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'jobs.db')

DETECTED_ENGINE = None

# ─── Global Error Handler (Always JSON, never HTML 500) ─────
@app.errorhandler(Exception)
def handle_global_error(e):
    import traceback
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500

# ─── Database Layer (MySQL with SQLite Fallback) ────────────
def detect_database_engine():
    global DETECTED_ENGINE
    if DETECTED_ENGINE is not None:
        return DETECTED_ENGINE

    if DB_TYPE in ('mysql', 'auto') and pymysql is not None:
        try:
            conn = pymysql.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASS,
                database=DB_NAME,
                connect_timeout=1,
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True,
                charset='utf8mb4'
            )
            conn.close()
            DETECTED_ENGINE = 'mysql'
            return 'mysql'
        except Exception:
            if DB_TYPE == 'mysql':
                raise

    DETECTED_ENGINE = 'sqlite'
    return 'sqlite'

def get_db_connection():
    engine = detect_database_engine()
    if engine == 'mysql':
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
            charset='utf8mb4'
        )
        return conn, 'mysql'

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def init_db():
    conn, engine = get_db_connection()
    cursor = conn.cursor()

    if engine == 'mysql':
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL DEFAULT 1,
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
                INDEX (user_id)
            );
        """)
        # Auto-migration if user_id is missing in MySQL
        try:
            cursor.execute("ALTER TABLE jobs ADD COLUMN user_id INT NOT NULL DEFAULT 1")
            print("[MIGRATE] user_id ditambahkan ke MySQL jobs")
        except Exception:
            pass

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS status_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT NOT NULL,
                status VARCHAR(50) NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                `key` VARCHAR(100) PRIMARY KEY,
                `value` TEXT
            );
        """)

        # Ensure default user 1 exists
        cursor.execute("SELECT id FROM users WHERE id = 1")
        if not cursor.fetchone():
            default_hash = generate_password_hash("password123")
            cursor.execute("INSERT INTO users (id, name, email, password_hash) VALUES (1, %s, %s, %s)",
                           ("Demo User", "demo@jobtracker.com", default_hash))

        conn.close()
        print(f"[OK] Database MySQL ({DB_NAME}) terhubung!")
    else:
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                company TEXT NOT NULL,
                position TEXT NOT NULL,
                location TEXT DEFAULT '',
                salary TEXT DEFAULT '',
                job_type TEXT DEFAULT '',
                description TEXT DEFAULT '',
                source TEXT DEFAULT '',
                url TEXT DEFAULT '',
                status TEXT DEFAULT 'Applied',
                notes TEXT DEFAULT '',
                applied_date TEXT DEFAULT (date('now')),
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                changed_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)

        # Auto-migration if user_id is missing in SQLite
        try:
            cursor.execute("ALTER TABLE jobs ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
            print("[MIGRATE] user_id ditambahkan ke SQLite jobs")
        except Exception:
            pass

        # Ensure default user 1 exists
        cursor.execute("SELECT id FROM users WHERE id = 1")
        if not cursor.fetchone():
            default_hash = generate_password_hash("password123")
            cursor.execute("INSERT INTO users (id, name, email, password_hash) VALUES (1, ?, ?, ?)",
                           ("Demo User", "demo@jobtracker.com", default_hash))

        conn.commit()
        conn.close()
        print("[OK] Database SQLite (jobs.db) siap digunakan!")

def db_query_all(query, params=()):
    conn, engine = get_db_connection()
    cursor = conn.cursor()
    if engine == 'sqlite':
        query = query.replace('%s', '?')
    else:
        query = query.replace('?', '%s')

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    if engine == 'sqlite':
        return [dict(row) for row in rows]
    return rows

def db_query_one(query, params=()):
    rows = db_query_all(query, params)
    return rows[0] if rows else None

def db_execute(query, params=()):
    conn, engine = get_db_connection()
    cursor = conn.cursor()
    if engine == 'sqlite':
        query = query.replace('%s', '?')
    else:
        query = query.replace('?', '%s')

    cursor.execute(query, params)
    last_id = cursor.lastrowid
    if engine == 'sqlite':
        conn.commit()
    conn.close()
    return last_id

# ─── Data Serialization Helper ──────────────────────────────
def serialize_job(job):
    if not job:
        return job
    j = dict(job)
    for key in ('applied_date', 'created_at', 'updated_at'):
        if isinstance(j.get(key), (date, datetime)):
            j[key] = str(j[key])
    return j

# ─── Auth Helper ────────────────────────────────────────────
def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return db_query_one("SELECT id, name, email, created_at FROM users WHERE id = ?", (user_id,))

# ─── Gemini AI Service (Centralized API Key) ────────────────
EXTRACTION_PROMPT = """You are an expert job posting analyzer. Extract structured information from the provided job posting text or screenshot.
Return ONLY a valid JSON object with the following fields:

{
  "company": "Company name",
  "position": "Job title or position name",
  "location": "City, Country, or 'Remote' / 'Hybrid' / 'Onsite'",
  "salary": "Salary range or compensation details if mentioned, otherwise empty string",
  "job_type": "Full-time, Part-time, Contract, Internship, Freelance, or Remote",
  "description": "Brief summary of key responsibilities and requirements (2-3 sentences)",
  "source": "Platform where this was posted (e.g. LinkedIn, Jobstreet, Glints, Kalibrr, Indeed, Tech in Asia) or empty string",
  "url": "Application or company URL if present, otherwise empty string"
}

Important Instructions:
- If a field is not found or ambiguous, leave it as an empty string "".
- Clean up any messy formatting, line breaks, or OCR artifacts.
- Do NOT wrap the output in markdown code blocks like ```json. Return raw JSON string only."""

CANDIDATE_MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.5-flash',
    'gemini-3.8-flash'
]

def get_active_api_key():
    # Centralized API Key from environment or database settings
    env_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if env_key and env_key != 'your_gemini_api_key_here':
        return env_key

    try:
        row = db_query_one("SELECT value FROM settings WHERE `key` = 'gemini_api_key' LIMIT 1")
        if row and row.get('value') and len(row['value'].strip()) > 5:
            return row['value'].strip()
    except Exception:
        pass
    return None

def call_gemini_api(contents_payload):
    api_key = get_active_api_key()
    if not api_key:
        raise ValueError("API Key Gemini belum diset oleh admin server di file .env")

    last_error = None
    for model_name in CANDIDATE_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {"contents": contents_payload}

        for attempt in range(2):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=25)
                if resp.status_code == 200:
                    data = resp.json()
                    text = data['candidates'][0]['content']['parts'][0]['text']
                    cleaned = re.sub(r'```json\n?|```\n?', '', text).strip()
                    return json.loads(cleaned)
                
                # Check error details
                msg = resp.text
                try:
                    err_json = resp.json().get('error', {})
                    msg = err_json.get('message', resp.text)
                except Exception:
                    pass
                
                last_error = f"{model_name} ({resp.status_code}): {msg}"

                # If overloaded (503), rate limited (429), or server error (500/502), wait and try next model
                if resp.status_code in (429, 503, 500, 502, 504):
                    import time
                    time.sleep(1)
                    break  # Move to next candidate model
                elif resp.status_code == 404:
                    break  # Model not found, move to next model
                else:
                    # Authentication or bad request error
                    raise ValueError(f"Google AI Error ({resp.status_code}): {msg}")

            except requests.exceptions.RequestException as e:
                last_error = str(e)
                continue

    raise ValueError(f"Google AI sedang padat (High Demand). Silakan coba lagi dalam beberapa detik: {last_error}")

# ─── Routes: Web Interface ──────────────────────────────────
@app.route('/')
def home():
    return render_template('index.html')

# ─── Routes: Authentication API ─────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({"error": "Nama, email, dan password wajib diisi"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password minimal 6 karakter"}), 400

    existing = db_query_one("SELECT id FROM users WHERE email = ?", (email,))
    if existing:
        return jsonify({"error": "Email ini sudah terdaftar. Silakan login."}), 400

    pwd_hash = generate_password_hash(password)
    user_id = db_execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", (name, email, pwd_hash))
    session['user_id'] = user_id

    return jsonify({
        "success": True,
        "message": f"Selamat datang, {name}! Akun berhasil dibuat.",
        "user": {"id": user_id, "name": name, "email": email}
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Email dan password wajib diisi"}), 400

    user = db_query_one("SELECT * FROM users WHERE email = ?", (email,))
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Email atau password salah!"}), 401

    session['user_id'] = user['id']
    return jsonify({
        "success": True,
        "message": f"Halo, {user['name']}! Berhasil masuk.",
        "user": {"id": user['id'], "name": user['name'], "email": user['email']}
    })

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('user_id', None)
    return jsonify({"success": True, "message": "Berhasil keluar."})

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False})
    return jsonify({
        "authenticated": True,
        "user": {"id": user['id'], "name": user['name'], "email": user['email']}
    })

# ─── Routes: Statistics (Personalized) ──────────────────────
@app.route('/api/jobs/stats', methods=['GET'])
def get_stats():
    user = get_current_user()
    if not user:
        return jsonify({"total": 0, "statuses": {}, "applied": 0, "screening": 0, "interview": 0, "offering": 0, "accepted": 0, "rejected": 0})

    total_row = db_query_one("SELECT COUNT(*) as count FROM jobs WHERE user_id = ?", (user['id'],))
    total = total_row['count'] if total_row else 0

    statuses_raw = db_query_all("SELECT status, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY status", (user['id'],))
    status_map = {row['status']: row['count'] for row in statuses_raw}

    interview_count = (
        status_map.get('Phone Interview', 0) +
        status_map.get('Technical Test', 0) +
        status_map.get('Interview', 0) +
        status_map.get('Final Interview', 0)
    )

    return jsonify({
        "total": total,
        "statuses": status_map,
        "applied": status_map.get('Applied', 0),
        "screening": status_map.get('Screening', 0),
        "interview": interview_count,
        "offering": status_map.get('Offering', 0),
        "accepted": status_map.get('Accepted', 0),
        "rejected": status_map.get('Rejected', 0)
    })

# ─── Routes: Job List & Filter (Personalized) ───────────────
@app.route('/api/jobs', methods=['GET'])
def list_jobs():
    user = get_current_user()
    if not user:
        return jsonify([])

    status = request.args.get('status')
    search = request.args.get('search')
    sort = request.args.get('sort', 'updated_at')

    query = "SELECT * FROM jobs WHERE user_id = ?"
    conditions = []
    params = [user['id']]

    if status and status != 'all':
        conditions.append("status = ?")
        params.append(status)

    if search:
        conditions.append("(company LIKE ? OR position LIKE ? OR location LIKE ? OR notes LIKE ?)")
        term = f"%{search}%"
        params.extend([term, term, term, term])

    if conditions:
        query += " AND " + " AND ".join(conditions)

    if sort == 'company':
        query += " ORDER BY company ASC"
    elif sort == 'status':
        query += " ORDER BY status ASC"
    else:
        query += " ORDER BY id DESC"

    jobs = db_query_all(query, tuple(params))
    serialized = [serialize_job(j) for j in jobs]
    return jsonify(serialized)

# ─── Routes: Job Detail ─────────────────────────────────────
@app.route('/api/jobs/<int:job_id>', methods=['GET'])
def get_job(job_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Silakan login terlebih dahulu"}), 401

    job = db_query_one("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user['id']))
    if not job:
        return jsonify({"error": "Lamaran tidak ditemukan"}), 404

    history = db_query_all("SELECT * FROM status_history WHERE job_id = ? ORDER BY changed_at ASC", (job_id,))
    for h in history:
        if isinstance(h.get('changed_at'), (date, datetime)):
            h['changed_at'] = str(h['changed_at'])

    job_data = serialize_job(job)
    job_data['history'] = history
    return jsonify(job_data)

# ─── Routes: Create Job ─────────────────────────────────────
@app.route('/api/jobs', methods=['POST'])
def create_job():
    user = get_current_user()
    # If session is lost or user not logged in, fallback to default user (id 1)
    user_id = user['id'] if user else 1

    data = request.get_json() or {}
    company = data.get('company', '').strip()
    position = data.get('position', '').strip()
    if not company or not position:
        return jsonify({"error": "Perusahaan dan Posisi wajib diisi"}), 400

    status = data.get('status', 'Applied')
    applied_date = data.get('applied_date') or str(date.today())

    last_id = db_execute("""
        INSERT INTO jobs (user_id, company, position, location, salary, job_type, description, source, url, status, notes, applied_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, company, position,
        data.get('location', ''),
        data.get('salary', ''),
        data.get('job_type', ''),
        data.get('description', ''),
        data.get('source', ''),
        data.get('url', ''),
        status,
        data.get('notes', ''),
        applied_date
    ))

    db_execute("INSERT INTO status_history (job_id, status) VALUES (?, ?)", (last_id, status))
    job = db_query_one("SELECT * FROM jobs WHERE id = ?", (last_id,))
    return jsonify(serialize_job(job)), 201

# ─── Routes: Update Job ─────────────────────────────────────
@app.route('/api/jobs/<int:job_id>', methods=['PUT'])
def update_job(job_id):
    user = get_current_user()
    user_id = user['id'] if user else 1

    existing = db_query_one("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id))
    if not existing:
        return jsonify({"error": "Lamaran tidak ditemukan"}), 404

    data = request.get_json() or {}
    new_status = data.get('status', existing['status'])
    if new_status != existing['status']:
        db_execute("INSERT INTO status_history (job_id, status) VALUES (?, ?)", (job_id, new_status))

    db_execute("""
        UPDATE jobs SET
            company = ?, position = ?, location = ?, salary = ?, job_type = ?,
            description = ?, source = ?, url = ?, status = ?, notes = ?, applied_date = ?
        WHERE id = ? AND user_id = ?
    """, (
        data.get('company', existing['company']),
        data.get('position', existing['position']),
        data.get('location', existing['location']),
        data.get('salary', existing['salary']),
        data.get('job_type', existing['job_type']),
        data.get('description', existing['description']),
        data.get('source', existing['source']),
        data.get('url', existing['url']),
        new_status,
        data.get('notes', existing['notes']),
        data.get('applied_date', existing['applied_date']),
        job_id,
        user_id
    ))

    updated = db_query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
    return jsonify(serialize_job(updated))

# ─── Routes: Status Patch ───────────────────────────────────
@app.route('/api/jobs/<int:job_id>/status', methods=['PATCH'])
def patch_status(job_id):
    user = get_current_user()
    user_id = user['id'] if user else 1

    existing = db_query_one("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id))
    if not existing:
        return jsonify({"error": "Lamaran tidak ditemukan"}), 404

    data = request.get_json() or {}
    new_status = data.get('status')
    if not new_status:
        return jsonify({"error": "Status wajib diisi"}), 400

    db_execute("INSERT INTO status_history (job_id, status) VALUES (?, ?)", (job_id, new_status))
    db_execute("UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?", (new_status, job_id, user_id))

    updated = db_query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
    return jsonify(serialize_job(updated))

# ─── Routes: Delete Job ─────────────────────────────────────
@app.route('/api/jobs/<int:job_id>', methods=['DELETE'])
def delete_job(job_id):
    user = get_current_user()
    user_id = user['id'] if user else 1

    existing = db_query_one("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id))
    if not existing:
        return jsonify({"error": "Lamaran tidak ditemukan"}), 404

    db_execute("DELETE FROM status_history WHERE job_id = ?", (job_id,))
    db_execute("DELETE FROM jobs WHERE id = ? AND user_id = ?", (job_id, user_id))
    return jsonify({"message": "Lamaran berhasil dihapus"})

# ─── Routes: AI Extraction (Text & Image) ───────────────────
@app.route('/api/jobs/extract-text', methods=['POST'])
def extract_text():
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "Teks lowongan tidak boleh kosong"}), 400

    contents = [{
        "parts": [
            {"text": EXTRACTION_PROMPT},
            {"text": f"\n\nJob Posting Content:\n{text}"}
        ]
    }]
    result = call_gemini_api(contents)
    return jsonify(result)

@app.route('/api/jobs/extract-image', methods=['POST'])
def extract_image():
    if 'image' not in request.files:
        return jsonify({"error": "Silakan pilih file gambar"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "Gambar belum dipilih"}), 400

    image_bytes = file.read()
    mime_type = file.mimetype or 'image/png'
    base64_str = base64.b64encode(image_bytes).decode('utf-8')

    contents = [{
        "parts": [
            {"text": EXTRACTION_PROMPT},
            {
                "inline_data": {
                    "mime_type": mime_type,
                    "data": base64_str
                }
            }
        ]
    }]
    result = call_gemini_api(contents)
    return jsonify(result)

# ─── Routes: Seed Demo Data (Personalized) ──────────────────
@app.route('/api/jobs/seed', methods=['POST'])
def seed_jobs():
    user = get_current_user()
    user_id = user['id'] if user else 1

    sample_jobs = [
        {
            "company": "GoTo Financial",
            "position": "Senior Backend Engineer (Go/Node)",
            "location": "Jakarta (Hybrid)",
            "salary": "Rp 28.000.000 - Rp 38.000.000",
            "job_type": "Full-time",
            "description": "Membangun payment gateway berkecepatan tinggi, integrasi QRIS, dan arsitektur microservices berskala jutaan transaksi per hari.",
            "source": "LinkedIn",
            "url": "https://www.linkedin.com/jobs",
            "status": "Technical Test",
            "notes": "Take-home test dikirim tanggal 28, batas pengumpulan Jumat depan.",
            "applied_date": "2026-10-25"
        },
        {
            "company": "Traveloka",
            "position": "Full Stack Engineer (React & TypeScript)",
            "location": "BSD, Tangerang",
            "salary": "Rp 22.000.000 - Rp 30.000.000",
            "job_type": "Full-time",
            "description": "Mengembangkan fitur booking experience baru untuk akomodasi dan integrasi loyalty rewards.",
            "source": "Jobstreet",
            "url": "https://jobstreet.co.id",
            "status": "Interview",
            "notes": "User interview dengan Engineering Lead via Google Meet jam 14:00.",
            "applied_date": "2026-10-20"
        },
        {
            "company": "Tiket.com",
            "position": "Frontend Developer",
            "location": "Remote (Indonesia)",
            "salary": "Rp 18.000.000 - Rp 25.000.000",
            "job_type": "Remote",
            "description": "Optimasi performa Core Web Vitals dan redesign halaman checkout tiket pesawat.",
            "source": "Glints",
            "url": "https://glints.com",
            "status": "Offering",
            "notes": "Offering letter sudah masuk via email. Deadline konfirmasi akhir minggu.",
            "applied_date": "2026-10-15"
        },
        {
            "company": "Shopee Indonesia",
            "position": "Software QA Engineer",
            "location": "Jakarta Selatan",
            "salary": "Rp 16.000.000 - Rp 22.000.000",
            "job_type": "Full-time",
            "description": "Automation testing menggunakan Playwright dan Cypress untuk marketplace release pipeline.",
            "source": "LinkedIn",
            "url": "https://shopee.co.id",
            "status": "Screening",
            "notes": "HR menghubungi via WhatsApp untuk jadwal call singkat.",
            "applied_date": "2026-10-28"
        },
        {
            "company": "Blibli",
            "position": "DevOps / Cloud Engineer",
            "location": "Jakarta Barat",
            "salary": "Rp 25.000.000 - Rp 35.000.000",
            "job_type": "Full-time",
            "description": "Pengelolaan Kubernetes cluster (GKE & EKS), automasi Terraform CI/CD.",
            "source": "Tech in Asia",
            "url": "https://techinasia.com/jobs",
            "status": "Applied",
            "notes": "Baru submit resume & portfolio.",
            "applied_date": "2026-10-29"
        }
    ]

    for job in sample_jobs:
        last_id = db_execute("""
            INSERT INTO jobs (user_id, company, position, location, salary, job_type, description, source, url, status, notes, applied_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, job['company'], job['position'], job['location'], job['salary'],
            job['job_type'], job['description'], job['source'], job['url'],
            job['status'], job['notes'], job['applied_date']
        ))
        db_execute("INSERT INTO status_history (job_id, status) VALUES (?, ?)", (last_id, job['status']))

    return jsonify({"success": True, "count": len(sample_jobs), "message": f"{len(sample_jobs)} contoh lamaran berhasil ditambahkan ke akun Anda!"})

# ─── Server Startup ─────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    print(f"\n>> Job Tracker (Python Flask) running on http://0.0.0.0:{PORT}")
    print(f"   Akses di browser: http://localhost:{PORT}\n")
    app.run(host='0.0.0.0', port=PORT, debug=True)
