// =============================================
// SCRIPVIA — Main Frontend Logic
// =============================================

// --- STATE ---
let currentProjectId  = null;
let currentDocId      = null;
let quill             = null;
let autoSaveTimer     = null;
let countdownTimer    = null;
let secondsUntilSave  = 30;
let pendingSync       = false;  // True when offline changes need syncing

// --- DOM REFS ---
const projectsList     = document.getElementById('projectsList');
const documentsList    = document.getElementById('documentsList');
const documentsNav     = document.getElementById('documentsNav');
const welcomeScreen    = document.getElementById('welcomeScreen');
const editorWrapper    = document.getElementById('editorWrapper');
const docTitleInput    = document.getElementById('docTitleInput');
const saveStatus       = document.getElementById('saveStatus');
const saveBtn          = document.getElementById('saveBtn');
const exportPdfBtn     = document.getElementById('exportPdfBtn');
const exportDocxBtn    = document.getElementById('exportDocxBtn');
const syncDriveBtn     = document.getElementById('syncDriveBtn');
const wordCountEl      = document.getElementById('wordCount');
const charCountEl      = document.getElementById('charCount');
const readTimeEl       = document.getElementById('readTime');
const lastSavedTimeEl  = document.getElementById('lastSavedTime');

const newProjectModal    = document.getElementById('newProjectModal');
const newDocModal        = document.getElementById('newDocModal');
const projectTitleInput  = document.getElementById('projectTitleInput');
const projectDescInput   = document.getElementById('projectDescInput');
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
        saveToLocalStorage();
        resetCountdown();
        updateStats();  // Update word/char count on every keystroke
    });
}

// =============================================
// STATS — Word count, char count, read time
// =============================================
function updateStats() {
    if (!quill) return;

    const text     = quill.getText().trim();
    const words    = text ? text.split(/\s+/).filter(w => w.length > 0) : [];
    const wordCount = words.length;
    const charCount = text.length;
    const readTime  = Math.max(1, Math.ceil(wordCount / 200)); // ~200 wpm average

    if (wordCountEl) wordCountEl.textContent = `${wordCount.toLocaleString()} word${wordCount !== 1 ? 's' : ''}`;
    if (charCountEl) charCountEl.textContent = `${charCount.toLocaleString()} character${charCount !== 1 ? 's' : ''}`;
    if (readTimeEl)  readTimeEl.textContent  = `~${readTime} min read`;
}

function updateLastSaved() {
    if (!lastSavedTimeEl) return;
    const now  = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastSavedTimeEl.textContent = `Saved at ${time}`;
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
        projectDescInput.value  = '';
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
            currentProjectId = null;
            currentDocId     = null;
            hideEditor();
            documentsNav.style.display = 'none';
        }
        await loadProjects();
    } catch(e) { console.error('deleteProject:', e); }
}

