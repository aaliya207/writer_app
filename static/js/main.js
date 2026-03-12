// =============================================
// SCRIPVIA — Main Frontend Logic v0.2
// =============================================

// --- STATE ---
let currentProjectId   = null;
let currentProjectData = null;  // Full project object including genre
let currentDocId       = null;
let currentDocType     = 'chapter'; // 'chapter' | 'scene'
let quill              = null;
let autoSaveTimer      = null;
let countdownTimer     = null;
let secondsUntilSave   = 30;
let pendingSync        = false;
let openTabs           = [];    // [{id, title, type}] — VS Code style tabs
let wikiData           = {};    // {name: {type, summary, image_url...}}

// --- DOM REFS ---
const projectsList      = document.getElementById('projectsList');
const documentsList     = document.getElementById('documentsList');
const charactersList    = document.getElementById('charactersList');
const scenesList        = document.getElementById('scenesList');
const loreList          = document.getElementById('loreList');
const projectDetail     = document.getElementById('projectDetail');
const projectsSection   = document.getElementById('projectsSection');
const currentProjectName = document.getElementById('currentProjectName');
const welcomeScreen     = document.getElementById('welcomeScreen');
const editorWrapper     = document.getElementById('editorWrapper');
const docTitleInput     = document.getElementById('docTitleInput');
const saveStatus        = document.getElementById('saveStatus');
const saveBtn           = document.getElementById('saveBtn');
const exportPdfBtn      = document.getElementById('exportPdfBtn');
const exportDocxBtn     = document.getElementById('exportDocxBtn');
const wordCountEl       = document.getElementById('wordCount');
const charCountEl       = document.getElementById('charCount');
const readTimeEl        = document.getElementById('readTime');
const lastSavedTimeEl   = document.getElementById('lastSavedTime');
const tabsBar           = document.getElementById('tabsBar');
const openTabsEl        = document.getElementById('openTabs');
const wikiTooltip       = document.getElementById('wikiTooltip');

