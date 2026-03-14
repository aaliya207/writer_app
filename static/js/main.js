// Scripvia — Main Frontend Logic v0.2

// --- STATE ---
let currentProjectId   = null;
let currentProjectData = null;
let currentDocId       = null;
let currentDocType     = 'chapter';
let quill              = null;
let autoSaveTimer      = null;
let countdownTimer     = null;
let secondsUntilSave   = 30;
let pendingSync        = false;
let openTabs           = [];
let wikiData           = {};

// --- DOM REFS ---
const projectsList      = document.getElementById('projectsList');
const documentsList     = document.getElementById('documentsList');
const charactersList    = document.getElementById('charactersList');
const scenesList        = document.getElementById('scenesList');
const loreList          = document.getElementById('loreList');
const relationshipsList = document.getElementById('relationshipsList');
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
const newProjectModal   = document.getElementById('newProjectModal');
const newDocModal       = document.getElementById('newDocModal');
const newCharModal      = document.getElementById('newCharModal');
const newSceneModal     = document.getElementById('newSceneModal');
const newLoreModal      = document.getElementById('newLoreModal');
const newRelModal       = document.getElementById('newRelModal');
const projectTitleInput  = document.getElementById('projectTitleInput');
const projectDescInput   = document.getElementById('projectDescInput');
const projectGenreInput  = document.getElementById('projectGenreInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

const CREATIVE_GENRES = ['fantasy','sci-fi','fiction','romance','mystery','thriller','horror','historical'];

// --- IMAGE UPLOAD ---
function setupImageUpload(fileInputId, urlInputId, previewWrapId, previewImgId, clearBtnId) {
    const fileInput  = document.getElementById(fileInputId);
    const urlInput   = document.getElementById(urlInputId);
    const previewWrap = document.getElementById(previewWrapId);
    const previewImg  = document.getElementById(previewImgId);
    const clearBtn    = document.getElementById(clearBtnId);

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            urlInput.value = previewImg.src = e.target.result;
            previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

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

    clearBtn.addEventListener('click', () => {
        urlInput.value = fileInput.value = previewImg.src = '';
        previewWrap.style.display = 'none';
    });
}

// --- CONFIRM DIALOG ---
function showConfirm(message, onConfirm, title = 'Are you sure?') {
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
        </div>`;
    document.body.appendChild(overlay);
    document.getElementById('confirmOkBtn').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    document.getElementById('confirmCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// --- QUILL ---
function initQuill() {
    quill = new Quill('#quillEditor', {
        theme: 'snow',
        placeholder: 'Start writing...',
        modules: {
            toolbar: [
                [{ header: [1,2,3,false] }],
                ['bold','italic','underline','strike'],
                [{ color:[] },{ background:[] }],
                [{ list:'ordered' },{ list:'bullet' }],
                ['blockquote','code-block'],
                [{ align:[] }],
                [{ indent:'-1' },{ indent:'+1' }],
                ['link'],['clean']
            ]
        }
    });

    quill.on('text-change', () => {
        setSaveStatus('unsaved');
        saveToLocalStorage();
        resetCountdown();
        updateStats();
    });

    let wikiHoverTimer = null;
    quill.root.addEventListener('mousemove', (e) => {
        clearTimeout(wikiHoverTimer);
        wikiHoverTimer = setTimeout(() => handleWikiHover(e), 400);
    });
    quill.root.addEventListener('mouseleave', () => {
        clearTimeout(wikiHoverTimer);
        setTimeout(() => { if (!wikiTooltip.matches(':hover')) hideWikiTooltip(); }, 200);
    });
    wikiTooltip.addEventListener('mouseleave', hideWikiTooltip);
}

// --- API ---
async function api(method, url, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
}

// --- PROJECTS ---
async function loadProjects() {
    try { renderProjects(await api('GET', '/api/projects')); }
    catch(e) { console.error('loadProjects:', e); }
}

function renderProjects(projects) {
    if (!projects.length) {
        projectsList.innerHTML = '<li class="empty-state">No projects yet.<br>Create one to begin.</li>';
        return;
    }
    projectsList.innerHTML = projects.map(p => `
        <li class="project-item ${p.id === currentProjectId ? 'active' : ''}" onclick="selectProject(${p.id})">
            <span class="item-name">${escapeHtml(p.title)}</span>
            <span class="item-meta">${genreEmoji(p.genre)}</span>
            <button class="item-delete" onclick="deleteProject(event,${p.id})">×</button>
        </li>`).join('');
}

function genreEmoji(genre) {
    const map = { fantasy:'⚔️','sci-fi':'🚀',fiction:'📖',romance:'💕',mystery:'🔍',thriller:'⚡',horror:'🕯️',historical:'🏛️',journal:'📓',screenplay:'🎬',poetry:'✨',general:'📝',other:'📌' };
    return map[genre] || '📝';
}

async function createProject() {
    const title = projectTitleInput.value.trim();
    if (!title) { projectTitleInput.focus(); return; }
    const btn = document.getElementById('confirmProjectBtn');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const p = await api('POST', '/api/projects', { title, genre: projectGenreInput.value, description: projectDescInput.value.trim() });
        closeModal(newProjectModal);
        projectTitleInput.value = projectDescInput.value = '';
        projectGenreInput.value = 'general';
        await loadProjects();
        selectProject(p.id);
    } catch(e) { console.error('createProject:', e); }
    finally { btn.textContent = 'Create Project'; btn.disabled = false; }
}

async function deleteProject(event, id) {
    event.stopPropagation();
    showConfirm('This will permanently delete the project and all its content.', async () => {
        try {
            await api('DELETE', `/api/projects/${id}`);
            if (currentProjectId === id) { currentProjectId = currentProjectData = null; showProjectList(); hideEditor(); }
            await loadProjects();
        } catch(e) { console.error('deleteProject:', e); }
    }, 'Delete Project?');
}

async function selectProject(id) {
    try {
        currentProjectId = id;
        const projects = await api('GET', '/api/projects');
        currentProjectData = projects.find(p => p.id === id);
        showProjectDetail();
        currentProjectName.textContent = currentProjectData.title;
        await showProjectOverview(id);
        const isCreative = CREATIVE_GENRES.includes(currentProjectData.genre);
        ['tabCharacters','tabScenes','tabLore','tabRelationships'].forEach(tid =>
            document.getElementById(tid).classList.toggle('hidden', !isCreative));
        switchTab('chapters');
        await loadDocuments(id);
        if (isCreative) await loadWikiData(id);
        closeNotesPanel();
    } catch(e) { console.error('selectProject:', e); }
}

function showProjectList()   { projectsSection.style.display = 'block'; projectDetail.style.display = 'none'; }
function showProjectDetail() { projectsSection.style.display = 'none';  projectDetail.style.display = 'flex'; }

// --- PROJECT OVERVIEW ---
async function showProjectOverview(projectId) {
    try {
        const stats = await api('GET', `/api/projects/${projectId}/stats`);
        const genreEmojis = { fantasy:'⚔️ Fantasy','sci-fi':'🚀 Sci-Fi',fiction:'📖 Fiction',romance:'💕 Romance',mystery:'🔍 Mystery',thriller:'⚡ Thriller',horror:'🕯️ Horror',historical:'🏛️ Historical',journal:'📓 Journal',screenplay:'🎬 Screenplay',poetry:'✨ Poetry',general:'📝 General',other:'📌 Other' };

        document.getElementById('overviewGenre').textContent    = genreEmojis[stats.genre] || '📝 General';
        document.getElementById('overviewTitle').textContent    = stats.title;
        document.getElementById('overviewDesc').textContent     = stats.description || 'No description yet.';
        document.getElementById('ovWords').textContent          = stats.total_words.toLocaleString();
        document.getElementById('ovChapters').textContent       = stats.chapter_count;
        document.getElementById('ovCharacters').textContent     = stats.character_count;
        document.getElementById('ovScenes').textContent         = stats.scene_count;
        document.getElementById('ovLore').textContent           = stats.lore_count;
        document.getElementById('ovLastEdited').textContent     = stats.last_edited ? `✎ Last edited ${formatDateNice(stats.last_edited)}` : '';
        document.getElementById('ovCreated').textContent        = stats.created_at  ? `✦ Created ${formatDateNice(stats.created_at)}` : '';

        const isCreative = stats.is_creative;
        ['ovCharBtn','ovSceneBtn','ovLoreBtn','ovRelBtn'].forEach(id =>
            document.getElementById(id).style.display = isCreative ? 'block' : 'none');
        ['ovCharStat','ovSceneStat','ovLoreStat'].forEach(id =>
            document.getElementById(id).style.display = isCreative ? 'flex' : 'none');

        document.getElementById('projectOverview').style.display = 'flex';
        document.getElementById('backToOverview').style.display  = 'block';
        welcomeScreen.classList.add('hidden');
        document.getElementById('editorHeader').style.display = 'none';
    } catch(e) { console.error('showProjectOverview:', e); }
}

function hideOverview() { document.getElementById('projectOverview').style.display = 'none'; }

function exportProject(format) {
    if (!currentProjectId) return;
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Preparing...'; btn.disabled = true;
    const a = document.createElement('a');
    a.href = `/api/projects/${currentProjectId}/export/${format}`;
    a.download = '';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
}

function overviewGoTo(tab) {
    if (tab === 'chapters') {
        hideOverview();
        switchTab('chapters');
        const firstDoc = document.querySelector('#documentsList .item-list-entry');
        if (firstDoc) firstDoc.click();
    } else {
        switchTab(tab);
        document.getElementById(`tab-${tab}`).scrollIntoView({ behavior: 'smooth' });
    }
}

function formatDateNice(dateInput) {
    const date = typeof dateInput === 'string'
        ? new Date(dateInput.endsWith('Z') ? dateInput : dateInput + 'Z')
        : dateInput;
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return date.toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' });
}

// --- TABS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
    if (tabName === 'chapters')       loadDocuments(currentProjectId);
    if (tabName === 'characters')     loadCharacters(currentProjectId);
    if (tabName === 'scenes')         loadScenes(currentProjectId);
    if (tabName === 'lore')           loadLore(currentProjectId);
    if (tabName === 'relationships')  loadRelationships(currentProjectId);
}

document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

document.getElementById('backToProjects').addEventListener('click', () => {
    currentProjectId = currentProjectData = null;
    hideOverview(); hideEditor(); showProjectList(); loadProjects();
    document.getElementById('backToOverview').style.display = 'none';
});

// --- DOCUMENTS ---
async function loadDocuments(projectId) {
    try { renderDocuments(await api('GET', `/api/projects/${projectId}/documents`)); }
    catch(e) { console.error('loadDocuments:', e); }
}

function renderDocuments(docs) {
    if (!docs.length) { documentsList.innerHTML = '<li class="empty-state">No chapters yet.</li>'; return; }
    documentsList.innerHTML = docs.map((d, i) => `
        <li class="item-list-entry ${d.id === currentDocId ? 'active' : ''}"
            draggable="true" data-id="${d.id}" data-index="${i}"
            onclick="openDocument(${d.id})"
            ondragstart="onDragStart(event)" ondragover="onDragOver(event)"
            ondragend="onDragEnd(event)" ondrop="onDrop(event)">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <span class="item-name">${escapeHtml(d.title)}</span>
            <button class="item-delete" onclick="deleteDocument(event,${d.id})">×</button>
        </li>`).join('');
}

// --- DRAG & DROP ---
let dragSrcEl = null;

function onDragStart(e) {
    dragSrcEl = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcEl.dataset.id);
    setTimeout(() => dragSrcEl.classList.add('dragging'), 0);
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.currentTarget;
    if (target === dragSrcEl) return;
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
    const midY = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
}

function onDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target === dragSrcEl) return;
    const items    = [...document.querySelectorAll('#documentsList .item-list-entry')];
    const srcIdx   = items.indexOf(dragSrcEl);
    const tgtIdx   = items.indexOf(target);
    const reordered = [...items];
    reordered.splice(srcIdx, 1);
    const midY = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    const insertAt = e.clientY < midY ? tgtIdx : tgtIdx + 1;
    reordered.splice(insertAt > srcIdx ? insertAt - 1 : insertAt, 0, dragSrcEl);
    saveChapterOrder(reordered.map(el => parseInt(el.dataset.id)));
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top','drag-over-bottom','dragging'));
}

function onDragEnd() {
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top','drag-over-bottom','dragging'));
}

async function saveChapterOrder(newOrder) {
    try {
        await api('POST', `/api/projects/${currentProjectId}/documents/reorder`, { order: newOrder });
        await loadDocuments(currentProjectId);
    } catch(e) { console.error('saveChapterOrder:', e); }
}

async function createDocument() {
    const title = docTitleModalInput.value.trim();
    if (!title || !currentProjectId) { docTitleModalInput.focus(); return; }
    const btn = document.getElementById('confirmDocBtn');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const doc = await api('POST', `/api/projects/${currentProjectId}/documents`, { title });
        closeModal(newDocModal);
        docTitleModalInput.value = '';
        if (currentProjectId) await loadDocuments(currentProjectId);
        openDocument(doc.id);
    } catch(e) { console.error('createDocument:', e); }
    finally { btn.textContent = 'Create'; btn.disabled = false; }
}

async function openDocument(id, type = 'chapter') {
    try {
        const doc = await api('GET', type === 'scene' ? `/api/scenes/${id}` : `/api/documents/${id}`);
        currentDocId = id; currentDocType = type;
        docTitleInput.value = doc.title; docTitleInput.disabled = false;
        quill.root.innerHTML = doc.content || '';
        quill.history.clear();
        showEditor(); enableHeaderBtns(true);
        if (!checkLocalStorageRestore(`${type}_${id}`, doc.content || '')) setSaveStatus('saved');
        updateStats(); startAutoSave(); addOpenTab(id, doc.title, type);
        if (type === 'chapter' && currentProjectId) await loadDocuments(currentProjectId);
        if (type === 'scene'   && currentProjectId) await loadScenes(currentProjectId);
    } catch(e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');
    try {
        await api('PUT', currentDocType === 'scene' ? `/api/scenes/${currentDocId}` : `/api/documents/${currentDocId}`, {
            title: docTitleInput.value.trim() || 'Untitled',
            content: quill.root.innerHTML
        });
        updateTabTitle(currentDocId, docTitleInput.value.trim());
        clearLocalStorage(`${currentDocType}_${currentDocId}`);
        updateLastSaved();
        if (currentDocType === 'chapter') await loadDocuments(currentProjectId);
        if (currentDocType === 'scene')   await loadScenes(currentProjectId);
        if (navigator.onLine && currentDocType === 'chapter') {
            setSaveStatus('syncing');
            try { await api('POST', `/api/documents/${currentDocId}/sync`); setSaveStatus('synced'); setTimeout(() => setSaveStatus('saved'), 2000); }
            catch(e) { setSaveStatus('saved'); }
        } else {
            setSaveStatus('saved');
            if (!navigator.onLine) pendingSync = true;
        }
    } catch(e) { setSaveStatus('error'); console.error('saveDocument:', e); }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    showConfirm('This chapter will be permanently deleted.', async () => {
        try {
            await api('DELETE', `/api/documents/${id}`);
            if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
            removeOpenTab(id); await loadDocuments(currentProjectId);
        } catch(e) { console.error('deleteDocument:', e); }
    }, 'Delete Chapter?');
}

// --- CHARACTERS ---
async function loadCharacters(projectId) {
    try { renderCharacters(await api('GET', `/api/projects/${projectId}/characters`)); }
    catch(e) { console.error('loadCharacters:', e); }
}

function renderCharacters(chars) {
    if (!chars.length) { charactersList.innerHTML = '<li class="empty-state">No characters yet.</li>'; return; }
    charactersList.innerHTML = chars.map(c => `
        <li class="item-list-entry" onclick="openEditCharModal(${c.id})">
            <span class="item-name">${escapeHtml(c.name)}</span>
            ${c.role ? `<span class="item-badge">${escapeHtml(c.role)}</span>` : ''}
            <button class="item-delete" onclick="deleteCharacter(event,${c.id})">×</button>
        </li>`).join('');
}

async function createCharacter() {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('charNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/characters`, {
            name, role: document.getElementById('charRoleInput').value,
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim()
        });
        closeModal(newCharModal);
        ['charNameInput','charAgeInput','charAppearanceInput','charPersonalityInput','charBackstoryInput','charImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('charRoleInput').value = '';
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch(e) { console.error('createCharacter:', e); }
}

async function deleteCharacter(event, id) {
    event.stopPropagation();
    showConfirm('This character will be permanently deleted.', async () => {
        try { await api('DELETE', `/api/characters/${id}`); await loadCharacters(currentProjectId); await loadWikiData(currentProjectId); }
        catch(e) { console.error('deleteCharacter:', e); }
    }, 'Delete Character?');
}

async function openEditCharModal(id) {
    try {
        const c = await api('GET', `/api/characters/${id}`);
        document.getElementById('charNameInput').value        = c.name        || '';
        document.getElementById('charRoleInput').value        = c.role        || '';
        document.getElementById('charAgeInput').value         = c.age         || '';
        document.getElementById('charAppearanceInput').value  = c.appearance  || '';
        document.getElementById('charPersonalityInput').value = c.personality || '';
        document.getElementById('charBackstoryInput').value   = c.backstory   || '';
        document.getElementById('charImageInput').value       = c.image_url   || '';
        const preview = document.getElementById('charImgPreview');
        if (c.image_url) { document.getElementById('charImgPreviewEl').src = c.image_url; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
        document.querySelector('#newCharModal .modal-title').textContent = 'Edit Character';
        const btn = document.getElementById('confirmCharBtn');
        btn.textContent = 'Save Changes'; btn.dataset.editId = id; btn.dataset.mode = 'edit';
        openModal(newCharModal);
    } catch(e) { console.error('openEditCharModal:', e); }
}

async function saveEditChar(id) {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name) { document.getElementById('charNameInput').focus(); return; }
    const btn = document.getElementById('confirmCharBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/characters/${id}`, {
            name, role: document.getElementById('charRoleInput').value,
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim()
        });
        closeModal(newCharModal); resetCharModal();
        await loadCharacters(currentProjectId); await loadWikiData(currentProjectId);
    } catch(e) { console.error('saveEditChar:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}

function resetCharModal() {
    document.querySelector('#newCharModal .modal-title').textContent = 'New Character';
    const btn = document.getElementById('confirmCharBtn');
    btn.textContent = 'Create Character'; delete btn.dataset.editId; delete btn.dataset.mode;
    ['charNameInput','charAgeInput','charAppearanceInput','charPersonalityInput','charBackstoryInput','charImageInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('charRoleInput').value = '';
    document.getElementById('charImgPreview').style.display = 'none';
    document.getElementById('charImgPreviewEl').src = '';
    document.getElementById('charImageFile').value = '';
}

// --- SCENES ---
async function loadScenes(projectId) {
    try { renderScenes(await api('GET', `/api/projects/${projectId}/scenes`)); }
    catch(e) { console.error('loadScenes:', e); }
}

function renderScenes(scenes) {
    const moodEmoji = { tense:'⚡',romantic:'💕',mysterious:'🌫️',action:'🔥',sad:'💧',hopeful:'🌅',dark:'🌑',comedic:'😄' };
    if (!scenes.length) { scenesList.innerHTML = '<li class="empty-state">No scenes yet.</li>'; return; }
    scenesList.innerHTML = scenes.map(s => `
        <li class="item-list-entry ${s.id === currentDocId && currentDocType === 'scene' ? 'active' : ''}" onclick="openDocument(${s.id},'scene')">
            <span class="item-name">${escapeHtml(s.title)}</span>
            ${s.mood ? `<span class="item-badge">${moodEmoji[s.mood]||''} ${s.mood}</span>` : ''}
            <button class="item-delete" onclick="deleteScene(event,${s.id})">×</button>
        </li>`).join('');
}

async function createScene() {
    const title = document.getElementById('sceneTitleInput').value.trim();
    if (!title || !currentProjectId) { document.getElementById('sceneTitleInput').focus(); return; }
    try {
        const scene = await api('POST', `/api/projects/${currentProjectId}/scenes`, { title, mood: document.getElementById('sceneMoodInput').value });
        closeModal(newSceneModal);
        document.getElementById('sceneTitleInput').value = document.getElementById('sceneMoodInput').value = '';
        await loadScenes(currentProjectId); openDocument(scene.id, 'scene');
    } catch(e) { console.error('createScene:', e); }
}

async function deleteScene(event, id) {
    event.stopPropagation();
    showConfirm('This scene will be permanently deleted.', async () => {
        try {
            await api('DELETE', `/api/scenes/${id}`);
            if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
            removeOpenTab(id); await loadScenes(currentProjectId);
        } catch(e) { console.error('deleteScene:', e); }
    }, 'Delete Scene?');
}

// --- LORE ---
async function loadLore(projectId) {
    try { renderLore(await api('GET', `/api/projects/${projectId}/lore`)); }
    catch(e) { console.error('loadLore:', e); }
}

function renderLore(items) {
    const catEmoji = { item:'⚔️',place:'🗺️',organization:'🏛️',concept:'✨',creature:'🐉',event:'📅',other:'📌' };
    if (!items.length) { loreList.innerHTML = '<li class="empty-state">No lore entries yet.</li>'; return; }
    loreList.innerHTML = items.map(i => `
        <li class="item-list-entry" onclick="openEditLoreModal(${i.id})">
            <span class="item-name">${escapeHtml(i.name)}</span>
            <span class="item-badge">${catEmoji[i.category]||'📌'}</span>
            <button class="item-delete" onclick="deleteLore(event,${i.id})">×</button>
        </li>`).join('');
}

async function createLore() {
    const name = document.getElementById('loreNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('loreNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/lore`, {
            name, category: document.getElementById('loreCategoryInput').value,
            description: document.getElementById('loreDescInput').value.trim(),
            image_url: document.getElementById('loreImageInput').value.trim()
        });
        closeModal(newLoreModal);
        ['loreNameInput','loreDescInput','loreImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('loreCategoryInput').value = 'item';
        await loadLore(currentProjectId); await loadWikiData(currentProjectId);
    } catch(e) { console.error('createLore:', e); }
}

async function deleteLore(event, id) {
    event.stopPropagation();
    showConfirm('This lore entry will be permanently deleted.', async () => {
        try { await api('DELETE', `/api/lore/${id}`); await loadLore(currentProjectId); await loadWikiData(currentProjectId); }
        catch(e) { console.error('deleteLore:', e); }
    }, 'Delete Lore Entry?');
}

async function openEditLoreModal(id) {
    try {
        const item = await api('GET', `/api/lore/${id}`);
        document.getElementById('loreNameInput').value     = item.name        || '';
        document.getElementById('loreCategoryInput').value = item.category    || 'item';
        document.getElementById('loreDescInput').value     = item.description || '';
        document.getElementById('loreImageInput').value    = item.image_url   || '';
        const preview = document.getElementById('loreImgPreview');
        if (item.image_url) { document.getElementById('loreImgPreviewEl').src = item.image_url; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
        document.querySelector('#newLoreModal .modal-title').textContent = 'Edit Lore Entry';
        const btn = document.getElementById('confirmLoreBtn');
        btn.textContent = 'Save Changes'; btn.dataset.editId = id; btn.dataset.mode = 'edit';
        openModal(newLoreModal);
    } catch(e) { console.error('openEditLoreModal:', e); }
}

async function saveEditLore(id) {
    const name = document.getElementById('loreNameInput').value.trim();
    if (!name) { document.getElementById('loreNameInput').focus(); return; }
    const btn = document.getElementById('confirmLoreBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/lore/${id}`, {
            name, category: document.getElementById('loreCategoryInput').value,
            description: document.getElementById('loreDescInput').value.trim(),
            image_url: document.getElementById('loreImageInput').value.trim()
        });
        closeModal(newLoreModal);
        await loadLore(currentProjectId); await loadWikiData(currentProjectId);
    } catch(e) { console.error('saveEditLore:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; resetLoreModal(); }
}

function resetLoreModal() {
    document.querySelector('#newLoreModal .modal-title').textContent = 'New Lore Entry';
    const btn = document.getElementById('confirmLoreBtn');
    btn.textContent = 'Create Entry'; delete btn.dataset.editId; delete btn.dataset.mode;
    ['loreNameInput','loreDescInput','loreImageInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('loreCategoryInput').value = 'item';
    document.getElementById('loreImgPreview').style.display = 'none';
    document.getElementById('loreImgPreviewEl').src = '';
    document.getElementById('loreImageFile').value = '';
}

// --- WIKI TOOLTIPS ---
async function loadWikiData(projectId) {
    try { wikiData = await api('GET', `/api/projects/${projectId}/wiki`); }
    catch(e) { console.error('loadWikiData:', e); }
}

function handleWikiHover(e) {
    if (!wikiData || !Object.keys(wikiData).length) return;
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
    } catch(e) { return; }

    const hoveredWord = range.toString().trim().toLowerCase();
    if (!hoveredWord || hoveredWord.length < 2) { hideWikiTooltip(); return; }

    const paraText  = range.startContainer.textContent || '';
    const sortedKeys = Object.keys(wikiData).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
        const keyWordList = key.split(' ').map(w => w.toLowerCase());
        if (keyWordList.includes(hoveredWord) || hoveredWord === key) {
            if (new RegExp(`\\b${escapeRegex(key)}\\b`, 'i').test(paraText)) {
                showWikiTooltip(wikiData[key], e.clientX, e.clientY);
                return;
            }
        }
    }
    hideWikiTooltip();
}

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function showWikiTooltip(entry, x, y) {
    const imgEl      = document.getElementById('wikiTooltipImgEl');
    const imgWrap    = document.getElementById('wikiCardImgWrap');
    const placeholder = document.getElementById('wikiCardPlaceholder');
    const nameEl     = document.getElementById('wikiTooltipName');
    const typeEl     = document.getElementById('wikiTooltipType');
    const bodyEl     = document.getElementById('wikiCardBody');

    nameEl.textContent = entry.name;
    if (entry.type === 'character') {
        const parts = [];
        if (entry.role) parts.push(entry.role);
        if (entry.age)  parts.push(`Age ${entry.age}`);
        typeEl.textContent = parts.join(' · ') || 'Character';
    } else {
        typeEl.textContent = entry.category || 'Lore';
    }

    if (entry.image_url) {
        imgEl.src = entry.image_url; imgEl.style.display = 'block';
        imgWrap.style.display = 'block'; placeholder.style.display = 'none';
        imgEl.onerror = () => { imgWrap.style.display = 'none'; };
    } else {
        imgWrap.style.display = 'none';
    }

    let bodyHtml = '';
    if (entry.type === 'character') {
        if (entry.summary)    bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Personality</div><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`;
        if (entry.backstory)  bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Backstory</div><div class="wiki-card-field-value">${escapeHtml(entry.backstory)}</div></div>`;
        if (entry.appearance) bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(entry.appearance)}</div></div>`;
    } else if (entry.summary) {
        bodyHtml = `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`;
    }
    bodyEl.innerHTML = bodyHtml || `<div class="wiki-card-field-value" style="color:var(--text-muted);font-style:italic;">No details added yet.</div>`;

    const cW = 340, cH = 400;
    let left = x + 20, top = y - 60;
    if (left + cW > window.innerWidth  - 20) left = x - cW - 20;
    if (top  + cH > window.innerHeight - 20) top  = window.innerHeight - cH - 20;
    if (top < 10) top = 10;
    wikiTooltip.style.left = `${left}px`;
    wikiTooltip.style.top  = `${top}px`;
    wikiTooltip.style.display = 'block';
}

function hideWikiTooltip() { wikiTooltip.style.display = 'none'; }

// --- NOTES PANEL ---
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
        await api('PUT', `/api/projects/${currentProjectId}/notes`, { content: document.getElementById('notesTextarea').value });
        setNotesSaveStatus('Saved ✓');
        setTimeout(() => setNotesSaveStatus(''), 2000);
    } catch(e) { setNotesSaveStatus('Error'); console.error('saveNotes:', e); }
}

function setNotesSaveStatus(msg) { const el = document.getElementById('notesSaveStatus'); if (el) el.textContent = msg; }

function toggleNotesPanel() {
    notesPanelOpen = !notesPanelOpen;
    document.getElementById('notesPanel').classList.toggle('open', notesPanelOpen);
    document.getElementById('editorArea').classList.toggle('notes-open', notesPanelOpen);
    if (notesPanelOpen && currentProjectId) loadNotes(currentProjectId);
}

function closeNotesPanel() {
    notesPanelOpen = false;
    document.getElementById('notesPanel').classList.remove('open');
    document.getElementById('editorArea').classList.remove('notes-open');
}

document.getElementById('notesTextarea').addEventListener('input', () => {
    setNotesSaveStatus('Unsaved...');
    clearTimeout(notesAutoSaveTimer);
    notesAutoSaveTimer = setTimeout(saveNotes, 1500);
});

// --- FOCUS MODE ---
let isFocusMode = false, cursorHideTimer = null, hintHideTimer = null;

function enterFocusMode() {
    isFocusMode = true;
    document.body.classList.add('focus-mode');
    closeNotesPanel();
    const hint = document.getElementById('focusExitHint');
    hint.classList.add('visible');
    clearTimeout(hintHideTimer);
    hintHideTimer = setTimeout(() => hint.classList.remove('visible'), 3000);
    updateFocusWordCount(); startCursorHide();
    document.getElementById('focusModeBtn').textContent = '⛶ Exit Focus';
}

function exitFocusMode() {
    isFocusMode = false;
    document.body.classList.remove('focus-mode', 'hide-cursor');
    clearTimeout(cursorHideTimer);
    document.getElementById('focusExitHint').classList.remove('visible');
    document.getElementById('focusModeBtn').textContent = '⛶ Focus';
}

function toggleFocusMode() { isFocusMode ? exitFocusMode() : enterFocusMode(); }

function updateFocusWordCount() {
    if (!quill) return;
    const words = quill.getText().trim().split(/\s+/).filter(w => w.length > 0).length;
    const el = document.getElementById('focusWordCount');
    if (el) el.textContent = `${words.toLocaleString()} words`;
}

function startCursorHide() {
    clearTimeout(cursorHideTimer);
    document.body.classList.remove('hide-cursor');
    cursorHideTimer = setTimeout(() => { if (isFocusMode) document.body.classList.add('hide-cursor'); }, 3000);
}

document.addEventListener('mousemove', () => {
    if (!isFocusMode) return;
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorHideTimer);
    cursorHideTimer = setTimeout(() => { if (isFocusMode) document.body.classList.add('hide-cursor'); }, 3000);
});

// --- SEARCH ---
let searchSelectedIndex = -1, searchResults = [], searchTimer = null;

function openSearch() {
    if (!currentProjectId) return;
    document.getElementById('searchOverlay').classList.add('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = `<div class="search-empty">Start typing to search across your project...</div>`;
    searchSelectedIndex = -1; searchResults = [];
    setTimeout(() => document.getElementById('searchInput').focus(), 50);
}

function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('active');
    searchSelectedIndex = -1;
}

async function performSearch(query) {
    if (!query || query.length < 2) {
        document.getElementById('searchResults').innerHTML = `<div class="search-empty">Start typing to search across your project...</div>`;
        searchResults = []; return;
    }
    try {
        searchResults = await api('GET', `/api/projects/${currentProjectId}/search?q=${encodeURIComponent(query)}`);
        renderSearchResults(query);
    } catch(e) { console.error('search:', e); }
}

function renderSearchResults(query) {
    const container = document.getElementById('searchResults');
    if (!searchResults.length) {
        container.innerHTML = `<div class="search-empty">No results for "<strong>${escapeHtml(query)}</strong>"</div>`;
        return;
    }
    const groups = { chapter:[], scene:[], character:[], lore:[] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });
    const labels = { chapter:'📄 Chapters', scene:'⚡ Scenes', character:'👤 Characters', lore:'📖 Lore' };
    let html = '', idx = 0;
    for (const [type, items] of Object.entries(groups)) {
        if (!items.length) continue;
        html += `<div class="search-group-label">${labels[type]}</div>`;
        items.forEach(item => {
            html += `<div class="search-result-item" onclick="openSearchResult(${idx})">
                <div class="search-result-icon">${item.icon}</div>
                <div class="search-result-body">
                    <div class="search-result-title">${highlightMatch(escapeHtml(item.title), query)}</div>
                    ${item.snippet ? `<div class="search-result-snippet">${highlightMatch(escapeHtml(item.snippet), query)}</div>` : ''}
                </div>
                <div class="search-result-type">${type}</div>
            </div>`;
            idx++;
        });
    }
    container.innerHTML = html;
    searchSelectedIndex = -1;
}

function highlightMatch(text, query) {
    if (!query) return text;
    return text.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
}

function openSearchResult(idx) {
    const flat = [];
    const groups = { chapter:[], scene:[], character:[], lore:[] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });
    Object.values(groups).forEach(items => items.forEach(i => flat.push(i)));
    const result = flat[idx];
    if (!result) return;
    closeSearch();
    if      (result.type === 'chapter')   { switchTab('chapters');   openDocument(result.id, 'chapter'); }
    else if (result.type === 'scene')     { switchTab('scenes');     openDocument(result.id, 'scene'); }
    else if (result.type === 'character') { switchTab('characters'); openEditCharModal(result.id); }
    else if (result.type === 'lore')      { switchTab('lore');       openEditLoreModal(result.id); }
}

function navigateSearch(direction) {
    const items = document.querySelectorAll('.search-result-item');
    if (!items.length) return;
    items[searchSelectedIndex]?.classList.remove('selected');
    searchSelectedIndex = (searchSelectedIndex + direction + items.length) % items.length;
    items[searchSelectedIndex]?.classList.add('selected');
    items[searchSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => performSearch(e.target.value.trim()), 250);
});
document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateSearch(1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); navigateSearch(-1); }
    if (e.key === 'Enter') { openSearchResult(searchSelectedIndex >= 0 ? searchSelectedIndex : 0); }
    if (e.key === 'Escape') closeSearch();
});
document.getElementById('searchOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('searchOverlay')) closeSearch();
});

// --- CHARACTER RELATIONSHIPS ---
let relSelectedColor = '#7b6fb0';
let relNodes = [], relEdges = [];
let relDragging = null, relDragOffX = 0, relDragOffY = 0;
let relZoom = 1, relPanX = 0, relPanY = 0;
let relIsPanning = false, relPanStart = { x:0, y:0 };
let relCanvas = null, relCtx = null;

async function loadRelationships(projectId) {
    try { renderRelationshipsList(await api('GET', `/api/projects/${projectId}/relationships`)); }
    catch(e) { console.error('loadRelationships:', e); }
}

function renderRelationshipsList(rels) {
    const emoji = { allies:'🤝',rivals:'⚔️',lovers:'💕',enemies:'🖤',family:'👨‍👩‍👧',mentor:'🧭',friends:'😊',complicated:'🌀',strangers:'👥' };
    if (!rels.length) { relationshipsList.innerHTML = '<li class="empty-state">No relationships yet.</li>'; return; }
    relationshipsList.innerHTML = rels.map(r => `
        <li class="item-list-entry">
            <span class="item-name" style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0;display:inline-block;"></span>
                ${escapeHtml(r.char_a_name)}
                <span style="color:var(--text-muted);font-size:11px;">${emoji[r.relation_type]||'↔'} ${r.relation_type}</span>
                ${escapeHtml(r.char_b_name)}
            </span>
            <button class="item-delete" onclick="deleteRelationship(event,${r.id})">×</button>
        </li>`).join('');
}

async function openNewRelModal() {
    try {
        const chars = await api('GET', `/api/projects/${currentProjectId}/characters`);
        if (chars.length < 2) { alert('You need at least 2 characters!'); return; }
        const options = chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        document.getElementById('relCharAInput').innerHTML = options;
        document.getElementById('relCharBInput').innerHTML = options;
        if (chars.length > 1) document.getElementById('relCharBInput').value = chars[1].id;
        relSelectedColor = '#7b6fb0';
        document.querySelectorAll('#relColorPicker .rel-color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === relSelectedColor));
        openModal(newRelModal);
    } catch(e) { console.error('openNewRelModal:', e); }
}

async function createRelationship() {
    const charA = parseInt(document.getElementById('relCharAInput').value);
    const charB = parseInt(document.getElementById('relCharBInput').value);
    if (charA === charB) { alert('Select two different characters!'); return; }
    const btn = document.getElementById('confirmRelBtn');
    btn.textContent = 'Adding...'; btn.disabled = true;
    try {
        await api('POST', `/api/projects/${currentProjectId}/relationships`, {
            char_a_id: charA, char_b_id: charB,
            relation_type: document.getElementById('relTypeInput').value,
            description: document.getElementById('relDescInput').value.trim(),
            color: relSelectedColor
        });
        closeModal(newRelModal);
        document.getElementById('relDescInput').value = '';
        await loadRelationships(currentProjectId);
    } catch(e) { console.error('createRelationship:', e); }
    finally { btn.textContent = 'Add Relationship'; btn.disabled = false; }
}

async function deleteRelationship(event, id) {
    event.stopPropagation();
    showConfirm('This relationship will be removed.', async () => {
        try {
            await api('DELETE', `/api/relationships/${id}`);
            await loadRelationships(currentProjectId);
            if (document.getElementById('relWebOverlay').style.display !== 'none') await openRelWeb();
        } catch(e) { console.error('deleteRelationship:', e); }
    }, 'Remove Relationship?');
}

let editingRelId = null, editRelColor = '#7b6fb0';

function openEditRelModal(edge) {
    editingRelId = edge.id; editRelColor = edge.color || '#7b6fb0';
    document.getElementById('editRelCharNames').textContent = `${edge.char_a_name}  ↔  ${edge.char_b_name}`;
    document.getElementById('editRelTypeInput').value = edge.relation_type || 'allies';
    document.getElementById('editRelDescInput').value = edge.description   || '';
    document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === editRelColor));
    openModal(document.getElementById('editRelModal'));
}

async function saveEditRel() {
    if (!editingRelId) return;
    const btn = document.getElementById('confirmEditRelBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/relationships/${editingRelId}`, {
            relation_type: document.getElementById('editRelTypeInput').value,
            description: document.getElementById('editRelDescInput').value.trim(),
            color: editRelColor
        });
        closeModal(document.getElementById('editRelModal'));
        await loadRelationships(currentProjectId); await openRelWeb();
    } catch(e) { console.error('saveEditRel:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}

async function deleteRelFromEdit() {
    const id = editingRelId;
    closeModal(document.getElementById('editRelModal'));
    try { await api('DELETE', `/api/relationships/${id}`); await loadRelationships(currentProjectId); await openRelWeb(); }
    catch(e) { console.error('deleteRelFromEdit:', e); }
}

async function openRelWeb() {
    try {
        const [chars, rels] = await Promise.all([
            api('GET', `/api/projects/${currentProjectId}/characters`),
            api('GET', `/api/projects/${currentProjectId}/relationships`)
        ]);
        if (!chars.length) { alert('No characters in this project yet!'); return; }
        document.getElementById('relWebProjectName').textContent = (currentProjectData?.title || '') + ' — Character Web';
        document.getElementById('relWebOverlay').style.display = 'flex';
        relCanvas = document.getElementById('relWebCanvas');
        relCtx    = relCanvas.getContext('2d');
        await new Promise(r => setTimeout(r, 50));
        const dpr = window.devicePixelRatio || 1;
        const cssW = relCanvas.offsetWidth, cssH = relCanvas.offsetHeight;
        relCanvas.width = cssW * dpr; relCanvas.height = cssH * dpr;
        relCtx.scale(dpr, dpr);
        relCanvas._dpr = dpr; relCanvas._cssW = cssW; relCanvas._cssH = cssH;
        relZoom = 1; relPanX = 0; relPanY = 0;
        const cx = cssW / 2, cy = cssH / 2, radius = Math.min(cx, cy) * 0.55;
        relNodes = chars.map((c, i) => {
            const angle = (2 * Math.PI * i) / chars.length - Math.PI / 2;
            return { id:c.id, name:c.name, role:c.role||'', image_url:c.image_url||'', x:cx+radius*Math.cos(angle), y:cy+radius*Math.sin(angle), img:null };
        });
        relEdges = rels;
        relNodes.forEach(node => {
            if (node.image_url) {
                const img = new Image(); img.src = node.image_url;
                img.onload = () => { node.img = img; drawRelWeb(); };
            }
        });
        drawRelWeb(); setupRelCanvasEvents();
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
    const style      = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#f0eeff';
    const bgModal     = style.getPropertyValue('--bg-modal').trim()     || '#181a2e';

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(relPanX, relPanY);
    ctx.scale(relZoom, relZoom);

    const pairCount = {}, pairIndex = {};
    relEdges.forEach(edge => {
        const key = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        pairCount[key] = (pairCount[key] || 0) + 1;
    });

    const relTypeEmoji = { allies:'🤝',rivals:'⚔️',lovers:'💕',enemies:'🖤',family:'👨‍👩‍👧',mentor:'🧭',friends:'😊',complicated:'🌀',strangers:'👥' };

    relEdges.forEach(edge => {
        const nodeA = relNodes.find(n => n.id === edge.char_a_id);
        const nodeB = relNodes.find(n => n.id === edge.char_b_id);
        if (!nodeA || !nodeB) return;
        const key   = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        const total = pairCount[key] || 1;
        pairIndex[key] = pairIndex[key] || 0;
        const idx = pairIndex[key]++;
        const dx = nodeB.x - nodeA.x, dy = nodeB.y - nodeA.y;
        const len = Math.hypot(dx, dy) || 1;
        const offset = total === 1 ? 0 : (idx - (total-1)/2) * 55;
        const cpX = (nodeA.x + nodeB.x)/2 + (-dy/len) * offset;
        const cpY = (nodeA.y + nodeB.y)/2 + ( dx/len) * offset;
        edge._cpX = cpX; edge._cpY = cpY;
        edge._ax = nodeA.x; edge._ay = nodeA.y;
        edge._bx = nodeB.x; edge._by = nodeB.y;

        ctx.beginPath(); ctx.moveTo(nodeA.x, nodeA.y);
        ctx.quadraticCurveTo(cpX, cpY, nodeB.x, nodeB.y);
        ctx.strokeStyle = edge.color || '#7b6fb0'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;

        const lx = 0.25*nodeA.x + 0.5*cpX + 0.25*nodeB.x;
        const ly = 0.25*nodeA.y + 0.5*cpY + 0.25*nodeB.y;
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = bgModal; ctx.beginPath(); ctx.roundRect(lx-15, ly-11, 30, 22, 6); ctx.fill();
        ctx.strokeStyle = edge.color || '#7b6fb0'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillText(relTypeEmoji[edge.relation_type] || edge.relation_type, lx, ly);
    });

    const nr = 38;
    relNodes.forEach(node => {
        ctx.save(); ctx.beginPath(); ctx.arc(node.x, node.y, nr, 0, Math.PI*2); ctx.clip();
        if (node.img && node.img.complete && node.img.naturalWidth > 0) {
            ctx.drawImage(node.img, node.x-nr, node.y-nr, nr*2, nr*2);
        } else {
            const grad = ctx.createRadialGradient(node.x, node.y-nr*0.3, 0, node.x, node.y, nr);
            grad.addColorStop(0, '#5b7fb0'); grad.addColorStop(1, '#7b6fb0');
            ctx.fillStyle = grad; ctx.fillRect(node.x-nr, node.y-nr, nr*2, nr*2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = 'bold 22px serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(node.name.charAt(0).toUpperCase(), node.x, node.y);
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(node.x, node.y, nr, 0, Math.PI*2);
        ctx.strokeStyle = '#7b6fb0'; ctx.lineWidth = 2.5; ctx.stroke();

        ctx.font = `600 13px 'DM Sans', sans-serif`;
        const nameW = ctx.measureText(node.name).width + 16, nameH = 22;
        const nameX = node.x - nameW/2, nameY = node.y + nr + 6;
        ctx.fillStyle = bgModal; ctx.beginPath(); ctx.roundRect(nameX, nameY, nameW, nameH, 6); ctx.fill();
        ctx.fillStyle = textPrimary; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x, nameY + nameH/2);

        if (node.role) {
            ctx.font = `11px 'DM Sans', sans-serif`;
            const rW = ctx.measureText(node.role).width + 12, rY = nameY + nameH + 3;
            ctx.fillStyle = 'rgba(157,143,212,0.15)'; ctx.beginPath(); ctx.roundRect(node.x-rW/2, rY, rW, 18, 5); ctx.fill();
            ctx.fillStyle = '#9d8fd4'; ctx.textBaseline = 'middle'; ctx.fillText(node.role, node.x, rY+9);
        }
    });
    ctx.restore();
}

function setupRelCanvasEvents() {
    let mouseDownPos = null, mouseDownTime = 0;

    relCanvas.onwheel = (e) => {
        e.preventDefault();
        const rect = relCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const newZoom = Math.min(Math.max(relZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.2), 4);
        relPanX = mx - (mx - relPanX) * (newZoom / relZoom);
        relPanY = my - (my - relPanY) * (newZoom / relZoom);
        relZoom = newZoom; drawRelWeb();
    };

    relCanvas.onmousedown = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        mouseDownPos = { x:mx, y:my }; mouseDownTime = Date.now();
        const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
        relDragging = relNodes.find(n => Math.hypot(n.x-cx, n.y-cy) < 42);
        if (relDragging) { relDragOffX = relDragging.x - cx; relDragOffY = relDragging.y - cy; }
        else { relIsPanning = true; relPanStart = { x:mx-relPanX, y:my-relPanY }; relCanvas.style.cursor = 'grabbing'; }
    };

    relCanvas.onmousemove = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if (relDragging) {
            relDragging.x = (mx - relPanX) / relZoom + relDragOffX;
            relDragging.y = (my - relPanY) / relZoom + relDragOffY;
            drawRelWeb();
        } else if (relIsPanning) {
            relPanX = mx - relPanStart.x; relPanY = my - relPanStart.y; drawRelWeb();
        }
    };

    relCanvas.onmouseup = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const moved = mouseDownPos && Math.hypot(mx - mouseDownPos.x, my - mouseDownPos.y) > 5;
        if (!moved && Date.now() - mouseDownTime < 300 && !relDragging) {
            const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
            const clicked = relEdges.find(edge => isNearCurve(cx, cy, edge));
            if (clicked) openEditRelModal(clicked);
        }
        relDragging = null; relIsPanning = false; mouseDownPos = null;
        relCanvas.style.cursor = 'grab';
    };

    relCanvas.onmouseleave = () => { relDragging = null; relIsPanning = false; relCanvas.style.cursor = 'grab'; };

    window.addEventListener('resize', () => {
        if (document.getElementById('relWebOverlay').style.display !== 'none') {
            const dpr = window.devicePixelRatio || 1;
            relCanvas.width  = relCanvas.offsetWidth  * dpr;
            relCanvas.height = relCanvas.offsetHeight * dpr;
            relCanvas._dpr = dpr; relCanvas._cssW = relCanvas.offsetWidth; relCanvas._cssH = relCanvas.offsetHeight;
            relCtx.scale(dpr, dpr); drawRelWeb();
        }
    });
}

function isNearCurve(mx, my, edge) {
    if (edge._ax === undefined) return false;
    for (let t = 0; t <= 1; t += 0.05) {
        const bx = (1-t)*(1-t)*edge._ax + 2*(1-t)*t*edge._cpX + t*t*edge._bx;
        const by = (1-t)*(1-t)*edge._ay + 2*(1-t)*t*edge._cpY + t*t*edge._by;
        if (Math.hypot(mx-bx, my-by) < 10) return true;
    }
    return false;
}

function closeRelWeb() { document.getElementById('relWebOverlay').style.display = 'none'; relDragging = null; }

// --- OPEN TABS ---
function addOpenTab(id, title, type = 'chapter') {
    if (openTabs.find(t => t.id === id && t.type === type)) { setActiveTab(id, type); return; }
    openTabs.push({ id, title, type }); renderTabs(); setActiveTab(id, type); tabsBar.style.display = 'block';
}

function removeOpenTab(id) {
    openTabs = openTabs.filter(t => t.id !== id); renderTabs();
    if (!openTabs.length) tabsBar.style.display = 'none';
}

function setActiveTab(id, type) {
    document.querySelectorAll('.open-tab').forEach(t => t.classList.toggle('active', t.dataset.id == id && t.dataset.type === type));
}

function updateTabTitle(id, title) {
    const tab = openTabs.find(t => t.id === id);
    if (tab) { tab.title = title; renderTabs(); }
}

function renderTabs() {
    const icon = { chapter:'📄', scene:'⚡' };
    openTabsEl.innerHTML = openTabs.map(t => `
        <div class="open-tab ${t.id === currentDocId && t.type === currentDocType ? 'active' : ''}"
             data-id="${t.id}" data-type="${t.type}" onclick="openDocument(${t.id},'${t.type}')">
            <span style="font-size:11px;margin-right:4px;">${icon[t.type]||'📄'}</span>
            <span class="open-tab-name">${escapeHtml(t.title)}</span>
            <button class="open-tab-close" onclick="closeTab(event,${t.id},'${t.type}')">×</button>
        </div>`).join('');
}

function closeTab(event, id, type) {
    event.stopPropagation();
    openTabs = openTabs.filter(t => !(t.id === id && t.type === type));
    renderTabs();
    if (currentDocId === id && currentDocType === type) {
        if (openTabs.length) { const last = openTabs[openTabs.length-1]; openDocument(last.id, last.type); }
        else { currentDocId = null; hideEditor(); tabsBar.style.display = 'none'; }
    }
    if (!openTabs.length) tabsBar.style.display = 'none';
}

// --- AUTO-SAVE & LOCALSTORAGE ---
function getLocalKey(key)  { return `scripvia_doc_${key}`; }

function saveToLocalStorage() {
    if (!currentDocId || !quill) return;
    try { localStorage.setItem(getLocalKey(`${currentDocType}_${currentDocId}`), JSON.stringify({ title: docTitleInput.value, content: quill.root.innerHTML, savedAt: Date.now() })); }
    catch(e) {}
}

function loadFromLocalStorage(key) {
    try { const raw = localStorage.getItem(getLocalKey(key)); return raw ? JSON.parse(raw) : null; }
    catch(e) { return null; }
}

function clearLocalStorage(key) { try { localStorage.removeItem(getLocalKey(key)); } catch(e) {} }

function checkLocalStorageRestore(key, serverContent) {
    const backup = loadFromLocalStorage(key);
    if (!backup) return false;
    if (Date.now() - backup.savedAt > 86400000) { clearLocalStorage(key); return false; }
    if (backup.content !== serverContent) {
        if (confirm(`📋 Unsaved changes found from ${formatTimeAgo(backup.savedAt)}.\n\nRestore them?`)) {
            quill.root.innerHTML = backup.content || ''; docTitleInput.value = backup.title || '';
            setSaveStatus('unsaved'); return true;
        } else { clearLocalStorage(key); }
    }
    return false;
}

function formatTimeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`;
    return `${Math.floor(d/3600)}h ago`;
}

function startAutoSave() {
    stopAutoSave(); secondsUntilSave = 30;
    countdownTimer = setInterval(() => {
        secondsUntilSave--;
        if (saveStatus.classList.contains('unsaved') && secondsUntilSave > 0) saveStatus.textContent = `● Saving in ${secondsUntilSave}s`;
        if (secondsUntilSave <= 0) secondsUntilSave = 30;
    }, 1000);
    autoSaveTimer = setInterval(async () => {
        if (currentDocId && saveStatus.classList.contains('unsaved')) await saveDocument();
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveTimer)  { clearInterval(autoSaveTimer);  autoSaveTimer  = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    secondsUntilSave = 30;
}

function resetCountdown() { secondsUntilSave = 30; }

// --- OFFLINE/ONLINE ---
window.addEventListener('online', async () => {
    if (pendingSync && currentDocId && currentDocType === 'chapter') {
        setSaveStatus('syncing');
        try { await saveDocument(); pendingSync = false; } catch(e) {}
    }
});

// --- STATS ---
function updateStats() {
    if (!quill) return;
    const text  = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(w => w.length > 0) : [];
    if (wordCountEl) wordCountEl.textContent = `${words.length.toLocaleString()} word${words.length !== 1 ? 's' : ''}`;
    if (charCountEl) charCountEl.textContent = `${text.length.toLocaleString()} char${text.length !== 1 ? 's' : ''}`;
    if (readTimeEl)  readTimeEl.textContent  = `~${Math.max(1, Math.ceil(words.length/200))} min read`;
    updateFocusWordCount();
}

function updateLastSaved() {
    if (!lastSavedTimeEl) return;
    lastSavedTimeEl.textContent = `Saved at ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
}

// --- UI HELPERS ---
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
    docTitleInput.value = ''; docTitleInput.disabled = true;
    if (quill) quill.root.innerHTML = '';
    setSaveStatus('');
    if (wordCountEl)     wordCountEl.textContent     = '0 words';
    if (charCountEl)     charCountEl.textContent     = '0 chars';
    if (readTimeEl)      readTimeEl.textContent      = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
    document.getElementById('notesToggleBtn').style.display = 'none';
    document.getElementById('focusModeBtn').style.display   = 'none';
    document.getElementById('searchBtn').style.display      = 'none';
    closeNotesPanel(); closeSearch();
    if (isFocusMode) exitFocusMode();
}

function setSaveStatus(status) {
    const map = { saved:'✓ Saved', saving:'Saving...', syncing:'↑ Syncing...', synced:'✓ Synced', unsaved:'● Unsaved', error:'✗ Error', '':'' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className   = 'save-status ' + status;
}

function enableHeaderBtns(on) { saveBtn.disabled = exportPdfBtn.disabled = exportDocxBtn.disabled = !on; }

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- MODALS ---
function openModal(modal)  { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) closeModal(o); });
});