async function selectProject(id) {
    currentProjectId = id;
    currentDocId     = null;
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

        docTitleInput.value    = doc.title;
        docTitleInput.disabled = false;

        quill.root.innerHTML = doc.content || '';
        quill.history.clear();

        showEditor();
        enableHeaderBtns(true);

        const restored = checkLocalStorageRestore(id, doc.content || '');
        if (!restored) setSaveStatus('saved');

        updateStats();
        startAutoSave();

        await loadDocuments(currentProjectId);
    } catch(e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');
    try {
        await api('PUT', `/api/documents/${currentDocId}`, {
            title:   docTitleInput.value.trim() || 'Untitled',
            content: quill.root.innerHTML
        });

        clearLocalStorage(currentDocId);
        updateLastSaved();
        await loadDocuments(currentProjectId);

        // Sync to Drive if online
        if (navigator.onLine) {
            setSaveStatus('syncing');
            try {
                await api('POST', `/api/documents/${currentDocId}/sync`);
                setSaveStatus('synced');
                setTimeout(() => setSaveStatus('saved'), 2000);
            } catch(e) {
                setSaveStatus('saved');
                console.warn('Drive sync failed:', e);
            }
        } else {
            setSaveStatus('saved');
            pendingSync = true;
        }

    } catch(e) {
        setSaveStatus('error');
        console.error('saveDocument:', e);
    }
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
// AUTO-SAVE & LOCALSTORAGE
// =============================================
function getLocalKey(docId)         { return `scripvia_doc_${docId}`; }

function saveToLocalStorage() {
    if (!currentDocId || !quill) return;
    try {
        localStorage.setItem(getLocalKey(currentDocId), JSON.stringify({
            title:   docTitleInput.value,
            content: quill.root.innerHTML,
            savedAt: Date.now()
        }));
    } catch(e) { console.warn('localStorage backup failed:', e); }
}

function loadFromLocalStorage(docId) {
    try {
        const raw = localStorage.getItem(getLocalKey(docId));
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

function clearLocalStorage(docId) {
    try { localStorage.removeItem(getLocalKey(docId)); } catch(e) {}
}

function checkLocalStorageRestore(docId, serverContent) {
    const backup = loadFromLocalStorage(docId);
    if (!backup) return false;

    const isRecent = (Date.now() - backup.savedAt) < 24 * 60 * 60 * 1000;
    if (!isRecent) { clearLocalStorage(docId); return false; }

    if (backup.content !== serverContent) {
        const timeAgo = formatTimeAgo(backup.savedAt);
        const restore = confirm(`📋 Unsaved changes found from ${timeAgo}.\n\nRestore them?`);
        if (restore) {
            quill.root.innerHTML = backup.content || '';
            docTitleInput.value  = backup.title || '';
            setSaveStatus('unsaved');
            return true;
        } else {
            clearLocalStorage(docId);
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

function startAutoSave() {
    stopAutoSave();
    secondsUntilSave = 30;

    countdownTimer = setInterval(() => {
        secondsUntilSave--;
        if (saveStatus.classList.contains('unsaved') && secondsUntilSave > 0) {
            saveStatus.textContent = `● Saving in ${secondsUntilSave}s`;
        }
        if (secondsUntilSave <= 0) secondsUntilSave = 30;
    }, 1000);

    autoSaveTimer = setInterval(async () => {
        if (currentDocId && saveStatus.classList.contains('unsaved')) {
            await saveDocument();
            clearLocalStorage(currentDocId);
        }
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveTimer)  { clearInterval(autoSaveTimer);  autoSaveTimer  = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    secondsUntilSave = 30;
}

function resetCountdown() { secondsUntilSave = 30; }

// =============================================
// OFFLINE / ONLINE DETECTION
// =============================================
window.addEventListener('online', async () => {
    console.log('🟢 Back online');
    if (pendingSync && currentDocId) {
        setSaveStatus('syncing');
        try {
            await saveDocument();
            pendingSync = false;
        } catch(e) { console.error('Failed to sync on reconnect:', e); }
    }
});

window.addEventListener('offline', () => {
    console.log('🔴 Gone offline — will sync on reconnect');
});

// =============================================
// UI HELPERS
// =============================================
function showEditor() {
    welcomeScreen.classList.add('hidden');
    editorWrapper.classList.add('visible');
}

function hideEditor() {
    stopAutoSave();
    welcomeScreen.classList.remove('hidden');
    editorWrapper.classList.remove('visible');
    docTitleInput.value    = '';
    docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
    if (wordCountEl)     wordCountEl.textContent    = '0 words';
    if (charCountEl)     charCountEl.textContent    = '0 characters';
    if (readTimeEl)      readTimeEl.textContent     = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
}

function setSaveStatus(status) {
    const map = {
        saved:   '✓ Saved',
        saving:  'Saving...',
        syncing: '↑ Syncing...',
        synced:  '✓ Synced',
        unsaved: '● Unsaved',
        error:   '✗ Error',
        '':      ''
    };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className   = 'save-status ' + status;
}

function enableHeaderBtns(on) {
    saveBtn.disabled       = !on;
    exportPdfBtn.disabled  = !on;
    exportDocxBtn.disabled = !on;
    syncDriveBtn.disabled  = !on;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// =============================================
// MODALS
// =============================================
function openModal(modal)  { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeModal(o); });
});

// =============================================
// DARK MODE — persists across refreshes
// =============================================
let isDark = localStorage.getItem('scripvia_theme') !== 'light';

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('themeIcon').textContent  = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
    localStorage.setItem('scripvia_theme', isDark ? 'dark' : 'light');
}

document.getElementById('darkModeToggle').addEventListener('click', () => {
    isDark = !isDark;
    applyTheme();
});

// =============================================
// SIDEBAR COLLAPSE — persists too
// =============================================
const sidebar = document.getElementById('sidebar');
let sidebarCollapsed = localStorage.getItem('scripvia_sidebar') === 'collapsed';

function applySidebar() {
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    localStorage.setItem('scripvia_sidebar', sidebarCollapsed ? 'collapsed' : 'open');
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebar();
});

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S → Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // Stop browser's default save dialog
        if (currentDocId) saveDocument();
    }

    // Escape → Close any open modal
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
    }
});

// =============================================
// GOOGLE DRIVE SYNC BUTTON
// =============================================
async function syncToDrive() {
    if (!currentDocId) return;
    await saveDocument();
}

// =============================================
// EXPORT
// =============================================
exportPdfBtn.addEventListener('click', () => {
    if (!currentDocId) return;
    window.location.href = `/api/documents/${currentDocId}/export/pdf`;
});

exportDocxBtn.addEventListener('click', () => {
    if (!currentDocId) return;
    window.location.href = `/api/documents/${currentDocId}/export/docx`;
});

// =============================================
// AUTH
// =============================================
async function checkAuthState() {
    try {
        const data      = await api('GET', '/auth/me');
        const loginBtn  = document.getElementById('loginBtn');
        const userInfo  = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName  = document.getElementById('userName');

        if (data.logged_in) {
            loginBtn.style.display = 'none';
            userInfo.classList.remove('hidden');
            userAvatar.src       = data.user.picture;
            userName.textContent = data.user.name.split(' ')[0];
        } else {
            loginBtn.style.display = 'flex';
            userInfo.classList.add('hidden');
        }
    } catch(e) { console.error('Auth check failed:', e); }
}

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
syncDriveBtn.addEventListener('click', syncToDrive);

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();    // Apply saved theme before anything renders
    applySidebar();  // Apply saved sidebar state
    initQuill();
    loadProjects();
    checkAuthState();
});