# Hostinger Deployment Guide

This guide details how to deploy your migrated MySQL backend to Hostinger.

## 1. Environment Variables
Go to your **Hostinger Panel** -> **VPS / Web Hosting** -> **Node.js Config** -> **Environment Variables**.

Add the following (copy-paste exactly):

| Key | Value |
| :--- | :--- |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `u676982383_mpuser` |
| `DB_PASSWORD` | `Mptracker@123` |
| `DB_NAME` | `u676982383_mptracker` |
| `JWT_SECRET` | *(Create a strong random secret)* |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

## 2. Database Setup
*You have already completed this step.*
- **Database:** `u676982383_mptracker`
- **Schema:** The `schema.sql` file has been executed in phpMyAdmin.

## 3. Deploying Code
1.  **Push** the latest code to GitHub (this has been done).
2.  In Hostinger, click **"Update Repository"** or **"Deploy"**.
3.  **Run NPM Install:**
    - If Hostinger doesn't do this automatically, run: `npm install` in the console.
    - This ensures `mysql2` is installed.
4.  **Restart Server:**
    - Click **"Restart"** on the Node.js application.

## 4. Verification
Check the logs using the "Logs" tab or by viewing `server_error.log` / `crash.log` if enabled.
- You should see: `✅ Connected to MySQL database successfully.` on startup.
- Visit `https://darkslateblue-cod-940859.hostingersite.com/api/health`
    - Response: `{"status":"ok", "message":"System healthy"}`
