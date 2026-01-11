const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mp_tracker.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting Migration: Social Protection -> Jobs, etc.');

db.serialize(() => {
    // 1. Rename 'social' -> 'jobs'
    db.run(`UPDATE projects SET sector = 'jobs' WHERE sector = 'social'`, function (err) {
        if (err) console.error('Error updating social->jobs:', err.message);
        else console.log(`Migrated ${this.changes} projects from 'Social Protection' to 'Jobs & Employment'`);
    });

    // 2. Merge 'youth' and 'sports' -> 'youth_sports'
    db.run(`UPDATE projects SET sector = 'youth_sports' WHERE sector IN ('youth', 'sports')`, function (err) {
        if (err) console.error('Error merging youth/sports:', err.message);
        else console.log(`Migrated ${this.changes} projects from 'Youth'/'Sports' to 'Youth & Sports'`);
    });

    // 3. Update Impact Metrics if they strictly track sectors (check if usage exists)
    // Assuming impact_metrics might use sector names, let's update them too just in case.
    db.run(`UPDATE impact_metrics SET sector = 'jobs' WHERE sector = 'social'`, (err) => {
        if (!err) console.log('Updated impact_metrics for jobs');
    });
    db.run(`UPDATE impact_metrics SET sector = 'youth_sports' WHERE sector IN ('youth', 'sports')`, (err) => {
        if (!err) console.log('Updated impact_metrics for youth_sports');
    });

    // 4. Update Completion Rates table (if exists)
    db.run(`UPDATE completion_rates SET sector = 'jobs' WHERE sector = 'social'`, (err) => { /* ignore if not exists */ });
    db.run(`UPDATE completion_rates SET sector = 'youth_sports' WHERE sector IN ('youth', 'sports')`, (err) => { /* ignore */ });

});

db.close(() => {
    console.log('Migration completed.');
});
