// Scripvia — Main Frontend Logic v0.2

// --- STATE ---
let currentProjectId = null;
let currentProjectData = null;
let currentDocId = null;
let currentDocType = 'chapter';
let quill = null;
let autoSaveTimer = null;
let countdownTimer = null;
let secondsUntilSave = 30;
let pendingSync = false;
let openTabs = [];
let wikiData = {};
let currentCharacters = [];
let storageScopeKey = 'guest_default';

// --- DOM REFS ---
const projectsList = document.getElementById('projectsList');
const documentsList = document.getElementById('documentsList');
const charactersList = document.getElementById('charactersList');
const scenesList = document.getElementById('scenesList');
const loreList = document.getElementById('loreList');
const relationshipsList = document.getElementById('relationshipsList');
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
const newRelModal = document.getElementById('newRelModal');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectDescInput = document.getElementById('projectDescInput');
const projectGenreInput = document.getElementById('projectGenreInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');

const CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical'];

// --- IMAGE UPLOAD ---
function setupImageUpload(fileInputId, urlInputId, previewWrapId, previewImgId, clearBtnId, enableCrop = false) {
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    const previewWrap = document.getElementById(previewWrapId);
    const previewImg = document.getElementById(previewImgId);
    const clearBtn = document.getElementById(clearBtnId);

    if (!fileInput || !urlInput || !previewWrap || !previewImg || !clearBtn) {
        console.warn('setupImageUpload skipped: missing DOM nodes', {
            fileInputId, urlInputId, previewWrapId, previewImgId, clearBtnId
        });
        return;
    }

    function applyImage(src) {
        urlInput.value = previewImg.src = src;
        previewWrap.style.display = 'block';
    }

    function maybeCrop(src) {
        if (enableCrop) {
            openCropModal(src, applyImage);
        } else {
            applyImage(src);
        }
    }

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => maybeCrop(e.target.result);
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

    urlInput.addEventListener('blur', () => {
        const val = urlInput.value.trim();
        if (enableCrop && val && (val.startsWith('http') || val.startsWith('data:'))) {
            maybeCrop(val);
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
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ color: [] }, { background: [] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                [{ align: [] }],
                [{ indent: '-1' }, { indent: '+1' }],
                ['link'], ['clean']
            ]
        }
    });
    quill.on('text-change', function () {
        setSaveStatus('unsaved');
        saveToLocalStorage();
        resetCountdown();
        updateStats();
        setTimeout(() => {
            const selection = quill.getSelection();
            if (selection) {
                const bounds = quill.getBounds(selection.index);
                const container = document.getElementById('editorWrapper');

                if (bounds && container) {
                    const editorTop = document.querySelector('.ql-editor').offsetTop;
                    const cursorPosInEditor = editorTop + bounds.top;
                    const targetScrollPos = cursorPosInEditor - (container.clientHeight * 0.35);
                    if (cursorPosInEditor > container.scrollTop + (container.clientHeight * 0.35)) {
                        container.scrollTop = Math.max(0, targetScrollPos);
                    }
                }
            }
        }, 0);
    });
    const editorElement = document.querySelector('.ql-editor');
    if (editorElement) {
        editorElement.addEventListener('mousemove', handleWikiHover);
        editorElement.addEventListener('mouseleave', hideWikiTooltip);
    }
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
    catch (e) { console.error('loadProjects:', e); }
}

function renderProjects(projects) {
    if (!projects.length) {
        projectsList.innerHTML = '<li class="empty-state">No projects yet.<br>Create one to begin.</li>';
        return;
    }
    projectsList.innerHTML = projects.map(p => `
        <li class="project-item ${p.id === currentProjectId ? 'active' : ''}" onclick="selectProject(${p.id})">
            <span class="item-name" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>
            <span class="item-meta">${genreEmoji(p.genre)}</span>
            <button class="item-delete" onclick="deleteProject(event,${p.id})">×</button>
        </li>`).join('');
}

function genreEmoji(genre) {
    const map = { fantasy: '⚔️', 'sci-fi': '🚀', fiction: '📖', romance: '💕', mystery: '🔍', thriller: '⚡', horror: '🕯️', historical: '🏛️', journal: '📓', screenplay: '🎬', poetry: '✨', general: '📝', other: '📌' };
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
    } catch (e) { console.error('createProject:', e); }
    finally { btn.textContent = 'Create Project'; btn.disabled = false; }
}

async function deleteProject(event, id) {
    event.stopPropagation();
    showConfirm('This will permanently delete the project and all its content.', async () => {
        try {
            await api('DELETE', `/api/projects/${id}`);
            if (currentProjectId === id) { currentProjectId = currentProjectData = null; showProjectList(); hideEditor(); }
            await loadProjects();
        } catch (e) { console.error('deleteProject:', e); }
    }, 'Delete Project?');
}

async function selectProject(id) {
    try {
        currentProjectId = id;
        const projects = await api('GET', '/api/projects');
        currentProjectData = projects.find(p => p.id === id);
        api('POST', `/api/projects/${id}/drive-sync-all`).catch(e => console.error('projectDriveSync:', e));
        showProjectDetail();
        currentProjectName.textContent = currentProjectData.title;
        await showProjectOverview(id);
        const isCreative = CREATIVE_GENRES.includes(currentProjectData.genre);
        ['tabCharacters', 'tabScenes', 'tabLore', 'tabRelationships'].forEach(tid =>
            document.getElementById(tid).classList.toggle('hidden', !isCreative));
        switchTab('chapters');
        await loadDocuments(id);
        if (isCreative) await loadWikiData(id);
        closeNotesPanel();
    } catch (e) { console.error('selectProject:', e); }
}

function showProjectList() { projectsSection.style.display = 'block'; projectDetail.style.display = 'none'; }
function showProjectDetail() { projectsSection.style.display = 'none'; projectDetail.style.display = 'flex'; }

// --- PROJECT OVERVIEW ---
async function showProjectOverview(projectId) {
    try {
        const stats = await api('GET', `/api/projects/${projectId}/stats`);
        const genreEmojis = { fantasy: '⚔️ Fantasy', 'sci-fi': '🚀 Sci-Fi', fiction: '📖 Fiction', romance: '💕 Romance', mystery: '🔍 Mystery', thriller: '⚡ Thriller', horror: '🕯️ Horror', historical: '🏛️ Historical', journal: '📓 Journal', screenplay: '🎬 Screenplay', poetry: '✨ Poetry', general: '📝 General', other: '📌 Other' };

        document.getElementById('overviewGenre').textContent = genreEmojis[stats.genre] || '📝 General';
        document.getElementById('overviewTitle').textContent = stats.title;
        document.getElementById('overviewDesc').textContent = stats.description || 'No description yet.';
        document.getElementById('ovWords').textContent = stats.total_words.toLocaleString();
        document.getElementById('ovChapters').textContent = stats.chapter_count;
        document.getElementById('ovCharacters').textContent = stats.character_count;
        document.getElementById('ovScenes').textContent = stats.scene_count;
        document.getElementById('ovLore').textContent = stats.lore_count;
        document.getElementById('ovLastEdited').textContent = stats.last_edited ? `✎ Last edited ${formatDateNice(stats.last_edited)}` : '';
        document.getElementById('ovCreated').textContent = stats.created_at ? `✦ Created ${formatDateNice(stats.created_at)}` : '';

        const isCreative = stats.is_creative;
        ['ovCharBtn', 'ovSceneBtn', 'ovLoreBtn', 'ovRelBtn'].forEach(id =>
            document.getElementById(id).style.display = isCreative ? 'block' : 'none');
        ['ovCharStat', 'ovSceneStat', 'ovLoreStat'].forEach(id =>
            document.getElementById(id).style.display = isCreative ? 'flex' : 'none');

        document.getElementById('projectOverview').style.display = 'flex';
        document.getElementById('backToOverview').style.display = 'block';
        welcomeScreen.classList.add('hidden');
        document.getElementById('editorHeader').style.display = 'none';
    } catch (e) { console.error('showProjectOverview:', e); }
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
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- TABS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
    if (tabName === 'chapters') loadDocuments(currentProjectId);
    if (tabName === 'characters') loadCharacters(currentProjectId);
    if (tabName === 'scenes') loadScenes(currentProjectId);
    if (tabName === 'lore') loadLore(currentProjectId);
    if (tabName === 'relationships') loadRelationships(currentProjectId);
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
    catch (e) { console.error('loadDocuments:', e); }
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
            <span class="item-name" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</span>
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
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    const midY = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
}

function onDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target === dragSrcEl) return;
    const items = [...document.querySelectorAll('#documentsList .item-list-entry')];
    const srcIdx = items.indexOf(dragSrcEl);
    const tgtIdx = items.indexOf(target);
    const reordered = [...items];
    reordered.splice(srcIdx, 1);
    const midY = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    const insertAt = e.clientY < midY ? tgtIdx : tgtIdx + 1;
    reordered.splice(insertAt > srcIdx ? insertAt - 1 : insertAt, 0, dragSrcEl);
    saveChapterOrder(reordered.map(el => parseInt(el.dataset.id)));
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging'));
}

function onDragEnd() {
    document.querySelectorAll('#documentsList .item-list-entry').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging'));
}

