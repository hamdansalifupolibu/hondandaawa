const db = require('./database');
const bcrypt = require('bcrypt');

const dashboardData = {
    education: {
        infraTitle: "Education Infrastructure",
        infraProjects: [
            { name: "Classroom Blocks", locations: "Nyong, Bagurugu", year: "2023", status: "completed" },
            { name: "ICT Centres", locations: "Nyong, Bagurugu", year: "2025", status: "completed" },
            { name: "Teachers' Quarters", locations: "Gatrego, Daragu", year: "2023", status: "ongoing" },
            { name: "Renovations", locations: "Sandua, Sanvan", year: "2023", status: "ongoing" }
        ],
        supportTitle: "Learning Support",
        supportProjects: [
            { name: "Furniture Distribution", locations: "Nyong, Sandua", year: "2023", status: "completed" },
            { name: "Laptops & Tablets", locations: "Sharmi Pepiragu", year: "2022", status: "planned" },
            { name: "Scholarships", locations: "Constituency Wide", year: "2024", status: "planned" },
            { name: "Teaching Materials", locations: "Zanala, Consaliv", year: "2023", status: "completed" }
        ],
        impactMetrics: [
            { val: "20+", label: "Schools Supported" },
            { val: "15K+", label: "Students Benefited" },
            { val: "4", label: "ICT Access Points" }
        ],
        rate: 85
    },
    health: {
        infraTitle: "Health Infrastructure",
        infraProjects: [
            { name: "CHPS Compound", locations: "Zandua, Kalariga", year: "2023", status: "completed" },
            { name: "Maternity Ward", locations: "Karaga Hospital", year: "2023", status: "ongoing" },
            { name: "Staff Housing", locations: "Nyong", year: "2024", status: "planned" },
            { name: "Lab Renovation", locations: "Bagurugu", year: "2023", status: "completed" }
        ],
        supportTitle: "Medical Support",
        supportProjects: [
            { name: "Medical Equipment", locations: "All Centers", year: "2023", status: "completed" },
            { name: "Screening Exercise", locations: "Sandua", year: "2023", status: "completed" },
            { name: "Health Insurance", locations: "Aged Citizens", year: "2024", status: "ongoing" },
            { name: "First Aid Kits", locations: "Schools", year: "2023", status: "completed" }
        ],
        impactMetrics: [
            { val: "12", label: "Health Facilities" },
            { val: "30K+", label: "Patients Served" },
            { val: "15", label: "Medics Supported" }
        ],
        rate: 72
    },
    roads: {
        infraTitle: "Roads & Transport",
        infraProjects: [
            { name: "Pishicu - Karago Road", locations: "Pishicu", year: "2023", status: "completed" },
            { name: "Bridge Construction", locations: "Nyong River", year: "2024", status: "ongoing" },
            { name: "Feeder Roads", locations: "Constituency Wide", year: "2023", status: "completed" },
            { name: "Culvert Installation", locations: "Sandua", year: "2024", status: "planned" }
        ],
        supportTitle: "Transport Support",
        supportProjects: [
            { name: "Motorbike Distribution", locations: "Extension Officers", year: "2022", status: "completed" },
            { name: "Bicycle for Schools", locations: "Remote Areas", year: "2023", status: "completed" },
            { name: "Road Maintenance", locations: "Major Arteries", year: "2024", status: "ongoing" }
        ],
        impactMetrics: [
            { val: "50km+", label: "Roads Improved" },
            { val: "10+", label: "Communities Linked" },
            { val: "2", label: "Bridges Built" }
        ],
        rate: 65
    },
    water: {
        infraTitle: "Water & Sanitation",
        infraProjects: [
            { name: "Borehole Drilling", locations: "Multiple Communities", year: "2023", status: "completed" },
            { name: "Public Latrines", locations: "Karaga Market", year: "2023", status: "completed" },
            { name: "Small Water System", locations: "Bagurugu", year: "2024", status: "ongoing" },
            { name: "Pipe Extension", locations: "Nyong", year: "2024", status: "planned" }
        ],
        supportTitle: "Sanitation Support",
        supportProjects: [
            { name: "Clean Up Kits", locations: "Youth Groups", year: "2023", status: "completed" },
            { name: "Water Filtering", locations: "Zandua", year: "2023", status: "completed" },
            { name: "Hygiene Training", locations: "Schools", year: "2024", status: "planned" }
        ],
        impactMetrics: [
            { val: "30+", label: "Safe Water Points" },
            { val: "25K+", label: "Access to Water" },
            { val: "5", label: "Sanitation Blocks" }
        ],
        rate: 78
    },
    ict: {
        infraTitle: "ICT Infrastructure",
        infraProjects: [
            { name: "Community ICT Hub", locations: "Karaga Town", year: "2023", status: "completed" },
            { name: "Modern Lab Setup", locations: "Secondary School", year: "2024", status: "ongoing" },
            { name: "E-Learning Center", locations: "Sandua", year: "2025", status: "planned" }
        ],
        supportTitle: "Digital Support",
        supportProjects: [
            { name: "Coding Bootcamps", locations: "Youth", year: "2023", status: "completed" },
            { name: "Laptop Loans", locations: "Tertiary Students", year: "2024", status: "ongoing" },
            { name: "Digital Literacy", locations: "Teachers", year: "2023", status: "completed" }
        ],
        impactMetrics: [
            { val: "100+", label: "Laptops Provided" },
            { val: "2K+", label: "Youth Trained" },
            { val: "3", label: "ICT Hubs" }
        ],
        rate: 58
    },
    social: {
        infraTitle: "Social Protection",
        infraProjects: [
            { name: "Disabled Center", locations: "Karaga", year: "2023", status: "completed" },
            { name: "Skills Center", locations: "Nyong", year: "2024", status: "ongoing" }
        ],
        supportTitle: "Charity & Welfare",
        supportProjects: [
            { name: "Widows Support", locations: "Constituency Wide", year: "2023", status: "completed" },
            { name: "Food Relief", locations: "Poor Families", year: "2023", status: "completed" },
            { name: "Business Grants", locations: "Market Women", year: "2024", status: "ongoing" }
        ],
        impactMetrics: [
            { val: "500+", label: "Widows Supported" },
            { val: "1K+", label: "Grants Issued" },
            { val: "2", label: "Social Centers" }
        ],
        rate: 82
    }
};

