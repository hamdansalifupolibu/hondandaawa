# Hon. Sualihu Dandaawa – MP Impact & Development Tracker
(Production Release)

## Overview
A dynamic, database-driven dashboard for tracking infrastructure projects, impact metrics, and completion rates across sectors (Education, Health, Roads, etc.).

## Features
-   **Dashboard**: Interactive data filtered by sector with completion rates.
-   **Admin Panel**:
    -   Secure Login (JWT + Role Based Access)
    -   User Governance (Registration -> Approval Workflow)
    -   Project CRUD (Create, Read, Update, Soft-Delete)
    -   Bulk Upload via Excel
-   **Security**: Rate limiting, Password policies, SQL Injection protection.
-   **Performance**: SQLite with Indexes, In-memory caching for stats.
-   **Audit**: Centralized logging of all admin actions (`audit_logs` table).

## Installation

1.  **Prerequisites**: Node.js (v18+).
2.  **Dependencies**:
    ```bash
    npm install
    ```
3.  **Configuration**:
    -   Copy `.env.example` to `.env`
    -   Update `JWT_SECRET` and `PORT` if needed.

## Running the Application

### Development
```bash
node server.js
```

### Production (PM2)
Ensure PM2 is installed globally (`npm install -g pm2`).
```bash
pm2 start ecosystem.config.js
pm2 logs
```

## User Roles
1.  **Public Viewer**: Read-only access to dashboard.
2.  **Regional Admin**: Can Manage Projects (CRUD, Upload).
3.  **Super Admin**: Can Manage Projects + Manage Users (Approve/Block/Delete).

## API Documentation
-   `GET /api/projects`: List projects (supports `?sector=x&page=1`)
-   `POST /api/login`: Authenticate
-   `POST /api/register`: New Account (Pending status default)
