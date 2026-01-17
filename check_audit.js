const { pool } = require('./database');

(async () => {
    try {
        const [rows] = await pool.query("SELECT * FROM audit_logs WHERE action='BULK_UPLOAD' ORDER BY id DESC LIMIT 5");
        console.log("Recent Bulk Upload Logs:");
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
