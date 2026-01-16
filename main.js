console.log("APP VERSION: 2.1 (Fix Loaded)");
// dashboardData and communities are now served via API

// Global State
let currentUser = null; // { token, role, username }
let currentSector = 'education';
let currentPage = 1;
const ITEMS_PER_PAGE = 6; // Limit as per request
let currentProjects = []; // Store projects for edit/delete lookup

document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const infraGrid = document.querySelector('#infra-grid');
    const supportGrid = document.querySelector('#support-grid');
    const infraTitle = document.querySelector('#infra-title');
    const supportTitle = document.querySelector('#support-title');
    const widgetMetrics = document.querySelector('#widget-metrics');
    const compRateVal = document.querySelector('#comp-rate-val');
    const compRateBar = document.querySelector('#comp-rate-bar');
    const authBtn = document.getElementById('auth-btn');
    const timeSlicer = document.getElementById('time-slicer');

    // --- EVENT DELEGATION (Bulletproof - High Priority) ---
    document.addEventListener('click', (e) => {
        // Auth Button
        const btn = e.target.closest('#auth-btn');
        if (btn) {
            e.preventDefault();
            console.log('Delegate: Auth click. User:', currentUser);
            if (currentUser) {
                currentUser = null;
                localStorage.removeItem('mp_tracker_user');
                try { updateAdminUI(); } catch (e) { console.error('UI update error:', e); }
                showToast('Logging out...', 'info');
                setTimeout(() => window.location.reload(), 500);
            } else {
                document.getElementById('login-modal').style.display = 'flex';
            }
        }

        // Modal Close Buttons (Delegate)
        if (e.target.closest('#close-login')) document.getElementById('login-modal').style.display = 'none';
        if (e.target.closest('#close-upload')) document.getElementById('upload-modal').style.display = 'none';
        if (e.target.closest('#close-modal')) document.getElementById('admin-modal').style.display = 'none';
        if (e.target.closest('#close-user-modal')) document.getElementById('user-modal').style.display = 'none';
        if (e.target.closest('#close-edit-user')) document.getElementById('edit-user-modal').style.display = 'none';
    });

    // --- DASHBOARD STATS ---
    const formatCurrency = (val) => {
        if (val >= 1000000) return `GHS ${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `GHS ${(val / 1000).toFixed(1)}K`;
        return `GHS ${val}`;
    };

    window.fetchDashboardStats = async () => {
        try {
            const res = await fetch('/api/metrics');
            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
            } else {
                const text = await res.text();
                console.error("Dashboard Stats API Error (Non-JSON):", text.substring(0, 500));
                return; // Stop processing
            }

            // Counts
            if (data.counts) {
                document.getElementById('stat-total').innerText = data.counts.total;
                document.getElementById('stat-completed').innerText = data.counts.completed;
                document.getElementById('stat-ongoing').innerText = data.counts.ongoing;
            }

            // Metrics (Label-Value pairs)
            if (data.metrics) {
                // Scholarship Count
                if (data.metrics['Scholarships']) {
                    document.getElementById('stat-scholarships').innerText = data.metrics['Scholarships'];
                }
                // Estimated Beneficiaries
                if (data.metrics['Estimated Beneficiaries']) {
                    document.getElementById('stat-impact').innerText = data.metrics['Estimated Beneficiaries'];
                }
                // Total Investment
                if (data.metrics['Total Investment']) {
                    document.getElementById('stat-investment').innerText = formatCurrency(data.metrics['Total Investment']);
                }
            }
        } catch (err) { console.error('Stats Error:', err); }
    };


    // --- INIT ---
    try {
        checkAuth();
        fetchSectorData('education', 1, true);
        fetchDashboardStats();
        renderTable();
        injectModals();
    } catch (err) {
        console.error('Critical Layout Initialization Error:', err);
    }

    // --- EVENT LISTENERS ---
    if (timeSlicer) {
        timeSlicer.addEventListener('change', () => fetchSectorData(currentSector, 1, true));
    }

    const searchInput = document.getElementById('smart-search');
    const statusFilter = document.getElementById('status-filter');
    const fundingFilter = document.getElementById('funding-filter');

    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchSectorData(currentSector, 1, true), 400);
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => fetchSectorData(currentSector, 1, true));
    }

    if (fundingFilter) {
        fundingFilter.addEventListener('change', () => fetchSectorData(currentSector, 1, true));
    }
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchSectorData(btn.dataset.sector, 1, true);
        });
    });

    // --- FUNCTIONS ---

    function checkAuth() {
        const stored = localStorage.getItem('mp_tracker_user');
        if (stored) {
            currentUser = JSON.parse(stored);
        }
        updateAdminUI();
    }

    function logout() {
        currentUser = null;
        localStorage.removeItem('mp_tracker_user');
        updateAdminUI();
        window.location.reload();
    }

    function updateAdminUI() {
        const isLoggedIn = !!currentUser;

        if (isLoggedIn) {
            authBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
            authBtn.style.background = 'var(--text-dim)';
        } else {
            authBtn.innerHTML = '<i class="fas fa-user-circle"></i> Login';
            authBtn.style.background = '';
        }

        const isAdmin = currentUser && ['super_admin', 'regional_admin', 'analyst'].includes(currentUser.role);
        const isSuperAdmin = currentUser && currentUser.role === 'super_admin';
        const isAnalyst = currentUser && currentUser.role === 'analyst';

        let adminControls = document.querySelector('#admin-controls-container');
        if (isAdmin && !adminControls) {
            adminControls = document.createElement('div');
            adminControls.id = 'admin-controls-container';
            adminControls.className = 'glass-panel';
            adminControls.style.marginBottom = '20px';
            adminControls.style.padding = '15px';

            let buttonsHTML = '';

            if (!isAnalyst) {
                buttonsHTML += `
                    <button id="add-project-btn" class="admin-btn primary"><i class="fas fa-plus-circle"></i> Add Project</button>
                    <a href="/api/projects/template" class="admin-btn template"><i class="fas fa-download"></i> Template</a>
                `;
            }

            buttonsHTML += `<button id="bulk-upload-btn" class="admin-btn upload"><i class="fas fa-file-excel"></i> Bulk Upload</button>`;

            if (isSuperAdmin) {
                buttonsHTML += `<button id="user-mgmt-btn" class="admin-btn users"><i class="fas fa-users-cog"></i> Users</button>`;
            }

            adminControls.innerHTML = `
                <div style="display: flex; gap: 15px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <h4 style="margin:0; font-size: 1.2rem; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-shield-alt" style="color: var(--accent-gold);"></i> Admin Controls
                    </h4>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        ${buttonsHTML}
                    </div>
                </div>
            `;
            document.querySelector('.sector-nav').after(adminControls);

            if (!isAnalyst) {
                document.getElementById('add-project-btn').addEventListener('click', () => window.openModal('add'));
            }

            document.getElementById('bulk-upload-btn').addEventListener('click', () => window.openUploadModal());

            if (isSuperAdmin) document.getElementById('user-mgmt-btn').addEventListener('click', () => window.openUserModal());

            document.getElementById('bulk-upload-btn').addEventListener('click', () => window.openUploadModal());
            if (isSuperAdmin) document.getElementById('user-mgmt-btn').addEventListener('click', () => window.openUserModal());

        } else if (!isAdmin && adminControls) {
            adminControls.remove();
        }

        // Show/Hide Scholarship Edit
        const scholarshipEditBtn = document.getElementById('edit-scholarships-btn');
        if (scholarshipEditBtn) {
            scholarshipEditBtn.style.display = (isAdmin) ? 'inline-block' : 'none';
        }

        if (currentSector) fetchSectorData(currentSector, 1, true);
    }

    // Bind View All Links
    document.querySelectorAll('.view-all-link').forEach(link => {
        if (link.id !== 'load-more-btn') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Load up to 100 items (effectively "View All" for typical usage)
                fetchSectorData(currentSector, 1, true, 100);
            });
        }
    });

    // --- HELPER: Edit Metrics ---
    window.editMetric = async (label) => {
        const idMap = { 'Scholarships': 'stat-scholarships', 'Beneficiaries': 'stat-impact' };
        const currentText = document.getElementById(idMap[label]).innerText.split(' ')[0] || ''; // simple parse

        const newVal = prompt(`Enter new value for ${label}:`, currentText);
        if (newVal !== null && newVal !== currentText) {
            try {
                const res = await fetch('/api/metrics', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentUser.token}`
                    },
                    body: JSON.stringify({ label, value: newVal })
                });

                if (res.ok) {
                    showToast(`${label} updated`, 'success');
                    fetchDashboardStats();
                } else {
                    const d = await res.json();
                    showToast(d.error || 'Update failed', 'error');
                }
            } catch (err) { console.error(err); showToast('Update error', 'error'); }
        }
    };

    async function fetchSectorData(sectorKey, page = 1, reset = false, limitOverride = null) {
        currentSector = sectorKey;
        currentPage = page;
        const limit = limitOverride || ITEMS_PER_PAGE;

        // Time Slicer & Filters Logic
        const timeSlicer = document.getElementById('time-slicer');
        const searchInput = document.getElementById('smart-search');
        const statusFilter = document.getElementById('status-filter');
        const fundingFilter = document.getElementById('funding-filter');

        let queryParams = `?sector=${sectorKey}&page=${page}&limit=${limit}`;

        if (timeSlicer && timeSlicer.value !== 'all') {
            const [start, end] = timeSlicer.value.split('-');
            queryParams += `&year_start=${start}&year_end=${end}`;
        }

        if (searchInput && searchInput.value.trim()) {
            queryParams += `&search=${encodeURIComponent(searchInput.value.trim())}`;
        }

        if (statusFilter && statusFilter.value !== 'all') {
            queryParams += `&status=${encodeURIComponent(statusFilter.value)}`;
        }

        if (fundingFilter && fundingFilter.value !== 'all') {
            queryParams += `&funding=${encodeURIComponent(fundingFilter.value)}`;
        }

        try {
            const projectsRes = await fetch(`/api/projects${queryParams}`);

            // Safe JSON Parsing to catch HTML errors (like 404/500 pages)
            let projectsData;
            const contentType = projectsRes.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                projectsData = await projectsRes.json();
            } else {
                const text = await projectsRes.text();
                console.error("API returned non-JSON:", text.substring(0, 500)); // Log first 500 chars
                throw new Error(`Server Error: Received ${projectsRes.status}. Check console for details.`);
            }

            if (!projectsRes.ok) throw new Error(projectsData.error || 'Failed to fetch projects');

            if (reset) currentProjects = projectsData.projects || [];
            else currentProjects = [...currentProjects, ...(projectsData.projects || [])];

            const [metricsRes, ratesRes] = await Promise.all([
                fetch(`/api/impact-metrics?sector=${sectorKey}`),
                fetch(`/api/completion-rates?sector=${sectorKey}`)
            ]);

            let metricsData = { metrics: [] };
            if (metricsRes.headers.get("content-type")?.includes("application/json")) {
                metricsData = await metricsRes.json();
            } else {
                console.error("Impact Metrics API Error:", await metricsRes.text());
            }

            let ratesData = { rates: [] };
            if (ratesRes.headers.get("content-type")?.includes("application/json")) {
                ratesData = await ratesRes.json();
            } else {
                console.error("Completion Rates API Error:", await ratesRes.text());
            }

            const infraProjects = projectsData.projects.filter(p => p.category === 'infra');
            const supportProjects = projectsData.projects.filter(p => p.category === 'support');

            if (reset) {
                infraGrid.innerHTML = '';
                supportGrid.innerHTML = '';
            }

            if (infraProjects.length === 0 && reset) {
                infraGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 20px;">No projects found.</div>';
            } else {
                infraGrid.insertAdjacentHTML('beforeend', infraProjects.map(renderProject).join(''));
            }

            if (supportProjects.length === 0 && reset) {
                supportGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 20px;">No projects found.</div>';
            } else {
                supportGrid.insertAdjacentHTML('beforeend', supportProjects.map(renderProject).join(''));
            }

            // Load More Logic
            let loadMoreBtn = document.querySelector('#load-more-btn');
            // If we loaded "View All" (large limit), likely no more pages, or we should hide button if all loaded.
            const isViewAll = limitOverride && limitOverride > ITEMS_PER_PAGE;

            if (!isViewAll && projectsData.pagination.page < projectsData.pagination.totalPages) {
                if (!loadMoreBtn) {
                    loadMoreBtn = document.createElement('button');
                    loadMoreBtn.id = 'load-more-btn';
                    loadMoreBtn.className = 'view-all-link';
                    loadMoreBtn.style.width = '100%';
                    loadMoreBtn.style.textAlign = 'center';
                    loadMoreBtn.innerHTML = 'Load More <i class="fas fa-chevron-down"></i>';
                    loadMoreBtn.onclick = () => fetchSectorData(currentSector, currentPage + 1, false);
                    document.querySelector('.main-column').appendChild(loadMoreBtn);
                }
            } else {
                if (loadMoreBtn) loadMoreBtn.remove();
            }

            // Stats
            if (reset) {
                const metrics = metricsData.metrics;
                const rate = ratesData.rates[0] ? ratesData.rates[0].rate : 0;

                const titles = {
                    education: { infra: "Education Infrastructure", support: "Learning Support" },
                    health: { infra: "Health Infrastructure", support: "Medical Support" },
                    roads: { infra: "Roads & Transport", support: "Transport Support" },
                    water: { infra: "Water & Sanitation", support: "Sanitation Support" },
                    ict: { infra: "ICT Infrastructure", support: "Digital Support" },
                    jobs: { infra: "Jobs & Employment", support: "Skills & Welfare" },
                    agriculture: { infra: "Agri-Infrastructure", support: "Farming Inputs" },
                    youth_sports: { infra: "Youth & Sports Complexes", support: "Youth & Team Support" },
                    scholarship: { infra: "Scholarship Facilities", support: "Scholarship Beneficiaries" }
                };
                const currentTitles = titles[sectorKey] || titles.education;

                infraTitle.innerHTML = `<i class="fas fa-building"></i> ${currentTitles.infra}`;
                supportTitle.innerHTML = `<i class="fas fa-hand-holding-heart"></i> ${currentTitles.support}`;

                widgetMetrics.innerHTML = metrics.map(m => `
                    <div class="impact-row animate-in">
                        <span class="impact-val">${m.val}</span>
                        <span class="impact-label">${m.label}</span>
                    </div>
                `).join('');

                compRateVal.textContent = `${rate}%`;
                compRateBar.style.width = `${rate}%`;
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            showToast(error.message || 'Failed to load sector data.', 'error');
        }
    }

    function renderProject(p) {
        const role = currentUser ? currentUser.role : null;
        const canEdit = ['super_admin', 'regional_admin', 'editor'].includes(role);
        const canDelete = ['super_admin', 'regional_admin'].includes(role);

        let adminActions = '';
        if (canEdit) {
            adminActions = `
            <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; display: flex; justify-content: flex-end; gap: 8px;">
                <button onclick="window.editProject(${p.id})" style="background:none; border:none; color: var(--text-dim); cursor:pointer;"><i class="fas fa-pencil-alt"></i></button>
                ${canDelete ? `<button onclick="window.deleteProject(${p.id})" style="background:none; border:none; color: #ff6b6b; cursor:pointer;"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            `;
        }

        const imageHTML = p.image_url
            ? `<div style="width:100%; height:140px; background:url('${p.image_url}') center/cover no-repeat; border-radius:10px 10px 0 0; margin-bottom:10px;"></div>`
            : '';

        return `
            <div class="p-item animate-in">
                ${imageHTML}
                <div class="p-header">
                    <span class="p-title">${p.name}</span>
                    <span class="year-box">${p.year}</span>
                </div>

                <span class="p-loc">${p.locations}</span>
                <div class="p-meta">
                    <span class="tag ${p.status}">${p.status}</span>
                    ${p.project_cost ? `<span class="tag" style="background:rgba(255,255,255,0.1); color:var(--text-main);"><i class="fas fa-money-bill-wave" style="color:var(--accent-gold); margin-right:4px;"></i> ${p.project_cost}</span>` : ''}
                    ${p.beneficiary_count ? `<span class="tag" style="background:rgba(255,255,255,0.1); color:var(--text-main);"><i class="fas fa-users" style="color:var(--accent-teal); margin-right:4px;"></i> ${p.beneficiary_count}</span>` : ''}
                </div>
                ${adminActions}
            </div>
        `;
    }

    async function renderTable() {
        try {
            const res = await fetch('/api/communities');
            let communities;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                communities = await res.json();
            } else {
                const text = await res.text();
                console.error("Communities API Error (Non-JSON):", text.substring(0, 500));
                return;
            }
            const communityTbody = document.querySelector('#community-tbody');
            if (communityTbody) {
                communityTbody.innerHTML = communities.map((c, index) => `
                    <tr style="animation-delay: ${index * 0.1}s" class="animate-in">
                        <td><div class="community-name"><i class="fas fa-location-arrow" style="font-size: 0.7rem; color: var(--accent-gold);"></i> ${c.name}</div></td>
                        <td><span class="c-pill green"><i class="fas fa-check-circle"></i> ${c.completed}</span></td>
                        <td><span class="c-pill gold"><i class="fas fa-clock"></i> ${c.ongoing}</span></td>
                        <td><span class="update-badge">${c.update}</span></td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error fetching communities:', error);
        }
    }

    async function fetchScholarships() {
        try {
            const res = await fetch('/api/kpi/scholarships');
            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
                const el = document.getElementById('stat-scholarships');
                if (el) el.textContent = data.value;
            } else {
                console.error("Scholarships API Error (Non-JSON):", await res.text());
            }
        } catch (e) {
            console.error(e);
        }
    }

    // --- MODAL INJECTION & LOGIC ---
    function injectModals() {
        // --- TOAST CSS ---
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            .toast { visibility: hidden; min-width: 250px; background-color: #333; color: #fff; text-align: center; border-radius: 4px; padding: 16px; position: fixed; z-index: 3000; left: 50%; bottom: 30px; transform: translateX(-50%); font-size: 17px; opacity: 0; transition: opacity 0.5s, bottom 0.5s; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            .toast.show { visibility: visible; opacity: 1; bottom: 50px; }
            .toast.success { border-left: 5px solid var(--success); }
            .toast.error { border-left: 5px solid var(--accent-red); }
            .toast.info { border-left: 5px solid var(--accent-gold); }
        `;
        document.head.appendChild(styleSheet);
        const toastDiv = document.createElement('div');
        toastDiv.id = 'toast';
        toastDiv.className = 'toast';
        document.body.appendChild(toastDiv);





        // Bind Modal Events - Handled by Delegation now


        // Toggle Register (Existing Code...)
        let isRegisterMode = false;
        document.getElementById('toggle-auth').onclick = (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            const title = document.getElementById('auth-title');
            const btn = document.getElementById('auth-submit-btn');
            const link = document.getElementById('toggle-auth');
            const extra = document.getElementById('register-fields');

            if (isRegisterMode) {
                title.innerHTML = '<i class="fas fa-user-plus"></i> Register';
                btn.textContent = 'Create Account';
                link.textContent = 'Have an account? Login';
                extra.style.display = 'flex';
            } else {
                title.innerHTML = '<i class="fas fa-user-circle"></i> Portal Login';
                btn.textContent = 'Sign In';
                link.textContent = 'Need an account? Register';
                extra.style.display = 'none';
            }
        };

        // Login Handler (Existing...)
        document.getElementById('login-form').onsubmit = (e) => {
            e.preventDefault();
            const username = document.getElementById('l-username').value;
            const password = document.getElementById('l-password').value;
            const endpoint = isRegisterMode ? '/api/register' : '/api/login';

            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
                .then(async res => {
                    const ct = res.headers.get("content-type");
                    if (!ct || !ct.includes("application/json")) {
                        throw new Error(`Server returned non-JSON: ${await res.text()}`);
                    }
                    return res.json();
                })
                .then(data => {
                    if (data.token) {
                        currentUser = data;
                        localStorage.setItem('mp_tracker_user', JSON.stringify(data));
                        document.getElementById('login-modal').style.display = 'none';
                        updateAdminUI();
                        showToast('Welcome back, ' + data.username, 'success');
                    } else if (data.message) {
                        showToast(data.message, 'success');
                        if (isRegisterMode) document.getElementById('toggle-auth').click();
                    } else {
                        showToast(data.error || 'Operation failed', 'error');
                    }
                })
                .catch(() => showToast('Connection error', 'error'));
        };

        // Edit User Form Handler
        document.getElementById('edit-user-form').onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('eu-id').value;
            const role = document.getElementById('eu-role').value;
            const password = document.getElementById('eu-password').value;

            const body = { role };
            if (password) body.password = password;

            try {
                const res = await fetch(`/api/users/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentUser.token}`
                    },
                    body: JSON.stringify(body)
                });

                if (res.ok) {
                    showToast('User updated', 'success');
                    document.getElementById('edit-user-modal').style.display = 'none';
                    window.fetchUsers();
                } else {
                    const errInfo = await res.json();
                    showToast(errInfo.error || 'Update failed', 'error');
                }
            } catch (err) { showToast('Connection error', 'error'); }
        };


        // Project Form Handler
        document.getElementById('project-form').onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('p-id').value;
            const method = id ? 'PUT' : 'POST';
            console.log("APP VERSION: 2.0 (Blue Theme - Fix Loaded)");
            const API_BASE = '/api';
            const url = id ? `${API_BASE}/projects/${id}` : `${API_BASE}/projects`;

            const formData = new FormData();
            // Basic Fields
            formData.append('name', document.getElementById('p-name').value);
            formData.append('locations', document.getElementById('p-locations').value);
            formData.append('sector', document.getElementById('p-sector').value);
            formData.append('category', document.getElementById('p-category').value);
            formData.append('year', document.getElementById('p-year').value);
            formData.append('status', document.getElementById('p-status').value);
            formData.append('community', document.getElementById('p-locations').value.split(',')[0].trim());

            // New Fields
            formData.append('description', document.getElementById('p-description').value);
            formData.append('project_cost', document.getElementById('p-cost').value);
            formData.append('funding_source', document.getElementById('p-funding').value);
            formData.append('beneficiary_count', document.getElementById('p-beneficiaries').value);
            formData.append('contractor', document.getElementById('p-contractor').value);

            const imageFile = document.getElementById('p-image').files[0];
            if (imageFile) {
                formData.append('image', imageFile);
            }

            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${currentUser.token}` },
                    body: formData
                });
                if (res.ok) {
                    document.getElementById('admin-modal').style.display = 'none';
                    fetchSectorData(currentSector, 1, true);
                    fetchDashboardStats(); // Refresh metrics (Total Investment) immediately
                    showToast('Project saved', 'success');
                } else {
                    let data;
                    const ct = res.headers.get("content-type");
                    if (ct && ct.includes("application/json")) {
                        data = await res.json();
                    } else {
                        throw new Error("Server returned non-JSON error");
                    }
                    if (data.error === 'Failed to authenticate token' || res.status === 403) {
                        showToast('Session expired. Please login again.', 'error');
                        logout(); // Auto-logout
                    } else {
                        showToast(data.error || 'Save failed', 'error');
                    }
                }
            } catch (err) { console.error(err); showToast('An error occurred', 'error'); }
        };

        // Upload Form Handler
        document.getElementById('upload-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('file', document.getElementById('u-file').files[0]);

            try {
                const res = await fetch('/api/projects/bulk-upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentUser.token}` },
                    body: formData
                });
                const data = await res.json();
                showToast(`Upload: ${data.inserted} inserted, ${data.skipped} skipped`, 'success');
                document.getElementById('upload-modal').style.display = 'none';
                fetchSectorData(currentSector, 1, true);
            } catch (err) { showToast('Upload failed', 'error'); }
        };

        // --- SCHOLARSHIPS EVENTS ---
        const scholCard = document.getElementById('kpi-scholarships-card');
        if (scholCard) {
            scholCard.style.cursor = 'pointer';
            scholCard.addEventListener('click', (e) => {
                if (e.target.closest('.edit-kpi-btn')) return;
                window.openScholarshipModal();
            });
        }

        const closeScholBtn = document.getElementById('close-scholarship-modal');
        if (closeScholBtn) {
            closeScholBtn.onclick = () => document.getElementById('scholarship-modal').style.display = 'none';
        }

        const addScholBtn = document.getElementById('add-scholarship-btn');
        if (addScholBtn) {
            addScholBtn.onclick = () => {
                const c = document.getElementById('add-scholarship-form-container');
                c.style.display = (c.style.display === 'none') ? 'block' : 'none';
            };
        }

        const addScholForm = document.getElementById('add-scholarship-form');
        if (addScholForm) {
            addScholForm.onsubmit = (e) => {
                e.preventDefault();
                window.saveScholarship();
            };
        }
    }
});