async function saveChapterOrder(newOrder) {
    try {
        await api('POST', `/api/projects/${currentProjectId}/documents/reorder`, { order: newOrder });
        await loadDocuments(currentProjectId);
    } catch (e) { console.error('saveChapterOrder:', e); }
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
    } catch (e) { console.error('createDocument:', e); }
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
        if (type === 'scene' && currentProjectId) await loadScenes(currentProjectId);
    } catch (e) { console.error('openDocument:', e); }
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
        if (currentDocType === 'scene') await loadScenes(currentProjectId);
        if (navigator.onLine && currentDocType === 'chapter') {
            setSaveStatus('syncing');
            try {
                await api('POST', `/api/documents/${currentDocId}/sync`);
                if (currentProjectId) {
                    await api('POST', `/api/projects/${currentProjectId}/drive-sync-all`);
                }
                setSaveStatus('synced');
                setTimeout(() => setSaveStatus('saved'), 2000);
            }
            catch (e) {
                setSaveStatus('error');
                console.error('driveSync:', e);
                alert('Drive sync failed. Please try again after restarting the app.');
            }
        } else {
            setSaveStatus('saved');
            if (!navigator.onLine) pendingSync = true;
        }
    } catch (e) { setSaveStatus('error'); console.error('saveDocument:', e); }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    showConfirm('This chapter will be permanently deleted.', async () => {
        try {
            await api('DELETE', `/api/documents/${id}`);
            if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
            removeOpenTab(id); await loadDocuments(currentProjectId);
        } catch (e) { console.error('deleteDocument:', e); }
    }, 'Delete Chapter?');
}

// --- CHARACTERS ---
async function loadCharacters(projectId) {
    try { renderCharacters(await api('GET', `/api/projects/${projectId}/characters`)); }
    catch (e) { console.error('loadCharacters:', e); }
}

function renderCharacters(chars) {
    currentCharacters = chars;
    if (!chars.length) { charactersList.innerHTML = '<li class="empty-state">No characters yet.</li>'; return; }
    charactersList.innerHTML = chars.map(c => `
        <li class="item-list-entry character-list-entry" data-char-id="${c.id}" onclick="openEditCharModal(${c.id})">
            <span class="item-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
            ${c.role ? `<span class="item-badge">${escapeHtml(c.role)}</span>` : ''}
            <button class="item-delete" onclick="deleteCharacter(event,${c.id})">×</button>
        </li>`).join('');
    attachCharacterListHoverTooltips();
}

function attachCharacterListHoverTooltips() {
    charactersList.querySelectorAll('.character-list-entry').forEach(item => {
        item.addEventListener('mouseenter', handleCharacterListHover);
        item.addEventListener('mousemove', handleCharacterListHover);
        item.addEventListener('mouseleave', hideWikiTooltip);
    });
}

function handleCharacterListHover(e) {
    const item = e.currentTarget;
    const charId = parseInt(item.dataset.charId, 10);
    const character = currentCharacters.find(c => c.id === charId);
    if (!character) return;
    showCharacterHoverTooltip(character, e.clientX, e.clientY, { compact: true });
}

function ensureCharacterTitlesUI() {
    if (document.getElementById('charTitlesSection')) return;
    const nameInput = document.getElementById('charNameInput');
    if (!nameInput) return;
    nameInput.insertAdjacentHTML('afterend', `
        <label class="modal-label" id="charTitlesLabel">Titles <span class="optional">(optional)</span></label>
        <div class="char-titles-section" id="charTitlesSection">
            <div class="char-title-list" id="charTitlesList"></div>
            <button type="button" class="btn-ghost-sm char-title-add" id="addCharTitleBtn">+ Add title</button>
        </div>
    `);
    document.getElementById('addCharTitleBtn').addEventListener('click', () => addCharacterTitleInput(''));
    addCharacterTitleInput('');
}

