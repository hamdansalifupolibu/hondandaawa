const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'mp_tracker.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database at ' + dbPath, err.message);
    } else {
        console.log('Connected to the SQLite database at ' + dbPath);
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'public_viewer',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Projects Table
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            locations TEXT, 
            sector TEXT,
            year TEXT,
            status TEXT,
            category TEXT, -- 'infra' or 'support'
            community TEXT, -- Derived from locations for simple grouping if needed
            image_url TEXT,
            project_cost TEXT,
            funding_source TEXT,
            beneficiary_count INTEGER,
            contractor TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Migration: Add image_url if it doesn't exist
        db.run("ALTER TABLE projects ADD COLUMN image_url TEXT", (err) => { /* Ignore */ });

        // Migration: Add new fields (Dec 2025)
        const newCols = [
            "ALTER TABLE projects ADD COLUMN project_cost TEXT",
            "ALTER TABLE projects ADD COLUMN funding_source TEXT",
            "ALTER TABLE projects ADD COLUMN beneficiary_count INTEGER",
            "ALTER TABLE projects ADD COLUMN contractor TEXT",
            "ALTER TABLE projects ADD COLUMN description TEXT"
        ];

        newCols.forEach(query => {
            db.run(query, (err) => {
                // Ignore error if column already exists
            });
        });

        // Impact Metrics Table
        db.run(`CREATE TABLE IF NOT EXISTS impact_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sector TEXT,
            label TEXT,
            val TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Scholarships Table (Dynamic)
        db.run(`CREATE TABLE IF NOT EXISTS scholarships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            beneficiary_name TEXT,
            institution TEXT,
            amount TEXT,
            year TEXT,
            status TEXT,
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Completion Rates Table (Optional, or calculated. Let's store it for simplicity if it's manual)
        db.run(`CREATE TABLE IF NOT EXISTS completion_rates (
             sector TEXT PRIMARY KEY,
             rate INTEGER
        )`);

        // Audit Logs
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action TEXT, -- 'LOGIN', 'CREATE_PROJECT', 'DELETE_USER', etc.
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Indexes for Performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_projects_sector ON projects(sector)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_projects_community ON projects(community)`);
    });
}

module.exports = db;
