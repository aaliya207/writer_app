// =============================================
// SCRIPVIA — Main Frontend Logic v0.2
// =============================================

// --- STATE ---
let currentProjectId = null;
let currentProjectData = null;  // Full project object including genre
let currentDocId = null;
let currentDocType = 'chapter'; // 'chapter' | 'scene'
let quill = null;
let autoSaveTimer = null;
let countdownTimer = null;
let secondsUntilSave = 30;
let pendingSync = false;
let openTabs = [];    // [{id, title, type}] — VS Code style tabs
let wikiData = {};    // {name: {type, summary, image_url...}}

// --- DOM REFS ---
const projectsList = document.getElementById('projectsList');
const documentsList = document.getElementById('documentsList');
const charactersList = document.getElementById('charactersList');
const scenesList = document.getElementById('scenesList');
const loreList = document.getElementById('loreList');
const projectDetail = document.getElementById('projectDetail');
const projectsSection = document.getElementById('projectsSection');
const currentProjectName = document.getElementById('currentProjectName');
const welcomeScreen = document.getElementById('welcomeScreen');
const editorWrapper = document.getElementById('editorWrapper');
const docTitleInput = document.getElementById('docTitleInput');
const saveStatus = document.getElementById('saveStatus');
const saveBtn = document.getElementById('saveBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportDocxBtn = document.getElementById('exportDocxBtn');
const wordCountEl = document.getElementById('wordCount');
const charCountEl = document.getElementById('charCount');
const readTimeEl = document.getElementById('readTime');
const lastSavedTimeEl = document.getElementById('lastSavedTime');
const tabsBar = document.getElementById('tabsBar');
const openTabsEl = document.getElementById('openTabs');
const wikiTooltip = document.getElementById('wikiTooltip');

const newProjectModal = document.getElementById('newProjectModal');
const newDocModal = document.getElementById('newDocModal');
const newCharModal = document.getElementById('newCharModal');
const newSceneModal = document.getElementById('newSceneModal');
const newLoreModal = document.getElementById('newLoreModal');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectDescInput = document.getElementById('projectDescInput');
const projectGenreInput = document.getElementById('projectGenreInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

const CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical'];

// =============================================
// LOCAL IMAGE UPLOAD HELPERS
// =============================================
function setupImageUpload(fileInputId, urlInputId, previewWrapId, previewImgId, clearBtnId) {
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    const previewWrap = document.getElementById(previewWrapId);
    const previewImg = document.getElementById(previewImgId);
    const clearBtn = document.getElementById(clearBtnId);

    // File selected → convert to base64
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            urlInput.value = base64;
            previewImg.src = base64;
            previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

    // URL typed → show preview
    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (val && (val.startsWith('http') || val.startsWith('data:'))) {
            previewImg.src = val;
            previewWrap.style.display = 'block';
            previewImg.onerror = () => { previewWrap.style.display = 'none'; };
        } else {
            previewWrap.style.display = 'none';
        }
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        fileInput.value = '';
        previewImg.src = '';
        previewWrap.style.display = 'none';
    });
}

// =============================================
// CUSTOM CONFIRM DIALOG
// =============================================
function showConfirm(message, onConfirm, title = 'Are you sure?') {
    // Remove any existing confirm dialog
    const existing = document.getElementById('customConfirm');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'customConfirm';
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-title">${title}</div>
            <div class="confirm-msg">${message}</div>
            <div class="confirm-actions">
                <button class="btn-confirm-cancel" id="confirmCancelBtn">Cancel</button>
                <button class="btn-confirm-delete" id="confirmOkBtn">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('confirmOkBtn').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });

    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
        overlay.remove();
    });

    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });
}
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
                [{ color: [] }, { background: [] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                [{ align: [] }],
                [{ indent: '-1' }, { indent: '+1' }],
                ['link'],
                ['clean']
            ]
        }
    });

    quill.on('text-change', () => {
        setSaveStatus('unsaved');
        saveToLocalStorage();
        resetCountdown();
        updateStats();
    });

    // Wiki tooltip on hover over editor text
    let wikiHoverTimer = null;

    quill.root.addEventListener('mousemove', (e) => {
        clearTimeout(wikiHoverTimer);
        wikiHoverTimer = setTimeout(() => handleWikiHover(e), 400);
    });

    quill.root.addEventListener('mouseleave', () => {
        clearTimeout(wikiHoverTimer);
        // Delay hide so user can move mouse onto the card itself
        setTimeout(() => {
            if (!wikiTooltip.matches(':hover')) hideWikiTooltip();
        }, 200);
    });

    wikiTooltip.addEventListener('mouseleave', () => {
        hideWikiTooltip();
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
    } catch (e) { console.error('loadProjects:', e); }
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
            <span class="item-meta">${genreEmoji(p.genre)}</span>
            <button class="item-delete" onclick="deleteProject(event,${p.id})">×</button>
        </li>
    `).join('');
}

function genreEmoji(genre) {
    const map = { fantasy: '⚔️', 'sci-fi': '🚀', fiction: '📖', romance: '💕', mystery: '🔍', thriller: '⚡', horror: '🕯️', historical: '🏛️', journal: '📓', screenplay: '🎬', poetry: '✨', general: '📝', other: '📌' };
    return map[genre] || '📝';
}

async function createProject() {
    const title = projectTitleInput.value.trim();
    const genre = projectGenreInput.value;
    if (!title) { projectTitleInput.focus(); return; }
    const confirmBtn = document.getElementById('confirmProjectBtn');
    confirmBtn.textContent = 'Creating...';
    confirmBtn.disabled = true;
    try {
        const p = await api('POST', '/api/projects', {
            title, genre, description: projectDescInput.value.trim()
        });
        closeModal(newProjectModal);
        projectTitleInput.value = '';
        projectDescInput.value = '';
        projectGenreInput.value = 'general';
        await loadProjects();
        selectProject(p.id);
    } catch (e) {
        console.error('createProject:', e);
    } finally {
        confirmBtn.textContent = 'Create Project';
        confirmBtn.disabled = false;
    }
}

async function deleteProject(event, id) {
    event.stopPropagation();
    showConfirm(
        'This will permanently delete the project and all its chapters, characters, scenes and lore.',
        async () => {
            try {
                await api('DELETE', `/api/projects/${id}`);
                if (currentProjectId === id) {
                    currentProjectId = null;
                    currentProjectData = null;
                    showProjectList();
                    hideEditor();
                }
                await loadProjects();
            } catch (e) { console.error('deleteProject:', e); }
        },
        'Delete Project?'
    );
}

async function selectProject(id) {
    try {
        currentProjectId = id;  // Set this FIRST before any async calls
        const projects = await api('GET', '/api/projects');
        currentProjectData = projects.find(p => p.id === id);

        // Show project detail view
        showProjectDetail();
        currentProjectName.textContent = currentProjectData.title;

        // Show overview page
        await showProjectOverview(id);

        // Show/hide creative tabs based on genre
        const isCreative = CREATIVE_GENRES.includes(currentProjectData.genre);
        document.getElementById('tabCharacters').classList.toggle('hidden', !isCreative);
        document.getElementById('tabScenes').classList.toggle('hidden', !isCreative);
        document.getElementById('tabLore').classList.toggle('hidden', !isCreative);
        document.getElementById('tabRelationships').classList.toggle('hidden', !isCreative);

        // Load all data
        switchTab('chapters');
        await loadDocuments(id);
        if (isCreative) {
            await loadWikiData(id);
        }
        closeNotesPanel();
    } catch (e) { console.error('selectProject:', e); }
}

function showProjectList() {
    projectsSection.style.display = 'block';
    projectDetail.style.display = 'none';
}

function showProjectDetail() {
    projectsSection.style.display = 'none';
    projectDetail.style.display = 'flex';
}

// =============================================
// PROJECT OVERVIEW
// =============================================
async function showProjectOverview(projectId) {
    try {
        const stats = await api('GET', `/api/projects/${projectId}/stats`);
        console.log('last_edited raw:', stats.last_edited);
        console.log('created_at raw:', stats.created_at);
        console.log('parsed as UTC:', new Date(stats.last_edited + 'Z'));
        console.log('parsed without Z:', new Date(stats.last_edited));
        console.log('local now:', new Date());
        // Populate
        const genreEmojis = { fantasy: '⚔️ Fantasy', 'sci-fi': '🚀 Sci-Fi', fiction: '📖 Fiction', romance: '💕 Romance', mystery: '🔍 Mystery', thriller: '⚡ Thriller', horror: '🕯️ Horror', historical: '🏛️ Historical', journal: '📓 Journal', screenplay: '🎬 Screenplay', poetry: '✨ Poetry', general: '📝 General', other: '📌 Other' };

        document.getElementById('overviewGenre').textContent = genreEmojis[stats.genre] || '📝 General';
        document.getElementById('overviewTitle').textContent = stats.title;
        document.getElementById('overviewDesc').textContent = stats.description || 'No description yet.';
        document.getElementById('ovWords').textContent = stats.total_words.toLocaleString();
        document.getElementById('ovChapters').textContent = stats.chapter_count;
        document.getElementById('ovCharacters').textContent = stats.character_count;
        document.getElementById('ovScenes').textContent = stats.scene_count;
        document.getElementById('ovLore').textContent = stats.lore_count;

        // Format dates
        document.getElementById('ovLastEdited').textContent = stats.last_edited ? `✎ Last edited ${formatDateNice(stats.last_edited)}` : '';
document.getElementById('ovCreated').textContent    = stats.created_at  ? `✦ Created ${formatDateNice(stats.created_at)}` : '';

        // Hide creative-only buttons if not creative genre
        const isCreative = stats.is_creative;
        document.getElementById('ovCharBtn').style.display = isCreative ? 'block' : 'none';
        document.getElementById('ovSceneBtn').style.display = isCreative ? 'block' : 'none';
        document.getElementById('ovLoreBtn').style.display = isCreative ? 'block' : 'none';
        document.getElementById('ovRelBtn').style.display   = isCreative ? 'block' : 'none';

        // Hide creative stats if not creative
        document.getElementById('ovCharStat').style.display = isCreative ? 'flex' : 'none';
        document.getElementById('ovSceneStat').style.display = isCreative ? 'flex' : 'none';
        document.getElementById('ovLoreStat').style.display = isCreative ? 'flex' : 'none';

        document.getElementById('projectOverview').style.display = 'flex';
        welcomeScreen.classList.add('hidden');
        document.getElementById('editorHeader').style.display = 'none';

    } catch (e) { console.error('showProjectOverview:', e); }
    document.getElementById('backToOverview').style.display = 'block';
}

function hideOverview() {
    document.getElementById('projectOverview').style.display = 'none';
}

function exportProject(format) {
    if (!currentProjectId) return;
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Preparing...';
    btn.disabled    = true;

    // Use a temporary link to trigger download
    const a    = document.createElement('a');
    a.href     = `/api/projects/${currentProjectId}/export/${format}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
        btn.textContent = orig;
        btn.disabled    = false;
    }, 2000);
}

