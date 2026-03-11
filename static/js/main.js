// =============================================
// SCRIPVIA — Main Frontend Logic
// =============================================

let currentProjectId = null;
let currentDocId = null;
let quill = null;
let autoSaveTimer = null;      // Holds the 30s interval
let localBackupTimer = null;   // Holds the localStorage debounce timer
let countdownTimer = null;     // Countdown display timer
let secondsUntilSave = 30;     // Countdown counter

// DOM refs
const projectsList    = document.getElementById('projectsList');
const documentsList   = document.getElementById('documentsList');
const documentsNav    = document.getElementById('documentsNav');
const welcomeScreen   = document.getElementById('welcomeScreen');
const editorWrapper   = document.getElementById('editorWrapper');
const docTitleInput   = document.getElementById('docTitleInput');
const saveStatus      = document.getElementById('saveStatus');
const saveBtn         = document.getElementById('saveBtn');
const exportPdfBtn    = document.getElementById('exportPdfBtn');
const exportDocxBtn   = document.getElementById('exportDocxBtn');

const newProjectModal   = document.getElementById('newProjectModal');
const newDocModal       = document.getElementById('newDocModal');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectDescInput  = document.getElementById('projectDescInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

// =============================================
// QUILL INIT
// =============================================
function initQuill() {
    quill = new Quill('#quillEditor', {
        theme: 'snow',
        placeholder: 'Start writing...',
        modules: {
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                [{ align: [] }],
                ['link'],
                ['clean']
            ]
        }
    });

quill.on('text-change', () => {
    setSaveStatus('unsaved');
    saveToLocalStorage();      // Instantly backup to localStorage on every keystroke
    resetCountdown();          // Reset the 30s countdown on activity
});
}

// =============================================
// API HELPER
// =============================================
async function api(method, url, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
}

// =============================================
// PROJECTS
// =============================================
async function loadProjects() {
    try {
        const projects = await api('GET', '/api/projects');
        renderProjects(projects);
    } catch(e) { console.error('loadProjects:', e); }
}

function renderProjects(projects) {
    if (!projects.length) {
        projectsList.innerHTML = '<li class="empty-state">No projects yet.<br>Create one to begin.</li>';
        return;
    }
    projectsList.innerHTML = projects.map(p => `
        <li class="project-item ${p.id === currentProjectId ? 'active' : ''}"
            onclick="selectProject(${p.id})">
            <span class="item-name">${escapeHtml(p.title)}</span>
            <span class="item-meta">${p.document_count}</span>
            <button class="item-delete" onclick="deleteProject(event,${p.id})">×</button>
        </li>
    `).join('');
}

async function createProject() {
    const title = projectTitleInput.value.trim();
    if (!title) { projectTitleInput.focus(); return; }
    try {
        const p = await api('POST', '/api/projects', {
            title, description: projectDescInput.value.trim()
        });
        closeModal(newProjectModal);
        projectTitleInput.value = '';
        projectDescInput.value = '';
        await loadProjects();
        selectProject(p.id);
    } catch(e) { console.error('createProject:', e); }
}

async function deleteProject(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this project and all its documents?')) return;
    try {
        await api('DELETE', `/api/projects/${id}`);
        if (currentProjectId === id) {
            currentProjectId = null; currentDocId = null;
            hideEditor();
            documentsNav.style.display = 'none';
        }
        await loadProjects();
    } catch(e) { console.error('deleteProject:', e); }
}

async function selectProject(id) {
    currentProjectId = id;
    currentDocId = null;
    await loadProjects();
    await loadDocuments(id);
    documentsNav.style.display = 'block';
    hideEditor();
}

// =============================================
// DOCUMENTS
// =============================================
async function loadDocuments(projectId) {
    try {
        const docs = await api('GET', `/api/projects/${projectId}/documents`);
        renderDocuments(docs);
    } catch(e) { console.error('loadDocuments:', e); }
}

function renderDocuments(docs) {
    if (!docs.length) {
        documentsList.innerHTML = '<li class="empty-state">No documents yet.</li>';
        return;
    }
    documentsList.innerHTML = docs.map(d => `
        <li class="doc-item ${d.id === currentDocId ? 'active' : ''}"
            onclick="openDocument(${d.id})">
            <span class="item-dot"></span>
            <span class="item-name">${escapeHtml(d.title)}</span>
            <button class="item-delete" onclick="deleteDocument(event,${d.id})">×</button>
        </li>
    `).join('');
}

