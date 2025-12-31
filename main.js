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
    const authBtn = document.querySelector('#auth-btn');

    // --- INIT ---
    checkAuth();
    fetchSectorData('education', 1, true);
    fetchScholarships(); // Fetch initial value
    renderTable();
    injectModals();

    // --- EVENT LISTENERS ---
    const timeSlicer = document.getElementById('time-slicer');
    if (timeSlicer) {
        timeSlicer.addEventListener('change', () => {
            fetchSectorData(currentSector, 1, true);
        });
    }
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchSectorData(btn.dataset.sector, 1, true);
        });
    });

    authBtn.addEventListener('click', () => {
        if (currentUser) {
            logout();
        } else {
            document.getElementById('login-modal').style.display = 'flex';
        }
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

    const editScholarshipsBtn = document.getElementById('edit-scholarships-btn');
    if (editScholarshipsBtn) {
        editScholarshipsBtn.addEventListener('click', async () => {
            const currentVal = document.getElementById('stat-scholarships').textContent;
            const newVal = prompt("Enter new Scholarships value:", currentVal);
            if (newVal !== null && newVal !== currentVal) {
                try {
                    const res = await fetch('/api/kpi/scholarships', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentUser.token}`
                        },
                        body: JSON.stringify({ value: newVal })
                    });
                    if (res.ok) {
                        fetchScholarships();
                        showToast('Scholarships updated', 'success');
                    } else {
                        showToast('Update failed', 'error');
                    }
                } catch (e) {
                    showToast('Error updating value', 'error');
                }
            }
        });
    }

    async function fetchSectorData(sectorKey, page = 1, reset = false, limitOverride = null) {
        currentSector = sectorKey;
        currentPage = page;
        const limit = limitOverride || ITEMS_PER_PAGE;

        // Time Slicer Logic
        const timeSlicer = document.getElementById('time-slicer');
        let yearQuery = '';
        if (timeSlicer && timeSlicer.value !== 'all') {
            const [start, end] = timeSlicer.value.split('-');
            yearQuery = `&year_start=${start}&year_end=${end}`;
        }

        try {
            const projectsRes = await fetch(`/api/projects?sector=${sectorKey}&page=${page}&limit=${limit}${yearQuery}`);
            const projectsData = await projectsRes.json();

            if (reset) currentProjects = projectsData.projects;
            else currentProjects = [...currentProjects, ...projectsData.projects];

            const [metricsRes, ratesRes] = await Promise.all([
                fetch(`/api/impact-metrics?sector=${sectorKey}`),
                fetch(`/api/completion-rates?sector=${sectorKey}`)
            ]);
            const metricsData = await metricsRes.json();
            const ratesData = await ratesRes.json();

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
                    social: { infra: "Social Protection", support: "Charity & Welfare" },
                    agriculture: { infra: "Agri-Infrastructure", support: "Farming Inputs" },
                    youth: { infra: "Youth Centers", support: "Skill Training" },
                    sports: { infra: "Sports Complexes", support: "Team Support" }
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
            showToast('Failed to load sector data.', 'error');
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
                </div>
                ${adminActions}
            </div>
        `;
    }

    async function renderTable() {
        try {
            const res = await fetch('/api/communities');
            const communities = await res.json();
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
            const data = await res.json();
            const el = document.getElementById('stat-scholarships');
            if (el) el.textContent = data.value;
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

        // --- MODAL HTML ---
        const modalHTML = `
            <div id="login-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:2000; justify-content:center; align-items:center;">
                 <div class="glass-panel" style="width: 90%; max-width: 350px; padding: 25px; position:relative; text-align:center;">
                    <button id="close-login" style="position:absolute; top:10px; right:10px; background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">&times;</button>
                    <h3 id="auth-title" style="margin-bottom:20px;"><i class="fas fa-user-circle"></i> Portal Login</h3>
                    <form id="login-form" style="display:flex; flex-direction:column; gap:15px;">
                        <input type="text" id="l-username" placeholder="Username" required style="padding:10px; background:rgba(255,255,255,0.1); border:1px solid #444; color:white; border-radius: var(--radius-sm);">
                        <input type="password" id="l-password" placeholder="Password" required style="padding:10px; background:rgba(255,255,255,0.1); border:1px solid #444; color:white; border-radius: var(--radius-sm);">
                        <div id="register-fields" style="display:none; flex-direction:column; gap:15px;">
                            <p style="font-size:0.8rem; color:var(--text-dim); text-align:left;">* Password must be 8+ chars with number/special char.</p>
                        </div>
                        <button type="submit" id="auth-submit-btn" class="btn-primary" style="justify-content:center;">Sign In</button>
                    </form>
                    <p style="margin-top:15px; font-size:0.9rem;"><a href="#" id="toggle-auth" style="color:var(--accent-gold);">Need an account? Register</a></p>
                 </div>
            </div>

            <div id="user-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center;">
                <div class="glass-panel" style="width: 90%; max-width: 700px; padding: 20px; position:relative; max-height:80vh; overflow-y:auto;">
                    <button id="close-user-modal" style="position:absolute; top:10px; right:10px; background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">&times;</button>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3 style="margin:0;">User Management</h3>
                        <button id="msg-create-user-btn" class="btn-primary" style="padding:6px 12px; font-size:0.8rem;"><i class="fas fa-plus"></i> Add User</button>
                    </div>
                    <div id="create-user-form-container" style="display:none; background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-bottom:15px;">
                         <h4>Create New User</h4>
                         <form id="create-user-form" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                            <input type="text" id="cu-username" placeholder="Username" required class="glass-input">
                            <input type="password" id="cu-password" placeholder="Password (Complex)" required class="glass-input">
                            <select id="cu-role" class="glass-input">
                                <option value="analyst">Analyst</option>
                                <option value="editor">Editor</option>
                                <option value="regional_admin">Regional Admin</option>
                                <option value="super_admin">Super Admin</option>
                            </select>
                            <button type="submit" class="btn-primary" style="grid-column:1/-1;">Create User</button>
                         </form>
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="border-bottom:1px solid #444; text-align:left;">
                                <th style="padding:10px;">Username</th>
                                <th style="padding:10px;">Role</th>
                                <th style="padding:10px;">Status</th>
                                <th style="padding:10px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="user-tbody"></tbody>
                    </table>
                </div>
            </div>

            <div id="admin-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000; justify-content:center; align-items:center; backdrop-filter: blur(5px);">
                <div class="glass-panel" style="width: 90%; max-width: 800px; padding: 40px; position:relative; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header-styled">
                        <h3 id="modal-title">Manage Project</h3>
                        <button id="close-modal" style="background:none; border:none; color:var(--text-dim); font-size:1.2rem; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                    
                    <form id="project-form" class="modern-form">
                        <input type="hidden" id="p-id">
                        
                        <div class="form-group full-width">
                            <label class="form-label">Project Name</label>
                            <input type="text" id="p-name" class="form-control" placeholder="e.g. ICT Fongu JHS" required>
                        </div>

                        <div class="form-group full-width">
                            <label class="form-label">Location</label>
                            <input type="text" id="p-locations" class="form-control" placeholder="e.g. Wa, Upper West" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Sector</label>
                            <select id="p-sector" class="form-control" required>
                                <option value="education">Education</option>
                                <option value="health">Health</option>
                                <option value="roads">Roads & Transport</option>
                                <option value="water">Water & Sanitation</option>
                                <option value="ict">ICT</option>
                                <option value="social">Social Protection</option>
                                <option value="agriculture">Agriculture</option>
                                <option value="youth">Youth Development</option>
                                <option value="sports">Sports</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Category</label>
                             <select id="p-category" class="form-control" required>
                                <option value="infra">Infrastructure</option>
                                <option value="support">Logistical Support</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Year</label>
                            <input type="text" id="p-year" class="form-control" placeholder="e.g. 2026" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Status</label>
                            <select id="p-status" class="form-control" required>
                                <option value="completed">Completed</option>
                                <option value="ongoing">Ongoing</option>
                                <option value="planned">Planned</option>
                            </select>
                        </div>
                        
                        <div class="form-group full-width">
                            <label class="form-label">Project Image (Optional)</label>
                            <div class="file-upload-wrapper" id="drop-zone">
                                <input type="file" id="p-image" accept="image/*">
                                <div class="file-upload-content">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <p id="file-text">Click or Drag to Upload Image</p>
                                </div>
                                <img id="image-preview" class="file-preview">
                            </div>
                        </div>

                        <div class="full-width" style="margin-top: 10px;">
                            <button type="submit" class="btn-primary" style="width: 100%; padding: 12px; font-size: 1rem;">Save Project</button>
                        </div>
                    </form>
                </div>
            </div>
            
            <div id="upload-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center;">
                 <div class="glass-panel" style="width: 90%; max-width: 400px; padding: 20px; position:relative;">
                    <button id="close-upload" style="position:absolute; top:10px; right:10px; background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">&times;</button>
                    <h3 style="margin-bottom:15px;">Bulk Upload</h3>
                    <form id="upload-form">
                        <input type="file" id="u-file" accept=".xlsx" required style="margin-bottom:15px; color:white;">
                        <button type="submit" class="btn-primary">Upload</button>
                    </form>
                 </div>
            </div>

            <div id="edit-user-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1100; justify-content:center; align-items:center;">
                 <div class="glass-panel" style="width: 90%; max-width: 400px; padding: 25px; position:relative;">
                    <button id="close-edit-user" style="position:absolute; top:10px; right:10px; background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">&times;</button>
                    <h3 style="margin-bottom:20px;">Edit User</h3>
                    <form id="edit-user-form" style="display:flex; flex-direction:column; gap:15px;">
                        <input type="hidden" id="eu-id">
                        <div>
                            <label style="font-size:0.8rem; color:var(--text-dim);">Username</label>
                            <input type="text" id="eu-username" disabled style="width:100%; padding:10px; background:rgba(255,255,255,0.05); border:1px solid #444; color:var(--text-dim); border-radius: var(--radius-sm);">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; color:var(--text-dim);">Role</label>
                             <select id="eu-role" style="width:100%; padding:10px; background:rgba(0,0,0,0.5); border:1px solid #444; color:white; border-radius: var(--radius-sm);">
                                <option value="analyst">Analyst</option>
                                <option value="editor">Editor</option>
                                <option value="regional_admin">Regional Admin</option>
                                <option value="super_admin">Super Admin</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem; color:var(--text-dim);">New Password (Optional)</label>
                            <input type="password" id="eu-password" placeholder="Leave blank to keep current" style="width:100%; padding:10px; background:rgba(255,255,255,0.1); border:1px solid #444; color:white; border-radius: var(--radius-sm);">
                        </div>
                        <button type="submit" class="btn-primary">Update User</button>
                    </form>
                 </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Bind Modal Events
        document.getElementById('close-modal').onclick = () => document.getElementById('admin-modal').style.display = 'none';
        document.getElementById('close-upload').onclick = () => document.getElementById('upload-modal').style.display = 'none';
        document.getElementById('close-login').onclick = () => document.getElementById('login-modal').style.display = 'none';
        document.getElementById('close-user-modal').onclick = () => document.getElementById('user-modal').style.display = 'none';
        document.getElementById('close-edit-user').onclick = () => document.getElementById('edit-user-modal').style.display = 'none';

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
                .then(res => res.json())
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
            const url = id ? `/api/projects/${id}` : '/api/projects';

            const formData = new FormData();
            formData.append('name', document.getElementById('p-name').value);
            formData.append('locations', document.getElementById('p-locations').value);
            formData.append('sector', document.getElementById('p-sector').value);
            formData.append('category', document.getElementById('p-category').value);
            formData.append('year', document.getElementById('p-year').value);
            formData.append('status', document.getElementById('p-status').value);
            formData.append('community', document.getElementById('p-locations').value.split(',')[0].trim());

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
                    showToast('Project saved', 'success');
                } else {
                    const data = await res.json();
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
        if (res.ok) window.location.reload();
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
                        'Authorization': `Bearer ${currentUser.token}`
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
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await res.json();
        currentUsersList = data.users || [];

        const tbody = document.getElementById('user-tbody');
        if (currentUsersList.length > 0) {
            tbody.innerHTML = currentUsersList.map(u => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px;">${u.username}</td>
                    <td style="padding:10px;">${u.role}</td>
                    <td style="padding:10px;"><span class="tag ${u.status === 'approved' ? 'completed' : (u.status === 'blocked' ? 'planned' : 'waiting')}">${u.status}</span></td>
                    <td style="padding:10px;">
                        ${u.role !== 'super_admin' ? `
                            <button onclick="window.updateUserStatus(${u.id}, 'approved')" style="color:var(--success); background:none; border:none; cursor:pointer; margin-right:5px;" title="Approve"><i class="fas fa-check"></i></button>
                            <button onclick="window.updateUserStatus(${u.id}, 'blocked')" style="color:var(--accent-red); background:none; border:none; cursor:pointer; margin-right:5px;" title="Block"><i class="fas fa-ban"></i></button>
                            <button onclick="window.editUser(${u.id})" style="color:var(--accent-teal); background:none; border:none; cursor:pointer; margin-right:5px;" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                            <button onclick="window.deleteUser(${u.id})" style="color:var(--accent-red); background:none; border:none; cursor:pointer;" title="Delete"><i class="fas fa-trash"></i></button>
                        ` : '<span style="color:var(--text-dim); font-size:0.8rem;">Super Admin</span>'}
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">No users found.</td></tr>`;
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
        const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
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
        const res = await fetch(`/api/users/${id}/status`, {
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
    const toast = document.getElementById("toast");
    if (!toast) return; // Should exist by now
    toast.className = `toast show ${type}`;
    toast.innerText = message;
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

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