function overviewGoTo(tab) {
    if (tab === 'chapters') {
        // Start writing = hide overview, open first chapter or show chapters tab
        hideOverview();
        switchTab('chapters');
        const firstDoc = document.querySelector('#documentsList .item-list-entry');
        if (firstDoc) firstDoc.click();
    } else {
        // For characters/scenes/lore — switch sidebar tab but keep overview visible
        // so the user sees both the overview AND the sidebar list
        switchTab(tab);
        // Scroll sidebar into view
        document.getElementById(`tab-${tab}`).scrollIntoView({ behavior: 'smooth' });
    }
}
function formatDateNice(dateInput) {
    // Parse as UTC if string (backend sends UTC without Z suffix)
    let date;
    if (typeof dateInput === 'string') {
        // Add Z to tell JS it's UTC, then JS converts to local time automatically
        date = new Date(dateInput.endsWith('Z') ? dateInput : dateInput + 'Z');
    } else {
        date = dateInput;
    }

    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}


// =============================================
// TABS
// =============================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));

    // Load data for tab
    if (tabName === 'chapters') loadDocuments(currentProjectId);
    if (tabName === 'characters') loadCharacters(currentProjectId);
    if (tabName === 'scenes') loadScenes(currentProjectId);
    if (tabName === 'lore') loadLore(currentProjectId);
    if (tabName === 'relationships') loadRelationships(currentProjectId);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('backToProjects').addEventListener('click', () => {
    currentProjectId = null;
    currentProjectData = null;
    hideOverview();
    hideEditor();
    showProjectList();
    loadProjects();
    document.getElementById('backToOverview').style.display = 'block';
});

// =============================================
// DOCUMENTS (CHAPTERS)
// =============================================
async function loadDocuments(projectId) {
    try {
        const docs = await api('GET', `/api/projects/${projectId}/documents`);
        renderDocuments(docs);
    } catch (e) { console.error('loadDocuments:', e); }
}

function renderDocuments(docs) {
    if (!docs.length) {
        documentsList.innerHTML = '<li class="empty-state">No chapters yet.</li>';
        return;
    }
    documentsList.innerHTML = docs.map((d, i) => `
        <li class="item-list-entry ${d.id === currentDocId ? 'active' : ''}"
            draggable="true"
            data-id="${d.id}"
            data-index="${i}"
            onclick="openDocument(${d.id})"
            ondragstart="onDragStart(event)"
            ondragover="onDragOver(event)"
            ondragend="onDragEnd(event)"
            ondrop="onDrop(event)">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <span class="item-name">${escapeHtml(d.title)}</span>
            <button class="item-delete" onclick="deleteDocument(event,${d.id})">×</button>
        </li>
    `).join('');
}

// =============================================
// DRAG AND DROP — CHAPTER REORDERING
// =============================================
let dragSrcIndex = null;
let dragSrcEl = null;

function onDragStart(e) {
    dragSrcEl = e.currentTarget;
    dragSrcIndex = parseInt(dragSrcEl.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcEl.dataset.id);
    setTimeout(() => dragSrcEl.classList.add('dragging'), 0);
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.currentTarget;
    if (target === dragSrcEl) return;

    // Visual indicator
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isAbove = e.clientY < midY;
    target.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
}

function onDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target === dragSrcEl) return;

    // Build new order
    const items = [...document.querySelectorAll('#documentsList .item-list-entry')];
    const srcIdx = items.indexOf(dragSrcEl);
    const tgtIdx = items.indexOf(target);

    // Reorder array
    const reordered = [...items];
    reordered.splice(srcIdx, 1);

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midY;
    const insertAt = insertBefore ? tgtIdx : tgtIdx + 1;
    reordered.splice(insertAt > srcIdx ? insertAt - 1 : insertAt, 0, dragSrcEl);

    // Get new ID order
    const newOrder = reordered.map(el => parseInt(el.dataset.id));

    // Save to backend
    saveChapterOrder(newOrder);

    // Clean up
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
}

function onDragEnd(e) {
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
}

async function saveChapterOrder(newOrder) {
    try {
        await api('POST', `/api/projects/${currentProjectId}/documents/reorder`, {
            order: newOrder
        });
        await loadDocuments(currentProjectId);
    } catch (e) { console.error('saveChapterOrder:', e); }
}

async function createDocument() {
    const title = docTitleModalInput.value.trim();
    if (!title || !currentProjectId) { docTitleModalInput.focus(); return; }
    const confirmBtn = document.getElementById('confirmDocBtn');
    confirmBtn.textContent = 'Creating...';
    confirmBtn.disabled = true;
    try {
        const doc = await api('POST', `/api/projects/${currentProjectId}/documents`, { title });
        closeModal(newDocModal);
        docTitleModalInput.value = '';
        if (currentProjectId) await loadDocuments(currentProjectId);
        openDocument(doc.id);
    } catch (e) {
        console.error('createDocument:', e);
    } finally {
        confirmBtn.textContent = 'Create';
        confirmBtn.disabled = false;
    }
}