function addCharacterTitleInput(value = '') {
    const list = document.getElementById('charTitlesList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'char-title-row';
    row.innerHTML = `
        <input type="text" class="modal-input char-title-input" placeholder="e.g. Crown Prince, Captain..." value="${escapeHtml(value)}">
        <button type="button" class="btn-ghost-sm char-title-remove" aria-label="Remove title">×</button>
    `;
    row.querySelector('.char-title-remove').addEventListener('click', () => {
        row.remove();
        if (!list.children.length) addCharacterTitleInput('');
    });
    list.appendChild(row);
}

function getCharacterTitles() {
    return Array.from(document.querySelectorAll('.char-title-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function setCharacterTitles(titles = []) {
    const list = document.getElementById('charTitlesList');
    if (!list) return;
    list.innerHTML = '';
    const values = Array.isArray(titles) && titles.length ? titles : [''];
    values.forEach(title => addCharacterTitleInput(title));
}

async function createCharacter() {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name || !currentProjectId) { document.getElementById('charNameInput').focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/characters`, {
            name, role: document.getElementById('charRoleInput').value,
            titles: getCharacterTitles(),
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim(),
            image_focus: 'center'
        });
        closeModal(newCharModal);
        resetCharModal();
        await loadCharacters(currentProjectId);
        await loadWikiData(currentProjectId);
    } catch (e) { console.error('createCharacter:', e); }
}

async function deleteCharacter(event, id) {
    event.stopPropagation();
    showConfirm('This character will be permanently deleted.', async () => {
        try { await api('DELETE', `/api/characters/${id}`); await loadCharacters(currentProjectId); await loadWikiData(currentProjectId); }
        catch (e) { console.error('deleteCharacter:', e); }
    }, 'Delete Character?');
}

async function openEditCharModal(id) {
    try {
        const c = await api('GET', `/api/characters/${id}`);
        document.getElementById('charNameInput').value = c.name || '';
        document.getElementById('charRoleInput').value = c.role || '';
        setCharacterTitles(c.titles || []);
        document.getElementById('charAgeInput').value = c.age || '';
        document.getElementById('charAppearanceInput').value = c.appearance || '';
        document.getElementById('charPersonalityInput').value = c.personality || '';
        document.getElementById('charBackstoryInput').value = c.backstory || '';
        document.getElementById('charImageInput').value = c.image_url || '';
        const preview = document.getElementById('charImgPreview');
        if (c.image_url) { document.getElementById('charImgPreviewEl').src = c.image_url; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
        document.querySelector('#newCharModal .modal-title').textContent = 'Edit Character';
        const btn = document.getElementById('confirmCharBtn');
        btn.textContent = 'Save Changes'; btn.dataset.editId = id; btn.dataset.mode = 'edit';
        openModal(newCharModal);
    } catch (e) { console.error('openEditCharModal:', e); }
}

async function saveEditChar(id) {
    const name = document.getElementById('charNameInput').value.trim();
    if (!name) { document.getElementById('charNameInput').focus(); return; }
    const btn = document.getElementById('confirmCharBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/characters/${id}`, {
            name, role: document.getElementById('charRoleInput').value,
            titles: getCharacterTitles(),
            age: document.getElementById('charAgeInput').value.trim(),
            appearance: document.getElementById('charAppearanceInput').value.trim(),
            personality: document.getElementById('charPersonalityInput').value.trim(),
            backstory: document.getElementById('charBackstoryInput').value.trim(),
            image_url: document.getElementById('charImageInput').value.trim(),
            image_focus: 'center'
        });
        closeModal(newCharModal); resetCharModal();
        await loadCharacters(currentProjectId); await loadWikiData(currentProjectId);
    } catch (e) { console.error('saveEditChar:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}
// --- IMAGE CROP ---
let cropCallback = null;
let cropRect = null;
let cropDragging = false;
let cropStart = null;
let cropImage = new Image();

let cropCanvasInited = false;

function openCropModal(imageSrc, callback) {
    const cropModal = document.getElementById('cropModal');
    const canvas = document.getElementById('cropCanvas');

    if (!cropModal || !canvas) {
        console.warn('Crop modal is unavailable; using image without cropping.');
        if (callback) callback(imageSrc);
        return;
    }

    cropCallback = callback;
    cropRect = null;
    cropImage = new Image();

    if (!cropCanvasInited) {
        initCropCanvas();
        cropCanvasInited = true;
    }

    openModal(cropModal);

    cropImage.onload = () => {
        const canvasWrap = document.querySelector('.crop-canvas-wrap');
        const maxW = Math.min(480, canvasWrap?.clientWidth || window.innerWidth * 0.82);
        const maxH = Math.min(window.innerHeight * 0.5, canvasWrap?.clientHeight || 360);
        const scale = Math.min(
            maxW / cropImage.naturalWidth,
            maxH / cropImage.naturalHeight,
            1
        );
        canvas.width = cropImage.naturalWidth * scale;
        canvas.height = cropImage.naturalHeight * scale;
        canvas._scale = scale;
        drawCropCanvas();
    };
    cropImage.src = imageSrc;
}

function drawCropCanvas() {
    const canvas = document.getElementById('cropCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cropImage, 0, 0, canvas.width, canvas.height);
    if (!cropRect) return;
    const { x, y, w, h } = cropRect;
    // Dim outside
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, y);
    ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, canvas.width - x - w, h);
    // Border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    // Corner handles
    const hs = 8;
    ctx.fillStyle = '#fff';
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
    });
}

function initCropCanvas() {
    const canvas = document.getElementById('cropCanvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', e => {
        const r = canvas.getBoundingClientRect();
        cropStart = { x: e.clientX - r.left, y: e.clientY - r.top };
        cropDragging = true;
        cropRect = null;
    });

    canvas.addEventListener('mousemove', e => {
        if (!cropDragging || !cropStart) return;
        const r = canvas.getBoundingClientRect();
        const mx = Math.max(0, Math.min(canvas.width, e.clientX - r.left));
        const my = Math.max(0, Math.min(canvas.height, e.clientY - r.top));
        cropRect = {
            x: Math.min(cropStart.x, mx),
            y: Math.min(cropStart.y, my),
            w: Math.abs(mx - cropStart.x),
            h: Math.abs(my - cropStart.y)
        };
        drawCropCanvas();
    });

    canvas.addEventListener('mouseup', () => { cropDragging = false; });
    canvas.addEventListener('mouseleave', () => { cropDragging = false; });
}

function confirmCrop() {
    const cropModal = document.getElementById('cropModal');
    const cropCanvas = document.getElementById('cropCanvas');

    if (!cropModal || !cropCanvas) {
        if (cropCallback) cropCallback(cropImage.src);
        return;
    }

    if (!cropRect || cropRect.w < 5 || cropRect.h < 5) {
        // No crop selected — use full image
        if (cropCallback) cropCallback(cropImage.src);
        closeModal(cropModal);
        return;
    }
    const scale = cropCanvas._scale || 1;
    const sx = cropRect.x / scale;
    const sy = cropRect.y / scale;
    const sw = cropRect.w / scale;
    const sh = cropRect.h / scale;
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(cropImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropped = out.toDataURL('image/jpeg', 0.92);
    if (cropCallback) cropCallback(cropped);
    closeModal(cropModal);
}
function resetCharModal() {
    document.querySelector('#newCharModal .modal-title').textContent = 'New Character';
    const btn = document.getElementById('confirmCharBtn');
    btn.textContent = 'Create Character';
    delete btn.dataset.editId;
    delete btn.dataset.mode;
    document.getElementById('charNameInput').value = '';
    document.getElementById('charRoleInput').value = '';
    setCharacterTitles([]);
    document.getElementById('charAgeInput').value = '';
    document.getElementById('charAppearanceInput').value = '';
    document.getElementById('charPersonalityInput').value = '';
    document.getElementById('charBackstoryInput').value = '';
    document.getElementById('charImageInput').value = '';
    document.getElementById('charImgPreview').style.display = 'none';
    document.getElementById('charImgPreviewEl').src = '';
    const fileInput = document.getElementById('charImageFile');
    fileInput.value = '';
    fileInput.type = 'text';
    fileInput.type = 'file';
    document.getElementById('charImageInput').value = '';
}


// --- SCENES ---
async function loadScenes(projectId) {
    try { renderScenes(await api('GET', `/api/projects/${projectId}/scenes`)); }
    catch (e) { console.error('loadScenes:', e); }
}

function renderScenes(scenes) {
    const moodEmoji = { tense: '⚡', romantic: '💕', mysterious: '🌫️', action: '🔥', sad: '💧', hopeful: '🌅', dark: '🌑', comedic: '😄' };
    if (!scenes.length) { scenesList.innerHTML = '<li class="empty-state">No scenes yet.</li>'; return; }
    scenesList.innerHTML = scenes.map(s => `
        <li class="item-list-entry ${s.id === currentDocId && currentDocType === 'scene' ? 'active' : ''}" onclick="openDocument(${s.id},'scene')">
            <span class="item-name" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
            ${s.mood ? `<span class="item-badge">${moodEmoji[s.mood] || ''} ${s.mood}</span>` : ''}
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
    } catch (e) { console.error('createScene:', e); }
}

async function deleteScene(event, id) {
    event.stopPropagation();
    showConfirm('This scene will be permanently deleted.', async () => {
        try {
            await api('DELETE', `/api/scenes/${id}`);
            if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
            removeOpenTab(id); await loadScenes(currentProjectId);
        } catch (e) { console.error('deleteScene:', e); }
    }, 'Delete Scene?');
}

// --- LORE ---
async function loadLore(projectId) {
    try { renderLore(await api('GET', `/api/projects/${projectId}/lore`)); }
    catch (e) { console.error('loadLore:', e); }
}

function renderLore(items) {
    const catEmoji = { item: '⚔️', place: '🗺️', organization: '🏛️', concept: '✨', creature: '🐉', event: '📅', other: '📌' };
    if (!items.length) { loreList.innerHTML = '<li class="empty-state">No lore entries yet.</li>'; return; }
    loreList.innerHTML = items.map(i => `
        <li class="item-list-entry" onclick="openEditLoreModal(${i.id})">
            <span class="item-name" title="${escapeHtml(i.name)}">${escapeHtml(i.name)}</span>
            <span class="item-badge">${catEmoji[i.category] || '📌'}</span>
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
        ['loreNameInput', 'loreDescInput', 'loreImageInput'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('loreCategoryInput').value = 'item';
        await loadLore(currentProjectId); await loadWikiData(currentProjectId);
    } catch (e) { console.error('createLore:', e); }
}

async function deleteLore(event, id) {
    event.stopPropagation();
    showConfirm('This lore entry will be permanently deleted.', async () => {
        try { await api('DELETE', `/api/lore/${id}`); await loadLore(currentProjectId); await loadWikiData(currentProjectId); }
        catch (e) { console.error('deleteLore:', e); }
    }, 'Delete Lore Entry?');
}

async function openEditLoreModal(id) {
    try {
        const item = await api('GET', `/api/lore/${id}`);
        document.getElementById('loreNameInput').value = item.name || '';
        document.getElementById('loreCategoryInput').value = item.category || 'item';
        document.getElementById('loreDescInput').value = item.description || '';
        document.getElementById('loreImageInput').value = item.image_url || '';
        const preview = document.getElementById('loreImgPreview');
        if (item.image_url) { document.getElementById('loreImgPreviewEl').src = item.image_url; preview.style.display = 'block'; }
        else { preview.style.display = 'none'; }
        document.querySelector('#newLoreModal .modal-title').textContent = 'Edit Lore Entry';
        const btn = document.getElementById('confirmLoreBtn');
        btn.textContent = 'Save Changes'; btn.dataset.editId = id; btn.dataset.mode = 'edit';
        openModal(newLoreModal);
    } catch (e) { console.error('openEditLoreModal:', e); }
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
    } catch (e) { console.error('saveEditLore:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; resetLoreModal(); }
}

function resetLoreModal() {
    document.querySelector('#newLoreModal .modal-title').textContent = 'New Lore Entry';
    const btn = document.getElementById('confirmLoreBtn');
    btn.textContent = 'Create Entry'; delete btn.dataset.editId; delete btn.dataset.mode;
    ['loreNameInput', 'loreDescInput', 'loreImageInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('loreCategoryInput').value = 'item';
    document.getElementById('loreImgPreview').style.display = 'none';
    document.getElementById('loreImgPreviewEl').src = '';
    document.getElementById('loreImageFile').value = '';
}

// --- WIKI TOOLTIPS ---
async function loadWikiData(projectId) {
    try { wikiData = await api('GET', `/api/projects/${projectId}/wiki`); }
    catch (e) { console.error('loadWikiData:', e); }
}
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// --- WIKI TOOLTIPS ---
async function loadWikiData(projectId) {
    try { wikiData = await api('GET', `/api/projects/${projectId}/wiki`); }
    catch (e) { console.error('loadWikiData:', e); }
}

let wikiHoverTimer = null;
let activeTooltipSignature = '';

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
    } catch (e) { return; }

    const sortedKeys = Object.keys(wikiData).sort((a, b) => b.length - a.length);
    const textNode = range.startContainer;
    const paraText = textNode?.textContent || '';
    const paraTextLower = paraText.toLowerCase();
    const caretOffset = range.startOffset;

    if (!paraTextLower.trim()) { hideWikiTooltip(); return; }

    let matchedKey = null;
    for (const key of sortedKeys) {
        const searchKey = key.toLowerCase();
        let matchIndex = paraTextLower.indexOf(searchKey);

        while (matchIndex !== -1) {
            const matchEnd = matchIndex + searchKey.length;
            const beforeChar = matchIndex > 0 ? paraTextLower[matchIndex - 1] : '';
            const afterChar = matchEnd < paraTextLower.length ? paraTextLower[matchEnd] : '';
            const startsAtBoundary = !beforeChar || !/[a-z0-9_]/i.test(beforeChar);
            const endsAtBoundary = !afterChar || !/[a-z0-9_]/i.test(afterChar);
            const isInsideMatch = caretOffset >= matchIndex && caretOffset <= matchEnd;

            if (startsAtBoundary && endsAtBoundary && isInsideMatch) {
                matchedKey = key;
                break;
            }
            matchIndex = paraTextLower.indexOf(searchKey, matchIndex + 1);
        }

        if (matchedKey) {
            break;
        }
    }

    if (!matchedKey) { hideWikiTooltip(); return; }

    // Capture position NOW before any async work
    const x = e.clientX;
    const y = e.clientY;

    showWikiTooltip(matchedKey, x, y);
}

function showWikiTooltip(key, x, y) {
    // Use already-loaded wikiData — NO await, NO re-fetch here
    const entry = wikiData[key];
    if (!entry) return;

    const imgEl = document.getElementById('wikiTooltipImgEl');
    const imgWrap = document.getElementById('wikiCardImgWrap');
    const placeholder = document.getElementById('wikiCardPlaceholder');
    const nameEl = document.getElementById('wikiTooltipName');
    const typeEl = document.getElementById('wikiTooltipType');
    const bodyEl = document.getElementById('wikiCardBody');

    nameEl.textContent = entry.name;
    if (entry.type === 'character') {
        const parts = [];
        if (entry.role) parts.push(entry.role);
        if (entry.age) parts.push(`Age ${entry.age}`);
        typeEl.textContent = parts.join(' · ') || 'Character';
    } else {
        typeEl.textContent = entry.category || 'Lore';
    }

    // Image: assign onload BEFORE setting src, handle cached images too
    if (entry.image_url) {
        const focusPos = 'center center';

        imgEl.onload = () => { imgEl.style.objectPosition = focusPos; };
        imgEl.onerror = () => { imgWrap.style.display = 'none'; };

        const freshSrc = entry.image_url.startsWith('data:')
            ? entry.image_url
            : entry.image_url + '?t=' + Date.now();

        imgEl.src = '';
        imgEl.src = freshSrc;

        // Fallback: if already cached and complete, onload won't fire
        if (imgEl.complete && imgEl.naturalWidth > 0) {
            imgEl.style.objectPosition = focusPos;
        }

        imgEl.style.display = 'block';
        imgWrap.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        imgWrap.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    // Body content
    let bodyHtml = '';
    if (entry.type === 'character') {
        if (entry.summary) bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Personality</div><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`;
        if (entry.backstory) bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Backstory</div><div class="wiki-card-field-value">${escapeHtml(entry.backstory)}</div></div>`;
        if (entry.appearance) bodyHtml += `<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(entry.appearance)}</div></div>`;
    } else if (entry.summary) {
        bodyHtml = `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`;
    }
    bodyEl.innerHTML = bodyHtml || `<div class="wiki-card-field-value" style="color:var(--text-muted);font-style:italic;">No details added yet.</div>`;

    wikiTooltip.style.visibility = 'hidden';
    wikiTooltip.style.display = 'block';

    // Position tooltip after layout so the card can size to the full image.
    const cW = wikiTooltip.offsetWidth || 360;
    const cH = wikiTooltip.offsetHeight || 420;
    let left = x + 20;
    let top = y - 60;
    if (left + cW > window.innerWidth - 20) left = x - cW - 20;
    if (top + cH > window.innerHeight - 20) top = window.innerHeight - cH - 20;
    if (top < 10) top = 10;

    wikiTooltip.style.left = `${left}px`;
    wikiTooltip.style.top = `${top}px`;
    wikiTooltip.style.visibility = 'visible';
}

function hideWikiTooltip() { wikiTooltip.style.display = 'none'; }

function ensureWikiTooltipLayout() {
    const cardContent = wikiTooltip.querySelector('.wiki-card-content');
    if (!cardContent || document.getElementById('wikiCardFlow')) return;

    const imgWrap = document.getElementById('wikiCardImgWrap');
    const header = cardContent.querySelector('.wiki-card-header');
    const body = document.getElementById('wikiCardBody');
    if (!imgWrap || !header || !body) return;

    cardContent.innerHTML = `
        <div class="wiki-card-flow" id="wikiCardFlow">
            ${imgWrap.outerHTML}
            ${header.outerHTML}
            <div class="wiki-card-body" id="wikiCardBodyFlow"></div>
        </div>
    `;
}

function clearWikiHoverTimer() {
    if (wikiHoverTimer) {
        clearTimeout(wikiHoverTimer);
        wikiHoverTimer = null;
    }
}

let activeWikiHoverKey = null;
let activeWikiHoverToken = 0;
const WIKI_TOOLTIP_HOVER_DELAY_MS = 500;

function getWikiMatchAtPoint(clientX, clientY) {
    if (!wikiData || !Object.keys(wikiData).length) return null;

    let range;
    try {
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(clientX, clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (!pos) return null;
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
        }
        if (!range) return null;
        range.expand('word');
    } catch (e) { return null; }

    const sortedKeys = Object.keys(wikiData).sort((a, b) => b.length - a.length);
    const textNode = range.startContainer;
    const paraText = textNode?.textContent || '';
    const paraTextLower = paraText.toLowerCase();
    const caretOffset = range.startOffset;

    if (!paraTextLower.trim()) return null;

    for (const key of sortedKeys) {
        const searchKey = key.toLowerCase();
        let matchIndex = paraTextLower.indexOf(searchKey);

        while (matchIndex !== -1) {
            const matchEnd = matchIndex + searchKey.length;
            const beforeChar = matchIndex > 0 ? paraTextLower[matchIndex - 1] : '';
            const afterChar = matchEnd < paraTextLower.length ? paraTextLower[matchEnd] : '';
            const startsAtBoundary = !beforeChar || !/[a-z0-9_]/i.test(beforeChar);
            const endsAtBoundary = !afterChar || !/[a-z0-9_]/i.test(afterChar);
            const isInsideMatch = caretOffset >= matchIndex && caretOffset <= matchEnd;

            if (startsAtBoundary && endsAtBoundary && isInsideMatch && textNode?.nodeType === Node.TEXT_NODE) {
                const matchRange = document.createRange();
                matchRange.setStart(textNode, matchIndex);
                matchRange.setEnd(textNode, matchEnd);
                const rects = Array.from(matchRange.getClientRects());
                const isOverExactMatch = rects.some(rect =>
                    clientX >= rect.left &&
                    clientX <= rect.right &&
                    clientY >= rect.top &&
                    clientY <= rect.bottom
                );

                if (isOverExactMatch) return { key, x: clientX, y: clientY };
            }

            matchIndex = paraTextLower.indexOf(searchKey, matchIndex + 1);
        }
    }

    return null;
}

function handleWikiHover(e) {
    const match = getWikiMatchAtPoint(e.clientX, e.clientY);
    if (!match) {
        activeWikiHoverKey = null;
        activeWikiHoverToken += 1;
        clearWikiHoverTimer();
        hideWikiTooltip();
        return;
    }

    if (activeWikiHoverKey === match.key && wikiTooltip.style.display === 'block') return;

    activeWikiHoverToken += 1;
    const hoverToken = activeWikiHoverToken;
    activeWikiHoverKey = match.key;
    clearWikiHoverTimer();
    wikiHoverTimer = setTimeout(() => {
        const confirmedMatch = getWikiMatchAtPoint(match.x, match.y);
        if (!confirmedMatch || confirmedMatch.key !== match.key || hoverToken !== activeWikiHoverToken) return;
        showWikiTooltip(match.key, confirmedMatch.x, confirmedMatch.y);
    }, WIKI_TOOLTIP_HOVER_DELAY_MS);
}

function showWikiTooltip(key, x, y) {
    const entry = wikiData[key];
    if (!entry) return;
    const signature = `wiki:${key}`;
    if (activeTooltipSignature !== signature || wikiTooltip.style.display !== 'block') {
        if (!renderTooltipCard(buildWikiTooltipEntry(entry))) return;
        activeTooltipSignature = signature;
        wikiTooltip.style.visibility = 'hidden';
        wikiTooltip.style.display = 'block';
    }
    positionWikiTooltip(x, y);
    wikiTooltip.style.visibility = 'visible';
}

function hideWikiTooltip() {
    clearWikiHoverTimer();
    activeWikiHoverKey = null;
    activeWikiHoverToken += 1;
    activeTooltipSignature = '';
    wikiTooltip.classList.remove('compact');
    wikiTooltip.style.display = 'none';
}

function positionWikiTooltip(x, y) {
    const cW = wikiTooltip.offsetWidth || 360;
    const cH = wikiTooltip.offsetHeight || 420;
    let left = x + 18;
    let top = y - 36;
    if (left + cW > window.innerWidth - 16) left = x - cW - 18;
    if (top + cH > window.innerHeight - 16) top = window.innerHeight - cH - 16;
    if (top < 10) top = 10;
    if (left < 10) left = 10;
    wikiTooltip.style.left = `${left}px`;
    wikiTooltip.style.top = `${top}px`;
}

function renderTooltipCard(entry, { compact = false } = {}) {
    ensureWikiTooltipLayout();

    const flowEl = document.getElementById('wikiCardFlow');
    const imgEl = flowEl ? flowEl.querySelector('#wikiTooltipImgEl') : null;
    const imgWrap = flowEl ? flowEl.querySelector('#wikiCardImgWrap') : null;
    const nameEl = flowEl ? flowEl.querySelector('#wikiTooltipName') : document.getElementById('wikiTooltipName');
    const typeEl = flowEl ? flowEl.querySelector('#wikiTooltipType') : document.getElementById('wikiTooltipType');
    let titlesEl = flowEl ? flowEl.querySelector('#wikiTooltipTitles') : null;
    const bodyEl = document.getElementById('wikiCardBodyFlow');
    if (!flowEl || !imgEl || !imgWrap || !bodyEl) return false;
    if (!titlesEl) {
        typeEl.insertAdjacentHTML('afterend', '<div class="wiki-card-titles" id="wikiTooltipTitles"></div>');
        titlesEl = flowEl.querySelector('#wikiTooltipTitles');
    }

    wikiTooltip.classList.toggle('compact', compact);
    nameEl.textContent = entry.name || '';
    typeEl.textContent = entry.meta || '';
    titlesEl.textContent = entry.titlesText || '';
    titlesEl.style.display = entry.titlesText ? 'block' : 'none';

    if (entry.image_url) {
        flowEl.classList.remove('no-image');
        imgEl.onload = () => { imgEl.style.objectPosition = 'center center'; };
        imgEl.onerror = () => {
            flowEl.classList.add('no-image');
            imgWrap.style.display = 'none';
        };
        const freshSrc = entry.image_url.startsWith('data:')
            ? entry.image_url
            : entry.image_url + '?t=' + Date.now();
        imgEl.src = '';
        imgEl.src = freshSrc;
        imgEl.style.display = 'block';
        imgWrap.style.display = 'flex';
    } else {
        flowEl.classList.add('no-image');
        imgWrap.style.display = 'none';
    }

    bodyEl.innerHTML = entry.bodyHtml || `<div class="wiki-card-field-value" style="color:var(--text-muted);font-style:italic;">No details added yet.</div>`;
    return true;
}

function buildCharacterTooltipEntry(character, { compact = false } = {}) {
    const titleList = Array.isArray(character.titles) ? character.titles.filter(Boolean) : [];
    const meta = [character.role, ...titleList, character.age ? `Age ${character.age}` : ''].filter(Boolean).join(' · ') || 'Character';
    const fields = [];

    if (compact) {
        if (titleList.length) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Titles</div><div class="wiki-card-field-value">${escapeHtml(titleList.join(', '))}</div></div>`);
        if (character.role) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Role</div><div class="wiki-card-field-value">${escapeHtml(character.role)}</div></div>`);
        if (character.age) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Age</div><div class="wiki-card-field-value">${escapeHtml(character.age)}</div></div>`);
        if (character.appearance) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(character.appearance)}</div></div>`);
    } else {
        if (titleList.length) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Titles</div><div class="wiki-card-field-value">${escapeHtml(titleList.join(', '))}</div></div>`);
        if (character.personality) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Personality</div><div class="wiki-card-field-value">${escapeHtml(character.personality)}</div></div>`);
        if (character.backstory) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Backstory</div><div class="wiki-card-field-value">${escapeHtml(character.backstory)}</div></div>`);
        if (character.appearance) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(character.appearance)}</div></div>`);
        if (character.extra_notes) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Notes</div><div class="wiki-card-field-value">${escapeHtml(character.extra_notes)}</div></div>`);
    }

    return {
        name: character.name || '',
        meta,
        image_url: character.image_url || '',
        bodyHtml: fields.join('')
    };
}

function buildWikiTooltipEntry(entry) {
    if (entry.type === 'character') {
        return buildCharacterTooltipEntry({
            name: entry.name,
            role: entry.role || '',
            age: entry.age || '',
            titles: entry.titles || [],
            image_url: entry.image_url || '',
            personality: entry.summary || '',
            backstory: entry.backstory || '',
            appearance: entry.appearance || '',
            extra_notes: ''
        });
    }

    return {
        name: entry.name || '',
        meta: entry.category || 'Lore',
        image_url: entry.image_url || '',
        bodyHtml: entry.summary
            ? `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`
            : ''
    };
}

function showCharacterHoverTooltip(character, x, y, { compact = false } = {}) {
    const signature = `character:${character.id}:${compact ? 'compact' : 'full'}`;
    if (activeTooltipSignature !== signature || wikiTooltip.style.display !== 'block') {
        if (!renderTooltipCard(buildCharacterTooltipEntry(character, { compact }), { compact })) return;
        activeTooltipSignature = signature;
        wikiTooltip.style.visibility = 'hidden';
        wikiTooltip.style.display = 'block';
    }
    positionWikiTooltip(x, y);
    wikiTooltip.style.visibility = 'visible';
}

function buildCharacterTooltipEntry(character, { compact = false } = {}) {
    const titleList = Array.isArray(character.titles) ? character.titles.filter(Boolean) : [];
    const meta = [character.role, character.age ? `Age ${character.age}` : ''].filter(Boolean).join(' · ') || 'Character';
    const fields = [];

    if (compact) {
        if (character.role) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Role</div><div class="wiki-card-field-value">${escapeHtml(character.role)}</div></div>`);
        if (character.age) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Age</div><div class="wiki-card-field-value">${escapeHtml(character.age)}</div></div>`);
        if (character.appearance) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(character.appearance)}</div></div>`);
    } else {
        if (character.personality) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Personality</div><div class="wiki-card-field-value">${escapeHtml(character.personality)}</div></div>`);
        if (character.backstory) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Backstory</div><div class="wiki-card-field-value">${escapeHtml(character.backstory)}</div></div>`);
        if (character.appearance) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Appearance</div><div class="wiki-card-field-value">${escapeHtml(character.appearance)}</div></div>`);
        if (character.extra_notes) fields.push(`<div class="wiki-card-field"><div class="wiki-card-field-label">Notes</div><div class="wiki-card-field-value">${escapeHtml(character.extra_notes)}</div></div>`);
    }

    return {
        name: character.name || '',
        meta,
        titlesText: titleList.join(' · '),
        image_url: character.image_url || '',
        bodyHtml: fields.join('')
    };
}

function buildWikiTooltipEntry(entry) {
    if (entry.type === 'character') {
        return buildCharacterTooltipEntry({
            name: entry.name,
            role: entry.role || '',
            age: entry.age || '',
            titles: entry.titles || [],
            image_url: entry.image_url || '',
            personality: entry.summary || '',
            backstory: entry.backstory || '',
            appearance: entry.appearance || '',
            extra_notes: ''
        });
    }

    return {
        name: entry.name || '',
        meta: entry.category || 'Lore',
        titlesText: '',
        image_url: entry.image_url || '',
        bodyHtml: entry.summary
            ? `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`
            : ''
    };
}

// --- NOTES PANEL ---
let notesAutoSaveTimer = null;
let notesPanelOpen = false;

async function loadNotes(projectId) {
    try {
        const note = await api('GET', `/api/projects/${projectId}/notes`);
        document.getElementById('notesTextarea').value = note.content || '';
        setNotesSaveStatus('');
    } catch (e) { console.error('loadNotes:', e); }
}

async function saveNotes() {
    if (!currentProjectId) return;
    setNotesSaveStatus('Saving...');
    try {
        await api('PUT', `/api/projects/${currentProjectId}/notes`, { content: document.getElementById('notesTextarea').value });
        setNotesSaveStatus('Saved ✓');
        setTimeout(() => setNotesSaveStatus(''), 2000);
    } catch (e) { setNotesSaveStatus('Error'); console.error('saveNotes:', e); }
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
    } catch (e) { console.error('search:', e); }
}

function renderSearchResults(query) {
    const container = document.getElementById('searchResults');
    if (!searchResults.length) {
        container.innerHTML = `<div class="search-empty">No results for "<strong>${escapeHtml(query)}</strong>"</div>`;
        return;
    }
    const groups = { chapter: [], scene: [], character: [], lore: [] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });
    const labels = { chapter: '📄 Chapters', scene: '⚡ Scenes', character: '👤 Characters', lore: '📖 Lore' };
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
    const groups = { chapter: [], scene: [], character: [], lore: [] };
    searchResults.forEach(r => { if (groups[r.type]) groups[r.type].push(r); });
    Object.values(groups).forEach(items => items.forEach(i => flat.push(i)));
    const result = flat[idx];
    if (!result) return;
    closeSearch();
    if (result.type === 'chapter') { switchTab('chapters'); openDocument(result.id, 'chapter'); }
    else if (result.type === 'scene') { switchTab('scenes'); openDocument(result.id, 'scene'); }
    else if (result.type === 'character') { switchTab('characters'); openEditCharModal(result.id); }
    else if (result.type === 'lore') { switchTab('lore'); openEditLoreModal(result.id); }
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
    if (e.key === 'ArrowUp') { e.preventDefault(); navigateSearch(-1); }
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
let relIsPanning = false, relPanStart = { x: 0, y: 0 };
let relCanvas = null, relCtx = null;
let relHoveredNodeId = null;
const RELATION_TYPE_OPTIONS = [
    ['allies', 'Allies'],
    ['rivals', 'Rivals'],
    ['lovers', 'Lovers'],
    ['enemies', 'Enemies'],
    ['family', 'Family'],
    ['mentor', 'Mentor / Student'],
    ['friends', 'Friends'],
    ['complicated', 'Complicated'],
    ['strangers', 'Strangers'],
    ['custom', 'Custom']
];

function formatRelationLabel(value) {
    if (!value) return 'Relationship';
    const preset = RELATION_TYPE_OPTIONS.find(([key]) => key === value);
    return preset ? preset[1] : value;
}

function isRelWebOpen() {
    return document.getElementById('relWebOverlay')?.style.display !== 'none';
}

function ensureRelationTypeInputs() {
    const newSelect = document.getElementById('relTypeInput');
    const editSelect = document.getElementById('editRelTypeInput');
    if (!newSelect || !editSelect) return;

    const optionHtml = RELATION_TYPE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    newSelect.innerHTML = optionHtml;
    editSelect.innerHTML = optionHtml;

    if (!document.getElementById('relCustomTypeInput')) {
        newSelect.insertAdjacentHTML('afterend', '<input type="text" class="modal-input" id="relCustomTypeInput" placeholder="e.g. Brother, Sister, Cousins..." style="display:none;">');
    }
    if (!document.getElementById('editRelCustomTypeInput')) {
        editSelect.insertAdjacentHTML('afterend', '<input type="text" class="modal-input" id="editRelCustomTypeInput" placeholder="e.g. Brother, Sister, Cousins..." style="display:none;">');
    }

    updateRelationCustomInput('rel');
    updateRelationCustomInput('edit');
}

function updateRelationCustomInput(mode) {
    const select = document.getElementById(mode === 'edit' ? 'editRelTypeInput' : 'relTypeInput');
    const input = document.getElementById(mode === 'edit' ? 'editRelCustomTypeInput' : 'relCustomTypeInput');
    if (!select || !input) return;
    const isCustom = select.value === 'custom';
    input.style.display = isCustom ? 'block' : 'none';
    input.required = isCustom;
}

function getSelectedRelationType(mode) {
    const select = document.getElementById(mode === 'edit' ? 'editRelTypeInput' : 'relTypeInput');
    const input = document.getElementById(mode === 'edit' ? 'editRelCustomTypeInput' : 'relCustomTypeInput');
    if (!select) return '';
    if (select.value !== 'custom') return select.value;
    const customValue = input?.value.trim() || '';
    return customValue;
}

async function loadRelationships(projectId) {
    try { renderRelationshipsList(await api('GET', `/api/projects/${projectId}/relationships`)); }
    catch (e) { console.error('loadRelationships:', e); }
}

function renderRelationshipsList(rels) {
    const emoji = { allies: '🤝', rivals: '⚔️', lovers: '💕', enemies: '🖤', family: '👨‍👩‍👧', mentor: '🧭', friends: '😊', complicated: '🌀', strangers: '👥' };
    if (!rels.length) { relationshipsList.innerHTML = '<li class="empty-state">No relationships yet.</li>'; return; }
    relationshipsList.innerHTML = rels.map(r => `
        <li class="item-list-entry">
            <span class="item-name" style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0;display:inline-block;"></span>
                ${escapeHtml(r.char_a_name)}
                <span style="color:var(--text-muted);font-size:11px;">${emoji[r.relation_type] || '↔'} ${r.relation_type}</span>
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
    } catch (e) { console.error('openNewRelModal:', e); }
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
    } catch (e) { console.error('createRelationship:', e); }
    finally { btn.textContent = 'Add Relationship'; btn.disabled = false; }
}