projectGenreInput.addEventListener('change', () => {
    document.getElementById('genreNote').style.display = CREATIVE_GENRES.includes(projectGenreInput.value) ? 'block' : 'none';
});

// --- THEME & SIDEBAR ---
let isDark = localStorage.getItem('scripvia_theme') !== 'light';

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('themeIcon').textContent  = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
    localStorage.setItem('scripvia_theme', isDark ? 'dark' : 'light');
}

document.getElementById('darkModeToggle').addEventListener('click', () => { isDark = !isDark; applyTheme(); });

const sidebar = document.getElementById('sidebar');
let sidebarCollapsed = localStorage.getItem('scripvia_sidebar') === 'collapsed';

function applySidebar() { sidebar.classList.toggle('collapsed', sidebarCollapsed); }

document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('scripvia_sidebar', sidebarCollapsed ? 'collapsed' : 'open');
    applySidebar();
});

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (currentDocId) saveDocument(); }
    if (e.key === 'F11') { e.preventDefault(); if (currentDocId) toggleFocusMode(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); if (currentProjectId) openSearch(); }
    if (e.key === 'Escape') {
        if (isFocusMode) { exitFocusMode(); return; }
        document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
        hideWikiTooltip();
    }
});

// --- EXPORT ---
exportPdfBtn.addEventListener('click',  () => { if (currentDocId && currentDocType === 'chapter') window.location.href = `/api/documents/${currentDocId}/export/pdf`; });
exportDocxBtn.addEventListener('click', () => { if (currentDocId && currentDocType === 'chapter') window.location.href = `/api/documents/${currentDocId}/export/docx`; });

