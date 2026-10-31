require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper to get local network IP
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server after DB is ready
async function start() {
  try {
    await getDb();
    console.log('✅ Database initialized');

    // Routes (loaded after DB init)
    const jobsRouter = require('./routes/jobs');
    app.use('/api/jobs', jobsRouter);

    app.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIp();
      console.log(`\n🚀 Job Tracker running:`);
      console.log(`   💻 Di Laptop/Komputer: http://localhost:${PORT}`);
      console.log(`   📱 Di HP / Device Lain: http://${localIp}:${PORT} (Satu Wi-Fi)\n`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