async function openDocument(id, type = 'chapter') {
    try {
        const endpoint = type === 'scene' ? `/api/scenes/${id}` : `/api/documents/${id}`;
        const doc = await api('GET', endpoint);
        currentDocId = id;
        currentDocType = type;

        docTitleInput.value = doc.title;
        docTitleInput.disabled = false;
        quill.root.innerHTML = doc.content || '';
        quill.history.clear();

        showEditor();
        enableHeaderBtns(true);

        const restored = checkLocalStorageRestore(`${type}_${id}`, doc.content || '');
        if (!restored) setSaveStatus('saved');

        updateStats();
        startAutoSave();
        addOpenTab(id, doc.title, type);

        if (type === 'chapter' && currentProjectId) await loadDocuments(currentProjectId);
        if (type === 'scene' && currentProjectId) await loadScenes(currentProjectId);
    } catch (e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');

    try {
        const endpoint = currentDocType === 'scene'
            ? `/api/scenes/${currentDocId}`
            : `/api/documents/${currentDocId}`;

        await api('PUT', endpoint, {
            title: docTitleInput.value.trim() || 'Untitled',
            content: quill.root.innerHTML
        });

        // Update tab title
        updateTabTitle(currentDocId, docTitleInput.value.trim());

        clearLocalStorage(`${currentDocType}_${currentDocId}`);
        updateLastSaved();

        if (currentDocType === 'chapter') await loadDocuments(currentProjectId);
        if (currentDocType === 'scene') await loadScenes(currentProjectId);

        // Sync to Drive if online and it's a chapter
        if (navigator.onLine && currentDocType === 'chapter') {
            setSaveStatus('syncing');
            try {
                await api('POST', `/api/documents/${currentDocId}/sync`);
                setSaveStatus('synced');
                setTimeout(() => setSaveStatus('saved'), 2000);
            } catch (e) {
                setSaveStatus('saved');
            }
        } else {
            setSaveStatus('saved');
            if (!navigator.onLine) pendingSync = true;
        }

    } catch (e) {
        setSaveStatus('error');
        console.error('saveDocument:', e);
    }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    showConfirm(
        'This chapter will be permanently deleted.',
        async () => {
            try {
                await api('DELETE', `/api/documents/${id}`);
                if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
                removeOpenTab(id);
                await loadDocuments(currentProjectId);
            } catch (e) { console.error('deleteDocument:', e); }
        },
        'Delete Chapter?'
    );
}

// =============================================
// CHARACTERS
// =============================================
async function loadCharacters(projectId) {
    try {
        const chars = await api('GET', `/api/projects/${projectId}/characters`);
        renderCharacters(chars);
    } catch (e) { console.error('loadCharacters:', e); }
}

function renderCharacters(chars) {
    if (!chars.length) {
        charactersList.innerHTML = '<li class="empty-state">No characters yet.</li>';
        return;
    }
    charactersList.innerHTML = chars.map(c => `
        <li class="item-list-entry char-preview" onclick="openEditCharModal(${c.id})">
            <span class="item-name">${escapeHtml(c.name)}</span>
            ${c.role ? `<span class="item-badge">${escapeHtml(c.role)}</span>` : ''}
            <button class="item-delete" onclick="deleteCharacter(event,${c.id})">×</button>

            
        </li>
    `).join('');
}

async function createCharacter() {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('charNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/characters`, {
            name,
            role: document.getElementById('charRoleInput').value,
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim()
        });
        closeModal(newCharModal);
        // Clear fields
        ['charNameInput', 'charAgeInput', 'charAppearanceInput', 'charPersonalityInput', 'charBackstoryInput', 'charImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('charRoleInput').value = '';
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch (e) { console.error('createCharacter:', e); }
}

async function deleteCharacter(event, id) {
    event.stopPropagation();
    showConfirm(
        'This character and all their info will be permanently deleted.',
        async () => {
            try {
                await api('DELETE', `/api/characters/${id}`);
                await loadCharacters(currentProjectId);
                await loadWikiData(currentProjectId);
            } catch (e) { console.error('deleteCharacter:', e); }
        },
        'Delete Character?'
    );
}
async function openEditCharModal(id) {
    try {
        const c = await api('GET', `/api/characters/${id}`);

        document.getElementById('charNameInput').value = c.name || '';
        document.getElementById('charRoleInput').value = c.role || '';
        document.getElementById('charAgeInput').value = c.age || '';
        document.getElementById('charAppearanceInput').value = c.appearance || '';
        document.getElementById('charPersonalityInput').value = c.personality || '';
        document.getElementById('charBackstoryInput').value = c.backstory || '';
        document.getElementById('charImageInput').value = c.image_url || '';
        // Show image preview if exists
        if (c.image_url) {
            document.getElementById('charImgPreviewEl').src = c.image_url;
            document.getElementById('charImgPreview').style.display = 'block';
        } else {
            document.getElementById('charImgPreview').style.display = 'none';
        }
        document.querySelector('#newCharModal .modal-title').textContent = 'Edit Character';
        document.getElementById('confirmCharBtn').textContent = 'Save Changes';

        // Store id on button as data attribute instead of reassigning onclick
        document.getElementById('confirmCharBtn').dataset.editId = id;
        document.getElementById('confirmCharBtn').dataset.mode = 'edit';

        openModal(newCharModal);
    } catch (e) { console.error('openEditCharModal:', e); }
}

async function saveEditChar(id) {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name) { document.getElementById('charNameInput').focus(); return; }
    const confirmBtn = document.getElementById('confirmCharBtn');
    confirmBtn.textContent = 'Saving...';
    confirmBtn.disabled = true;
    try {
        await api('PUT', `/api/characters/${id}`, {
            name,
            role: document.getElementById('charRoleInput').value,
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim()
        });
        closeModal(newCharModal);
        resetCharModal();
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch (e) {
        console.error('saveEditChar:', e);
    } finally {
        confirmBtn.textContent = 'Save Changes';
        confirmBtn.disabled = false;
    }
}

function resetCharModal() {
    document.querySelector('#newCharModal .modal-title').textContent = 'New Character';
    document.getElementById('confirmCharBtn').textContent = 'Create Character';
    delete document.getElementById('confirmCharBtn').dataset.editId;
    delete document.getElementById('confirmCharBtn').dataset.mode;
    ['charNameInput', 'charAgeInput', 'charAppearanceInput', 'charPersonalityInput', 'charBackstoryInput', 'charImageInput']
        .forEach(id => document.getElementById(id).value = '');
    document.getElementById('charRoleInput').value = '';
    document.getElementById('charImgPreview').style.display = 'none';
    document.getElementById('charImgPreviewEl').src = '';
    document.getElementById('charImageFile').value = '';
}
// =============================================
// SCENES
// =============================================
async function loadScenes(projectId) {
    try {
        const scenes = await api('GET', `/api/projects/${projectId}/scenes`);
        renderScenes(scenes);
    } catch (e) { console.error('loadScenes:', e); }
}

function renderScenes(scenes) {
    const moodEmoji = { tense: '⚡', romantic: '💕', mysterious: '🌫️', action: '🔥', sad: '💧', hopeful: '🌅', dark: '🌑', comedic: '😄' };
    if (!scenes.length) {
        scenesList.innerHTML = '<li class="empty-state">No scenes yet.<br>Capture a scene idea!</li>';
        return;
    }
    scenesList.innerHTML = scenes.map(s => `
        <li class="item-list-entry ${s.id === currentDocId && currentDocType === 'scene' ? 'active' : ''}"
            onclick="openDocument(${s.id}, 'scene')">
            <span class="item-name">${escapeHtml(s.title)}</span>
            ${s.mood ? `<span class="item-badge">${moodEmoji[s.mood] || ''} ${s.mood}</span>` : ''}
            <button class="item-delete" onclick="deleteScene(event,${s.id})">×</button>
        </li>
    `).join('');
}

async function createScene() {
    const title = document.getElementById('sceneTitleInput').value.trim();
    if (!title || !currentProjectId) { document.getElementById('sceneTitleInput').focus(); return; }
    try {
        const scene = await api('POST', `/api/projects/${currentProjectId}/scenes`, {
            title,
            mood: document.getElementById('sceneMoodInput').value
        });
        closeModal(newSceneModal);
        document.getElementById('sceneTitleInput').value = '';
        document.getElementById('sceneMoodInput').value = '';
        await loadScenes(currentProjectId);
        openDocument(scene.id, 'scene');
    } catch (e) { console.error('createScene:', e); }
}

async function deleteScene(event, id) {
    event.stopPropagation();
    showConfirm(
        'This scene will be permanently deleted.',
        async () => {
            try {
                await api('DELETE', `/api/scenes/${id}`);
                if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
                removeOpenTab(id);
                await loadScenes(currentProjectId);
            } catch (e) { console.error('deleteScene:', e); }
        },
        'Delete Scene?'
    );
}

// =============================================
// LORE
// =============================================
async function loadLore(projectId) {
    try {
        const items = await api('GET', `/api/projects/${projectId}/lore`);
        renderLore(items);
    } catch (e) { console.error('loadLore:', e); }
}

function renderLore(items) {
    const catEmoji = { item: '⚔️', place: '🗺️', organization: '🏛️', concept: '✨', creature: '🐉', event: '📅', other: '📌' };
    if (!items.length) {
        loreList.innerHTML = '<li class="empty-state">No lore entries yet.</li>';
        return;
    }
    loreList.innerHTML = items.map(i => `
        <li class="item-list-entry" onclick="openEditLoreModal(${i.id})">
            <span class="item-name">${escapeHtml(i.name)}</span>
            <span class="item-badge">${catEmoji[i.category] || '📌'}</span>
            <button class="item-delete" onclick="deleteLore(event,${i.id})">×</button>
        </li>
    `).join('');
}

async function createLore() {
    const name = document.getElementById('loreNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('loreNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/lore`, {
            name,
            category: document.getElementById('loreCategoryInput').value,
            description: document.getElementById('loreDescInput').value.trim(),
            image_url: document.getElementById('loreImageInput').value.trim()
        });
        closeModal(newLoreModal);
        ['loreNameInput', 'loreDescInput', 'loreImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('loreCategoryInput').value = 'item';
        await loadLore(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch (e) { console.error('createLore:', e); }
}

async function deleteLore(event, id) {
    event.stopPropagation();
    showConfirm(
        'This lore entry will be permanently deleted.',
        async () => {
            try {
                await api('DELETE', `/api/lore/${id}`);
                await loadLore(currentProjectId);
                await loadWikiData(currentProjectId);
            } catch (e) { console.error('deleteLore:', e); }
        },
        'Delete Lore Entry?'
    );
}
async function openEditLoreModal(id) {
    try {
        const item = await api('GET', `/api/lore/${id}`);

        document.getElementById('loreNameInput').value = item.name || '';
        document.getElementById('loreCategoryInput').value = item.category || 'item';
        document.getElementById('loreDescInput').value = item.description || '';
        document.getElementById('loreImageInput').value = item.image_url || '';
        if (item.image_url) {
            document.getElementById('loreImgPreviewEl').src = item.image_url;
            document.getElementById('loreImgPreview').style.display = 'block';
        } else {
            document.getElementById('loreImgPreview').style.display = 'none';
        }
        document.querySelector('#newLoreModal .modal-title').textContent = 'Edit Lore Entry';
        document.getElementById('confirmLoreBtn').textContent = 'Save Changes';
        document.getElementById('confirmLoreBtn').dataset.editId = id;
        document.getElementById('confirmLoreBtn').dataset.mode = 'edit';

        openModal(newLoreModal);
    } catch (e) { console.error('openEditLoreModal:', e); }
}

async function saveEditLore(id) {
    const name = document.getElementById('loreNameInput').value.trim();
    if (!name) { document.getElementById('loreNameInput').focus(); return; }
    const confirmBtn = document.getElementById('confirmLoreBtn');
    confirmBtn.textContent = 'Saving...';
    confirmBtn.disabled = true;
    try {
        await api('PUT', `/api/lore/${id}`, {
            name,
            category: document.getElementById('loreCategoryInput').value,
            description: document.getElementById('loreDescInput').value.trim(),
            image_url: document.getElementById('loreImageInput').value.trim()
        });
        closeModal(newLoreModal);
        await loadLore(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch (e) {
        console.error('saveEditLore:', e);
    } finally {
        confirmBtn.textContent = 'Save Changes';
        confirmBtn.disabled = false;
        resetLoreModal();
    }
}

function resetLoreModal() {
    document.querySelector('#newLoreModal .modal-title').textContent = 'New Lore Entry';
    document.getElementById('confirmLoreBtn').textContent = 'Create Entry';
    delete document.getElementById('confirmLoreBtn').dataset.editId;
    delete document.getElementById('confirmLoreBtn').dataset.mode;
    ['loreNameInput', 'loreDescInput', 'loreImageInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('loreCategoryInput').value = 'item';
    document.getElementById('loreImgPreview').style.display = 'none';
    document.getElementById('loreImgPreviewEl').src = '';
    document.getElementById('loreImageFile').value = '';
}
// =============================================
// WIKI DATA + HOVER TOOLTIPS
// =============================================
async function loadWikiData(projectId) {
    try {
        wikiData = await api('GET', `/api/projects/${projectId}/wiki`);
    } catch (e) { console.error('loadWikiData:', e); }
}

function handleWikiHover(e) {
    if (!wikiData || Object.keys(wikiData).length === 0) return;

    // Get word at cursor position
    let range;
    try {
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (!pos) return;
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
        }
        if (!range) return;
        range.expand('word');
    } catch (e) { return; }

    const hoveredWord = range.toString().trim().toLowerCase();
    if (!hoveredWord || hoveredWord.length < 2) {
        hideWikiTooltip();
        return;
    }

    // Get full paragraph text to check multi-word names
    const node = range.startContainer;
    const paraText = node.textContent || '';

    // Sort keys longest first so "Suyeon Park" matches before "Suyeon"
    const sortedKeys = Object.keys(wikiData).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
        const keyWords = key.split(' ');
        const firstWord = keyWords[0].toLowerCase();

        // Match if hovered word is any word within the key name
        const keyWordList = keyWords.map(w => w.toLowerCase());
        const wordMatches = keyWordList.includes(hoveredWord);

        if (wordMatches || hoveredWord === key) {
            // Verify full name exists in paragraph with word boundaries
            const regex = new RegExp(`\\b${escapeRegex(key)}\\b`, 'i');
            if (regex.test(paraText)) {
                showWikiTooltip(wikiData[key], e.clientX, e.clientY);
                return;
            }
        }
    }

    hideWikiTooltip();
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showWikiTooltip(entry, x, y) {
    const tooltip = wikiTooltip;
    const imgEl = document.getElementById('wikiTooltipImgEl');
    const placeholder = document.getElementById('wikiCardPlaceholder');
    const nameEl = document.getElementById('wikiTooltipName');
    const typeEl = document.getElementById('wikiTooltipType');
    const bodyEl = document.getElementById('wikiCardBody');

    nameEl.textContent = entry.name;

    // Type label
    if (entry.type === 'character') {
        const parts = [];
        if (entry.role) parts.push(entry.role);
        if (entry.age) parts.push(`Age ${entry.age}`);
        typeEl.textContent = parts.length ? parts.join(' · ') : 'Character';
    } else {
        typeEl.textContent = entry.category ? `${entry.category}` : 'Lore';
    }

    // Image — hide entire image section if no image
    const imgWrap = document.getElementById('wikiCardImgWrap');
    if (entry.image_url) {
        imgEl.src = entry.image_url;
        imgEl.style.display = 'block';
        imgWrap.style.display = 'block';
        placeholder.style.display = 'none';
        imgEl.onerror = () => {
            imgWrap.style.display = 'none';
        };
    } else {
        imgWrap.style.display = 'none';
    }

    // Body — show all available info
    let bodyHtml = '';
    if (entry.type === 'character') {
        if (entry.summary) bodyHtml += `
            <div class="wiki-card-field">
                <div class="wiki-card-field-label">Personality</div>
                <div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div>
            </div>`;
        if (entry.backstory) bodyHtml += `
            <div class="wiki-card-field">
                <div class="wiki-card-field-label">Backstory</div>
                <div class="wiki-card-field-value">${escapeHtml(entry.backstory)}</div>
            </div>`;
        if (entry.appearance) bodyHtml += `
            <div class="wiki-card-field">
                <div class="wiki-card-field-label">Appearance</div>
                <div class="wiki-card-field-value">${escapeHtml(entry.appearance)}</div>
            </div>`;
    } else {
        if (entry.summary) bodyHtml += `
            <div class="wiki-card-field">
                <div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div>
            </div>`;
    }
    bodyEl.innerHTML = bodyHtml || `<div class="wiki-card-field-value" style="color:var(--text-muted);font-style:italic;">No details added yet.</div>`;

    // Position — prefer showing to the right, flip left if near edge
    const cardWidth = 340;
    const cardHeight = 400;
    let left = x + 20;
    let top = y - 60;

    if (left + cardWidth > window.innerWidth - 20) left = x - cardWidth - 20;
    if (top + cardHeight > window.innerHeight - 20) top = window.innerHeight - cardHeight - 20;
    if (top < 10) top = 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.display = 'block';
}

function hideWikiTooltip() {
    wikiTooltip.style.display = 'none';
}

// =============================================
// NOTES PANEL
// =============================================
let notesAutoSaveTimer = null;
let notesPanelOpen     = false;

async function loadNotes(projectId) {
    try {
        const note = await api('GET', `/api/projects/${projectId}/notes`);
        document.getElementById('notesTextarea').value = note.content || '';
        setNotesSaveStatus('');
    } catch(e) { console.error('loadNotes:', e); }
}

async function saveNotes() {
    if (!currentProjectId) return;
    setNotesSaveStatus('Saving...');
    try {
        await api('PUT', `/api/projects/${currentProjectId}/notes`, {
            content: document.getElementById('notesTextarea').value
        });
        setNotesSaveStatus('Saved ✓');
        setTimeout(() => setNotesSaveStatus(''), 2000);
    } catch(e) {
        setNotesSaveStatus('Error');
        console.error('saveNotes:', e);
    }
}

function setNotesSaveStatus(msg) {
    const el = document.getElementById('notesSaveStatus');
    if (el) el.textContent = msg;
}

function toggleNotesPanel() {
    notesPanelOpen = !notesPanelOpen;
    const panel      = document.getElementById('notesPanel');
    const editorArea = document.getElementById('editorArea');
    panel.classList.toggle('open', notesPanelOpen);
    editorArea.classList.toggle('notes-open', notesPanelOpen);

    if (notesPanelOpen && currentProjectId) {
        loadNotes(currentProjectId);
    }
}

function closeNotesPanel() {
    notesPanelOpen = false;
    document.getElementById('notesPanel').classList.remove('open');
    document.getElementById('editorArea').classList.remove('notes-open');
}

// Notes textarea auto-save
document.getElementById('notesTextarea').addEventListener('input', () => {
    setNotesSaveStatus('Unsaved...');
    clearTimeout(notesAutoSaveTimer);
    notesAutoSaveTimer = setTimeout(saveNotes, 1500);
});

// =============================================
// FOCUS MODE
// =============================================
let isFocusMode      = false;
let cursorHideTimer  = null;
let hintHideTimer    = null;

function enterFocusMode() {
    isFocusMode = true;
    document.body.classList.add('focus-mode');
    closeNotesPanel();

    // Show exit hint briefly
    const hint = document.getElementById('focusExitHint');
    hint.classList.add('visible');
    clearTimeout(hintHideTimer);
    hintHideTimer = setTimeout(() => hint.classList.remove('visible'), 3000);

    // Update focus word count
    updateFocusWordCount();

    // Hide cursor after 3s of no movement
    startCursorHide();

    document.getElementById('focusModeBtn').textContent = '⛶ Exit Focus';
}

function exitFocusMode() {
    isFocusMode = false;
    document.body.classList.remove('focus-mode', 'hide-cursor');
    clearTimeout(cursorHideTimer);

    const hint = document.getElementById('focusExitHint');
    hint.classList.remove('visible');

    document.getElementById('focusModeBtn').textContent = '⛶ Focus';
}

function toggleFocusMode() {
    if (isFocusMode) exitFocusMode();
    else enterFocusMode();
}

function updateFocusWordCount() {
    if (!quill) return;
    const text  = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
    const el    = document.getElementById('focusWordCount');
    if (el) el.textContent = `${words.toLocaleString()} words`;
}

function startCursorHide() {
    clearTimeout(cursorHideTimer);
    document.body.classList.remove('hide-cursor');
    cursorHideTimer = setTimeout(() => {
        if (isFocusMode) document.body.classList.add('hide-cursor');
    }, 3000);
}

// Show cursor on mouse move in focus mode
document.addEventListener('mousemove', () => {
    if (!isFocusMode) return;
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorHideTimer);
    cursorHideTimer = setTimeout(() => {
        if (isFocusMode) document.body.classList.add('hide-cursor');
    }, 3000);
});

// =============================================
// SEARCH
// =============================================
let searchSelectedIndex = -1;
let searchResults       = [];
let searchTimer         = null;

function openSearch() {
    if (!currentProjectId) return;
    const overlay = document.getElementById('searchOverlay');
    overlay.classList.add('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = `<div class="search-empty">Start typing to search across your project...</div>`;
    searchSelectedIndex = -1;
    searchResults       = [];
    setTimeout(() => document.getElementById('searchInput').focus(), 50);
}

function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('active');
    searchSelectedIndex = -1;
}

async function performSearch(query) {
    if (!query || query.length < 2) {
        document.getElementById('searchResults').innerHTML = `<div class="search-empty">Start typing to search across your project...</div>`;
        searchResults = [];
        return;
    }

    try {
        searchResults = await api('GET', `/api/projects/${currentProjectId}/search?q=${encodeURIComponent(query)}`);
        renderSearchResults(query);
    } catch(e) { console.error('search:', e); }
}

function renderSearchResults(query) {
    const container = document.getElementById('searchResults');

    if (!searchResults.length) {
        container.innerHTML = `<div class="search-empty">No results found for "<strong>${escapeHtml(query)}</strong>"</div>`;
        return;
    }

    // Group by type
    const groups = { chapter: [], scene: [], character: [], lore: [] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });

    const groupLabels = { chapter: '📄 Chapters', scene: '⚡ Scenes', character: '👤 Characters', lore: '📖 Lore' };

    let html       = '';
    let globalIdx  = 0;

    for (const [type, items] of Object.entries(groups)) {
        if (!items.length) continue;
        html += `<div class="search-group-label">${groupLabels[type]}</div>`;
        items.forEach(item => {
            const highlightedTitle   = highlightMatch(escapeHtml(item.title), query);
            const highlightedSnippet = item.snippet ? highlightMatch(escapeHtml(item.snippet), query) : '';
            html += `
                <div class="search-result-item" data-idx="${globalIdx}" data-type="${item.type}" data-id="${item.id}" onclick="openSearchResult(${globalIdx})">
                    <div class="search-result-icon">${item.icon}</div>
                    <div class="search-result-body">
                        <div class="search-result-title">${highlightedTitle}</div>
                        ${highlightedSnippet ? `<div class="search-result-snippet">${highlightedSnippet}</div>` : ''}
                    </div>
                    <div class="search-result-type">${type}</div>
                </div>`;
            globalIdx++;
        });
    }

    container.innerHTML = html;
    searchSelectedIndex = -1;
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function openSearchResult(idx) {
    const flat = [];
    const groups = { chapter: [], scene: [], character: [], lore: [] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });
    for (const items of Object.values(groups)) items.forEach(i => flat.push(i));

    const result = flat[idx];
    if (!result) return;

    closeSearch();

    if (result.type === 'chapter') {
        switchTab('chapters');
        openDocument(result.id, 'chapter');
    } else if (result.type === 'scene') {
        switchTab('scenes');
        openDocument(result.id, 'scene');
    } else if (result.type === 'character') {
        switchTab('characters');
        openEditCharModal(result.id);
    } else if (result.type === 'lore') {
        switchTab('lore');
        openEditLoreModal(result.id);
    }
}

function navigateSearch(direction) {
    const items = document.querySelectorAll('.search-result-item');
    if (!items.length) return;

    items[searchSelectedIndex]?.classList.remove('selected');
    searchSelectedIndex = (searchSelectedIndex + direction + items.length) % items.length;
    items[searchSelectedIndex]?.classList.add('selected');
    items[searchSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

// Search input handler
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => performSearch(e.target.value.trim()), 250);
});

// Search keyboard navigation
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); navigateSearch(1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); navigateSearch(-1); }
    if (e.key === 'Enter') {
        if (searchSelectedIndex >= 0) openSearchResult(searchSelectedIndex);
        else if (searchResults.length > 0) openSearchResult(0);
    }
    if (e.key === 'Escape') closeSearch();
});

// Close on overlay click
document.getElementById('searchOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('searchOverlay')) closeSearch();
});

// =============================================
// CHARACTER RELATIONSHIPS
// =============================================
let relSelectedColor = '#7b6fb0';
let relNodes         = [];   // {id, name, x, y, image_url, role}
let relEdges         = [];   // {id, char_a_id, char_b_id, relation_type, color, description}
let relDragging      = null;
let relDragOffX      = 0;
let relDragOffY      = 0;
let relZoom     = 1;
let relPanX     = 0;
let relPanY     = 0;
let relIsPanning = false;
let relPanStart  = { x: 0, y: 0 };
let relCanvas        = null;
let relCtx           = null;
let relAnimFrame     = null;

async function loadRelationships(projectId) {
    try {
        const rels = await api('GET', `/api/projects/${projectId}/relationships`);
        renderRelationshipsList(rels);
    } catch(e) { console.error('loadRelationships:', e); }
}

function renderRelationshipsList(rels) {
    const relTypeEmoji = { allies:'🤝', rivals:'⚔️', lovers:'💕', enemies:'🖤', family:'👨‍👩‍👧', mentor:'🧭', friends:'😊', complicated:'🌀', strangers:'👥' };
    if (!rels.length) {
        relationshipsList.innerHTML = '<li class="empty-state">No relationships yet.<br>Add one to start building the web.</li>';
        return;
    }
    relationshipsList.innerHTML = rels.map(r => `
        <li class="item-list-entry">
            <span class="item-name" style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0;display:inline-block;"></span>
                ${escapeHtml(r.char_a_name)} 
                <span style="color:var(--text-muted);font-size:11px;">${relTypeEmoji[r.relation_type] || '↔'} ${r.relation_type}</span>
                ${escapeHtml(r.char_b_name)}
            </span>
            <button class="item-delete" onclick="deleteRelationship(event,${r.id})">×</button>
        </li>
    `).join('');
}

async function openNewRelModal() {
    // Populate character dropdowns
    try {
        const chars = await api('GET', `/api/projects/${currentProjectId}/characters`);
        if (chars.length < 2) {
            alert('You need at least 2 characters to create a relationship!');
            return;
        }
        const options = chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        document.getElementById('relCharAInput').innerHTML = options;
        document.getElementById('relCharBInput').innerHTML = options;
        // Default second select to second character
        if (chars.length > 1) document.getElementById('relCharBInput').value = chars[1].id;

        relSelectedColor = '#7b6fb0';
        document.querySelectorAll('.rel-color-opt').forEach(o => {
            o.classList.toggle('selected', o.dataset.color === relSelectedColor);
        });

        openModal(newRelModal);
    } catch(e) { console.error('openNewRelModal:', e); }
}

async function createRelationship() {
    const charA = parseInt(document.getElementById('relCharAInput').value);
    const charB = parseInt(document.getElementById('relCharBInput').value);
    if (charA === charB) {
        alert('Please select two different characters!');
        return;
    }
    const confirmBtn = document.getElementById('confirmRelBtn');
    confirmBtn.textContent = 'Adding...';
    confirmBtn.disabled    = true;
    try {
        await api('POST', `/api/projects/${currentProjectId}/relationships`, {
            char_a_id:     charA,
            char_b_id:     charB,
            relation_type: document.getElementById('relTypeInput').value,
            description:   document.getElementById('relDescInput').value.trim(),
            color:         relSelectedColor
        });
        closeModal(newRelModal);
        document.getElementById('relDescInput').value = '';
        await loadRelationships(currentProjectId);
    } catch(e) {
        console.error('createRelationship:', e);
    } finally {
        confirmBtn.textContent = 'Add Relationship';
        confirmBtn.disabled    = false;
    }
}

async function deleteRelationship(event, id) {
    event.stopPropagation();
    showConfirm('This relationship will be removed from the web.', async () => {
        try {
            await api('DELETE', `/api/relationships/${id}`);
            await loadRelationships(currentProjectId);
            if (document.getElementById('relWebOverlay').style.display !== 'none') {
                await openRelWeb();
            }
        } catch(e) { console.error('deleteRelationship:', e); }
    }, 'Remove Relationship?');
}

let editingRelId      = null;
let editRelColor      = '#7b6fb0';

function openEditRelModal(edge) {
    editingRelId  = edge.id;
    editRelColor  = edge.color || '#7b6fb0';

    document.getElementById('editRelCharNames').textContent =
        `${edge.char_a_name}  ↔  ${edge.char_b_name}`;
    document.getElementById('editRelTypeInput').value   = edge.relation_type || 'allies';
    document.getElementById('editRelDescInput').value   = edge.description   || '';

    document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(o => {
        o.classList.toggle('selected', o.dataset.color === editRelColor);
    });

    openModal(document.getElementById('editRelModal'));
}

async function saveEditRel() {
    if (!editingRelId) return;
    const confirmBtn = document.getElementById('confirmEditRelBtn');
    confirmBtn.textContent = 'Saving...';
    confirmBtn.disabled    = true;
    try {
        await api('PUT', `/api/relationships/${editingRelId}`, {
            relation_type: document.getElementById('editRelTypeInput').value,
            description:   document.getElementById('editRelDescInput').value.trim(),
            color:         editRelColor
        });
        closeModal(document.getElementById('editRelModal'));
        await loadRelationships(currentProjectId);
        await openRelWeb();
    } catch(e) {
        console.error('saveEditRel:', e);
    } finally {
        confirmBtn.textContent = 'Save Changes';
        confirmBtn.disabled    = false;
    }
}

async function deleteRelFromEdit() {
    const id = editingRelId;
    closeModal(document.getElementById('editRelModal'));
    try {
        await api('DELETE', `/api/relationships/${id}`);
        await loadRelationships(currentProjectId);
        await openRelWeb();
    } catch(e) { console.error('deleteRelFromEdit:', e); }
}

// ---- CANVAS WEB ----
async function openRelWeb() {
    try {
        const [chars, rels] = await Promise.all([
            api('GET', `/api/projects/${currentProjectId}/characters`),
            api('GET', `/api/projects/${currentProjectId}/relationships`)
        ]);

        if (chars.length === 0) {
            alert('No characters in this project yet!');
            return;
        }

        document.getElementById('relWebProjectName').textContent = currentProjectData?.title + ' — Character Web';
        document.getElementById('relWebOverlay').style.display = 'flex';

        relCanvas = document.getElementById('relWebCanvas');
        relCtx    = relCanvas.getContext('2d');

        // Size canvas
        // Wait for overlay to render before measuring
        await new Promise(r => setTimeout(r, 50));

        const dpr        = window.devicePixelRatio || 1;
        const cssW       = relCanvas.offsetWidth;
        const cssH       = relCanvas.offsetHeight;
        relCanvas.width  = cssW * dpr;
        relCanvas.height = cssH * dpr;
        relCtx.scale(dpr, dpr);
        relCanvas._dpr   = dpr;
        relCanvas._cssW  = cssW;
        relCanvas._cssH  = cssH;
        // Reset zoom and pan
        relZoom = 1;
        relPanX = 0;
        relPanY = 0;
       // Place nodes in a circle using CSS dimensions
        const cx     = (relCanvas._cssW) / 2;
        const cy     = (relCanvas._cssH) / 2;
        const radius = Math.min(cx, cy) * 0.55;

        relNodes = chars.map((c, i) => {
            const angle = (2 * Math.PI * i) / chars.length - Math.PI / 2;
            return {
                id:        c.id,
                name:      c.name,
                role:      c.role || '',
                image_url: c.image_url || '',
                x:         cx + radius * Math.cos(angle),
                y:         cy + radius * Math.sin(angle),
                img:       null
            };
        });

        relEdges = rels;

        // Preload images
        relNodes.forEach(node => {
            if (node.image_url) {
                const img  = new Image();
                img.src    = node.image_url;
                img.onload = () => { node.img = img; drawRelWeb(); };
            }
        });

        drawRelWeb();
        setupRelCanvasEvents();

    } catch(e) { console.error('openRelWeb:', e); }
}

function relZoomIn()    { relZoom = Math.min(relZoom * 1.2, 4); drawRelWeb(); }
function relZoomOut()   { relZoom = Math.max(relZoom * 0.8, 0.2); drawRelWeb(); }
function relZoomReset() { relZoom = 1; relPanX = 0; relPanY = 0; drawRelWeb(); }

function drawRelWeb() {
    if (!relCtx || !relCanvas) return;
    const ctx = relCtx;
    const W   = relCanvas._cssW || relCanvas.offsetWidth;
    const H   = relCanvas._cssH || relCanvas.offsetHeight;

    // Get theme colors from CSS variables
    const style       = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim()   || '#f0eeff';
    const textMuted   = style.getPropertyValue('--text-muted').trim()     || '#6b6490';
    const bgModal     = style.getPropertyValue('--bg-modal').trim()       || '#181a2e';
    const borderAcc   = style.getPropertyValue('--border-accent').trim()  || 'rgba(123,111,176,0.4)';

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(relPanX, relPanY);
    ctx.scale(relZoom, relZoom);

    // Count edges between each pair
    const pairCount = {};
    relEdges.forEach(edge => {
        const key = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        pairCount[key] = (pairCount[key] || 0) + 1;
    });

    const pairIndex = {};

    // Draw edges
    relEdges.forEach(edge => {
        const nodeA = relNodes.find(n => n.id === edge.char_a_id);
        const nodeB = relNodes.find(n => n.id === edge.char_b_id);
        if (!nodeA || !nodeB) return;

        const key   = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        const total = pairCount[key] || 1;
        pairIndex[key] = (pairIndex[key] || 0);
        const idx   = pairIndex[key];
        pairIndex[key]++;

        const dx     = nodeB.x - nodeA.x;
        const dy     = nodeB.y - nodeA.y;
        const len    = Math.hypot(dx, dy) || 1;
        const perpX  = -dy / len;
        const perpY  =  dx / len;
        const spread = 55;
        const offset = total === 1 ? 0 : (idx - (total - 1) / 2) * spread;

        const cpX = (nodeA.x + nodeB.x) / 2 + perpX * offset;
        const cpY = (nodeA.y + nodeB.y) / 2 + perpY * offset;

        edge._cpX = cpX; edge._cpY = cpY;
        edge._ax  = nodeA.x; edge._ay = nodeA.y;
        edge._bx  = nodeB.x; edge._by = nodeB.y;

        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        ctx.quadraticCurveTo(cpX, cpY, nodeB.x, nodeB.y);
        ctx.strokeStyle  = edge.color || '#7b6fb0';
        ctx.lineWidth    = 2.5;
        ctx.globalAlpha  = 0.8;
        ctx.stroke();
        ctx.globalAlpha  = 1;

        // Midpoint label
        const labelX = 0.25*nodeA.x + 0.5*cpX + 0.25*nodeB.x;
        const labelY = 0.25*nodeA.y + 0.5*cpY + 0.25*nodeB.y;
        const relTypeEmoji = { allies:'🤝', rivals:'⚔️', lovers:'💕', enemies:'🖤', family:'👨‍👩‍👧', mentor:'🧭', friends:'😊', complicated:'🌀', strangers:'👥' };
        const label = relTypeEmoji[edge.relation_type] || edge.relation_type;

        ctx.font         = '13px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const lW = 30, lH = 22;
        ctx.fillStyle = bgModal;
        ctx.beginPath();
        ctx.roundRect(labelX - lW/2, labelY - lH/2, lW, lH, 6);
        ctx.fill();
        ctx.strokeStyle = edge.color || '#7b6fb0';
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.fillText(label, labelX, labelY);
    });

    // Draw nodes
    const nodeRadius = 38;
    relNodes.forEach(node => {
        // Clip circle for image
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.clip();

        if (node.img && node.img.complete && node.img.naturalWidth > 0) {
            ctx.drawImage(node.img, node.x - nodeRadius, node.y - nodeRadius, nodeRadius * 2, nodeRadius * 2);
        } else {
            const grad = ctx.createRadialGradient(node.x, node.y - nodeRadius*0.3, 0, node.x, node.y, nodeRadius);
            grad.addColorStop(0, '#5b7fb0');
            grad.addColorStop(1, '#7b6fb0');
            ctx.fillStyle = grad;
            ctx.fillRect(node.x - nodeRadius, node.y - nodeRadius, nodeRadius*2, nodeRadius*2);
            ctx.fillStyle    = 'rgba(255,255,255,0.95)';
            ctx.font         = `bold 22px serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name.charAt(0).toUpperCase(), node.x, node.y);
        }
        ctx.restore();

        // Border ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#7b6fb0';
        ctx.lineWidth   = 2.5;
        ctx.stroke();

        // Name pill background
        const name    = node.name;
        ctx.font      = `600 13px 'DM Sans', sans-serif`;
        const nameW   = ctx.measureText(name).width + 16;
        const nameH   = 22;
        const nameX   = node.x - nameW / 2;
        const nameY   = node.y + nodeRadius + 6;

        ctx.fillStyle = bgModal;
        ctx.beginPath();
        ctx.roundRect(nameX, nameY, nameW, nameH, 6);
        ctx.fill();

        ctx.fillStyle    = textPrimary;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, node.x, nameY + nameH/2);

        if (node.role) {
            ctx.font      = `11px 'DM Sans', sans-serif`;
            const roleW   = ctx.measureText(node.role).width + 12;
            const roleX   = node.x - roleW / 2;
            const roleY   = nameY + nameH + 3;
            ctx.fillStyle = 'rgba(157,143,212,0.15)';
            ctx.beginPath();
            ctx.roundRect(roleX, roleY, roleW, 18, 5);
            ctx.fill();
            ctx.fillStyle    = '#9d8fd4';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.role, node.x, roleY + 9);
        }
    });

    ctx.restore();
}