async function deleteRelationship(event, id) {
    event.stopPropagation();
    showConfirm('This relationship will be removed.', async () => {
        try {
            await api('DELETE', `/api/relationships/${id}`);
            await loadRelationships(currentProjectId);
            if (document.getElementById('relWebOverlay').style.display !== 'none') await openRelWeb();
        } catch (e) { console.error('deleteRelationship:', e); }
    }, 'Remove Relationship?');
}

let editingRelId = null, editRelColor = '#7b6fb0';

function openEditRelModal(edge) {
    editingRelId = edge.id; editRelColor = edge.color || '#7b6fb0';
    document.getElementById('editRelCharNames').textContent = `${edge.char_a_name}  ↔  ${edge.char_b_name}`;
    document.getElementById('editRelTypeInput').value = edge.relation_type || 'allies';
    document.getElementById('editRelDescInput').value = edge.description || '';
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
    } catch (e) { console.error('saveEditRel:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
}

async function deleteRelFromEdit() {
    const id = editingRelId;
    closeModal(document.getElementById('editRelModal'));
    try { await api('DELETE', `/api/relationships/${id}`); await loadRelationships(currentProjectId); await openRelWeb(); }
    catch (e) { console.error('deleteRelFromEdit:', e); }
}

function renderRelationshipsList(rels) {
    if (!rels.length) { relationshipsList.innerHTML = '<li class="empty-state">No relationships yet.</li>'; return; }
    relationshipsList.innerHTML = rels.map(r => `
        <li class="item-list-entry">
            <span class="item-name" title="${escapeHtml(`${r.char_a_name} ${formatRelationLabel(r.relation_type)} ${r.char_b_name}`)}" style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0;display:inline-block;"></span>
                ${escapeHtml(r.char_a_name)}
                <span style="color:var(--text-muted);font-size:11px;">${escapeHtml(formatRelationLabel(r.relation_type))}</span>
                ${escapeHtml(r.char_b_name)}
            </span>
            <button class="item-delete" aria-label="Delete relationship" title="Delete relationship" onclick="deleteRelationship(event,${r.id})">&times;</button>
        </li>`).join('');
}

async function openNewRelModal(options = {}) {
    try {
        const chars = await api('GET', `/api/projects/${currentProjectId}/characters`);
        if (chars.length < 2) { alert('You need at least 2 characters!'); return; }
        const charOptions = chars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        document.getElementById('relCharAInput').innerHTML = charOptions;
        document.getElementById('relCharBInput').innerHTML = charOptions;
        if (typeof options.preselectCharA === 'number') {
            document.getElementById('relCharAInput').value = String(options.preselectCharA);
            const fallbackCharB = chars.find(c => c.id !== options.preselectCharA);
            if (fallbackCharB) document.getElementById('relCharBInput').value = String(fallbackCharB.id);
        } else if (chars.length > 1) {
            document.getElementById('relCharBInput').value = chars[1].id;
        }
        document.getElementById('relTypeInput').value = 'allies';
        const customInput = document.getElementById('relCustomTypeInput');
        if (customInput) customInput.value = '';
        updateRelationCustomInput('new');
        relSelectedColor = '#7b6fb0';
        document.querySelectorAll('#relColorPicker .rel-color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === relSelectedColor));
        openModal(newRelModal);
    } catch (e) { console.error('openNewRelModal:', e); }
}

function openEditRelModal(edge) {
    editingRelId = edge.id;
    editRelColor = edge.color || '#7b6fb0';
    document.getElementById('editRelCharNames').textContent = `${edge.char_a_name} <-> ${edge.char_b_name}`;
    const select = document.getElementById('editRelTypeInput');
    const customInput = document.getElementById('editRelCustomTypeInput');
    const isPreset = RELATION_TYPE_OPTIONS.some(([value]) => value === edge.relation_type && value !== 'custom');
    select.value = isPreset ? edge.relation_type : 'custom';
    if (customInput) customInput.value = isPreset ? '' : (edge.relation_type || '');
    updateRelationCustomInput('edit');
    document.getElementById('editRelDescInput').value = edge.description || '';
    document.querySelectorAll('#editRelColorPicker .rel-color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === editRelColor));
    openModal(document.getElementById('editRelModal'));
}

async function createRelationship() {
    const charA = parseInt(document.getElementById('relCharAInput').value);
    const charB = parseInt(document.getElementById('relCharBInput').value);
    if (charA === charB) { alert('Select two different characters!'); return; }
    const relationType = getSelectedRelationType('new');
    if (!relationType) {
        document.getElementById('relCustomTypeInput')?.focus();
        return;
    }
    const btn = document.getElementById('confirmRelBtn');
    btn.textContent = 'Adding...'; btn.disabled = true;
    try {
        await api('POST', `/api/projects/${currentProjectId}/relationships`, {
            char_a_id: charA, char_b_id: charB,
            relation_type: relationType,
            description: document.getElementById('relDescInput').value.trim(),
            color: relSelectedColor
        });
        closeModal(newRelModal);
        document.getElementById('relDescInput').value = '';
        const customInput = document.getElementById('relCustomTypeInput');
        if (customInput) customInput.value = '';
        document.getElementById('relTypeInput').value = 'allies';
        updateRelationCustomInput('new');
        await loadRelationships(currentProjectId);
        if (isRelWebOpen()) await openRelWeb();
    } catch (e) { console.error('createRelationship:', e); }
    finally { btn.textContent = 'Add Relationship'; btn.disabled = false; }
}

async function saveEditRel() {
    if (!editingRelId) return;
    const relationType = getSelectedRelationType('edit');
    if (!relationType) {
        document.getElementById('editRelCustomTypeInput')?.focus();
        return;
    }
    const btn = document.getElementById('confirmEditRelBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/relationships/${editingRelId}`, {
            relation_type: relationType,
            description: document.getElementById('editRelDescInput').value.trim(),
            color: editRelColor
        });
        closeModal(document.getElementById('editRelModal'));
        await loadRelationships(currentProjectId); await openRelWeb();
    } catch (e) { console.error('saveEditRel:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
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
        document.body.classList.add("rel-web-open");
        relCanvas = document.getElementById('relWebCanvas');
        relCtx = relCanvas.getContext('2d');
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
            return {
                id: c.id,
                name: c.name,
                role: c.role || '',
                titles: c.titles || [],
                age: c.age || '',
                personality: c.personality || '',
                backstory: c.backstory || '',
                appearance: c.appearance || '',
                extra_notes: c.extra_notes || '',
                image_url: c.image_url || '',
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle),
                img: null
            };
        });
        relEdges = rels;
        relHoveredNodeId = null;
        relNodes.forEach(node => {
            if (node.image_url) {
                const img = new Image(); img.src = node.image_url;
                img.onload = () => { node.img = img; drawRelWeb(); };
            }
        });
        drawRelWeb(); setupRelCanvasEvents();
    } catch (e) { console.error('openRelWeb:', e); }
}