// --- AUTH ---
async function checkAuthState() {
    try {
        const data = await api('GET', '/auth/me');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        if (data.logged_in) {
            loginBtn.style.display = 'none'; userInfo.classList.remove('hidden');
            document.getElementById('userAvatar').src = data.user.picture;
            document.getElementById('userName').textContent = data.user.name.split(' ')[0];
        } else {
            const guest = localStorage.getItem('scripvia_guest');
            if (guest) showGuestUser(JSON.parse(guest).name);
            else { loginBtn.style.display = 'flex'; userInfo.classList.add('hidden'); }
        }
    } catch(e) { console.error('checkAuthState:', e); }
}

function showGuestUser(name) {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('userName').textContent = name + ' (guest)';
    document.getElementById('userAvatar').style.display = 'none';
}

// --- EVENT LISTENERS ---
document.getElementById('newProjectBtn').addEventListener('click',    () => openModal(newProjectModal));
document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal(newProjectModal));
document.getElementById('cancelProjectBtn2').addEventListener('click',() => closeModal(newProjectModal));
document.getElementById('confirmProjectBtn').addEventListener('click', createProject);
projectTitleInput.addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });

document.getElementById('newDocBtn').addEventListener('click',    () => openModal(newDocModal));
document.getElementById('cancelDocBtn').addEventListener('click',  () => closeModal(newDocModal));
document.getElementById('cancelDocBtnX').addEventListener('click', () => closeModal(newDocModal));
document.getElementById('confirmDocBtn').addEventListener('click', createDocument);
docTitleModalInput.addEventListener('keydown', e => { if (e.key === 'Enter') createDocument(); });

