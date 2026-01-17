const { pool } = require('./database');

(async () => {
    try {
        const [rows] = await pool.query("SELECT id, name, project_cost, funding_source FROM projects ORDER BY id DESC LIMIT 5");
        console.log("Recent Projects Data:");
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