function setupRelCanvasEvents() {
    let mouseDownPos = null;
    let mouseDownTime = 0;

    relCanvas.onwheel = (e) => {
        e.preventDefault();
        const rect   = relCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta  = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(relZoom * delta, 0.2), 4);

        // Zoom toward mouse position
        relPanX = mouseX - (mouseX - relPanX) * (newZoom / relZoom);
        relPanY = mouseY - (mouseY - relPanY) * (newZoom / relZoom);
        relZoom = newZoom;
        drawRelWeb();
    };

    relCanvas.onmousedown = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx   = (e.clientX - rect.left);
        const my   = (e.clientY - rect.top);
        mouseDownPos  = { x: mx, y: my };
        mouseDownTime = Date.now();

        // Convert screen coords to canvas coords
        const cx = (mx - relPanX) / relZoom;
        const cy = (my - relPanY) / relZoom;

        relDragging = relNodes.find(n => Math.hypot(n.x - cx, n.y - cy) < 42);
        if (relDragging) {
            relDragOffX = relDragging.x - cx;
            relDragOffY = relDragging.y - cy;
        } else {
            relIsPanning = true;
            relPanStart  = { x: mx - relPanX, y: my - relPanY };
            relCanvas.style.cursor = 'grabbing';
        }
    };

    relCanvas.onmousemove = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx   = e.clientX - rect.left;
        const my   = e.clientY - rect.top;

        if (relDragging) {
            const cx      = (mx - relPanX) / relZoom;
            const cy      = (my - relPanY) / relZoom;
            relDragging.x = cx + relDragOffX;
            relDragging.y = cy + relDragOffY;
            drawRelWeb();
        } else if (relIsPanning) {
            relPanX = mx - relPanStart.x;
            relPanY = my - relPanStart.y;
            drawRelWeb();
        }
    };

    relCanvas.onmouseup = (e) => {
        const rect    = relCanvas.getBoundingClientRect();
        const mx      = e.clientX - rect.left;
        const my      = e.clientY - rect.top;
        const elapsed = Date.now() - mouseDownTime;
        const moved   = mouseDownPos && Math.hypot(mx - mouseDownPos.x, my - mouseDownPos.y) > 5;

        // Click = short duration + barely moved + not dragging a node
        if (!moved && elapsed < 300 && !relDragging) {
            // Convert to canvas coords
            const cx = (mx - relPanX) / relZoom;
            const cy = (my - relPanY) / relZoom;
            const clickedEdge = relEdges.find(edge => isNearCurve(cx, cy, edge));
            if (clickedEdge) openEditRelModal(clickedEdge);
        }

        relDragging    = null;
        relIsPanning   = false;
        mouseDownPos   = null;
        relCanvas.style.cursor = 'grab';
    };

    relCanvas.onmouseleave = () => {
        relDragging  = null;
        relIsPanning = false;
        relCanvas.style.cursor = 'grab';
    };

    window.addEventListener('resize', () => {
        if (document.getElementById('relWebOverlay').style.display !== 'none') {
            const dpr        = window.devicePixelRatio || 1;
            relCanvas.width  = relCanvas.offsetWidth  * dpr;
            relCanvas.height = relCanvas.offsetHeight * dpr;
            relCanvas._dpr   = dpr;
            relCanvas._cssW  = relCanvas.offsetWidth;
            relCanvas._cssH  = relCanvas.offsetHeight;
            relCtx.scale(dpr, dpr);
            drawRelWeb();
        }
    });
}

