const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mp_tracker.db');

db.all("SELECT * FROM audit_logs WHERE action='BULK_UPLOAD' ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("Recent Bulk Upload Logs:");
        console.log(JSON.stringify(rows, null, 2));
    }
});