function relZoomIn() { relZoom = Math.min(relZoom * 1.2, 4); drawRelWeb(); }
function relZoomOut() { relZoom = Math.max(relZoom * 0.8, 0.2); drawRelWeb(); }
function relZoomReset() { relZoom = 1; relPanX = 0; relPanY = 0; drawRelWeb(); }

function drawRelWeb() {
    if (!relCtx || !relCanvas) return;
    const ctx = relCtx;
    const W = relCanvas._cssW || relCanvas.offsetWidth;
    const H = relCanvas._cssH || relCanvas.offsetHeight;
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#f0eeff';
    const bgModal = style.getPropertyValue('--bg-modal').trim() || '#181a2e';
    const bgHover = style.getPropertyValue('--bg-hover').trim() || 'rgba(160,160,170,0.25)';
    const connectedNodeIds = new Set();
    if (relHoveredNodeId) {
        connectedNodeIds.add(relHoveredNodeId);
        relEdges.forEach(edge => {
            if (edge.char_a_id === relHoveredNodeId || edge.char_b_id === relHoveredNodeId) {
                connectedNodeIds.add(edge.char_a_id);
                connectedNodeIds.add(edge.char_b_id);
            }
        });
    }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(relPanX, relPanY);
    ctx.scale(relZoom, relZoom);

    const pairCount = {}, pairIndex = {};
    relEdges.forEach(edge => {
        const key = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        pairCount[key] = (pairCount[key] || 0) + 1;
    });

    const relTypeEmoji = { allies: '🤝', rivals: '⚔️', lovers: '💕', enemies: '🖤', family: '👨‍👩‍👧', mentor: '🧭', friends: '😊', complicated: '🌀', strangers: '👥' };

    relEdges.forEach(edge => {
        const nodeA = relNodes.find(n => n.id === edge.char_a_id);
        const nodeB = relNodes.find(n => n.id === edge.char_b_id);
        if (!nodeA || !nodeB) return;
        const isRelatedToHover = relHoveredNodeId && (edge.char_a_id === relHoveredNodeId || edge.char_b_id === relHoveredNodeId);
        const key = [Math.min(edge.char_a_id, edge.char_b_id), Math.max(edge.char_a_id, edge.char_b_id)].join('-');
        const total = pairCount[key] || 1;
        pairIndex[key] = pairIndex[key] || 0;
        const idx = pairIndex[key]++;
        const dx = nodeB.x - nodeA.x, dy = nodeB.y - nodeA.y;
        const len = Math.hypot(dx, dy) || 1;
        const offset = total === 1 ? 0 : (idx - (total - 1) / 2) * 55;
        const cpX = (nodeA.x + nodeB.x) / 2 + (-dy / len) * offset;
        const cpY = (nodeA.y + nodeB.y) / 2 + (dx / len) * offset;
        edge._cpX = cpX; edge._cpY = cpY;
        edge._ax = nodeA.x; edge._ay = nodeA.y;
        edge._bx = nodeB.x; edge._by = nodeB.y;

        ctx.beginPath(); ctx.moveTo(nodeA.x, nodeA.y);
        ctx.quadraticCurveTo(cpX, cpY, nodeB.x, nodeB.y);
        ctx.strokeStyle = edge.color || '#7b6fb0';
        ctx.lineWidth = isRelatedToHover ? 4.5 : 2.5;
        ctx.globalAlpha = relHoveredNodeId ? (isRelatedToHover ? 1 : 0.06) : 0.8;
        ctx.stroke();
        ctx.globalAlpha = 1;

        const lx = 0.25 * nodeA.x + 0.5 * cpX + 0.25 * nodeB.x;
        const ly = 0.25 * nodeA.y + 0.5 * cpY + 0.25 * nodeB.y;
        const relLabel = formatRelationLabel(edge.relation_type);
        ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const labelW = Math.max(42, ctx.measureText(relLabel).width + 16);
        ctx.fillStyle = relHoveredNodeId ? (isRelatedToHover ? bgHover : 'rgba(118,118,126,0.24)') : bgModal; ctx.beginPath(); ctx.roundRect(lx - labelW / 2, ly - 11, labelW, 22, 6); ctx.fill();
        ctx.globalAlpha = relHoveredNodeId ? (isRelatedToHover ? 1 : 0.12) : 1;
        ctx.strokeStyle = edge.color || '#7b6fb0'; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = relHoveredNodeId ? (isRelatedToHover ? 1 : 0.4) : 1;
        ctx.fillStyle = relHoveredNodeId ? (isRelatedToHover ? textPrimary : 'rgba(225,225,232,0.42)') : textPrimary;
        ctx.fillText(relLabel, lx, ly);
        ctx.globalAlpha = 1;
    });

    const nr = 38;
    relNodes.forEach(node => {
        const isHoverFocus = relHoveredNodeId === node.id;
        const isHoverRelated = connectedNodeIds.has(node.id);
        const drawY = node.y - (isHoverRelated ? 6 : 0);
        const drawR = nr + (isHoverFocus ? 3 : 0);
        ctx.save(); ctx.beginPath(); ctx.arc(node.x, drawY, drawR, 0, Math.PI * 2); ctx.clip();
        ctx.globalAlpha = relHoveredNodeId ? (isHoverRelated ? 1 : 0.16) : 1;
        if (node.img && node.img.complete && node.img.naturalWidth > 0) {
            const iw = node.img.naturalWidth;
            const ih = node.img.naturalHeight;
            const srcSize = Math.min(iw, ih);
            const srcX = (iw - srcSize) / 2;
            const srcY = (ih - srcSize) / 2;
            ctx.drawImage(node.img, srcX, srcY, srcSize, srcSize, node.x - drawR, drawY - drawR, drawR * 2, drawR * 2);
        } else {
            const grad = ctx.createRadialGradient(node.x, drawY - drawR * 0.3, 0, node.x, drawY, drawR);
            grad.addColorStop(0, '#5b7fb0'); grad.addColorStop(1, '#7b6fb0');
            ctx.fillStyle = grad; ctx.fillRect(node.x - drawR, drawY - drawR, drawR * 2, drawR * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = 'bold 22px serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(node.name.charAt(0).toUpperCase(), node.x, drawY);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(node.x, drawY, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = relHoveredNodeId ? (isHoverRelated ? '#d7d2e2' : 'rgba(123,111,176,0.22)') : '#7b6fb0'; ctx.lineWidth = isHoverFocus ? 4.5 : 2.5; ctx.stroke();

        ctx.font = `600 13px 'DM Sans', sans-serif`;
        const nameW = ctx.measureText(node.name).width + 16, nameH = 22;
        const nameX = node.x - nameW / 2, nameY = drawY + drawR + 6;
        ctx.fillStyle = relHoveredNodeId ? (isHoverRelated ? bgHover : 'rgba(118,118,126,0.26)') : bgModal; ctx.beginPath(); ctx.roundRect(nameX, nameY, nameW, nameH, 6); ctx.fill();
        ctx.fillStyle = relHoveredNodeId ? (isHoverRelated ? textPrimary : 'rgba(225,225,232,0.42)') : textPrimary; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x, nameY + nameH / 2);

        let roleBounds = null;
        if (node.role) {
            ctx.font = `11px 'DM Sans', sans-serif`;
            const rW = ctx.measureText(node.role).width + 12, rY = nameY + nameH + 3;
            ctx.fillStyle = relHoveredNodeId ? (isHoverRelated ? bgHover : 'rgba(118,118,126,0.22)') : 'rgba(157,143,212,0.15)'; ctx.beginPath(); ctx.roundRect(node.x - rW / 2, rY, rW, 18, 5); ctx.fill();
            ctx.fillStyle = relHoveredNodeId ? (isHoverRelated ? '#9d8fd4' : 'rgba(190,190,205,0.38)') : '#9d8fd4'; ctx.textBaseline = 'middle'; ctx.fillText(node.role, node.x, rY + 9);
            roleBounds = { x: node.x - rW / 2, y: rY, w: rW, h: 18 };
        }
        node._hoverBounds = { cx: node.x, cy: drawY, r: drawR, nameX, nameY, nameW, nameH, roleBounds };
    });
    ctx.restore();
}

function getRelNodeAtPoint(cx, cy) {
    return relNodes.find(node => {
        const bounds = node._hoverBounds;
        if (!bounds) return false;
        const onCircle = Math.hypot(bounds.cx - cx, bounds.cy - cy) <= bounds.r;
        const onName = cx >= bounds.nameX && cx <= bounds.nameX + bounds.nameW && cy >= bounds.nameY && cy <= bounds.nameY + bounds.nameH;
        const onRole = bounds.roleBounds && cx >= bounds.roleBounds.x && cx <= bounds.roleBounds.x + bounds.roleBounds.w &&
            cy >= bounds.roleBounds.y && cy <= bounds.roleBounds.y + bounds.roleBounds.h;
        return onCircle || onName || onRole;
    }) || null;
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
        mouseDownPos = { x: mx, y: my }; mouseDownTime = Date.now();
        const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
        hideWikiTooltip();
        relDragging = relNodes.find(n => Math.hypot(n.x - cx, n.y - cy) < 42);
        if (relDragging) { relDragOffX = relDragging.x - cx; relDragOffY = relDragging.y - cy; }
        else { relIsPanning = true; relPanStart = { x: mx - relPanX, y: my - relPanY }; relCanvas.style.cursor = 'grabbing'; }
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
        } else {
            const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
            const hoveredNode = getRelNodeAtPoint(cx, cy);
            const hoveredId = hoveredNode?.id || null;
            if (hoveredId !== relHoveredNodeId) {
                relHoveredNodeId = hoveredId;
                drawRelWeb();
            }
            if (hoveredNode) {
                relCanvas.style.cursor = 'pointer';
                showCharacterHoverTooltip(hoveredNode, e.clientX, e.clientY, { compact: true });
            } else {
                relCanvas.style.cursor = 'grab';
                hideWikiTooltip();
            }
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

    relCanvas.ondblclick = (e) => {
        const rect = relCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
        const clickedNode = getRelNodeAtPoint(cx, cy);
        if (clickedNode) {
            openNewRelModal({ preselectCharA: clickedNode.id });
        }
    };

    relCanvas.onmouseleave = () => {
        relDragging = null;
        relIsPanning = false;
        relHoveredNodeId = null;
        relCanvas.style.cursor = 'grab';
        hideWikiTooltip();
        drawRelWeb();
    };

    window.addEventListener('resize', () => {
        if (document.getElementById('relWebOverlay').style.display !== 'none') {
            const dpr = window.devicePixelRatio || 1;
            relCanvas.width = relCanvas.offsetWidth * dpr;
            relCanvas.height = relCanvas.offsetHeight * dpr;
            relCanvas._dpr = dpr; relCanvas._cssW = relCanvas.offsetWidth; relCanvas._cssH = relCanvas.offsetHeight;
            relCtx.scale(dpr, dpr); drawRelWeb();
        }
    });
}

function isNearCurve(mx, my, edge) {
    if (edge._ax === undefined) return false;
    for (let t = 0; t <= 1; t += 0.05) {
        const bx = (1 - t) * (1 - t) * edge._ax + 2 * (1 - t) * t * edge._cpX + t * t * edge._bx;
        const by = (1 - t) * (1 - t) * edge._ay + 2 * (1 - t) * t * edge._cpY + t * t * edge._by;
        if (Math.hypot(mx - bx, my - by) < 10) return true;
    }
    return false;
}

function closeRelWeb() {
    document.getElementById('relWebOverlay').style.display = 'none';
    document.body.classList.remove("rel-web-open");
    relDragging = null;
}
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
    const icon = { chapter: '📄', scene: '⚡' };
    openTabsEl.innerHTML = openTabs.map(t => `
        <div class="open-tab ${t.id === currentDocId && t.type === currentDocType ? 'active' : ''}"
             data-id="${t.id}" data-type="${t.type}" onclick="openDocument(${t.id},'${t.type}')">
            <span style="font-size:11px;margin-right:4px;">${icon[t.type] || '📄'}</span>
            <span class="open-tab-name">${escapeHtml(t.title)}</span>
            <button class="open-tab-close" onclick="closeTab(event,${t.id},'${t.type}')">×</button>
        </div>`).join('');
}

