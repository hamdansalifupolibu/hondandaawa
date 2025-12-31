require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database');
const authMiddleware = require('./auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_key_change_me';
// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- FILE UPLOAD CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads', 'projects');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });
const memoryUpload = multer({ storage: multer.memoryStorage() }); // For bulk Excel upload

// --- SECURITY: Rate Limiting ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login/register attempts, please try again later." }
});

// --- ADMIN VERIFICATION ---
// --- ADMIN VERIFICATION ---
const verifyEditor = (req, res, next) => {
    if (!req.userRole || !['super_admin', 'regional_admin', 'editor'].includes(req.userRole)) {
        return res.status(403).json({ error: 'Access denied: Editors only' });
    }
    next();
};

const verifyDeletePermission = (req, res, next) => {
    if (!req.userRole || !['super_admin', 'regional_admin'].includes(req.userRole)) {
        return res.status(403).json({ error: 'Access denied: Cannot delete records' });
    }
    next();
};

const verifyUploader = (req, res, next) => {
    if (!req.userRole || !['super_admin', 'regional_admin', 'analyst'].includes(req.userRole)) {
        return res.status(403).json({ error: 'Access denied: Uploaders only' });
    }
    next();
};

const verifySuperAdmin = (req, res, next) => {
    if (!req.userRole || req.userRole !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied: Super Admin only' });
    }
    next();
};

// --- CACHING & AUDITING ---
const cache = {
    projects: {},
    communities: null,
    metrics: {},
    rates: {},
    ttl: 60 * 1000
};

const clearCache = () => {
    cache.projects = {};
    cache.communities = null;
    cache.metrics = {};
    cache.rates = {};
};

const logAudit = (req, action, details, userOverride = null) => {
    const user = userOverride || req.user || { id: null, username: 'anonymous' };
    const headers = req.headers || {};
    const socket = req.socket || {};
    const ip = headers['x-forwarded-for'] || socket.remoteAddress || 'unknown';

    const stmt = db.prepare("INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)");
    stmt.run(user.id, user.username, action, JSON.stringify(details), ip, (err) => {
        if (err) console.error('Audit Log Error:', err);
    });
    stmt.finalize();
};

// --- BACKUPS ---
cron.schedule('0 0 * * *', () => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const source = path.join(__dirname, 'mp_tracker.db');
    const dest = path.join(backupDir, `mp_tracker_backup_${timestamp}.db`);

    fs.copyFile(source, dest, (err) => {
        if (err) console.error('Backup failed:', err);
        else console.log('Database backup successful:', dest);
    });
});

// --- API ROUTES ---

// Projects (Cached)
app.get('/api/projects', (req, res) => {
    const cacheKey = JSON.stringify(req.query);
    if (cache.projects[cacheKey]) return res.json(cache.projects[cacheKey]);

    const { sector, year_start, year_end, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let baseQuery = "FROM projects WHERE status != 'archived'";
    const params = [];

    if (sector) {
        baseQuery += ' AND sector = ?';
        params.push(sector);
    }

    if (year_start && year_end) {
        baseQuery += ' AND year >= ? AND year <= ?';
        params.push(year_start, year_end);
    }

    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const dataQuery = `SELECT * ${baseQuery} ORDER BY id DESC LIMIT ? OFFSET ?`;

    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });

        const total = countRow ? countRow.total : 0;

        db.all(dataQuery, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const result = {
                projects: rows,
                pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
            };
            cache.projects[cacheKey] = result;
            res.json(result);
        });
    });
});