function isNearCurve(mx, my, edge) {
    if (edge._ax === undefined) return false;
    // Sample points along quadratic bezier and check distance
    for (let t = 0; t <= 1; t += 0.05) {
        const bx = (1-t)*(1-t)*edge._ax + 2*(1-t)*t*edge._cpX + t*t*edge._bx;
        const by = (1-t)*(1-t)*edge._ay + 2*(1-t)*t*edge._cpY + t*t*edge._by;
        if (Math.hypot(mx - bx, my - by) < 10) return true;
    }
    return false;
}

function closeRelWeb() {
    document.getElementById('relWebOverlay').style.display = 'none';
    relDragging = null;
}

// =============================================
// VS CODE STYLE OPEN TABS
// =============================================
function addOpenTab(id, title, type = 'chapter') {
    // Don't add duplicate
    if (openTabs.find(t => t.id === id && t.type === type)) {
        setActiveTab(id, type);
        return;
    }
    openTabs.push({ id, title, type });
    renderTabs();
    setActiveTab(id, type);
    tabsBar.style.display = 'block';
}

function removeOpenTab(id) {
    openTabs = openTabs.filter(t => t.id !== id);
    renderTabs();
    if (!openTabs.length) tabsBar.style.display = 'none';
}

function setActiveTab(id, type) {
    document.querySelectorAll('.open-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.id == id && t.dataset.type === type);
    });
}