function closeTab(event, id, type) {
    event.stopPropagation();
    openTabs = openTabs.filter(t => !(t.id === id && t.type === type));
    renderTabs();
    if (currentDocId === id && currentDocType === type) {
        if (openTabs.length) { const last = openTabs[openTabs.length - 1]; openDocument(last.id, last.type); }
        else { currentDocId = null; hideEditor(); tabsBar.style.display = 'none'; }
    }
    if (!openTabs.length) tabsBar.style.display = 'none';
}

// --- AUTO-SAVE & LOCALSTORAGE ---
function getLocalKey(key) { return `scripvia_doc_${storageScopeKey}_${key}`; }

function saveToLocalStorage() {
    if (!currentDocId || !quill) return;
    try { localStorage.setItem(getLocalKey(`${currentDocType}_${currentDocId}`), JSON.stringify({ title: docTitleInput.value, content: quill.root.innerHTML, savedAt: Date.now() })); }
    catch (e) { }
}

function loadFromLocalStorage(key) {
    try { const raw = localStorage.getItem(getLocalKey(key)); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
}

function clearLocalStorage(key) { try { localStorage.removeItem(getLocalKey(key)); } catch (e) { } }

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
    if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    return `${Math.floor(d / 3600)}h ago`;
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
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    secondsUntilSave = 30;
}