// --- HELPER FUNCTIONS (Interior Scope to access currentProjects) ---
window.editProject = async (id) => {
    const project = currentProjects.find(p => p.id === id);
    if (project) {
        window.openModal('edit', project);
    } else {
        console.error('Project not found:', id);
    }
};

window.deleteProject = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
        const res = await fetch(`/api/projects/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (res.ok) {
            fetchSectorData(currentSector, 1, true);
            fetchDashboardStats();
            showToast('Project deleted', 'info');
        }
    } catch (err) { console.error(err); }
};

// --- HELPER FUNCTIONS (Window Scope) ---

window.openModal = (mode, project = null) => {
    const modal = document.getElementById('admin-modal');
    const form = document.getElementById('project-form');
    document.getElementById('modal-title').textContent = mode === 'add' ? 'Add Project' : 'Edit Project';

    bindFilePreview(); // Ensure listener is active

    if (mode === 'edit' && project) {
        document.getElementById('p-id').value = project.id;
        document.getElementById('p-name').value = project.name;
        document.getElementById('p-locations').value = project.locations;
        document.getElementById('p-sector').value = project.sector;
        document.getElementById('p-category').value = project.category;
        document.getElementById('p-year').value = project.year;
        document.getElementById('p-status').value = project.status;

        // New Fields
        document.getElementById('p-description').value = project.description || '';
        document.getElementById('p-cost').value = project.project_cost || '';
        document.getElementById('p-funding').value = project.funding_source || '';
        document.getElementById('p-beneficiaries').value = project.beneficiary_count || '';
        document.getElementById('p-contractor').value = project.contractor || '';

        // Image Preview in Edit
        const preview = document.getElementById('image-preview');
        const text = document.getElementById('file-text');
        if (project.image_url) {
            if (preview) {
                preview.src = project.image_url;
                preview.style.display = 'block';
            }
            if (text) text.style.display = 'none';
        } else {
            if (preview) preview.style.display = 'none';
            if (text) text.style.display = 'block';
        }
    } else {
        form.reset();
        document.getElementById('p-id').value = '';
        // Clear preview for add mode
        const preview = document.getElementById('image-preview');
        const text = document.getElementById('file-text');
        if (preview) {
            preview.style.display = 'none';
            preview.src = '';
        }
        if (text) text.style.display = 'block';
        if (document.getElementById('p-image')) document.getElementById('p-image').value = '';
    }
    modal.style.display = 'flex';
};

window.openUploadModal = () => {
    document.getElementById('upload-modal').style.display = 'flex';

    // Drag & Drop Logic (Bind once)
    const dropZone = document.getElementById('upload-drop-zone');
    const fileInput = document.getElementById('u-file');
    const fileNameDisplay = document.getElementById('file-name-display');

    if (dropZone && !dropZone.dataset.bound) {
        dropZone.dataset.bound = true;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            fileInput.files = files;
            updateFileName();
        });

        fileInput.addEventListener('change', updateFileName);

        function updateFileName() {
            if (fileInput.files.length > 0) {
                fileNameDisplay.textContent = 'Selected: ' + fileInput.files[0].name;
                dropZone.querySelector('.upload-text').style.display = 'none';
                dropZone.querySelector('.upload-subtext').style.display = 'none';
                dropZone.querySelector('.upload-icon').className = 'fas fa-file-excel upload-icon';
                dropZone.querySelector('.upload-icon').style.color = 'var(--accent-gold)';
            }
        }

        // Make entire zone clickable
        dropZone.addEventListener('click', () => fileInput.click());
    }
};


window.openUserModal = async () => {
    document.getElementById('user-modal').style.display = 'flex';
    document.getElementById('create-user-form-container').style.display = 'none'; // Reset form visibility

    // Bind Create User Button inside modal once
    const createBtn = document.getElementById('msg-create-user-btn');
    if (createBtn && !createBtn.dataset.bound) {
        createBtn.dataset.bound = true;
        createBtn.addEventListener('click', () => {
            const container = document.getElementById('create-user-form-container');
            container.style.display = container.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('create-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('cu-username').value;
            const password = document.getElementById('cu-password').value;
            const role = document.getElementById('cu-role').value;

            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentUser.token} `
                    },
                    body: JSON.stringify({ username, password, role })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('User created successfully', 'success');
                    document.getElementById('create-user-form').reset();
                    document.getElementById('create-user-form-container').style.display = 'none';
                    window.fetchUsers();
                } else {
                    showToast(data.error || 'Creation failed', 'error');
                }
            } catch (err) { showToast('Connection error', 'error'); }
        });
    }

    await window.fetchUsers();
};

