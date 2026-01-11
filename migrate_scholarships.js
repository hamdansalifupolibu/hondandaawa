const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mp_tracker.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createScholarshipsTable();
    }
});

function createScholarshipsTable() {
    db.run(`CREATE TABLE IF NOT EXISTS scholarships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        beneficiary_name TEXT,
        institution TEXT,
        amount TEXT,
        year TEXT,
        status TEXT,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Scholarships table created successfully.');
        }
        db.close();
    });
}
