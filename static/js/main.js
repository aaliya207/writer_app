// =============================================
// LOREWRITER — Main Frontend Logic
// =============================================

// --- STATE ---
// These variables track what's currently open/selected
let currentProjectId = null;
let currentDocId = null;
let quill = null; // The rich text editor instance

// --- DOM ELEMENTS ---
// Grab all the HTML elements we'll interact with
const projectsList = document.getElementById('projectsList');
const documentsList = document.getElementById('documentsList');
const documentsNav = document.getElementById('documentsNav');
const welcomeScreen = document.getElementById('welcomeScreen');
const editorWrapper = document.querySelector('.editor-wrapper');
const docTitleInput = document.getElementById('docTitleInput');
const saveStatus = document.getElementById('saveStatus');
const saveBtn = document.getElementById('saveBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportDocxBtn = document.getElementById('exportDocxBtn');

// Modals
const newProjectModal = document.getElementById('newProjectModal');
const newDocModal = document.getElementById('newDocModal');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectDescInput = document.getElementById('projectDescInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

// =============================================
// QUILL EDITOR SETUP
// =============================================
function initQuill() {
    quill = new Quill('#quillEditor', {
        theme: 'snow',
        placeholder: 'Begin your legend here...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['blockquote', 'code-block'],
                [{ 'align': [] }],
                ['clean'] // Remove formatting button
            ]
        }
    });

    // Whenever user types, mark as "unsaved"
    quill.on('text-change', () => {
        setSaveStatus('unsaved');
    });
}

// =============================================
// API HELPERS
// These functions talk to our Flask backend
// =============================================

// Generic fetch wrapper — handles JSON + errors
async function api(method, url, body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// =============================================
// PROJECTS
// =============================================

async function loadProjects() {
    try {
        const projects = await api('GET', '/api/projects');
        renderProjects(projects);
    } catch (e) {
        console.error('Failed to load projects', e);
    }
}

function renderProjects(projects) {
    if (projects.length === 0) {
        projectsList.innerHTML = '<li class="empty-state">No projects yet.<br>Create one above.</li>';
        return;
    }

    projectsList.innerHTML = projects.map(p => `
        <li class="project-item ${p.id === currentProjectId ? 'active' : ''}" 
            data-id="${p.id}" 
            onclick="selectProject(${p.id})">
            <span class="item-name">${escapeHtml(p.title)}</span>
            <span class="item-meta">${p.document_count} ch.</span>
            <button class="item-delete" onclick="deleteProject(event, ${p.id})" title="Delete project">×</button>
        </li>
    `).join('');
}

async function createProject() {
    const title = projectTitleInput.value.trim();
    if (!title) return;

    try {
        const project = await api('POST', '/api/projects', {
            title,
            description: projectDescInput.value.trim()
        });

        closeModal(newProjectModal);
        projectTitleInput.value = '';
        projectDescInput.value = '';

        await loadProjects();
        selectProject(project.id);
    } catch (e) {
        console.error('Failed to create project', e);
    }
}

async function deleteProject(event, id) {
    event.stopPropagation(); // Don't trigger selectProject
    if (!confirm('Delete this project and all its chapters?')) return;

    try {
        await api('DELETE', `/api/projects/${id}`);
        if (currentProjectId === id) {
            currentProjectId = null;
            currentDocId = null;
            hideEditor();
            documentsNav.style.display = 'none';
        }
        await loadProjects();
    } catch (e) {
        console.error('Failed to delete project', e);
    }
}

async function selectProject(id) {
    currentProjectId = id;
    currentDocId = null;
    await loadProjects(); // Re-render to show active state
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
    } catch (e) {
        console.error('Failed to load documents', e);
    }
}

function renderDocuments(docs) {
    if (docs.length === 0) {
        documentsList.innerHTML = '<li class="empty-state">No chapters yet.</li>';
        return;
    }

    documentsList.innerHTML = docs.map(d => `
        <li class="doc-item ${d.id === currentDocId ? 'active' : ''}" 
            data-id="${d.id}"
            onclick="openDocument(${d.id})">
            <span class="item-name">${escapeHtml(d.title)}</span>
            <button class="item-delete" onclick="deleteDocument(event, ${d.id})" title="Delete chapter">×</button>
        </li>
    `).join('');
}