function updateTabTitle(id, title) {
    const tab = openTabs.find(t => t.id === id);
    if (tab) { tab.title = title; renderTabs(); }
}

function renderTabs() {
    const typeIcon = { chapter: '📄', scene: '⚡' };
    openTabsEl.innerHTML = openTabs.map(t => `
        <div class="open-tab ${t.id === currentDocId && t.type === currentDocType ? 'active' : ''}"
             data-id="${t.id}" data-type="${t.type}"
             onclick="openDocument(${t.id}, '${t.type}')">
            <span style="font-size:11px;margin-right:4px;">${typeIcon[t.type] || '📄'}</span>
            <span class="open-tab-name">${escapeHtml(t.title)}</span>
            <button class="open-tab-close" onclick="closeTab(event,${t.id},'${t.type}')">×</button>
        </div>
    `).join('');
}

function closeTab(event, id, type) {
    event.stopPropagation();
    openTabs = openTabs.filter(t => !(t.id === id && t.type === type));
    renderTabs();

    if (currentDocId === id && currentDocType === type) {
        // Switch to another open tab or hide editor
        if (openTabs.length) {
            const last = openTabs[openTabs.length - 1];
            openDocument(last.id, last.type);
        } else {
            currentDocId = null;
            hideEditor();
            tabsBar.style.display = 'none';
        }
    }
    if (!openTabs.length) tabsBar.style.display = 'none';
}