const seedData = async () => {
    console.log("Seeding data...");

    // Clear tables
    await new Promise((resolve) => db.run("DELETE FROM projects", resolve));
    await new Promise((resolve) => db.run("DELETE FROM impact_metrics", resolve));
    await new Promise((resolve) => db.run("DELETE FROM users", resolve));
    await new Promise((resolve) => db.run("DELETE FROM completion_rates", resolve));

    // Admin User
    const hashedPassword = await bcrypt.hash('password123', 10);
    db.run("INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)", ['admin', hashedPassword, 'super_admin', 'approved']);

    // Loop through sectors
    for (const [sectorKey, data] of Object.entries(dashboardData)) {

        // Infra Projects
        data.infraProjects.forEach(p => {
            db.run("INSERT INTO projects (name, locations, sector, year, status, category, community) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [p.name, p.locations, sectorKey, p.year, p.status, 'infra', p.locations.split(',')[0].trim()]); // Naive community extraction
        });

        // Support Projects
        data.supportProjects.forEach(p => {
            db.run("INSERT INTO projects (name, locations, sector, year, status, category, community) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [p.name, p.locations, sectorKey, p.year, p.status, 'support', p.locations.split(',')[0].trim()]);
        });

        // Metrics
        data.impactMetrics.forEach(m => {
            db.run("INSERT INTO impact_metrics (sector, label, val) VALUES (?, ?, ?)", [sectorKey, m.label, m.val]);
        });

        // Completion Rate
        db.run("INSERT INTO completion_rates (sector, rate) VALUES (?, ?)", [sectorKey, data.rate]);
    }

    console.log("Seeding complete.");
};

// Wait for DB connection
setTimeout(seedData, 1000);