async function createDocument() {
    const title = docTitleModalInput.value.trim();
    if (!title || !currentProjectId) { docTitleModalInput.focus(); return; }
    try {
        const doc = await api('POST', `/api/projects/${currentProjectId}/documents`, { title });
        closeModal(newDocModal);
        docTitleModalInput.value = '';
        await loadDocuments(currentProjectId);
        openDocument(doc.id);
    } catch(e) { console.error('createDocument:', e); }
}

async function openDocument(id) {
    try {
        const doc = await api('GET', `/api/documents/${id}`);
        currentDocId = id;
        docTitleInput.value = doc.title;
        docTitleInput.disabled = false;

        // Load server content first
        quill.root.innerHTML = doc.content || '';
        quill.history.clear();

        showEditor();
        enableHeaderBtns(true);

        // Check if there's a newer localStorage backup to restore
        const restored = checkLocalStorageRestore(id, doc.content || '');
        if (!restored) setSaveStatus('saved');

        // Start the 30s auto-save cycle
        startAutoSave();

        await loadDocuments(currentProjectId);
    } catch(e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');
    try {
        await api('PUT', `/api/documents/${currentDocId}`, {
            title: docTitleInput.value.trim() || 'Untitled',
            content: quill.root.innerHTML
        });
        setSaveStatus('saved');
        clearLocalStorage(currentDocId); // Server has latest, no need for backup
        await loadDocuments(currentProjectId);
    } catch(e) { setSaveStatus('error'); console.error('saveDocument:', e); }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this document?')) return;
    try {
        await api('DELETE', `/api/documents/${id}`);
        if (currentDocId === id) {
            currentDocId = null;
            hideEditor();
            enableHeaderBtns(false);
        }
        await loadDocuments(currentProjectId);
    } catch(e) { console.error('deleteDocument:', e); }
}

// =============================================
// UI HELPERS
// =============================================
function showEditor() {
    welcomeScreen.classList.add('hidden');
    editorWrapper.classList.add('visible');
}

function hideEditor() {
    stopAutoSave(); // Stop the interval when leaving a doc
    welcomeScreen.classList.remove('hidden');
    editorWrapper.classList.remove('visible');
    docTitleInput.value = '';
    docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
}

function setSaveStatus(status) {
    const map = { saved: '✓ Saved', saving: 'Saving...', unsaved: '● Unsaved', error: '✗ Error', '': '' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className = 'save-status ' + status;
}

function enableHeaderBtns(on) {
    saveBtn.disabled = !on;
    exportPdfBtn.disabled = !on;
    exportDocxBtn.disabled = !on;
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =============================================
// MODALS
// =============================================
function openModal(modal) { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeModal(o); });
});

// =============================================
// DARK MODE
// =============================================
let isDark = true;
document.getElementById('darkModeToggle').addEventListener('click', () => {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('themeIcon').textContent  = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
});

// =============================================
// SIDEBAR COLLAPSE
// =============================================
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

// =============================================
// EVENT LISTENERS
// =============================================
document.getElementById('newProjectBtn').addEventListener('click', () => openModal(newProjectModal));
document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal(newProjectModal));
document.getElementById('cancelProjectBtn2').addEventListener('click', () => closeModal(newProjectModal));
document.getElementById('confirmProjectBtn').addEventListener('click', createProject);
projectTitleInput.addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });

document.getElementById('newDocBtn').addEventListener('click', () => openModal(newDocModal));
document.getElementById('cancelDocBtn').addEventListener('click', () => closeModal(newDocModal));
document.getElementById('cancelDocBtnX').addEventListener('click', () => closeModal(newDocModal));
document.getElementById('confirmDocBtn').addEventListener('click', createDocument);
docTitleModalInput.addEventListener('keydown', e => { if (e.key === 'Enter') createDocument(); });

saveBtn.addEventListener('click', saveDocument);
exportPdfBtn.addEventListener('click', () => alert('PDF export — coming in Step 7!'));
exportDocxBtn.addEventListener('click', () => alert('DOCX export — coming in Step 7!'));

// =============================================
// AUTO-SAVE & LOCALSTORAGE BACKUP
// =============================================

// --- localStorage helpers ---
// We store content with a key based on doc ID so each doc has its own backup

function getLocalKey(docId) {
    // e.g. "scripvia_doc_42"
    return `scripvia_doc_${docId}`;
}

