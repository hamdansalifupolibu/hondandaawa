console.log("Starting Server Process...");
const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

// --- CRASH LOGGING (Immediate) ---
process.on('uncaughtException', (err) => {
    const msg = `[CRASH] ${new Date().toISOString()} - ${err.message}\n${err.stack}\n`;
    console.error(msg);
    try {
        fs.appendFileSync(path.join(__dirname, 'crash.log'), msg);
    } catch (e) { console.error("Failed to write to crash.log", e); }
    process.exit(1);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authMiddleware = require('./auth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
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

const logAudit = async (req, action, details, userOverride = null) => {
    try {
        const user = userOverride || req.user || { id: null, username: 'anonymous' };
        const headers = req.headers || {};
        const socket = req.socket || {};
        const ip = headers['x-forwarded-for'] || socket.remoteAddress || 'unknown';

        const sql = "INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)";
        await pool.execute(sql, [user.id, user.username, action, JSON.stringify(details), ip]);
    } catch (err) {
        console.error('Audit Log Error:', err.message);
    }
};

// --- BACKUPS ---
cron.schedule('0 0 * * *', () => {
    // MySQL backups should be handled by the hosting provider or separate dump script
    console.log('Daily backup trigger: Please ensure MySQL database is backed up via Hostinger control panel.');
});

// --- API ROUTES ---

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query("SELECT 1");
        res.json({ status: 'ok', message: 'System healthy' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Database connection failed: ' + err.message });
    }
});

// --- SEEDING ENDPOINT (Repair Kit) ---
app.get('/api/seed', async (req, res) => {
    let connection;
    try {
        const seedPath = path.resolve(__dirname, 'projects_dump.json');
        if (!fs.existsSync(seedPath)) return res.status(404).json({ error: 'Seed file not found' });

        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        let inserted = 0;
        let errors = 0;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Note: Using schema.sql is preferred for table creation. 
        // This endpoint will just focus on data insertion.

        const stmt = `INSERT IGNORE INTO projects (id, name, locations, sector, year, status, category, community, created_at, image_url, project_cost, funding_source, beneficiary_count, contractor, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        for (const p of seedData) {
            try {
                await connection.execute(stmt, [p.id, p.name, p.locations, p.sector, p.year, p.status, p.category, p.community, p.created_at, p.image_url, p.project_cost, p.funding_source, p.beneficiary_count, p.contractor, p.description]);
                inserted++;
            } catch (err) {
                console.error("Seed Insert Error:", err.message);
                errors++;
            }
        }

        await connection.commit();
        res.json({ message: `Seeding complete. Inserted: ${inserted}, Errors/Duplicates: ${errors}` });

    } catch (e) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) connection.release();
    }
});

// Projects (Cached)
app.get('/api/projects', async (req, res) => {
    try {
        const cacheKey = JSON.stringify(req.query);
        if (cache.projects[cacheKey]) return res.json(cache.projects[cacheKey]);

        const { sector, year_start, year_end, search, status, funding, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        let baseQuery = "FROM projects WHERE 1=1";
        const params = [];

        // Always exclude archived unless specifically requested
        baseQuery += " AND status != 'archived'";

        if (sector && sector !== 'all') {
            baseQuery += ' AND sector = ?';
            params.push(sector);
        }

        if (year_start && year_end) {
            baseQuery += ' AND year >= ? AND year <= ?';
            params.push(year_start, year_end);
        }

        if (search) {
            baseQuery += ' AND (name LIKE ? OR locations LIKE ? OR contractor LIKE ? OR description LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        if (status && status !== 'all') {
            baseQuery += ' AND status = ?';
            params.push(status.toLowerCase());
        }

        if (funding && funding !== 'all') {
            baseQuery += ' AND funding_source LIKE ?';
            params.push(`%${funding}%`);
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        // Important: MySQL LIMIT requires integers, parameters are safe but need consistent typing.
        // Also note: standard mysql2 params handling works for LIMIT too.
        const dataQuery = `SELECT * ${baseQuery} ORDER BY id DESC LIMIT ? OFFSET ?`;

        const [countRows] = await pool.query(countQuery, params);
        const total = countRows[0] ? countRows[0].total : 0;

        const [rows] = await pool.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);

        const result = {
            projects: rows,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
        };
        cache.projects[cacheKey] = result;
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// Create Project
app.post('/api/projects', authMiddleware, verifyEditor, upload.single('image'), async (req, res) => {
    try {
        let { name, locations, sector, year, status, category, community, project_cost, funding_source, beneficiary_count, contractor, description } = req.body;
        const image_url = req.file ? `/uploads/projects/${req.file.filename}` : null;

        if (!name || !sector) return res.status(400).json({ error: 'Name and Sector are required' });

        // Sanitize Cost
        if (project_cost) {
            project_cost = String(project_cost).replace(/[^0-9.]/g, '');
        }

        const stmt = `INSERT INTO projects (name, locations, sector, year, status, category, community, image_url, project_cost, funding_source, beneficiary_count, contractor, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await pool.execute(stmt, [name, locations, sector, year, status, category, community, image_url, project_cost, funding_source, beneficiary_count, contractor, description]);

        clearCache();
        logAudit(req, 'CREATE_PROJECT', { id: result.insertId, name });
        res.status(201).json({ id: result.insertId, message: 'Project created', image_url });
    } catch (err) {
        console.error('Database INSERT Error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// Update Project
app.put('/api/projects/:id', authMiddleware, verifyEditor, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        let { name, locations, sector, year, status, category, community, project_cost, funding_source, beneficiary_count, contractor, description } = req.body;

        if (project_cost) {
            project_cost = String(project_cost).replace(/[^0-9.]/g, '');
        }

        let sql = `UPDATE projects SET name=?, locations=?, sector=?, year=?, status=?, category=?, community=?, project_cost=?, funding_source=?, beneficiary_count=?, contractor=?, description=?`;
        let params = [name, locations, sector, year, status, category, community, project_cost, funding_source, beneficiary_count, contractor, description];

        if (req.file) {
            sql += `, image_url=?`;
            params.push(`/uploads/projects/${req.file.filename}`);
        }

        sql += ` WHERE id=?`;
        params.push(id);

        const [result] = await pool.execute(sql, params);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Project not found' });
        clearCache();
        logAudit(req, 'UPDATE_PROJECT', { id, changes: req.body });
        res.json({ message: 'Project updated' });
    } catch (err) {
        console.error('Database UPDATE Error:', err);
        fs.appendFileSync('server_error.log', `${new Date().toISOString()} - DB UPDATE ERROR: ${err.message}\n`);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// Delete Project
app.delete('/api/projects/:id', authMiddleware, verifyEditor, verifyDeletePermission, async (req, res) => {
    try {
        const { id } = req.params;
        const stmt = `UPDATE projects SET status='archived' WHERE id=?`;
        const [result] = await pool.execute(stmt, [id]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Project not found' });
        clearCache();
        logAudit(req, 'DELETE_PROJECT', { id });
        res.json({ message: 'Project archived' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk Upload
// Download Template Endpoint (No DB changes)
app.get('/api/projects/template', (req, res) => {
    try {
        const headers = [
            'Name', 'Locations', 'Sector', 'Category', 'Year', 'Status',
            'Cost', 'Funding', 'Beneficiaries', 'Contractor', 'Description'
        ];
        const exampleRow = [
            'Example School Block', 'Tamale, Northern', 'Education', 'Infrastructure', '2025', 'Planned',
            '50000', 'MP Common Fund', '1500', 'ABC Construction', 'Construction of a 3-unit classroom block'
        ];
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.aoa_to_sheet([headers, exampleRow]);
        xlsx.utils.book_append_sheet(wb, ws, 'Template');
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="Project_Upload_Template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

app.post('/api/projects/bulk-upload', authMiddleware, verifyUploader, memoryUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let connection;
    try {
        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const row = rawData[i].map(c => String(c || '').trim().toLowerCase());
            if (row.includes('name') && row.includes('sector')) {
                headerRowIndex = i;
                headers = row;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return res.status(400).json({ error: 'Invalid file format. Header row with "Name" and "Sector" not found.' });
        }

        const colMap = {};
        headers.forEach((h, idx) => {
            if (['name', 'locations', 'sector', 'year', 'status', 'category', 'community', 'project_cost', 'cost', 'funding_source', 'funding', 'beneficiary_count', 'beneficiaries', 'contractor', 'description'].includes(h)) {
                colMap[h] = idx;
            }
        });

        const rowsToProcess = rawData.slice(headerRowIndex + 1);
        let inserted = 0;
        let skipped = 0;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const stmt = `INSERT INTO projects (name, locations, sector, year, status, category, community, image_url, project_cost, funding_source, beneficiary_count, contractor, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        for (let idx = 0; idx < rowsToProcess.length; idx++) {
            const rowArray = rowsToProcess[idx];
            const row = {};
            Object.keys(colMap).forEach(key => row[key] = rowArray[colMap[key]]);

            if (row.name && row.sector) {
                await connection.execute(stmt, [
                    String(row.name).trim(),
                    String(row.locations || '').trim(),
                    String(row.sector).toLowerCase().trim(),
                    String(row.year || '').trim(),
                    row.status ? String(row.status).toLowerCase().trim() : 'planned',
                    row.category ? String(row.category).toLowerCase().trim() : 'infrastructure',
                    String(row.community || '').trim(),
                    null, // image_url
                    row.project_cost || row.cost || null,
                    row.funding_source || row.funding || null,
                    row.beneficiary_count || row.beneficiaries || null,
                    row.contractor || null,
                    row.description || null
                ]);
                inserted++;
            } else {
                skipped++;
            }
        }

        await connection.commit();
        clearCache();
        logAudit(req, 'BULK_UPLOAD', { inserted, skipped });
        res.json({ message: 'Upload processed', inserted, skipped });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ error: 'Failed to process Excel file' });
    } finally {
        if (connection) connection.release();
    }
});

// --- METRICS & STATS API ---
app.get('/api/metrics', async (req, res) => {
    try {
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM projects) as total,
                (SELECT COUNT(*) FROM projects WHERE LOWER(status) = 'completed') as completed,
                (SELECT COUNT(*) FROM projects WHERE LOWER(status) = 'ongoing') as ongoing
        `;

        const [countRows] = await pool.query(statsQuery);
        const counts = countRows[0];

        const [metricRows] = await pool.query("SELECT label, val FROM impact_metrics");
        const metrics = {};
        metricRows.forEach(r => metrics[r.label] = r.val);

        // Dynamic Scholarship Count & Total Investment
        const [scholRows] = await pool.query("SELECT COUNT(*) as total, SUM(amount) as cost FROM scholarships");
        const scholRow = scholRows[0];
        const legacyScholCount = (scholRow && scholRow.total) ? scholRow.total : 0;
        const scholCost = (scholRow && scholRow.cost) ? parseFloat(scholRow.cost) : 0;

        const [projScholRows] = await pool.query("SELECT COUNT(*) as total FROM projects WHERE sector = 'scholarship' AND status != 'archived'");
        const projScholCount = (projScholRows[0] && projScholRows[0].total) ? projScholRows[0].total : 0;

        metrics['Scholarships'] = (legacyScholCount + projScholCount).toString();

        // Calculate Total Investment (Projects + Scholarships)
        // Note: MySQL REPLACE replaces all occurrences by default, unlike SQLite/JS slightly different behaviors. 
        // But here we need to be careful with CAST. REPALCE(str, from, to). 
        // MySQL REPLACE: REPLACE('abc', 'b', 'd') -> 'adc'. 
        const [projRows] = await pool.query("SELECT SUM(CAST(REPLACE(REPLACE(project_cost, ',', ''), 'GHS', '') AS DECIMAL(15,2))) as total_project_cost FROM projects WHERE status != 'archived'");
        const projCost = (projRows[0] && projRows[0].total_project_cost) ? parseFloat(projRows[0].total_project_cost) : 0;
        const totalInvestment = projCost + scholCost;

        metrics['Total Investment'] = totalInvestment;

        res.json({ counts, metrics });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/metrics', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
        const { label, value } = req.body;
        if (!label || !value) return res.status(400).json({ error: 'Label and value required' });

        const [rows] = await pool.query("SELECT id FROM impact_metrics WHERE label = ?", [label]);

        if (rows.length > 0) {
            await pool.execute("UPDATE impact_metrics SET val = ? WHERE label = ?", [value, label]);
            logAudit(req, 'UPDATE_METRIC', { label, value });
            res.json({ message: 'Metric updated' });
        } else {
            await pool.execute("INSERT INTO impact_metrics (sector, label, val) VALUES (?, ?, ?)", ['general', label, value]);
            logAudit(req, 'CREATE_METRIC', { label, value });
            res.json({ message: 'Metric created' });
        }
        clearCache();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Scholarships KPI
app.get('/api/scholarships', async (req, res) => {
    try {
        const { year } = req.query;
        let query = "SELECT * FROM scholarships ORDER BY created_at DESC";
        const params = [];
        if (year) {
            query = "SELECT * FROM scholarships WHERE year = ? ORDER BY created_at DESC";
            params.push(year);
        }
        const [rows] = await pool.query(query, params);
        res.json({ scholarships: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/scholarships', authMiddleware, verifyEditor, async (req, res) => {
    try {
        const { beneficiary_name, institution, amount, year, status, category } = req.body;
        if (!beneficiary_name || !institution) return res.status(400).json({ error: 'Name and Institution required' });

        const [result] = await pool.execute(
            "INSERT INTO scholarships (beneficiary_name, institution, amount, year, status, category) VALUES (?, ?, ?, ?, ?, ?)",
            [beneficiary_name, institution, amount, year, status || 'Pending', category || 'Tertiary']
        );
        logAudit(req, 'CREATE_SCHOLARSHIP', { id: result.insertId, beneficiary_name });
        res.status(201).json({ id: result.insertId, message: 'Scholarship added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/scholarships/:id', authMiddleware, verifyEditor, async (req, res) => {
    try {
        const { id } = req.params;
        const { beneficiary_name, institution, amount, year, status, category } = req.body;

        await pool.execute(
            "UPDATE scholarships SET beneficiary_name=?, institution=?, amount=?, year=?, status=?, category=? WHERE id=?",
            [beneficiary_name, institution, amount, year, status, category, id]
        );
        logAudit(req, 'UPDATE_SCHOLARSHIP', { id });
        res.json({ message: 'Scholarship updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/scholarships/:id', authMiddleware, verifyEditor, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute("DELETE FROM scholarships WHERE id = ?", [id]);
        logAudit(req, 'DELETE_SCHOLARSHIP', { id });
        res.json({ message: 'Scholarship deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/impact-metrics', async (req, res) => {
    try {
        const { sector } = req.query;
        let query = 'SELECT * FROM impact_metrics';
        const params = [];
        if (sector) { query += ' WHERE sector = ?'; params.push(sector); }

        const [metricsRows] = await pool.query(query, params);

        let investQuery = "SELECT SUM(CAST(REPLACE(REPLACE(project_cost, ',', ''), 'GHS', '') AS DECIMAL(15,2))) as total FROM projects WHERE status != 'archived'";
        let investParams = [];
        if (sector) {
            investQuery += " AND sector = ?";
            investParams.push(sector);
        }

        const [row] = await pool.query(investQuery, investParams);
        const total = (row[0] && row[0].total) ? parseFloat(row[0].total) : 0;

        let formattedTotal = `GHS ${total.toLocaleString()}`;
        if (total >= 1000000) formattedTotal = `GHS ${(total / 1000000).toFixed(1)}M`;
        else if (total >= 1000) formattedTotal = `GHS ${(total / 1000).toFixed(1)}K`;

        metricsRows.push({
            label: 'Sector Investment',
            val: formattedTotal
        });

        res.json({ metrics: metricsRows });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/communities', async (req, res) => {
    try {
        const query = `
            SELECT community,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing
            FROM projects GROUP BY community
        `;
        const [rows] = await pool.query(query);
        const communities = rows.map(row => ({
            name: row.community,
            completed: row.completed,
            ongoing: row.ongoing,
            update: "Just now"
        }));
        res.json(communities);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/completion-rates', async (req, res) => {
    try {
        const { sector } = req.query;
        let query = 'SELECT * FROM completion_rates';
        const params = [];
        if (sector) { query += ' WHERE sector = ?'; params.push(sector); }

        const [rows] = await pool.query(query, params);
        res.json({ rates: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTHENTICATION ---
app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d|.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) return res.status(400).json({ error: "Password does not meet complexity requirements." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const validRoles = ['super_admin', 'regional_admin', 'analyst', 'editor'];
        const userRole = (role && validRoles.includes(role)) ? role : 'public_viewer';
        const status = 'pending';

        await pool.execute(
            "INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)",
            [username, hashedPassword, userRole, status]
        );
        logAudit(req, 'REGISTER', { username });
        res.json({ message: "Registration successful. Please wait for admin approval." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Username already exists" });
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
        const user = rows[0];

        if (!user) {
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

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
        logAudit(req, 'LOGIN_SUCCESS', {}, user);
        res.json({ token, role: user.role, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USER MANAGEMENT ---
app.get('/api/users', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, username, role, status, created_at FROM users");
        res.json({ users: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) return res.status(400).json({ error: "All fields required" });

        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d|.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
        if (!passwordRegex.test(password)) return res.status(400).json({ error: "Password lacking complexity" });

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute("INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, 'approved')", [username, hashedPassword, role]);

        logAudit(req, 'CREATE_USER_ADMIN', { username, role });
        res.status(201).json({ message: "User created" });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Username likely exists" });
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/status', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['approved', 'blocked', 'pending'].includes(status)) return res.status(400).json({ error: "Invalid status" });

        await pool.execute("UPDATE users SET status = ? WHERE id = ?", [status, id]);
        logAudit(req, 'UPDATE_USER_STATUS', { targetId: id, status });
        res.json({ message: `User status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
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
        await pool.execute(sql, params);

        logAudit(req, 'UPDATE_USER', { targetId: id, fields: updates });
        res.json({ message: "User updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authMiddleware, verifySuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute("DELETE FROM users WHERE id = ?", [id]);
        logAudit(req, 'DELETE_USER', { targetId: id });
        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API 404 HANDLER ---
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: "API endpoint not found. Check route URL." });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    fs.appendFileSync('server_error.log', `${new Date().toISOString()} - GLOBAL ERROR: ${err.stack}\n`);
    logAudit(req, 'SERVER_ERROR', { error: err.message });

    // Ensure JSON response for API clients
    res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
        error: err.message
    });
});

// --- SHUTDOWN ---
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    try {
        await pool.end();
        console.log('Database pool closed.');
        process.exit(0);
    } catch (err) {
        console.error('Error closing DB pool:', err.message);
        process.exit(1);
    }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