const newProjectModal    = document.getElementById('newProjectModal');
const newDocModal        = document.getElementById('newDocModal');
const newCharModal       = document.getElementById('newCharModal');
const newSceneModal      = document.getElementById('newSceneModal');
const newLoreModal       = document.getElementById('newLoreModal');
const projectTitleInput  = document.getElementById('projectTitleInput');
const projectDescInput   = document.getElementById('projectDescInput');
const projectGenreInput  = document.getElementById('projectGenreInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

const CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical'];

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
    quill.root.addEventListener('mouseover', handleWikiHover);
    quill.root.addEventListener('mouseout',  () => hideWikiTooltip());
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
            <span class="item-meta">${genreEmoji(p.genre)}</span>
            <button class="item-delete" onclick="deleteProject(event,${p.id})">×</button>
        </li>
    `).join('');
}

function genreEmoji(genre) {
    const map = { fantasy:'⚔️', 'sci-fi':'🚀', fiction:'📖', romance:'💕', mystery:'🔍', thriller:'⚡', horror:'🕯️', historical:'🏛️', journal:'📓', screenplay:'🎬', poetry:'✨', general:'📝', other:'📌' };
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
        projectDescInput.value  = '';
        projectGenreInput.value = 'general';
        await loadProjects();
        selectProject(p.id);
    } catch(e) {
        console.error('createProject:', e);
    } finally {
        confirmBtn.textContent = 'Create Project';
        confirmBtn.disabled = false;
    }
}

async function deleteProject(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this project and everything in it?')) return;
    try {
        await api('DELETE', `/api/projects/${id}`);
        if (currentProjectId === id) {
            currentProjectId = null;
            currentProjectData = null;
            showProjectList();
            hideEditor();
        }
        await loadProjects();
    } catch(e) { console.error('deleteProject:', e); }
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
    } catch(e) { console.error('selectProject:', e); }
}

function showProjectList() {
    projectsSection.style.display = 'block';
    projectDetail.style.display   = 'none';
}

function showProjectDetail() {
    projectsSection.style.display = 'none';
    projectDetail.style.display   = 'flex';
}

// =============================================
// TABS
// =============================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));

    // Load data for tab
    if (tabName === 'chapters')    loadDocuments(currentProjectId);
    if (tabName === 'characters')  loadCharacters(currentProjectId);
    if (tabName === 'scenes')      loadScenes(currentProjectId);
    if (tabName === 'lore')        loadLore(currentProjectId);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('backToProjects').addEventListener('click', () => {
    currentProjectId   = null;
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
    } catch(e) { console.error('loadDocuments:', e); }
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
    } catch(e) {
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
        currentDocId   = id;
        currentDocType = type;

        docTitleInput.value    = doc.title;
        docTitleInput.disabled = false;
        quill.root.innerHTML   = doc.content || '';
        quill.history.clear();

        showEditor();
        enableHeaderBtns(true);

        const restored = checkLocalStorageRestore(`${type}_${id}`, doc.content || '');
        if (!restored) setSaveStatus('saved');

        updateStats();
        startAutoSave();
        addOpenTab(id, doc.title, type);

       if (type === 'chapter' && currentProjectId) await loadDocuments(currentProjectId);
       if (type === 'scene'   && currentProjectId) await loadScenes(currentProjectId);
    } catch(e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');

    try {
        const endpoint = currentDocType === 'scene'
            ? `/api/scenes/${currentDocId}`
            : `/api/documents/${currentDocId}`;

        await api('PUT', endpoint, {
            title:   docTitleInput.value.trim() || 'Untitled',
            content: quill.root.innerHTML
        });

        // Update tab title
        updateTabTitle(currentDocId, docTitleInput.value.trim());

        clearLocalStorage(`${currentDocType}_${currentDocId}`);
        updateLastSaved();

        if (currentDocType === 'chapter') await loadDocuments(currentProjectId);
        if (currentDocType === 'scene')   await loadScenes(currentProjectId);

        // Sync to Drive if online and it's a chapter
        if (navigator.onLine && currentDocType === 'chapter') {
            setSaveStatus('syncing');
            try {
                await api('POST', `/api/documents/${currentDocId}/sync`);
                setSaveStatus('synced');
                setTimeout(() => setSaveStatus('saved'), 2000);
            } catch(e) {
                setSaveStatus('saved');
            }
        } else {
            setSaveStatus('saved');
            if (!navigator.onLine) pendingSync = true;
        }

    } catch(e) {
        setSaveStatus('error');
        console.error('saveDocument:', e);
    }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this chapter?')) return;
    try {
        await api('DELETE', `/api/documents/${id}`);
        if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
        removeOpenTab(id);
        await loadDocuments(currentProjectId);
    } catch(e) { console.error('deleteDocument:', e); }
}

// =============================================
// CHARACTERS
// =============================================
async function loadCharacters(projectId) {
    try {
        const chars = await api('GET', `/api/projects/${projectId}/characters`);
        renderCharacters(chars);
    } catch(e) { console.error('loadCharacters:', e); }
}

function renderCharacters(chars) {
    if (!chars.length) {
        charactersList.innerHTML = '<li class="empty-state">No characters yet.</li>';
        return;
    }
    charactersList.innerHTML = chars.map(c => `
        <li class="item-list-entry char-preview">
            <span class="item-name">${escapeHtml(c.name)}</span>
            ${c.role ? `<span class="item-badge">${escapeHtml(c.role)}</span>` : ''}
            <button class="item-delete" onclick="deleteCharacter(event,${c.id})">×</button>

            <!-- Hover card -->
            <div class="char-preview-card">
                ${c.image_url ? `<img class="char-card-img" src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.name)}" onerror="this.style.display='none'">` : ''}
                <div class="char-card-name">${escapeHtml(c.name)}</div>
                ${c.role ? `<div class="char-card-role">${escapeHtml(c.role)}${c.age ? ' · ' + escapeHtml(c.age) : ''}</div>` : ''}
                ${c.personality ? `<div class="char-card-summary">${escapeHtml(c.personality.slice(0, 120))}${c.personality.length > 120 ? '...' : ''}</div>` : ''}
                ${c.backstory ? `<div class="char-card-summary" style="margin-top:6px;font-style:italic;">${escapeHtml(c.backstory.slice(0, 100))}${c.backstory.length > 100 ? '...' : ''}</div>` : ''}
            </div>
        </li>
    `).join('');
}

async function createCharacter() {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('charNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/characters`, {
            name,
            role:        document.getElementById('charRoleInput').value,
            age:         document.getElementById('charAgeInput').value.trim(),
            appearance:  document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory:   document.getElementById('charBackstoryInput').value.trim(),
            image_url:   document.getElementById('charImageInput').value.trim()
        });
        closeModal(newCharModal);
        // Clear fields
        ['charNameInput','charAgeInput','charAppearanceInput','charPersonalityInput','charBackstoryInput','charImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('charRoleInput').value = '';
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch(e) { console.error('createCharacter:', e); }
}