function resetCountdown() { secondsUntilSave = 30; }

// --- OFFLINE/ONLINE ---
window.addEventListener('online', async () => {
    if (pendingSync && currentDocId && currentDocType === 'chapter') {
        setSaveStatus('syncing');
        try { await saveDocument(); pendingSync = false; } catch (e) { }
    }
});

// --- STATS ---
function updateStats() {
    if (!quill) return;
    const text = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(w => w.length > 0) : [];
    if (wordCountEl) wordCountEl.textContent = `${words.length.toLocaleString()} word${words.length !== 1 ? 's' : ''}`;
    if (charCountEl) charCountEl.textContent = `${text.length.toLocaleString()} char${text.length !== 1 ? 's' : ''}`;
    if (readTimeEl) readTimeEl.textContent = `~${Math.max(1, Math.ceil(words.length / 200))} min read`;
    updateFocusWordCount();
}

function updateLastSaved() {
    if (!lastSavedTimeEl) return;
    lastSavedTimeEl.textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
    if (wordCountEl) wordCountEl.textContent = '0 words';
    if (charCountEl) charCountEl.textContent = '0 chars';
    if (readTimeEl) readTimeEl.textContent = '~0 min read';
    if (lastSavedTimeEl) lastSavedTimeEl.textContent = 'Never saved';
    document.getElementById('notesToggleBtn').style.display = 'none';
    document.getElementById('focusModeBtn').style.display = 'none';
    document.getElementById('searchBtn').style.display = 'none';
    closeNotesPanel(); closeSearch();
    if (isFocusMode) exitFocusMode();
}