// Create Project
app.post('/api/projects', authMiddleware, verifyEditor, upload.single('image'), (req, res) => {
    const { name, locations, sector, year, status, category, community } = req.body;
    const image_url = req.file ? `/uploads/projects/${req.file.filename}` : null;

    if (!name || !sector) return res.status(400).json({ error: 'Name and Sector are required' });

    const stmt = `INSERT INTO projects (name, locations, sector, year, status, category, community, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(stmt, [name, locations, sector, year, status, category, community, image_url], function (err) {
        if (err) {
            console.error('Database INSERT Error:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        clearCache();
        logAudit(req, 'CREATE_PROJECT', { id: this.lastID, name });
        res.status(201).json({ id: this.lastID, message: 'Project created', image_url });
    });
});

// Update Project
app.put('/api/projects/:id', authMiddleware, verifyEditor, upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name, locations, sector, year, status, category, community } = req.body;

    let sql = `UPDATE projects SET name=?, locations=?, sector=?, year=?, status=?, category=?, community=?`;
    let params = [name, locations, sector, year, status, category, community];

    if (req.file) {
        sql += `, image_url=?`;
        params.push(`/uploads/projects/${req.file.filename}`);
    }

    sql += ` WHERE id=?`;
    params.push(id);

    db.run(sql, params, function (err) {
        if (err) {
            console.error('Database UPDATE Error:', err);
            fs.appendFileSync('server_error.log', `${new Date().toISOString()} - DB UPDATE ERROR: ${err.message}\n`);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Project not found' });
        clearCache();
        logAudit(req, 'UPDATE_PROJECT', { id, changes: req.body });
        res.json({ message: 'Project updated' });
    });
});

// Delete Project
// Delete Project
app.delete('/api/projects/:id', authMiddleware, verifyEditor, verifyDeletePermission, (req, res) => {
    const { id } = req.params;
    const stmt = `UPDATE projects SET status='archived' WHERE id=?`;
    db.run(stmt, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Project not found' });
        clearCache();
        logAudit(req, 'DELETE_PROJECT', { id });
        res.json({ message: 'Project archived' });
    });
});

// Bulk Upload
app.post('/api/projects/bulk-upload', authMiddleware, verifyUploader, memoryUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);

        let inserted = 0;
        let skipped = 0;

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(`INSERT INTO projects (name, locations, sector, year, status, category, community) VALUES (?, ?, ?, ?, ?, ?, ?)`);

            rows.forEach(row => {
                if (row.name && row.sector) {
                    stmt.run([row.name, row.locations, row.sector, row.year, row.status, row.category, row.community]);
                    inserted++;
                } else {
                    skipped++;
                }
            });

            stmt.finalize();
            db.run('COMMIT', () => {
                clearCache();
                logAudit(req, 'BULK_UPLOAD', { inserted, skipped });
                res.json({ message: 'Upload processed', inserted, skipped });
            });
        });

    } catch (err) {
        res.status(500).json({ error: 'Failed to process Excel file' });
    }
});

// Scholarships KPI
app.get('/api/kpi/scholarships', (req, res) => {
    db.get("SELECT val FROM impact_metrics WHERE label = 'Scholarships'", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ value: row ? row.val : '0' });
    });
});

app.put('/api/kpi/scholarships', authMiddleware, verifyEditor, (req, res) => {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: 'Value is required' });

    db.get("SELECT id FROM impact_metrics WHERE label = 'Scholarships'", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            db.run("UPDATE impact_metrics SET val = ? WHERE label = 'Scholarships'", [value], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                logAudit(req, 'UPDATE_KPI', { label: 'Scholarships', value });
                res.json({ message: 'Updated successfully' });
            });
        } else {
            db.run("INSERT INTO impact_metrics (sector, label, val) VALUES ('global', 'Scholarships', ?)", [value], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                logAudit(req, 'CREATE_KPI', { label: 'Scholarships', value });
                res.json({ message: 'Created and updated successfully' });
            });
        }
    });
});

app.get('/api/impact-metrics', (req, res) => {
    const { sector } = req.query;
    let query = 'SELECT * FROM impact_metrics';
    const params = [];
    if (sector) { query += ' WHERE sector = ?'; params.push(sector); }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ metrics: rows });
    });
});

app.get('/api/communities', (req, res) => {
    const query = `
        SELECT community,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing
        FROM projects GROUP BY community
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const communities = rows.map(row => ({
            name: row.community,
            completed: row.completed,
            ongoing: row.ongoing,
            update: "Just now"
        }));
        res.json(communities);
    });
});

app.get('/api/completion-rates', (req, res) => {
    const { sector } = req.query;
    let query = 'SELECT * FROM completion_rates';
    const params = [];
    if (sector) { query += ' WHERE sector = ?'; params.push(sector); }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rates: rows });
    });
});

