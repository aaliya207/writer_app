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

        // Show/hide creative tabs based on genre
        const isCreative = CREATIVE_GENRES.includes(currentProjectData.genre);
        document.getElementById('tabCharacters').classList.toggle('hidden', !isCreative);
        document.getElementById('tabScenes').classList.toggle('hidden', !isCreative);
        document.getElementById('tabLore').classList.toggle('hidden', !isCreative);

        // Load all data
        switchTab('chapters');
        await loadDocuments(id);
        if (isCreative) {
            await loadWikiData(id);
        }
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
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('backToProjects').addEventListener('click', () => {
    currentProjectId = null;
    currentProjectData = null;
    showProjectList();
    loadProjects();
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
    documentsList.innerHTML = docs.map(d => `
        <li class="item-list-entry ${d.id === currentDocId ? 'active' : ''}"
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
            document.getElementById('charImgPreviewEl').src         = c.image_url;
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
            document.getElementById('loreImgPreviewEl').src         = item.image_url;
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
    const text = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(w => w.length > 0) : [];
    const wordCount = words.length;
    const charCount = text.length;
    const readTime = Math.max(1, Math.ceil(wordCount / 200));

    if (wordCountEl) wordCountEl.textContent = `${wordCount.toLocaleString()} word${wordCount !== 1 ? 's' : ''}`;
    if (charCountEl) charCountEl.textContent = `${charCount.toLocaleString()} char${charCount !== 1 ? 's' : ''}`;
    if (readTimeEl) readTimeEl.textContent = `~${readTime} min read`;
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
}

function hideEditor() {
    stopAutoSave();
    welcomeScreen.classList.remove('hidden');
    editorWrapper.classList.remove('visible');
    document.getElementById('editorHeader').style.display = 'none';
    docTitleInput.value = '';
    docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
    if (wordCountEl) wordCountEl.textContent = '0 words';
    if (charCountEl) charCountEl.textContent = '0 chars';
    if (readTimeEl) readTimeEl.textContent = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
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
    if (e.key === 'Escape') {
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
});