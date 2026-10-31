const express = require('express');
const multer = require('multer');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db/database');
const { extractFromText, extractFromImage, getActiveApiKey } = require('../services/gemini');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ─── GET /settings ─────────────────────────────────────────
router.get('/settings', (req, res) => {
  const currentKey = getActiveApiKey();
  const maskedKey = currentKey
    ? (currentKey.length > 8 ? `${currentKey.substring(0, 4)}...${currentKey.slice(-4)}` : '••••••••')
    : '';

  res.json({
    hasKey: Boolean(currentKey),
    maskedKey: maskedKey
  });
});

// ─── POST /settings ────────────────────────────────────────
router.post('/settings', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'API Key wajib diisi' });
  }

  const trimmed = apiKey.trim();
  run(
    `INSERT INTO settings (key, value) VALUES ('gemini_api_key', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [trimmed]
  );

  res.json({
    success: true,
    message: 'API Key berhasil disimpan!',
    hasKey: true,
    maskedKey: `${trimmed.substring(0, 4)}...${trimmed.slice(-4)}`
  });
});

// ─── POST /seed (Sample Data) ──────────────────────────────
router.post('/seed', (req, res) => {
  const sampleJobs = [
    {
      company: 'GoTo Financial',
      position: 'Senior Backend Engineer (Go/Node)',
      location: 'Jakarta (Hybrid)',
      salary: 'Rp 28.000.000 - Rp 38.000.000',
      job_type: 'Full-time',
      description: 'Membangun payment gateway berkecepatan tinggi, integrasi QRIS, dan arsitektur microservices berskala jutaan transaksi per hari.',
      source: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs',
      status: 'Technical Test',
      notes: 'Take-home test dikirim tanggal 28, batas pengumpulan Jumat depan.',
      applied_date: '2026-10-25'
    },
    {
      company: 'Traveloka',
      position: 'Full Stack Engineer (React & TypeScript)',
      location: 'BSD, Tangerang',
      salary: 'Rp 22.000.000 - Rp 30.000.000',
      job_type: 'Full-time',
      description: 'Mengembangkan fitur booking experience baru untuk akomodasi dan integrasi loyalty rewards.',
      source: 'Jobstreet',
      url: 'https://jobstreet.co.id',
      status: 'Interview',
      notes: 'User interview dengan Engineering Lead via Google Meet jam 14:00.',
      applied_date: '2026-10-20'
    },
    {
      company: 'Tiket.com',
      position: 'Frontend Developer',
      location: 'Remote (Indonesia)',
      salary: 'Rp 18.000.000 - Rp 25.000.000',
      job_type: 'Remote',
      description: 'Optimasi performa Core Web Vitals dan redesign halaman checkout tiket pesawat.',
      source: 'Glints',
      url: 'https://glints.com',
      status: 'Offering',
      notes: 'Offering letter sudah masuk via email. Deadline konfirmasi akhir minggu.',
      applied_date: '2026-10-15'
    },
    {
      company: 'Shopee Indonesia',
      position: 'Software QA Engineer',
      location: 'Jakarta Selatan',
      salary: 'Rp 16.000.000 - Rp 22.000.000',
      job_type: 'Full-time',
      description: 'Automation testing menggunakan Playwright dan Cypress untuk marketplace release pipeline.',
      source: 'LinkedIn',
      url: 'https://shopee.co.id',
      status: 'Screening',
      notes: 'HR menghubungi via WhatsApp untuk jadwal call singkat.',
      applied_date: '2026-10-28'
    },
    {
      company: 'Blibli',
      position: 'DevOps / Cloud Engineer',
      location: 'Jakarta Barat',
      salary: 'Rp 25.000.000 - Rp 35.000.000',
      job_type: 'Full-time',
      description: 'Pengelolaan Kubernetes cluster (GKE & EKS), automasi Terraform CI/CD.',
      source: 'Tech in Asia',
      url: 'https://techinasia.com/jobs',
      status: 'Applied',
      notes: 'Baru submit resume & portfolio.',
      applied_date: '2026-10-29'
    }
  ];

  for (const job of sampleJobs) {
    const resInsert = run(
      `INSERT INTO jobs (company, position, location, salary, job_type,
                         description, source, url, status, notes, applied_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.company, job.position, job.location, job.salary, job.job_type,
       job.description, job.source, job.url, job.status,
       job.notes, job.applied_date]
    );

    run('INSERT INTO status_history (job_id, status) VALUES (?, ?)',
      [resInsert.lastInsertRowid, job.status]);
  }

  res.json({ success: true, count: sampleJobs.length, message: `${sampleJobs.length} contoh lamaran berhasil ditambahkan!` });
});

