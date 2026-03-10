// =============================================
// SCRIPVIA — Main Frontend Logic
// =============================================

let currentProjectId = null;
let currentDocId = null;
let quill = null;

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

    quill.on('text-change', () => setSaveStatus('unsaved'));
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
        quill.root.innerHTML = doc.content || '';
        quill.history.clear();
        showEditor();
        setSaveStatus('saved');
        enableHeaderBtns(true);
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
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    initQuill();
    loadProjects();
});