-- =========================================
-- Users Table
-- =========================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'public_viewer',
    status VARCHAR(50) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- Projects Table
-- =========================================
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    locations TEXT, 
    sector VARCHAR(50) NOT NULL,
    year VARCHAR(20),
    status VARCHAR(50) DEFAULT 'planned',
    category VARCHAR(50) DEFAULT 'infrastructure', -- 'infra' or 'support'
    community VARCHAR(255),
    image_url TEXT,
    project_cost VARCHAR(100), -- Stored as text to handle symbols and formatting
    funding_source VARCHAR(255),
    beneficiary_count VARCHAR(50), -- Stored as text to prevent errors on empty input
    contractor VARCHAR(255),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_projects_sector (sector),
    INDEX idx_projects_status (status),
    INDEX idx_projects_community (community),
    INDEX idx_projects_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- Impact Metrics Table
-- =========================================
CREATE TABLE IF NOT EXISTS impact_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector VARCHAR(50) DEFAULT 'general',
    label VARCHAR(255) NOT NULL,
    val VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_label_sector (label, sector)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- Scholarships Table
-- =========================================
CREATE TABLE IF NOT EXISTS scholarships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    beneficiary_name VARCHAR(255) NOT NULL,
    institution VARCHAR(255) NOT NULL,
    amount VARCHAR(100), -- Stored as text for flexibility and consistency
    year VARCHAR(20),
    status VARCHAR(50) DEFAULT 'Pending',
    category VARCHAR(100) DEFAULT 'Tertiary',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scholarships_year (year),
    INDEX idx_scholarships_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- Completion Rates Table
-- =========================================
CREATE TABLE IF NOT EXISTS completion_rates (
     sector VARCHAR(50) PRIMARY KEY,
     rate INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================
-- Audit Logs Table
-- =========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL, -- 'LOGIN', 'CREATE_PROJECT', 'DELETE_USER', etc.
    details TEXT, -- JSON string
    ip_address VARCHAR(45),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_action (action),
    INDEX idx_audit_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
