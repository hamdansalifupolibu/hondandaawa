const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mp_tracker',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Ensure we handle dates correctly as strings or JS Date objects
    dateStrings: true
});

// Check connection on startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database successfully.');
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

module.exports = {
    pool,
    // Helper for simple queries
    query: (sql, params) => pool.execute(sql, params)
};
