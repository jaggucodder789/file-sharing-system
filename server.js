// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'files.json');

// ensure folders / files
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}', 'utf8');

// util to load/save DB (simple JSON)
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}');
  } catch (e) {
    console.error('Failed to read DB', e);
    return {};
  }
}
function saveDB(obj) {
  fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200 MB limit (adjust if needed)
});

// static
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// helpers
function genId() {
  return crypto.randomBytes(6).toString('hex');
}
function hashPwd(p) {
  if (!p) return null;
  return crypto.createHash('sha256').update(p).digest('hex');
}

// Upload endpoint (AJAX POST from frontend)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const DB = loadDB();
    const id = genId();
    // expiry: 10 minutes from now (change ms if you prefer)
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const password = req.body.password || null;

    DB[id] = {
      id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      passwordHash: password ? hashPwd(password) : null,
      uploadedAt: Date.now(),
      expiresAt
    };

    saveDB(DB);

    // qr + download page url
    const fileUrl = `${req.protocol}://${req.get('host')}/download.html?id=${id}`;
    const qrData = await QRCode.toDataURL(fileUrl);

    console.log(`Uploaded ${req.file.originalname} -> id=${id}`);
    res.json({ message: 'uploaded', id, fileUrl, qrData, expiresAt });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

// Provide metadata for download page (JS fetch)
app.get('/meta/:id', (req, res) => {
  const DB = loadDB();
  const f = DB[req.params.id];
  if (!f) return res.status(404).json({ error: 'Not found or expired' });
  res.json({
    id: f.id,
    originalName: f.originalName,
    expiresAt: f.expiresAt,
    passwordProtected: !!f.passwordHash
  });
});

// Download route that triggers file download (form POST will hit this)
app.post('/download/:id', (req, res) => {
  const id = req.params.id;
  const DB = loadDB();
  const f = DB[id];
  if (!f) return res.status(404).send('Invalid or expired link');

  // check expiry
  if (Date.now() > f.expiresAt) {
    // try to delete file if still exists
    try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
    delete DB[id];
    saveDB(DB);
    return res.status(410).send('Link expired');
  }

  // password check
  if (f.passwordHash) {
    const provided = (req.body && req.body.password) || '';
    if (hashPwd(provided) !== f.passwordHash) {
      return res.status(401).send('Invalid password');
    }
  }

  // stream download
  const sendName = f.originalName || path.basename(f.path);
  res.download(f.path, sendName, (err) => {
    if (err) {
      console.error('Download error', err);
      if (!res.headersSent) res.status(500).send('Download failed');
    } else {
      console.log(`Downloaded id=${id} file=${sendName}`);
    }
  });
});

// simple health
app.get('/health', (req, res) => {
  const DB = loadDB();
  res.json({ ok: true, stored: Object.keys(DB).length });
});

// cleanup job: every 1 minute, remove expired files
setInterval(() => {
  const DB = loadDB();
  let changed = false;
  for (const [id, f] of Object.entries(DB)) {
    if (Date.now() > f.expiresAt) {
      try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
      delete DB[id];
      changed = true;
      console.log(`Auto-deleted expired file id=${id}`);
    }
  }
  if (changed) saveDB(DB);
}, 60 * 1000);

// start
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