// ─── GET /stats ───────────────────────────────────────────
router.get('/stats', (req, res) => {
  const totalRow = queryOne('SELECT COUNT(*) as count FROM jobs');
  const total = totalRow ? totalRow.count : 0;
  const statuses = queryAll('SELECT status, COUNT(*) as count FROM jobs GROUP BY status');

  const statusMap = {};
  statuses.forEach(s => { statusMap[s.status] = s.count; });

  res.json({
    total,
    statuses: statusMap,
    applied: statusMap['Applied'] || 0,
    screening: statusMap['Screening'] || 0,
    interview: (statusMap['Phone Interview'] || 0) +
               (statusMap['Technical Test'] || 0) +
               (statusMap['Interview'] || 0) +
               (statusMap['Final Interview'] || 0),
    offering: statusMap['Offering'] || 0,
    accepted: statusMap['Accepted'] || 0,
    rejected: statusMap['Rejected'] || 0
  });
});

// ─── GET / ────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { status, search, sort } = req.query;
  let query = 'SELECT * FROM jobs';
  const params = [];
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(company LIKE ? OR position LIKE ? OR location LIKE ? OR notes LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const sortCol = sort === 'company' ? 'company ASC'
                : sort === 'status'  ? 'status ASC'
                : 'updated_at DESC';
  query += ` ORDER BY ${sortCol}`;

  const jobs = queryAll(query, params);
  res.json(jobs);
});

// ─── GET /:id ─────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const job = queryOne('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)]);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const history = queryAll(
    'SELECT * FROM status_history WHERE job_id = ? ORDER BY changed_at ASC',
    [Number(req.params.id)]
  );

  res.json({ ...job, history });
});

// ─── POST / ──────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    company, position, location, salary, job_type,
    description, source, url, status, notes, applied_date
  } = req.body;

  if (!company || !position) {
    return res.status(400).json({ error: 'Perusahaan dan Posisi wajib diisi' });
  }

  const finalStatus = status || 'Applied';
  const finalDate = applied_date || new Date().toISOString().split('T')[0];

  const result = run(
    `INSERT INTO jobs (company, position, location, salary, job_type,
                       description, source, url, status, notes, applied_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [company, position, location || '', salary || '', job_type || '',
     description || '', source || '', url || '', finalStatus,
     notes || '', finalDate]
  );

  run('INSERT INTO status_history (job_id, status) VALUES (?, ?)',
    [result.lastInsertRowid, finalStatus]);

  const job = queryOne('SELECT * FROM jobs WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(job);
});

// ─── POST /extract-text ──────────────────────────────────
router.post('/extract-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Teks lowongan tidak boleh kosong' });
    }
    const extracted = await extractFromText(text);
    res.json(extracted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /extract-image ─────────────────────────────────
router.post('/extract-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Silakan pilih gambar lowongan kerja' });
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const extracted = await extractFromImage(base64, mimeType);
    res.json(extracted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PUT /:id ────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const job = queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return res.status(404).json({ error: 'Lamaran tidak ditemukan' });

  const {
    company, position, location, salary, job_type,
    description, source, url, status, notes, applied_date
  } = req.body;

  // Record status change in history
  if (status && status !== job.status) {
    run('INSERT INTO status_history (job_id, status) VALUES (?, ?)', [id, status]);
  }

  run(
    `UPDATE jobs SET
       company = ?, position = ?, location = ?, salary = ?, job_type = ?,
       description = ?, source = ?, url = ?, status = ?, notes = ?,
       applied_date = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      company  || job.company,
      position || job.position,
      (location !== undefined && location !== null) ? location : job.location,
      (salary !== undefined && salary !== null) ? salary : job.salary,
      (job_type !== undefined && job_type !== null) ? job_type : job.job_type,
      (description !== undefined && description !== null) ? description : job.description,
      (source !== undefined && source !== null) ? source : job.source,
      (url !== undefined && url !== null) ? url : job.url,
      status   || job.status,
      (notes !== undefined && notes !== null) ? notes : job.notes,
      applied_date || job.applied_date,
      id
    ]
  );

  const updated = queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
  res.json(updated);
});

// ─── PATCH /:id/status ───────────────────────────────────
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib dipilih' });

  const id = Number(req.params.id);
  const job = queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return res.status(404).json({ error: 'Lamaran tidak ditemukan' });

  run('INSERT INTO status_history (job_id, status) VALUES (?, ?)', [id, status]);
  run("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);

  const updated = queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
  res.json(updated);
});

// ─── DELETE /:id ─────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const job = queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return res.status(404).json({ error: 'Lamaran tidak ditemukan' });

  run('DELETE FROM status_history WHERE job_id = ?', [id]);
  run('DELETE FROM jobs WHERE id = ?', [id]);
  res.json({ message: 'Lamaran berhasil dihapus' });
});

module.exports = router;