// =============================================
// AUTO-SAVE & LOCALSTORAGE
// =============================================
function getLocalKey(key) { return `scripvia_doc_${key}`; }

function saveToLocalStorage() {
    if (!currentDocId || !quill) return;
    try {
        localStorage.setItem(getLocalKey(`${currentDocType}_${currentDocId}`), JSON.stringify({
            title: docTitleInput.value,
            content: quill.root.innerHTML,
            savedAt: Date.now()
        }));
    } catch (e) { }
}

function loadFromLocalStorage(key) {
    try {
        const raw = localStorage.getItem(getLocalKey(key));
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearLocalStorage(key) {
    try { localStorage.removeItem(getLocalKey(key)); } catch (e) { }
}

function checkLocalStorageRestore(key, serverContent) {
    const backup = loadFromLocalStorage(key);
    if (!backup) return false;
    const isRecent = (Date.now() - backup.savedAt) < 24 * 60 * 60 * 1000;
    if (!isRecent) { clearLocalStorage(key); return false; }
    if (backup.content !== serverContent) {
        const timeAgo = formatTimeAgo(backup.savedAt);
        const restore = confirm(`📋 Unsaved changes found from ${timeAgo}.\n\nRestore them?`);
        if (restore) {
            quill.root.innerHTML = backup.content || '';
            docTitleInput.value = backup.title || '';
            setSaveStatus('unsaved');
            return true;
        } else { clearLocalStorage(key); }
    }
    return false;
}

function formatTimeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    return `${Math.floor(d / 3600)}h ago`;
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
        }
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    secondsUntilSave = 30;
}

function resetCountdown() { secondsUntilSave = 30; }

// =============================================
// OFFLINE / ONLINE
// =============================================
window.addEventListener('online', async () => {
    if (pendingSync && currentDocId && currentDocType === 'chapter') {
        setSaveStatus('syncing');
        try { await saveDocument(); pendingSync = false; } catch (e) { }
    }
});
window.addEventListener('offline', () => { console.log('🔴 Offline'); });

