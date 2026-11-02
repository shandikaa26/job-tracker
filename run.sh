#!/bin/bash
# Matikan proses lama di port 8000 jika ada
fuser -k 8000/tcp 2>/dev/null || true

# Jalankan server Job Tracker Python Flask
python3 app.py