// --- AUTHENTICATION ---

app.post('/api/register', authLimiter, async (req, res) => {
    const { username, password, role } = req.body;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d|.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) return res.status(400).json({ error: "Password does not meet complexity requirements." });

    const hashedPassword = await bcrypt.hash(password, 10);

    const validRoles = ['super_admin', 'regional_admin', 'analyst', 'editor'];
    const userRole = (role && validRoles.includes(role)) ? role : 'public_viewer';
    const status = 'pending';

    const stmt = db.prepare("INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)");
    stmt.run(username, hashedPassword, userRole, status, function (err) {
        if (err) return res.status(400).json({ error: "Username already exists" });
        logAudit(req, 'REGISTER', { username });
        res.json({ message: "Registration successful. Please wait for admin approval." });
    });
    stmt.finalize();
});

app.post('/api/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) {
            logAudit(req, 'LOGIN_FAIL', { reason: 'User not found' }, { username, id: null });
            return res.status(400).json({ error: "Invalid credentials" });
        }

        if (user.role === 'public_viewer') {
            return res.status(403).json({ error: "Public viewers do not have login access." });
        }

        if (user.status !== 'approved') {
            logAudit(req, 'LOGIN_BLOCK', { status: user.status }, user);
            return res.status(403).json({ error: "Account is pending approval or blocked." });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            logAudit(req, 'LOGIN_FAIL', { reason: 'Bad password' }, user);
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'super_secret_key_change_me', { expiresIn: '24h' });

        logAudit(req, 'LOGIN_SUCCESS', {}, user);
        res.json({ token, role: user.role, username: user.username });
    });
});

// --- USER MANAGEMENT ---

app.get('/api/users', authMiddleware, verifySuperAdmin, (req, res) => {
    db.all("SELECT id, username, role, status, created_at FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ users: rows });
    });
});

app.post('/api/users', authMiddleware, verifySuperAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: "All fields required" });

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d|.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) return res.status(400).json({ error: "Password lacking complexity" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare("INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, 'approved')");

    stmt.run(username, hashedPassword, role, function (err) {
        if (err) return res.status(400).json({ error: "Username likely exists" });
        logAudit(req, 'CREATE_USER_ADMIN', { username, role });
        res.status(201).json({ message: "User created" });
    });
    stmt.finalize();
});

app.put('/api/users/:id/status', authMiddleware, verifySuperAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'blocked', 'pending'].includes(status)) return res.status(400).json({ error: "Invalid status" });

    db.run("UPDATE users SET status = ? WHERE id = ?", [status, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req, 'UPDATE_USER_STATUS', { targetId: id, status });
        res.json({ message: `User status updated to ${status}` });
    });
});

app.put('/api/users/:id', authMiddleware, verifySuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { password, role } = req.body;

    let updates = [];
    let params = [];

    if (password) {
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d|.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) return res.status(400).json({ error: "Password must be 8+ chars and include number/special char." });

        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push("password = ?");
        params.push(hashedPassword);
    }

    if (role) {
        if (!['super_admin', 'regional_admin', 'analyst', 'editor', 'public_viewer'].includes(role)) return res.status(400).json({ error: "Invalid role" });
        updates.push("role = ?");
        params.push(role);
    }

    if (updates.length === 0) return res.status(400).json({ error: "No changes provided" });

    params.push(id);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req, 'UPDATE_USER', { targetId: id, fields: updates });
        res.json({ message: "User updated successfully" });
    });
});

app.delete('/api/users/:id', authMiddleware, verifySuperAdmin, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req, 'DELETE_USER', { targetId: id });
        res.json({ message: "User deleted" });
    });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    fs.appendFileSync('server_error.log', `${new Date().toISOString()} - GLOBAL ERROR: ${err.stack}\n`);
    logAudit(req, 'SERVER_ERROR', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- SHUTDOWN ---
const gracefulShutdown = () => {
    console.log('Shutting down gracefully...');
    db.close((err) => {
        if (err) console.error('Error closing DB:', err.message);
        else console.log('Database connection closed.');
        process.exit(0);
    });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