// =============================================
// STATS
// =============================================
function updateStats() {
    if (!quill) return;
    const text      = quill.getText().trim();
    const words     = text ? text.split(/\s+/).filter(w => w.length > 0) : [];
    const wordCount = words.length;
    const charCount = text.length;
    const readTime  = Math.max(1, Math.ceil(wordCount / 200));

    if (wordCountEl) wordCountEl.textContent = `${wordCount.toLocaleString()} word${wordCount !== 1 ? 's' : ''}`;
    if (charCountEl) charCountEl.textContent = `${charCount.toLocaleString()} char${charCount !== 1 ? 's' : ''}`;
    if (readTimeEl)  readTimeEl.textContent  = `~${readTime} min read`;
    updateFocusWordCount();
}

function updateLastSaved() {
    if (!lastSavedTimeEl) return;
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastSavedTimeEl.textContent = `Saved at ${t}`;
}

// =============================================
// UI HELPERS
// =============================================
function showEditor() {
    welcomeScreen.classList.add('hidden');
    editorWrapper.classList.add('visible');
    document.getElementById('editorHeader').style.display = 'flex';
    document.getElementById('projectOverview').style.display = 'none';
    document.getElementById('notesToggleBtn').style.display = 'block';
    document.getElementById('focusModeBtn').style.display = 'block';
    document.getElementById('searchBtn').style.display = 'block';
}

function hideEditor() {
    stopAutoSave();
    welcomeScreen.classList.remove('hidden');
    editorWrapper.classList.remove('visible');
    document.getElementById('editorHeader').style.display = 'none';
    document.getElementById('projectOverview').style.display = 'none';
    docTitleInput.value = '';
    docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
    if (wordCountEl) wordCountEl.textContent = '0 words';
    if (charCountEl) charCountEl.textContent = '0 chars';
    if (readTimeEl) readTimeEl.textContent = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
    document.getElementById('notesToggleBtn').style.display = 'none';
    closeNotesPanel();
    document.getElementById('focusModeBtn').style.display = 'none';
    if (isFocusMode) exitFocusMode();
    document.getElementById('searchBtn').style.display = 'none';
    closeSearch();
}

function setSaveStatus(status) {
    const map = { saved: '✓ Saved', saving: 'Saving...', syncing: '↑ Syncing...', synced: '✓ Synced', unsaved: '● Unsaved', error: '✗ Error', '': '' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className = 'save-status ' + status;
}

function enableHeaderBtns(on) {
    saveBtn.disabled = !on;
    exportPdfBtn.disabled = !on;
    exportDocxBtn.disabled = !on;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =============================================
// MODALS
// =============================================
function openModal(modal) { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeModal(o); });
});

// Genre note toggle
projectGenreInput.addEventListener('change', () => {
    const isCreative = CREATIVE_GENRES.includes(projectGenreInput.value);
    document.getElementById('genreNote').style.display = isCreative ? 'block' : 'none';
});

// =============================================
// DARK MODE + SIDEBAR PERSISTENCE
// =============================================
let isDark = localStorage.getItem('scripvia_theme') !== 'light';

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
    localStorage.setItem('scripvia_theme', isDark ? 'dark' : 'light');
}

document.getElementById('darkModeToggle').addEventListener('click', () => {
    isDark = !isDark;
    applyTheme();
});

const sidebar = document.getElementById('sidebar');
let sidebarCollapsed = localStorage.getItem('scripvia_sidebar') === 'collapsed';

function applySidebar() {
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('scripvia_sidebar', sidebarCollapsed ? 'collapsed' : 'open');
    applySidebar();
});

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentDocId) saveDocument();
    }
    if (e.key === 'F11') {
        e.preventDefault();
        if (currentDocId) toggleFocusMode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (currentProjectId) openSearch();
    }
    if (e.key === 'Escape') {
        if (isFocusMode) {
            exitFocusMode();
            return;
        }
        document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
        hideWikiTooltip();
    }
});

// =============================================
// EXPORT
// =============================================
exportPdfBtn.addEventListener('click', () => {
    if (!currentDocId || currentDocType !== 'chapter') return;
    window.location.href = `/api/documents/${currentDocId}/export/pdf`;
});
exportDocxBtn.addEventListener('click', () => {
    if (!currentDocId || currentDocType !== 'chapter') return;
    window.location.href = `/api/documents/${currentDocId}/export/docx`;
});

// =============================================
// AUTH
// =============================================
async function checkAuthState() {
    try {
        const data = await api('GET', '/auth/me');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');

        if (data.logged_in) {
            loginBtn.style.display = 'none';
            userInfo.classList.remove('hidden');
            userAvatar.src = data.user.picture;
            userName.textContent = data.user.name.split(' ')[0];
        } else {
            const guest = localStorage.getItem('scripvia_guest');
            if (guest) {
                const g = JSON.parse(guest);
                showGuestUser(g.name);
            } else {
                loginBtn.style.display = 'flex';
                userInfo.classList.add('hidden');
            }
        }
    } catch (e) { console.error('checkAuthState:', e); }
}

function showGuestUser(name) {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    if (loginBtn) loginBtn.style.display = 'none';
    if (userInfo) userInfo.classList.remove('hidden');
    if (userName) userName.textContent = name + ' (guest)';
    if (userAvatar) userAvatar.style.display = 'none';
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

document.getElementById('newCharBtn').addEventListener('click', () => openModal(newCharModal));
document.getElementById('cancelCharBtn').addEventListener('click', () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('cancelCharBtnX').addEventListener('click', () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('confirmCharBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmCharBtn');
    const mode = btn.dataset.mode;
    const id = btn.dataset.editId;
    if (mode === 'edit' && id) {
        saveEditChar(parseInt(id));
    } else {
        createCharacter();
    }
});

document.getElementById('newSceneBtn').addEventListener('click', () => openModal(newSceneModal));
document.getElementById('cancelSceneBtn').addEventListener('click', () => closeModal(newSceneModal));
document.getElementById('cancelSceneBtnX').addEventListener('click', () => closeModal(newSceneModal));
document.getElementById('confirmSceneBtn').addEventListener('click', createScene);

document.getElementById('newLoreBtn').addEventListener('click', () => openModal(newLoreModal));
document.getElementById('cancelLoreBtn').addEventListener('click', () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('cancelLoreBtnX').addEventListener('click', () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('confirmLoreBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmLoreBtn');
    const mode = btn.dataset.mode;
    const id = btn.dataset.editId;
    if (mode === 'edit' && id) {
        saveEditLore(parseInt(id));
    } else {
        createLore();
    }
});

saveBtn.addEventListener('click', saveDocument);

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    setupImageUpload('charImageFile', 'charImageInput', 'charImgPreview', 'charImgPreviewEl', 'clearCharImg');
    setupImageUpload('loreImageFile', 'loreImageInput', 'loreImgPreview', 'loreImgPreviewEl', 'clearLoreImg');
    const guest = localStorage.getItem('scripvia_guest');
    document.getElementById('wikiCardClose').addEventListener('click', hideWikiTooltip);
    fetch('/auth/me')
        .then(r => r.json())
        .then(data => {
            if (!data.logged_in && !guest) {
                window.location.href = '/login';
                return;
            }
            applyTheme();
            applySidebar();
            initQuill();
            loadProjects();
            checkAuthState();
        })
        .catch(() => {
            applyTheme();
            applySidebar();
            initQuill();
            loadProjects();
        });
    document.getElementById('backToOverview').addEventListener('click', () => {
        hideEditor();
        showProjectOverview(currentProjectId);
    });
    document.getElementById('notesToggleBtn').addEventListener('click', toggleNotesPanel);
    document.getElementById('notesPanelClose').addEventListener('click', closeNotesPanel);
    document.getElementById('focusModeBtn').addEventListener('click', toggleFocusMode);
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    // Relationships
    document.getElementById('newRelBtn').addEventListener('click', openNewRelModal);
    document.getElementById('viewRelWebBtn').addEventListener('click', openRelWeb);
    document.getElementById('relWebClose').addEventListener('click', closeRelWeb);
    document.getElementById('relWebAddBtn').addEventListener('click', () => { closeRelWeb(); openNewRelModal(); });
    document.getElementById('cancelRelBtn').addEventListener('click',  () => closeModal(newRelModal));
    document.getElementById('cancelRelBtnX').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('confirmRelBtn').addEventListener('click', createRelationship);

    // Color picker
    document.querySelectorAll('.rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            relSelectedColor = opt.dataset.color;
        });
    });
    document.getElementById('confirmEditRelBtn').addEventListener('click', saveEditRel);
    document.getElementById('cancelEditRelBtn').addEventListener('click',  () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('cancelEditRelBtnX').addEventListener('click', () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('deleteRelFromEditBtn').addEventListener('click', deleteRelFromEdit);

    // Edit rel color picker
    document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            editRelColor = opt.dataset.color;
        });
    });
});