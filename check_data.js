const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mp_tracker.db');

db.all("SELECT id, name, project_cost, funding_source FROM projects ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("Recent Projects Data:");
        console.log(JSON.stringify(rows, null, 2));
    }
});