// Store users globally
let currentUsersList = [];

window.fetchUsers = async () => {
    try {
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${currentUser.token} ` }
        });
        const data = await res.json();
        currentUsersList = data.users || [];

        const tbody = document.getElementById('user-tbody');
        if (currentUsersList.length > 0) {
            tbody.innerHTML = currentUsersList.map(u => `
            < tr >
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:35px; height:35px; background:rgba(255,255,255,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--accent-gold); font-size:0.9rem;">
                                ${u.username.charAt(0).toUpperCase()}
                            </div>
                            <span style="font-weight:500;">${u.username}</span>
                        </div>
                    </td>
                    <td><span class="role-badge ${u.role}">${u.role.replace('_', ' ')}</span></td>
                    <td>
                        <span style="display:inline-flex; align-items:center; gap:6px; color:${u.status === 'approved' ? 'var(--completed)' : (u.status === 'blocked' ? '#e74c3c' : '#f39c12')}; font-size:0.9rem;">
                            <i class="fas fa-circle" style="font-size:0.5rem;"></i> ${u.status.toUpperCase()}
                        </span>
                    </td>
                    <td style="text-align:right;">
                        ${u.role !== 'super_admin' ? `
                            <div style="display:flex; justify-content:flex-end; gap:8px;">
                                <button onclick="window.updateUserStatus(${u.id}, 'approved')" style="width:32px; height:32px; border-radius:8px; background:rgba(46,204,113,0.1); color:var(--accent-green); border:1px solid rgba(46,204,113,0.2); cursor:pointer; transition:all 0.2s;" title="Approve"><i class="fas fa-check"></i></button>
                                <button onclick="window.updateUserStatus(${u.id}, 'blocked')" style="width:32px; height:32px; border-radius:8px; background:rgba(231,76,60,0.1); color:#e74c3c; border:1px solid rgba(231,76,60,0.2); cursor:pointer; transition:all 0.2s;" title="Block"><i class="fas fa-ban"></i></button>
                                <button onclick="window.editUser(${u.id})" style="width:32px; height:32px; border-radius:8px; background:rgba(26,188,156,0.1); color:var(--accent-teal); border:1px solid rgba(26,188,156,0.2); cursor:pointer; transition:all 0.2s;" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                                <button onclick="window.deleteUser(${u.id})" style="width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.05); color:var(--text-dim); border:1px solid rgba(255,255,255,0.1); cursor:pointer; transition:all 0.2s;" title="Delete"><i class="fas fa-trash"></i></button>
                            </div>
                        ` : '<span style="color:var(--text-dim); font-size:0.85rem; font-style:italic;">Protected</span>'}
                    </td>
                </tr >
            `).join('');
        } else {
            tbody.innerHTML = `< tr > <td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">No users found.</td></tr > `;
        }
    } catch (err) {
        window.showToast('Failed to fetch users', 'error');
    }
};