function setSaveStatus(status) {
    const map = { saved: '✓ Saved', saving: 'Saving...', syncing: '↑ Syncing...', synced: '✓ Synced', unsaved: '● Unsaved', error: '✗ Error', '': '' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className = 'save-status ' + status;
}

function enableHeaderBtns(on) { saveBtn.disabled = exportPdfBtn.disabled = exportDocxBtn.disabled = !on; }

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- MODALS ---
function openModal(modal) {
    if (!modal) {
        console.warn('openModal called with null modal');
        return;
    }
    modal.classList.add('active');
}
function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
}

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
    document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
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
exportPdfBtn.addEventListener('click', () => { if (currentDocId && currentDocType === 'chapter') window.location.href = `/api/documents/${currentDocId}/export/pdf`; });
exportDocxBtn.addEventListener('click', () => { if (currentDocId && currentDocType === 'chapter') window.location.href = `/api/documents/${currentDocId}/export/docx`; });

// --- AUTH ---
async function checkAuthState() {
    try {
        const data = await api('GET', '/auth/me');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        if (data.logged_in) {
            storageScopeKey = data.scope_key || `user_${data.user.id}`;
            loginBtn.style.display = 'none'; userInfo.classList.remove('hidden');
            document.getElementById('userAvatar').src = data.user.picture;
            document.getElementById('userName').textContent = data.user.name.split(' ')[0];
        } else {
            storageScopeKey = data.scope_key || localStorage.getItem('scripvia_guest_scope') || `guest_${Date.now()}`;
            localStorage.setItem('scripvia_guest_scope', storageScopeKey);
            const guest = localStorage.getItem('scripvia_guest');
            if (guest) showGuestUser(JSON.parse(guest).name);
            else { loginBtn.style.display = 'flex'; userInfo.classList.add('hidden'); }
        }
    } catch (e) { console.error('checkAuthState:', e); }
}

function showGuestUser(name) {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('userName').textContent = name + ' (guest)';
    document.getElementById('userAvatar').style.display = 'none';
}

// --- EVENT LISTENERS ---
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

document.getElementById('newCharBtn').addEventListener('click', () => {
    resetCharModal();
    openModal(newCharModal);
});
document.getElementById('cancelCharBtn').addEventListener('click', () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('cancelCharBtnX').addEventListener('click', () => { resetCharModal(); closeModal(newCharModal); });
document.getElementById('confirmCharBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmCharBtn');
    btn.dataset.mode === 'edit' && btn.dataset.editId ? saveEditChar(parseInt(btn.dataset.editId)) : createCharacter();
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
    btn.dataset.mode === 'edit' && btn.dataset.editId ? saveEditLore(parseInt(btn.dataset.editId)) : createLore();
});

saveBtn.addEventListener('click', saveDocument);

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {

    ensureWikiTooltipLayout();
    ensureRelationTypeInputs();
    ensureCharacterTitlesUI();
    document.getElementById('wikiCardClose').addEventListener('click', hideWikiTooltip);
    document.getElementById('backToOverview').addEventListener('click', () => { hideEditor(); showProjectOverview(currentProjectId); });
    document.getElementById('notesToggleBtn').addEventListener('click', toggleNotesPanel);
    document.getElementById('notesPanelClose').addEventListener('click', closeNotesPanel);
    document.getElementById('focusModeBtn').addEventListener('click', toggleFocusMode);
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('newRelBtn').addEventListener('click', openNewRelModal);
    document.getElementById('viewRelWebBtn').addEventListener('click', openRelWeb);
    document.getElementById('relWebClose').addEventListener('click', closeRelWeb);
    document.getElementById('relWebAddBtn').addEventListener('click', () => openNewRelModal());
    document.getElementById('cancelRelBtn').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('cancelRelBtnX').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('confirmRelBtn').addEventListener('click', createRelationship);
    document.getElementById('confirmEditRelBtn').addEventListener('click', saveEditRel);
    document.getElementById('relTypeInput').addEventListener('change', () => updateRelationCustomInput('new'));
    document.getElementById('editRelTypeInput').addEventListener('change', () => updateRelationCustomInput('edit'));
    document.getElementById('cancelEditRelBtn').addEventListener('click', () => closeModal(document.getElementById('editRelModal')));
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
    setupImageUpload('charImageFile', 'charImageInput', 'charImgPreview', 'charImgPreviewEl', 'clearCharImg', true);
    setupImageUpload('loreImageFile', 'loreImageInput', 'loreImgPreview', 'loreImgPreviewEl', 'clearLoreImg', false);
    document.getElementById('cropConfirmBtn')?.addEventListener('click', confirmCrop);
    document.getElementById('cropModalClose')?.addEventListener('click', () => closeModal(document.getElementById('cropModal')));
    document.getElementById('cropCancelBtn')?.addEventListener('click', () => closeModal(document.getElementById('cropModal')));
});