async function createDocument() {
    const title = docTitleModalInput.value.trim();
    if (!title || !currentProjectId) return;

    try {
        const doc = await api('POST', `/api/projects/${currentProjectId}/documents`, { title });
        closeModal(newDocModal);
        docTitleModalInput.value = '';
        await loadDocuments(currentProjectId);
        openDocument(doc.id);
    } catch (e) {
        console.error('Failed to create document', e);
    }
}

async function openDocument(id) {
    try {
        const doc = await api('GET', `/api/documents/${id}`);
        currentDocId = id;

        // Populate the editor
        docTitleInput.value = doc.title;
        docTitleInput.disabled = false;

        // Set Quill content (it stores HTML)
        quill.root.innerHTML = doc.content || '';
        quill.history.clear(); // Clear undo history for fresh start

        showEditor();
        setSaveStatus('saved');
        enableHeaderBtns(true);

        // Re-render doc list to show active state
        await loadDocuments(currentProjectId);
    } catch (e) {
        console.error('Failed to open document', e);
    }
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
        await loadDocuments(currentProjectId); // Refresh list
    } catch (e) {
        setSaveStatus('error');
        console.error('Failed to save', e);
    }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this chapter?')) return;

    try {
        await api('DELETE', `/api/documents/${id}`);
        if (currentDocId === id) {
            currentDocId = null;
            hideEditor();
            enableHeaderBtns(false);
        }
        await loadDocuments(currentProjectId);
    } catch (e) {
        console.error('Failed to delete document', e);
    }
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
    setSaveStatus('—');
}

function setSaveStatus(status) {
    const messages = {
        saved: '✓ Saved',
        saving: 'Saving...',
        unsaved: '● Unsaved',
        error: '✗ Error',
        '—': '—'
    };
    saveStatus.textContent = messages[status] || status;
    saveStatus.className = 'save-status ' + (status !== '—' ? status : '');
}

function enableHeaderBtns(enabled) {
    saveBtn.disabled = !enabled;
    exportPdfBtn.disabled = !enabled;
    exportDocxBtn.disabled = !enabled;
}

function escapeHtml(str) {
    // Prevent XSS — escape special characters in user content
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =============================================
// MODALS
// =============================================

function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

// Close modal when clicking overlay background
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay);
    });
});

// =============================================
// DARK MODE TOGGLE
// =============================================

const darkModeToggle = document.getElementById('darkModeToggle');
let isDark = true;

darkModeToggle.addEventListener('click', () => {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    darkModeToggle.textContent = isDark ? '🌙 Dark Mode' : '☀️ Light Mode';
});

// =============================================
// SIDEBAR COLLAPSE
// =============================================

const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

// =============================================
// EVENT LISTENERS — Wire up all the buttons
// =============================================

// New Project
document.getElementById('newProjectBtn').addEventListener('click', () => openModal(newProjectModal));
document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal(newProjectModal));
document.getElementById('confirmProjectBtn').addEventListener('click', createProject);
projectTitleInput.addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });

// New Document
document.getElementById('newDocBtn').addEventListener('click', () => openModal(newDocModal));
document.getElementById('cancelDocBtn').addEventListener('click', () => closeModal(newDocModal));
document.getElementById('confirmDocBtn').addEventListener('click', createDocument);
docTitleModalInput.addEventListener('keydown', e => { if (e.key === 'Enter') createDocument(); });

// Save button
saveBtn.addEventListener('click', saveDocument);

// Export buttons (placeholder for now — Step 7)
exportPdfBtn.addEventListener('click', () => alert('PDF export coming in Step 7!'));
exportDocxBtn.addEventListener('click', () => alert('DOCX export coming in Step 7!'));

// =============================================
// INIT — Run when page loads
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    initQuill();
    loadProjects();
});