window.editUser = (id) => {
    const user = currentUsersList.find(u => u.id === id);
    if (!user) return;

    document.getElementById('eu-id').value = user.id;
    document.getElementById('eu-username').value = user.username;
    document.getElementById('eu-role').value = user.role;
    document.getElementById('eu-password').value = ''; // Reset

    document.getElementById('edit-user-modal').style.display = 'flex';
};

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
        const res = await fetch(`/ api / users / ${id} `, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token} ` }
        });
        if (res.ok) {
            window.showToast('User deleted', 'success');
            window.fetchUsers();
        } else {
            window.showToast('Delete failed', 'error');
        }
    } catch (err) { console.error(err); }
};

window.updateUserStatus = async (id, status) => {
    try {
        const res = await fetch(`/ api / users / ${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            window.showToast(`User ${status}`, 'success');
            window.fetchUsers();
        } else {
            window.showToast('Action failed', 'error');
        }
    } catch (err) { console.error(err); }
};

window.showToast = (message, type = 'info') => {
    // Ensure container exists
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Icons map
    const icons = {
        success: '<i class="fas fa-check-circle toast-icon"></i>',
        error: '<i class="fas fa-exclamation-circle toast-icon"></i>',
        info: '<i class="fas fa-info-circle toast-icon"></i>'
    };

    // Create Toast
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span style="flex:1;">${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--text-dim); cursor:pointer;"><i class="fas fa-times"></i></button>
    `;

    // Append
    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4500);
};

window.bindFilePreview = () => {
    const fileInput = document.getElementById('p-image');
    const preview = document.getElementById('image-preview');
    const fileText = document.getElementById('file-text');
    const dropZone = document.getElementById('drop-zone');

    if (!fileInput || !preview || !dropZone) return;

    fileInput.onchange = function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                preview.src = e.target.result;
                preview.style.display = 'block';
                if (fileText) fileText.style.display = 'none';
            }
            reader.readAsDataURL(file);
        } else {
            // If cleared, maybe reset? keeping as is for now
        }
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('highlight');
    };

    dropZone.ondragleave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('highlight');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('highlight');
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        fileInput.dispatchEvent(new Event('change'));
    };
};

// --- SCHOLARSHIPS HELPER FUNCTIONS ---
window.openScholarshipModal = async () => {
    document.getElementById('scholarship-modal').style.display = 'flex';
    document.getElementById('add-scholarship-form-container').style.display = 'none';
    if (!currentUser || !['super_admin', 'regional_admin', 'editor'].includes(currentUser.role)) {
        document.getElementById('add-scholarship-btn').style.display = 'none';
    } else {
        document.getElementById('add-scholarship-btn').style.display = 'block';
    }
    await window.fetchScholarships();
};

window.fetchScholarships = async () => {
    try {
        const res = await fetch('/api/scholarships');
        let data;
        const ct = res.headers.get("content-type");
        if (ct && ct.includes("application/json")) {
            data = await res.json();
        } else {
            console.error("Scholarships Fetch Error (Non-JSON):", await res.text());
            return;
        }
        const tbody = document.getElementById('scholarship-tbody');
        if (tbody) {
            tbody.innerHTML = data.scholarships.map(s => `
                <tr>
                    <td>${s.beneficiary_name}</td>
                    <td>${s.institution}</td>
                    <td>${s.amount || '-'}</td>
                    <td><span class="role-badge ${s.status === 'Paid' ? 'super_admin' : 'editor'}">${s.status}</span></td>
                    <td>${s.year}</td>
                    <td style="text-align:right;">
                         ${currentUser && ['super_admin', 'regional_admin', 'editor'].includes(currentUser.role) ?
                    `<button onclick="window.deleteScholarship(${s.id})" style="color:#ff6b6b; background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>
             `).join('');
        }
        const statEl = document.getElementById('stat-scholarships');
        if (statEl) statEl.innerText = data.scholarships.length;
    } catch (err) { console.error(err); }
};

window.saveScholarship = async () => {
    if (!currentUser) return showToast('Login required', 'error');

    const body = {
        beneficiary_name: document.getElementById('s-name').value,
        institution: document.getElementById('s-institution').value,
        amount: document.getElementById('s-amount').value,
        year: document.getElementById('s-year').value,
        status: document.getElementById('s-status').value,
        category: document.getElementById('s-category').value
    };

    try {
        const res = await fetch('/api/scholarships', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            showToast('Scholarship added', 'success');
            document.getElementById('add-scholarship-form').reset();
            document.getElementById('add-scholarship-form-container').style.display = 'none';
            await window.fetchScholarships();
            window.fetchDashboardStats();
        } else {
            const d = await res.json();
            showToast(d.error || 'Failed', 'error');
        }
    } catch (err) { showToast('Error saving', 'error'); }
};

window.deleteScholarship = async (id) => {
    if (!confirm('Delete this record?')) return;
    try {
        const res = await fetch(`/api/scholarships/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (res.ok) {
            window.fetchScholarships();
            window.fetchDashboardStats();
        }
    } catch (err) { console.error(err); }
};