async function deleteCharacter(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this character?')) return;
    try {
        await api('DELETE', `/api/characters/${id}`);
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch(e) { console.error('deleteCharacter:', e); }
}

// =============================================
// SCENES
// =============================================
async function loadScenes(projectId) {
    try {
        const scenes = await api('GET', `/api/projects/${projectId}/scenes`);
        renderScenes(scenes);
    } catch(e) { console.error('loadScenes:', e); }
}

function renderScenes(scenes) {
    const moodEmoji = { tense:'⚡', romantic:'💕', mysterious:'🌫️', action:'🔥', sad:'💧', hopeful:'🌅', dark:'🌑', comedic:'😄' };
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
        document.getElementById('sceneMoodInput').value  = '';
        await loadScenes(currentProjectId);
        openDocument(scene.id, 'scene');
    } catch(e) { console.error('createScene:', e); }
}

async function deleteScene(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this scene?')) return;
    try {
        await api('DELETE', `/api/scenes/${id}`);
        if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
        removeOpenTab(id);
        await loadScenes(currentProjectId);
    } catch(e) { console.error('deleteScene:', e); }
}

// =============================================
// LORE
// =============================================
async function loadLore(projectId) {
    try {
        const items = await api('GET', `/api/projects/${projectId}/lore`);
        renderLore(items);
    } catch(e) { console.error('loadLore:', e); }
}

