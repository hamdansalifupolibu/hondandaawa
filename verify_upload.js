const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./mp_tracker.db');

const projectNames = [
    'Bagurugu Health Centre',
    "Renovation of Nurses' Bungalow",
    'Donation of Motorbikes to Health Facilities',
    'Provision of Vaccine Refrigerators',
    'Electrification of Rural Communities',
    'Feeder Roads Rehabilitation (Overseas Area',
    'Karaga Town Urban Roads Development',
    'Provision of Boreholes',
    'ICT Support to Karaga SHS',
    'ICT Support to NHIS District Office',
    'Support to District Police Station',
    'Installation of Community Grinding Mills',
    'Support to Needy Students'
];

db.serialize(() => {
    console.log("Checking for uploaded projects...\n");

    // Check for each project
    const placeholders = projectNames.map(() => '?').join(',');
    const query = `SELECT id, name, sector, year, status FROM projects WHERE name IN (${placeholders}) OR name LIKE 'Feeder Roads%'`;

    // Adjust params because 'Feeder Roads' match is fuzzy in my array but I added explicit LIKE check logic in mind, 
    // actually let's just search for the exact list first.
    db.all(`SELECT id, name, sector, year, status FROM projects ORDER BY id DESC LIMIT 20`, [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }

        console.log(`Found ${rows.length} recent projects. Key matches:`);

        let foundCount = 0;
        rows.forEach(row => {
            if (projectNames.some(n => row.name.includes(n.split(' ')[0]))) {
                console.log(`[FOUND] ID: ${row.id} | ${row.name} | ${row.sector} | ${row.year}`);
                foundCount++;
            }
        });

        if (foundCount === 0) {
            console.log("\nNo matches found in the last 20 records.");
        } else {
            console.log(`\nVerified ${foundCount} recent matches.`);
        }
    });
});

db.close();