function saveToLocalStorage() {
    // Called on every keystroke — saves content + title as a safety net
    if (!currentDocId || !quill) return;

    const backup = {
        title:     docTitleInput.value,
        content:   quill.root.innerHTML,
        savedAt:   Date.now()
    };

    try {
        localStorage.setItem(getLocalKey(currentDocId), JSON.stringify(backup));
    } catch(e) {
        // localStorage can fail if storage is full
        console.warn('localStorage backup failed:', e);
    }
}

function loadFromLocalStorage(docId) {
    // Returns the backup object or null if nothing stored
    try {
        const raw = localStorage.getItem(getLocalKey(docId));
        return raw ? JSON.parse(raw) : null;
    } catch(e) {
        return null;
    }
}

function clearLocalStorage(docId) {
    // Call this after a successful server save — cleanup old backup
    try {
        localStorage.removeItem(getLocalKey(docId));
    } catch(e) {}
}

// --- Auto-save interval ---

function startAutoSave() {
    // Clear any existing timers first (prevents duplicates)
    stopAutoSave();

    secondsUntilSave = 30;

    // Countdown: tick every second and update status display
    countdownTimer = setInterval(() => {
        secondsUntilSave--;

        // Only show countdown if there's unsaved content
        if (saveStatus.classList.contains('unsaved') && secondsUntilSave > 0) {
            saveStatus.textContent = `● Saving in ${secondsUntilSave}s`;
        }

        if (secondsUntilSave <= 0) {
            secondsUntilSave = 30; // Reset for next cycle
        }
    }, 1000);

    // Actual save: every 30 seconds
    autoSaveTimer = setInterval(async () => {
        if (currentDocId && saveStatus.classList.contains('unsaved')) {
            await saveDocument();           // Save to server
            clearLocalStorage(currentDocId); // Clean up localStorage after server save
        }
    }, 30000);
}

function stopAutoSave() {
    // Clean up all timers — called when closing a doc or switching docs
    if (autoSaveTimer)   { clearInterval(autoSaveTimer);   autoSaveTimer = null; }
    if (countdownTimer)  { clearInterval(countdownTimer);  countdownTimer = null; }
    secondsUntilSave = 30;
}

function resetCountdown() {
    // Reset the 30s countdown whenever the user types
    secondsUntilSave = 30;
}

// --- localStorage restore on doc open ---

function checkLocalStorageRestore(docId, serverContent) {
    const backup = loadFromLocalStorage(docId);
    if (!backup) return false; // No backup, nothing to do

    // Only offer restore if backup is NEWER than server content
    // (i.e. user had unsaved changes when app closed)
    const backupAge = Date.now() - backup.savedAt;
    const isRecent = backupAge < 24 * 60 * 60 * 1000; // Within last 24 hours

    if (!isRecent) {
        clearLocalStorage(docId); // Old backup, discard it
        return false;
    }

    // If backup content differs from server, ask user if they want to restore
    if (backup.content !== serverContent) {
        const timeAgo = formatTimeAgo(backup.savedAt);
        const restore = confirm(
            `📋 Unsaved changes found from ${timeAgo}.\n\nRestore them? (Cancel to keep the server version)`
        );

        if (restore) {
            quill.root.innerHTML = backup.content || '';
            docTitleInput.value  = backup.title || '';
            setSaveStatus('unsaved');
            return true;
        } else {
            clearLocalStorage(docId); // User declined, clean up
        }
    }

    return false;
}

function formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60)   return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    return `${Math.floor(diff / 3600)} hours ago`;
}
// =============================================
// AUTH — Check login state on page load
// =============================================
async function checkAuthState() {
    try {
        const data = await api('GET', '/auth/me');
        const loginBtn  = document.getElementById('loginBtn');
        const userInfo  = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName  = document.getElementById('userName');

        if (data.logged_in) {
            // Show user info, hide login button
            loginBtn.style.display  = 'none';
            userInfo.classList.remove('hidden');
            userAvatar.src = data.user.picture;
            userName.textContent = data.user.name.split(' ')[0]; // First name only
        } else {
            // Show login button, hide user info
            loginBtn.style.display  = 'flex';
            userInfo.classList.add('hidden');
        }
    } catch(e) {
        console.error('Auth check failed:', e);
    }
}
// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    initQuill();
    loadProjects();
    checkAuthState();
});