function renderLore(items) {
    const catEmoji = { item:'⚔️', place:'🗺️', organization:'🏛️', concept:'✨', creature:'🐉', event:'📅', other:'📌' };
    if (!items.length) {
        loreList.innerHTML = '<li class="empty-state">No lore entries yet.</li>';
        return;
    }
    loreList.innerHTML = items.map(i => `
        <li class="item-list-entry">
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
            category:    document.getElementById('loreCategoryInput').value,
            description: document.getElementById('loreDescInput').value.trim(),
            image_url:   document.getElementById('loreImageInput').value.trim()
        });
        closeModal(newLoreModal);
        ['loreNameInput','loreDescInput','loreImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('loreCategoryInput').value = 'item';
        await loadLore(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch(e) { console.error('createLore:', e); }
}

async function deleteLore(event, id) {
    event.stopPropagation();
    if (!confirm('Delete this lore entry?')) return;
    try {
        await api('DELETE', `/api/lore/${id}`);
        await loadLore(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch(e) { console.error('deleteLore:', e); }
}

// =============================================
// WIKI DATA + HOVER TOOLTIPS
// =============================================
async function loadWikiData(projectId) {
    try {
        wikiData = await api('GET', `/api/projects/${projectId}/wiki`);
    } catch(e) { console.error('loadWikiData:', e); }
}

function handleWikiHover(e) {
    const target = e.target;
    if (target.tagName !== 'SPAN' && target.tagName !== 'P' && target.tagName !== 'STRONG' && target.tagName !== 'EM') return;

    const text = target.textContent.toLowerCase().trim();
    if (!text || text.length < 2) return;

    // Check if any wiki entry name is contained in or matches the hovered text
    for (const [key, entry] of Object.entries(wikiData)) {
        if (text.includes(key) || key.includes(text)) {
            showWikiTooltip(entry, e.clientX, e.clientY);
            return;
        }
    }
}

function showWikiTooltip(entry, x, y) {
    const tooltip  = wikiTooltip;
    const imgEl    = document.getElementById('wikiTooltipImg');
    const imgTag   = document.getElementById('wikiTooltipImgEl');
    const nameEl   = document.getElementById('wikiTooltipName');
    const typeEl   = document.getElementById('wikiTooltipType');
    const summaryEl = document.getElementById('wikiTooltipSummary');

    nameEl.textContent    = entry.name;
    typeEl.textContent    = entry.type === 'character' ? `${entry.role || 'Character'}` : `${entry.category || 'Lore'}`;
    summaryEl.textContent = entry.summary || '';

    if (entry.image_url) {
        imgTag.src          = entry.image_url;
        imgEl.style.display = 'block';
    } else {
        imgEl.style.display = 'none';
    }

    // Position tooltip near cursor
    tooltip.style.display = 'block';
    tooltip.style.left    = `${Math.min(x + 16, window.innerWidth - 260)}px`;
    tooltip.style.top     = `${Math.min(y - 10, window.innerHeight - 200)}px`;
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
function getLocalKey(key)       { return `scripvia_doc_${key}`; }

function saveToLocalStorage() {
    if (!currentDocId || !quill) return;
    try {
        localStorage.setItem(getLocalKey(`${currentDocType}_${currentDocId}`), JSON.stringify({
            title:   docTitleInput.value,
            content: quill.root.innerHTML,
            savedAt: Date.now()
        }));
    } catch(e) {}
}

function loadFromLocalStorage(key) {
    try {
        const raw = localStorage.getItem(getLocalKey(key));
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

function clearLocalStorage(key) {
    try { localStorage.removeItem(getLocalKey(key)); } catch(e) {}
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
            docTitleInput.value  = backup.title || '';
            setSaveStatus('unsaved');
            return true;
        } else { clearLocalStorage(key); }
    }
    return false;
}

function formatTimeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60)   return `${d}s ago`;
    if (d < 3600) return `${Math.floor(d/60)}m ago`;
    return `${Math.floor(d/3600)}h ago`;
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
    if (autoSaveTimer)  { clearInterval(autoSaveTimer);  autoSaveTimer  = null; }
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
        try { await saveDocument(); pendingSync = false; } catch(e) {}
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
}

function hideEditor() {
    stopAutoSave();
    welcomeScreen.classList.remove('hidden');
    editorWrapper.classList.remove('visible');
    docTitleInput.value    = '';
    docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
    if (wordCountEl)     wordCountEl.textContent     = '0 words';
    if (charCountEl)     charCountEl.textContent     = '0 chars';
    if (readTimeEl)      readTimeEl.textContent      = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
}

function setSaveStatus(status) {
    const map = { saved:'✓ Saved', saving:'Saving...', syncing:'↑ Syncing...', synced:'✓ Synced', unsaved:'● Unsaved', error:'✗ Error', '':'' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className   = 'save-status ' + status;
}

function enableHeaderBtns(on) {
    saveBtn.disabled       = !on;
    exportPdfBtn.disabled  = !on;
    exportDocxBtn.disabled = !on;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =============================================
// MODALS
// =============================================
function openModal(modal)  { modal.classList.add('active'); }
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
    document.getElementById('themeIcon').textContent  = isDark ? '🌙' : '☀️';
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
        const data       = await api('GET', '/auth/me');
        const loginBtn   = document.getElementById('loginBtn');
        const userInfo   = document.getElementById('userInfo');
        const userAvatar = document.getElementById('userAvatar');
        const userName   = document.getElementById('userName');

        if (data.logged_in) {
            loginBtn.style.display = 'none';
            userInfo.classList.remove('hidden');
            userAvatar.src       = data.user.picture;
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
    } catch(e) { console.error('checkAuthState:', e); }
}

function showGuestUser(name) {
    const loginBtn  = document.getElementById('loginBtn');
    const userInfo  = document.getElementById('userInfo');
    const userName  = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    if (loginBtn)   loginBtn.style.display = 'none';
    if (userInfo)   userInfo.classList.remove('hidden');
    if (userName)   userName.textContent = name + ' (guest)';
    if (userAvatar) userAvatar.style.display = 'none';
}

// =============================================
// EVENT LISTENERS
// =============================================
document.getElementById('newProjectBtn').addEventListener('click', () => openModal(newProjectModal));
document.getElementById('cancelProjectBtn').addEventListener('click',  () => closeModal(newProjectModal));
document.getElementById('cancelProjectBtn2').addEventListener('click', () => closeModal(newProjectModal));
document.getElementById('confirmProjectBtn').addEventListener('click', createProject);
projectTitleInput.addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });

document.getElementById('newDocBtn').addEventListener('click',   () => openModal(newDocModal));
document.getElementById('cancelDocBtn').addEventListener('click',  () => closeModal(newDocModal));
document.getElementById('cancelDocBtnX').addEventListener('click', () => closeModal(newDocModal));
document.getElementById('confirmDocBtn').addEventListener('click', createDocument);
docTitleModalInput.addEventListener('keydown', e => { if (e.key === 'Enter') createDocument(); });

document.getElementById('newCharBtn').addEventListener('click',    () => openModal(newCharModal));
document.getElementById('cancelCharBtn').addEventListener('click',  () => closeModal(newCharModal));
document.getElementById('cancelCharBtnX').addEventListener('click', () => closeModal(newCharModal));
document.getElementById('confirmCharBtn').addEventListener('click', createCharacter);

document.getElementById('newSceneBtn').addEventListener('click',    () => openModal(newSceneModal));
document.getElementById('cancelSceneBtn').addEventListener('click',  () => closeModal(newSceneModal));
document.getElementById('cancelSceneBtnX').addEventListener('click', () => closeModal(newSceneModal));
document.getElementById('confirmSceneBtn').addEventListener('click', createScene);

document.getElementById('newLoreBtn').addEventListener('click',    () => openModal(newLoreModal));
document.getElementById('cancelLoreBtn').addEventListener('click',  () => closeModal(newLoreModal));
document.getElementById('cancelLoreBtnX').addEventListener('click', () => closeModal(newLoreModal));
document.getElementById('confirmLoreBtn').addEventListener('click', createLore);

saveBtn.addEventListener('click', saveDocument);

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const guest = localStorage.getItem('scripvia_guest');

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