document.getElementById('newCharBtn').addEventListener('click',    () => openModal(newCharModal));
document.getElementById('cancelCharBtn').addEventListener('click',  () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('cancelCharBtnX').addEventListener('click', () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('confirmCharBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmCharBtn');
    btn.dataset.mode === 'edit' && btn.dataset.editId ? saveEditChar(parseInt(btn.dataset.editId)) : createCharacter();
});

document.getElementById('newSceneBtn').addEventListener('click',    () => openModal(newSceneModal));
document.getElementById('cancelSceneBtn').addEventListener('click',  () => closeModal(newSceneModal));
document.getElementById('cancelSceneBtnX').addEventListener('click', () => closeModal(newSceneModal));
document.getElementById('confirmSceneBtn').addEventListener('click', createScene);

document.getElementById('newLoreBtn').addEventListener('click',    () => openModal(newLoreModal));
document.getElementById('cancelLoreBtn').addEventListener('click',  () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('cancelLoreBtnX').addEventListener('click', () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('confirmLoreBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmLoreBtn');
    btn.dataset.mode === 'edit' && btn.dataset.editId ? saveEditLore(parseInt(btn.dataset.editId)) : createLore();
});

saveBtn.addEventListener('click', saveDocument);

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    setupImageUpload('charImageFile','charImageInput','charImgPreview','charImgPreviewEl','clearCharImg');
    setupImageUpload('loreImageFile','loreImageInput','loreImgPreview','loreImgPreviewEl','clearLoreImg');

    document.getElementById('wikiCardClose').addEventListener('click', hideWikiTooltip);
    document.getElementById('backToOverview').addEventListener('click', () => { hideEditor(); showProjectOverview(currentProjectId); });
    document.getElementById('notesToggleBtn').addEventListener('click', toggleNotesPanel);
    document.getElementById('notesPanelClose').addEventListener('click', closeNotesPanel);
    document.getElementById('focusModeBtn').addEventListener('click', toggleFocusMode);
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('newRelBtn').addEventListener('click', openNewRelModal);
    document.getElementById('viewRelWebBtn').addEventListener('click', openRelWeb);
    document.getElementById('relWebClose').addEventListener('click', closeRelWeb);
    document.getElementById('relWebAddBtn').addEventListener('click', () => { closeRelWeb(); openNewRelModal(); });
    document.getElementById('cancelRelBtn').addEventListener('click',  () => closeModal(newRelModal));
    document.getElementById('cancelRelBtnX').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('confirmRelBtn').addEventListener('click', createRelationship);
    document.getElementById('confirmEditRelBtn').addEventListener('click', saveEditRel);
    document.getElementById('cancelEditRelBtn').addEventListener('click',  () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('cancelEditRelBtnX').addEventListener('click', () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('deleteRelFromEditBtn').addEventListener('click', deleteRelFromEdit);

    document.querySelectorAll('#relColorPicker .rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#relColorPicker .rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected'); relSelectedColor = opt.dataset.color;
        });
    });
    document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected'); editRelColor = opt.dataset.color;
        });
    });

    fetch('/auth/me').then(r => r.json()).then(data => {
        if (!data.logged_in && !localStorage.getItem('scripvia_guest')) { window.location.href = '/login'; return; }
        applyTheme(); applySidebar(); initQuill(); loadProjects(); checkAuthState();
    }).catch(() => { applyTheme(); applySidebar(); initQuill(); loadProjects(); });
});