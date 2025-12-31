# Project Analysis: Hon. Sualihu Dandaawa - MP Impact & Development Tracker

## Project Overview
This project is a static web dashboard designed to track and showcase the development initiatives, impact metrics, and community projects of **Hon. Sualihu Dandaawa**, the Member of Parliament for the Karaga Constituency in the Northern Region of Ghana.

It serves as a transparency and reporting tool, allowing constituents to view progress on infrastructure and social support programs.

## Technical Stack
*   **Architecture**: Client-side Static Web Application.
*   **Core Technologies**:
    *   **HTML5**: Semantic markup for structure (`index.html`).
    *   **CSS3**: Custom styling with CSS Variables, Flexbox, and Grid (`style.css`). No external CSS frameworks are used, ensuring a lightweight footprint.
    *   **Vanilla JavaScript**: Handles data storage, DOM manipulation, and dynamic rendering (`main.js`). No frontend frameworks (React, Vue, etc.) are used.
*   **External Dependencies**:
    *   **FontAwesome (v6.4.0)**: Used for icons via CDN.
    *   **Google Fonts**: Uses 'Poppins' (implied by usage in modern designs, though not explicitly checked in heade imports, typically standard for this look).

## Key Features

### 1. Dynamic Content Rendering
The application uses a Single Page Application (SPA)-like approach for its content sections.
*   **Sector Tabs**: Users can switch between different development sectors (Education, Health, Roads, Water, ICT, Social Protection).
*   **Data-Driven**: All project data is stored in a structured JSON-like object (`dashboardData`) in `main.js`. Clicking a tab updates the DOM to reflect the data for that sector without a page reload.

### 2. High-Level Metrics
The dashboard header provides immediate visibility into key performance indicators:
*   Total Projects
*   Completed vs. Ongoing counts
*   Estimated Beneficiaries

### 3. Community-Level Breakdown
A specific section creates a table view of progress by community (e.g., Karaga, Sandua, Nyong), tracking:
*   Completed Projects
*   Ongoing Projects
*   Last Update timestamps (represented as badges).

### 4. Interactive Elements
*   **Impact Summary Widget**: Dynamically updates specific statistics based on the selected sector.
*   **Completion Rate Visualizer**: A progress bar and percentage display that adjusts for each sector.

## Data Structure (`main.js`)
The data is organized by sector keys (e.g., `education`, `health`). Each sector object contains:
*   `infraTitle` & `supportTitle`: Headers for the two main columns.
*   `infraProjects` & `supportProjects`: Arrays of project objects containing:
    *   `name`: Project title.
    *   `locations`: Target communities.
    *   `year`: Implementation year.
    *   `status`: 'completed', 'ongoing', or 'planned' (used for CSS styling).
*   `impactMetrics`: Array of stat objects (`val`, `label`).
*   `rate`: Integer representing the overall completion percentage.

## Design System
*   **Theme**: Glassmorphism effects (`.glass-panel`), gradients, and extraction of specific colors (Gold/Accent colors) for branding.
*   **Responsiveness**: Grid and Flexbox layouts are used to adapt to different screen sizes (though specific media queries were not deeply analyzed, the structure supports it).
