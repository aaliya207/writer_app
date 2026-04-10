// Scripvia - Main Frontend Logic v0.2

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
let currentLoreItems = [];
let storageScopeKey = 'guest_default';
let relResizeHandler = null;
let loreWebResizeHandler = null;
let currentLoreWebView = 'mixed';
let currentLoreWebViews = [];
let currentTab = 'chapters';
let projectListCache = [];
const projectStatsCache = new Map();
const documentsCache = new Map();
const documentContentCache = new Map();
let pendingSyncPromise = null;
let authState = {
    loggedIn: false,
    mode: 'guest'
};

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
const newLoreRelModal = document.getElementById('newLoreRelModal');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectDescInput = document.getElementById('projectDescInput');
const projectGenreInput = document.getElementById('projectGenreInput');
const docTitleModalInput = document.getElementById('docTitleModalInput');
const loreTimelineEl = document.getElementById('loreTimeline');
const loreMapBoard = document.getElementById('loreMapBoard');
const loreMapLines = document.getElementById('loreMapLines');
const loreMapList = document.getElementById('loreMapList');
const loreWebViewSelect = document.getElementById('loreWebViewSelect');

const CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical'];

function isSignedInMode() {
    return authState.loggedIn;
}

function canAttemptDriveSync() {
    return isSignedInMode() && navigator.onLine;
}

function shouldQueueDriveSync() {
    return isSignedInMode() && !navigator.onLine;
}

function updateSaveButtonState() {
    if (!saveBtn) return;
    if (isSignedInMode()) {
        saveBtn.textContent = navigator.onLine ? 'Save & Sync' : 'Save Offline';
        saveBtn.title = navigator.onLine ? 'Save locally and sync to Drive' : 'Save locally now and sync to Drive when internet returns';
    } else {
        saveBtn.textContent = 'Save Locally';
        saveBtn.title = 'Save on this device only';
    }
}

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
function getDialogIcon(tone) {
    const map = {
        info: '\u{1F4A1}',
        success: '\u2705',
        warning: '\u26A0\uFE0F',
        danger: '\u{1F6A8}'
    };
    return map[tone] || map.info;
}

function showDialog({
    title = 'Notice',
    message = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    tone = 'info',
    showCancel = false
} = {}) {
    const existing = document.getElementById('customDialog');
    if (existing) existing.remove();

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.id = 'customDialog';
        overlay.innerHTML = `
            <div class="confirm-box confirm-box-${tone}" role="dialog" aria-modal="true" aria-live="polite">
                <div class="confirm-head">
                    <div class="confirm-icon" aria-hidden="true">${getDialogIcon(tone)}</div>
                    <div class="confirm-title-wrap">
                        <div class="confirm-title">${escapeHtml(title)}</div>
                    </div>
                </div>
                <div class="confirm-msg">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
                <div class="confirm-actions">
                    ${showCancel ? `<button class="btn-confirm-cancel" id="dialogCancelBtn">${escapeHtml(cancelText)}</button>` : ''}
                    <button class="${tone === 'danger' ? 'btn-confirm-delete' : 'btn-confirm-primary'}" id="dialogOkBtn">${escapeHtml(confirmText)}</button>
                </div>
            </div>`;

        const onKeyDown = e => {
            if (e.key === 'Escape') {
                close(false);
            }
        };

        const close = result => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(result);
        };

        document.body.appendChild(overlay);
        document.getElementById('dialogOkBtn')?.addEventListener('click', () => close(true));
        document.getElementById('dialogCancelBtn')?.addEventListener('click', () => close(false));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', onKeyDown, { once: true });
    });
}

function showNotice(message, title = 'Notice', tone = 'info') {
    return showDialog({ title, message, confirmText: 'OK', tone, showCancel: false });
}

function showDecision(message, {
    title = 'Are you sure?',
    confirmText = 'Continue',
    cancelText = 'Cancel',
    tone = 'warning'
} = {}) {
    return showDialog({ title, message, confirmText, cancelText, tone, showCancel: true });
}

function showConfirm(message, onConfirm, title = 'Are you sure?') {
    showDecision(message, { title, confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger' })
        .then(confirmed => {
            if (confirmed) onConfirm();
        });
}

function getFallbackAvatarDataUrl(name = 'User') {
    const safeName = String(name || 'User').trim();
    const initial = escapeHtml((safeName.charAt(0) || 'U').toUpperCase());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#7b6fb0"/><stop offset="1" stop-color="#5f8fd6"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="28" fill="white">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setUserAvatar(name, picture) {
    const userAvatar = document.getElementById('userAvatar');
    if (!userAvatar) return;
    const fallback = getFallbackAvatarDataUrl(name);
    userAvatar.style.display = 'block';
    userAvatar.alt = `${name || 'User'} avatar`;
    userAvatar.onerror = () => {
        userAvatar.onerror = null;
        userAvatar.src = fallback;
    };
    userAvatar.src = picture || fallback;
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
                ['link', 'image'], ['clean']
            ]
        }
    });
    applyQuillToolbarTooltips();
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
        editorElement.addEventListener('paste', handleEditorPaste);
        editorElement.addEventListener('drop', handleEditorDrop);
        editorElement.addEventListener('dragover', e => {
            if ([...e.dataTransfer?.files || []].some(file => file.type.startsWith('image/'))) {
                e.preventDefault();
            }
        });
    }
    wikiTooltip.addEventListener('mouseleave', hideWikiTooltip);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function applyQuillToolbarTooltips() {
    const toolbar = document.querySelector('.ql-toolbar');
    if (!toolbar) return;
    const tooltipMap = new Map([
        ['.ql-header[value="1"]', 'Heading 1'],
        ['.ql-header[value="2"]', 'Heading 2'],
        ['.ql-header[value="3"]', 'Heading 3'],
        ['.ql-header[value=""]', 'Paragraph'],
        ['.ql-bold', 'Bold'],
        ['.ql-italic', 'Italic'],
        ['.ql-underline', 'Underline'],
        ['.ql-strike', 'Strikethrough'],
        ['.ql-color', 'Text color'],
        ['.ql-background', 'Highlight color'],
        ['.ql-list[value="ordered"]', 'Numbered list'],
        ['.ql-list[value="bullet"]', 'Bullet list'],
        ['.ql-blockquote', 'Blockquote'],
        ['.ql-code-block', 'Code block'],
        ['.ql-align', 'Alignment'],
        ['.ql-indent[value="-1"]', 'Decrease indent'],
        ['.ql-indent[value="+1"]', 'Increase indent'],
        ['.ql-link', 'Insert link'],
        ['.ql-image', 'Insert image'],
        ['.ql-clean', 'Clear formatting']
    ]);
    tooltipMap.forEach((label, selector) => {
        toolbar.querySelectorAll(selector).forEach(el => {
            el.setAttribute('title', label);
            el.setAttribute('aria-label', label);
        });
    });
    toolbar.querySelectorAll('.ql-picker-label').forEach(label => {
        if (label.closest('.ql-header')) {
            label.setAttribute('title', 'Heading style');
            label.setAttribute('aria-label', 'Heading style');
        } else if (label.closest('.ql-color')) {
            label.setAttribute('title', 'Text color');
            label.setAttribute('aria-label', 'Text color');
        } else if (label.closest('.ql-background')) {
            label.setAttribute('title', 'Highlight color');
            label.setAttribute('aria-label', 'Highlight color');
        } else if (label.closest('.ql-align')) {
            label.setAttribute('title', 'Alignment');
            label.setAttribute('aria-label', 'Alignment');
        }
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function optimizeEditorImage(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return originalDataUrl;
    }

    const img = await loadImage(originalDataUrl);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const hasAlpha = ['image/png', 'image/webp'].includes(file.type);
    return canvas.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', hasAlpha ? undefined : 0.88);
}

function insertImageIntoEditor(src) {
    if (!quill || !src) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'image', src, 'user');
    quill.setSelection(range.index + 1, 0, 'silent');
}

async function insertImagesIntoEditor(files) {
    const imageFiles = [...files].filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) return false;

    for (const file of imageFiles) {
        try {
            const src = await optimizeEditorImage(file);
            insertImageIntoEditor(src);
        } catch (e) {
            console.error('insertImagesIntoEditor:', e);
            await showNotice('That image could not be inserted into the editor.', 'Image Paste Failed', 'warning');
        }
    }
    return true;
}

async function handleEditorPaste(e) {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.some(file => file.type.startsWith('image/'))) return;
    e.preventDefault();
    await insertImagesIntoEditor(files);
}

async function handleEditorDrop(e) {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.some(file => file.type.startsWith('image/'))) return;
    e.preventDefault();
    const selection = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (selection && quill) {
        const blot = Quill.find(selection.startContainer, true);
        if (blot) {
            const index = quill.getIndex(blot);
            quill.setSelection(index, 0, 'silent');
        }
    }
    await insertImagesIntoEditor(files);
}
// --- API ---
async function api(method, url, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        let message = `API ${res.status}`;
        try {
            const errorBody = await res.json();
            if (errorBody?.error) message = errorBody.error;
        } catch (e) { }
        throw new Error(message);
    }
    return res.json();
}

// --- PROJECTS ---
async function loadProjects() {
    try {
        projectListCache = await api('GET', '/api/projects');
        renderProjects(projectListCache);
    }
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
            <button class="item-delete" onclick="deleteProject(event,${p.id})">&times;</button>
        </li>`).join('');
}

function genreEmoji(genre) {
    const map = {
        fantasy: '\u2694\uFE0F',
        'sci-fi': '\u{1F680}',
        fiction: '\u{1F4D6}',
        romance: '\u{1F495}',
        mystery: '\u{1F50D}',
        thriller: '\u26A1',
        horror: '\u{1F56F}\uFE0F',
        historical: '\u{1F3DB}\uFE0F',
        journal: '\u{1F4D3}',
        screenplay: '\u{1F3AC}',
        poetry: '\u2728',
        general: '\u{1F4DD}',
        other: '\u{1F4CC}'
    };
    return map[genre] || '\u{1F4DD}';
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
        projectListCache = [...projectListCache, p];
        renderProjects(projectListCache);
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
            projectListCache = projectListCache.filter(project => project.id !== id);
            projectStatsCache.delete(id);
            documentsCache.delete(id);
            renderProjects(projectListCache);
        } catch (e) { console.error('deleteProject:', e); }
    }, 'Delete Project?');
}

async function selectProject(id) {
    try {
        currentProjectId = id;
        currentProjectData = projectListCache.find(p => p.id === id);
        if (!currentProjectData) {
            await loadProjects();
            currentProjectData = projectListCache.find(p => p.id === id);
        }
        if (!currentProjectData) return;
        renderProjects(projectListCache);
        showProjectDetail();
        currentProjectName.textContent = currentProjectData.title;
        await showProjectOverview(id);
        const isCreative = CREATIVE_GENRES.includes(currentProjectData.genre);
        ['tabCharacters', 'tabScenes', 'tabLore', 'tabRelationships'].forEach(tid =>
            document.getElementById(tid).classList.toggle('hidden', !isCreative));
        switchTab('chapters');
        if (isCreative) await loadWikiData(id);
        closeNotesPanel();
    } catch (e) { console.error('selectProject:', e); }
}

function showProjectList() { projectsSection.style.display = 'block'; projectDetail.style.display = 'none'; }
function showProjectDetail() { projectsSection.style.display = 'none'; projectDetail.style.display = 'flex'; }

// --- PROJECT OVERVIEW ---
async function showProjectOverview(projectId) {
    try {
        let stats = projectStatsCache.get(projectId);
        if (!stats) {
            stats = await api('GET', `/api/projects/${projectId}/stats`);
            projectStatsCache.set(projectId, stats);
        }
        const genreEmojis = {
            fantasy: '\u2694\uFE0F Fantasy',
            'sci-fi': '\u{1F680} Sci-Fi',
            fiction: '\u{1F4D6} Fiction',
            romance: '\u{1F495} Romance',
            mystery: '\u{1F50D} Mystery',
            thriller: '\u26A1 Thriller',
            horror: '\u{1F56F}\uFE0F Horror',
            historical: '\u{1F3DB}\uFE0F Historical',
            journal: '\u{1F4D3} Journal',
            screenplay: '\u{1F3AC} Screenplay',
            poetry: '\u2728 Poetry',
            general: '\u{1F4DD} General',
            other: '\u{1F4CC} Other'
        };

        document.getElementById('overviewGenre').textContent = genreEmojis[stats.genre] || '\u{1F4DD} General';
        document.getElementById('overviewTitle').textContent = stats.title;
        document.getElementById('overviewDesc').textContent = stats.description || 'No description yet.';
        document.getElementById('ovWords').textContent = stats.total_words.toLocaleString();
        document.getElementById('ovChapters').textContent = stats.chapter_count;
        document.getElementById('ovCharacters').textContent = stats.character_count;
        document.getElementById('ovScenes').textContent = stats.scene_count;
        document.getElementById('ovLore').textContent = stats.lore_count;
        document.getElementById('ovLastEdited').textContent = stats.last_edited ? `\u270E Last edited ${formatDateNice(stats.last_edited)}` : '';
        document.getElementById('ovCreated').textContent = stats.created_at ? `\u2726 Created ${formatDateNice(stats.created_at)}` : '';

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
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
    if (tabName === 'chapters') {
        if (documentsCache.has(currentProjectId)) renderCachedDocuments(currentProjectId);
        else loadDocuments(currentProjectId);
    }
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
    try {
        const docs = await api('GET', `/api/projects/${projectId}/documents`);
        documentsCache.set(projectId, docs);
        renderDocuments(docs);
    }
    catch (e) { console.error('loadDocuments:', e); }
}

function renderCachedDocuments(projectId = currentProjectId) {
    const docs = documentsCache.get(projectId);
    if (docs) renderDocuments(docs);
}

function renderDocuments(docs) {
    if (!docs.length) { documentsList.innerHTML = '<li class="empty-state">No chapters yet.</li>'; return; }
    documentsList.innerHTML = docs.map((d, i) => `
        <li class="item-list-entry ${d.id === currentDocId ? 'active' : ''}"
            draggable="true" data-id="${d.id}" data-index="${i}"
            onclick="openDocument(${d.id})"
            ondragstart="onDragStart(event)" ondragover="onDragOver(event)"
            ondragend="onDragEnd(event)" ondrop="onDrop(event)">
            <span class="drag-handle" title="Drag to reorder">\u283F</span>
            <span class="item-name" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</span>
            <button class="item-delete" onclick="deleteDocument(event,${d.id})">&times;</button>
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
        projectStatsCache.delete(currentProjectId);
        const docs = documentsCache.get(currentProjectId) || [];
        documentsCache.set(currentProjectId, [...docs, doc]);
        renderCachedDocuments();
        documentContentCache.set(`chapter_${doc.id}`, doc);
        openDocument(doc.id);
    } catch (e) {
        console.error('createDocument:', e);
        await showNotice(e.message || 'Could not create the chapter right now. Please try again.', 'Chapter Creation Failed', 'danger');
    }
    finally { btn.textContent = 'Create'; btn.disabled = false; }
}

async function openDocument(id, type = 'chapter') {
    try {
        const cacheKey = `${type}_${id}`;
        let doc = type === 'chapter' ? documentContentCache.get(cacheKey) : null;
        if (!doc) {
            doc = await api('GET', type === 'scene' ? `/api/scenes/${id}` : `/api/documents/${id}`);
            if (type === 'chapter') documentContentCache.set(cacheKey, doc);
        }
        currentDocId = id; currentDocType = type;
        docTitleInput.value = doc.title; docTitleInput.disabled = false;
        quill.root.innerHTML = doc.content || '';
        quill.history.clear();
        showEditor(); enableHeaderBtns(true);
        if (!await checkLocalStorageRestore(`${type}_${id}`, doc.content || '')) setSaveStatus('saved');
        updateStats(); startAutoSave(); addOpenTab(id, doc.title, type);
        if (type === 'chapter' && currentProjectId) renderCachedDocuments(currentProjectId);
        if (type === 'scene' && currentProjectId) await loadScenes(currentProjectId);
    } catch (e) { console.error('openDocument:', e); }
}

async function saveDocument() {
    if (!currentDocId) return;
    setSaveStatus('saving');
    try {
        const title = docTitleInput.value.trim() || 'Untitled';
        const content = quill.root.innerHTML;
        const savedDoc = await api('PUT', currentDocType === 'scene' ? `/api/scenes/${currentDocId}` : `/api/documents/${currentDocId}`, {
            title,
            content
        });
        updateTabTitle(currentDocId, title);
        if (currentDocType === 'chapter') {
            projectStatsCache.delete(currentProjectId);
            documentContentCache.set(`chapter_${currentDocId}`, savedDoc);
            const docs = documentsCache.get(currentProjectId) || [];
            documentsCache.set(currentProjectId, docs.map(doc => doc.id === currentDocId ? { ...doc, title, updated_at: savedDoc.updated_at, content: undefined } : doc));
            renderCachedDocuments(currentProjectId);
        }
        clearLocalStorage(`${currentDocType}_${currentDocId}`);
        updateLastSaved();
        if (currentDocType === 'scene') await loadScenes(currentProjectId);
        if (canAttemptDriveSync() && currentDocType === 'chapter') {
            setSaveStatus('syncing');
            queueDriveSync(currentDocId);
        } else {
            setSaveStatus('saved');
            if (shouldQueueDriveSync() && currentDocType === 'chapter') pendingSync = true;
        }
    } catch (e) { setSaveStatus('error'); console.error('saveDocument:', e); }
}

async function deleteDocument(event, id) {
    event.stopPropagation();
    showConfirm('This chapter will be permanently deleted.', async () => {
        try {
            await api('DELETE', `/api/documents/${id}`);
            if (currentDocId === id) { currentDocId = null; hideEditor(); enableHeaderBtns(false); }
            removeOpenTab(id);
            projectStatsCache.delete(currentProjectId);
            documentContentCache.delete(`chapter_${id}`);
            const docs = documentsCache.get(currentProjectId) || [];
            documentsCache.set(currentProjectId, docs.filter(doc => doc.id !== id));
            renderCachedDocuments(currentProjectId);
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
            <button class="item-delete" onclick="deleteCharacter(event,${c.id})">&times;</button>
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
        <button type="button" class="btn-ghost-sm char-title-remove" aria-label="Remove title">&times;</button>
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
        // No crop selected - use full image
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
    const moodEmoji = {
        tense: '\u26A1',
        romantic: '\u{1F495}',
        mysterious: '\u{1F32B}\uFE0F',
        action: '\u{1F525}',
        sad: '\u{1F4A7}',
        hopeful: '\u{1F305}',
        dark: '\u{1F311}',
        comedic: '\u{1F604}'
    };
    if (!scenes.length) { scenesList.innerHTML = '<li class="empty-state">No scenes yet.</li>'; return; }
    scenesList.innerHTML = scenes.map(s => `
        <li class="item-list-entry ${s.id === currentDocId && currentDocType === 'scene' ? 'active' : ''}" onclick="openDocument(${s.id},'scene')">
            <span class="item-name" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
            ${s.mood ? `<span class="item-badge">${moodEmoji[s.mood] || ''} ${s.mood}</span>` : ''}
            <button class="item-delete" onclick="deleteScene(event,${s.id})">&times;</button>
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
    try {
        const [items, rels] = await Promise.all([
            api('GET', `/api/projects/${projectId}/lore`),
            loadLoreRelationships(projectId)
        ]);
        currentLoreItems = items;
        loreEdges = rels;
        renderLore(currentLoreItems);
    }
    catch (e) { console.error('loadLore:', e); }
}

function addLoreAliasInput(value = '') {
    const list = document.getElementById('loreAliasesList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'char-title-row';
    row.innerHTML = `
        <input type="text" class="modal-input lore-alias-input" placeholder="e.g. The First Flame, Old Capital..." value="${escapeHtml(value)}">
        <button type="button" class="btn-ghost-sm char-title-remove" aria-label="Remove name">&times;</button>
    `;
    row.querySelector('.char-title-remove').addEventListener('click', () => {
        row.remove();
        if (!list.children.length) addLoreAliasInput('');
    });
    list.appendChild(row);
}

function getLoreAliases() {
    return Array.from(document.querySelectorAll('.lore-alias-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function setLoreAliases(values = []) {
    const list = document.getElementById('loreAliasesList');
    if (!list) return;
    list.innerHTML = '';
    const items = Array.isArray(values) && values.length ? values : [''];
    items.forEach(value => addLoreAliasInput(value));
}

function getLorePayloadFromModal() {
    const categorySelect = document.getElementById('loreCategoryInput');
    const customCategoryInput = document.getElementById('loreCustomCategoryInput');
    const category = categorySelect?.value === 'custom'
        ? (customCategoryInput?.value.trim() || '')
        : categorySelect?.value;
    return {
        name: document.getElementById('loreNameInput').value.trim(),
        category,
        description: document.getElementById('loreDescInput').value.trim(),
        aliases: getLoreAliases(),
        image_url: document.getElementById('loreImageInput').value.trim(),
        event_date: document.getElementById('loreEventDateInput').value.trim(),
        event_order: parseInt(document.getElementById('loreEventOrderInput').value || '0', 10) || 0,
        show_in_web: !!document.getElementById('loreShowInWebInput').checked
    };
}

async function createLore() {
    const payload = getLorePayloadFromModal();
    const name = payload.name;
    if (!name || !currentProjectId) { document.getElementById('loreNameInput').focus(); return; }
    if (!payload.category) { document.getElementById('loreCustomCategoryInput')?.focus(); return; }
    try {
        await api('POST', `/api/projects/${currentProjectId}/lore`, payload);
        closeModal(newLoreModal);
        resetLoreModal();
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
        const presetLoreCategories = ['item', 'place', 'organization', 'concept', 'creature', 'event', 'other'];
        document.getElementById('loreNameInput').value = item.name || '';
        document.getElementById('loreCategoryInput').value = presetLoreCategories.includes(item.category) ? item.category : 'custom';
        document.getElementById('loreCustomCategoryInput').value = presetLoreCategories.includes(item.category) ? '' : (item.category || '');
        updateLoreCategoryCustomInput();
        document.getElementById('loreDescInput').value = item.description || '';
        setLoreAliases(item.aliases || []);
        document.getElementById('loreImageInput').value = item.image_url || '';
        document.getElementById('loreEventDateInput').value = item.event_date || '';
        document.getElementById('loreEventOrderInput').value = item.event_order ?? 0;
        document.getElementById('loreShowInWebInput').checked = item.show_in_web !== false;
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
    const payload = getLorePayloadFromModal();
    const name = payload.name;
    if (!name) { document.getElementById('loreNameInput').focus(); return; }
    if (!payload.category) { document.getElementById('loreCustomCategoryInput')?.focus(); return; }
    const btn = document.getElementById('confirmLoreBtn');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        await api('PUT', `/api/lore/${id}`, payload);
        closeModal(newLoreModal);
        await loadLore(currentProjectId); await loadWikiData(currentProjectId);
    } catch (e) { console.error('saveEditLore:', e); }
    finally { btn.textContent = 'Save Changes'; btn.disabled = false; resetLoreModal(); }
}

function resetLoreModal() {
    document.querySelector('#newLoreModal .modal-title').textContent = 'New Lore Entry';
    const btn = document.getElementById('confirmLoreBtn');
    btn.textContent = 'Create Entry'; delete btn.dataset.editId; delete btn.dataset.mode;
    ['loreNameInput', 'loreDescInput', 'loreImageInput', 'loreEventDateInput', 'loreEventOrderInput', 'loreCustomCategoryInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('loreCategoryInput').value = 'item';
    updateLoreCategoryCustomInput();
    setLoreAliases([]);
    document.getElementById('loreShowInWebInput').checked = true;
    document.getElementById('loreImgPreview').style.display = 'none';
    document.getElementById('loreImgPreviewEl').src = '';
    document.getElementById('loreImageFile').value = '';
}

// --- LORE CONNECTIONS + VIEWS ---
let loreRelSelectedColor = '#5f8fd6';
let editingLoreRelId = null;
let editLoreRelColor = '#5f8fd6';
let loreNodes = [], loreEdges = [];
let loreCanvas = null, loreCtx = null;
let loreDragging = null, loreDragOffX = 0, loreDragOffY = 0;
let loreZoom = 1, lorePanX = 0, lorePanY = 0;
let loreIsPanning = false, lorePanStart = { x: 0, y: 0 };
let loreHoveredNodeId = null;
let loreHoveredEdgeId = null;
let loreMapDragState = null;
let loreMapRelations = [];
let loreAllRelationships = [];
let loreTimelineItems = [];
let loreTimelineEdges = [];

function populateLoreRelationTypeSelects() {
    const html = LORE_RELATION_TYPE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    ['loreRelTypeInput', 'editLoreRelTypeInput'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = html;
    });
    if (!document.getElementById('loreRelCustomTypeInput')) {
        document.getElementById('loreRelTypeInput')?.insertAdjacentHTML('afterend', '<input type="text" class="modal-input" id="loreRelCustomTypeInput" placeholder="Write your custom connection..." style="display:none;">');
    }
    if (!document.getElementById('editLoreRelCustomTypeInput')) {
        document.getElementById('editLoreRelTypeInput')?.insertAdjacentHTML('afterend', '<input type="text" class="modal-input" id="editLoreRelCustomTypeInput" placeholder="Write your custom connection..." style="display:none;">');
    }
    updateLoreRelationCustomInput('new');
    updateLoreRelationCustomInput('edit');
}

function updateLoreRelationCustomInput(mode) {
    const isEdit = mode === 'edit';
    const select = document.getElementById(isEdit ? 'editLoreRelTypeInput' : 'loreRelTypeInput');
    const input = document.getElementById(isEdit ? 'editLoreRelCustomTypeInput' : 'loreRelCustomTypeInput');
    if (!select || !input) return;
    const isCustom = select.value === 'custom';
    input.style.display = isCustom ? 'block' : 'none';
    input.required = isCustom;
}

function getSelectedLoreRelationType(mode) {
    const isEdit = mode === 'edit';
    const select = document.getElementById(isEdit ? 'editLoreRelTypeInput' : 'loreRelTypeInput');
    const input = document.getElementById(isEdit ? 'editLoreRelCustomTypeInput' : 'loreRelCustomTypeInput');
    if (!select) return '';
    if (select.value !== 'custom') return select.value;
    return input?.value.trim() || '';
}

async function loadLoreRelationships(projectId) {
    return api('GET', `/api/projects/${projectId}/lore-relationships`);
}

async function openNewLoreRelModal(options = {}) {
    try {
        const items = currentLoreItems.length ? currentLoreItems : await api('GET', `/api/projects/${currentProjectId}/lore`);
        if (items.length < 2) {
            await showNotice('You need at least 2 lore entries first.', 'Not Enough Lore', 'warning');
            return;
        }
        const optionsHtml = items.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
        document.getElementById('loreRelAInput').innerHTML = optionsHtml;
        document.getElementById('loreRelBInput').innerHTML = optionsHtml;
        if (typeof options.preselectLoreA === 'number') {
            document.getElementById('loreRelAInput').value = String(options.preselectLoreA);
            const other = items.find(item => item.id !== options.preselectLoreA);
            if (other) document.getElementById('loreRelBInput').value = String(other.id);
        } else if (items.length > 1) {
            document.getElementById('loreRelBInput').value = String(items[1].id);
        }
        document.getElementById('loreRelTypeInput').value = 'related to';
        const customInput = document.getElementById('loreRelCustomTypeInput');
        if (customInput) customInput.value = '';
        updateLoreRelationCustomInput('new');
        document.getElementById('loreRelDescInput').value = '';
        loreRelSelectedColor = '#5f8fd6';
        document.querySelectorAll('#loreRelColorPicker .rel-color-opt').forEach(opt => opt.classList.toggle('selected', opt.dataset.color === loreRelSelectedColor));
        openModal(newLoreRelModal);
    } catch (e) { console.error('openNewLoreRelModal:', e); }
}

async function createLoreRelationship() {
    const loreA = parseInt(document.getElementById('loreRelAInput').value, 10);
    const loreB = parseInt(document.getElementById('loreRelBInput').value, 10);
    if (loreA === loreB) {
        await showNotice('Select two different lore entries.', 'Choose Different Entries', 'warning');
        return;
    }
    const relationType = getSelectedLoreRelationType('new');
    if (!relationType) {
        document.getElementById('loreRelCustomTypeInput')?.focus();
        return;
    }
    const btn = document.getElementById('confirmLoreRelBtn');
    btn.textContent = 'Adding...';
    btn.disabled = true;
    try {
        await api('POST', `/api/projects/${currentProjectId}/lore-relationships`, {
            lore_a_id: loreA,
            lore_b_id: loreB,
            relation_type: relationType,
            description: document.getElementById('loreRelDescInput').value.trim(),
            color: loreRelSelectedColor
        });
        closeModal(newLoreRelModal);
        if (document.getElementById('loreWebOverlay').style.display !== 'none') await openLoreWeb();
        if (document.getElementById('loreTimelineOverlay').style.display !== 'none') await openLoreTimeline();
        if (document.getElementById('loreMapOverlay').style.display !== 'none') await openLoreMap();
    } catch (e) { console.error('createLoreRelationship:', e); }
    finally {
        btn.textContent = 'Add Connection';
        btn.disabled = false;
    }
}

function openEditLoreRelModal(edge) {
    editingLoreRelId = edge.id;
    editLoreRelColor = edge.color || '#5f8fd6';
    document.getElementById('editLoreRelNames').textContent = `${edge.lore_a_name} <-> ${edge.lore_b_name}`;
    const select = document.getElementById('editLoreRelTypeInput');
    const customInput = document.getElementById('editLoreRelCustomTypeInput');
    const isPreset = LORE_RELATION_TYPE_OPTIONS.some(([value]) => value === edge.relation_type && value !== 'custom');
    select.value = isPreset ? edge.relation_type : 'custom';
    if (customInput) customInput.value = isPreset ? '' : (edge.relation_type || '');
    updateLoreRelationCustomInput('edit');
    document.getElementById('editLoreRelDescInput').value = edge.description || '';
    document.querySelectorAll('#editLoreRelColorPicker .rel-color-opt').forEach(opt => opt.classList.toggle('selected', opt.dataset.color === editLoreRelColor));
    openModal(document.getElementById('editLoreRelModal'));
}

async function saveEditLoreRel() {
    if (!editingLoreRelId) return;
    const relationType = getSelectedLoreRelationType('edit');
    if (!relationType) {
        document.getElementById('editLoreRelCustomTypeInput')?.focus();
        return;
    }
    const btn = document.getElementById('confirmEditLoreRelBtn');
    btn.textContent = 'Saving...';
    btn.disabled = true;
    try {
        await api('PUT', `/api/lore-relationships/${editingLoreRelId}`, {
            relation_type: relationType,
            description: document.getElementById('editLoreRelDescInput').value.trim(),
            color: editLoreRelColor
        });
        closeModal(document.getElementById('editLoreRelModal'));
        await openLoreWeb();
    } catch (e) { console.error('saveEditLoreRel:', e); }
    finally {
        btn.textContent = 'Save Changes';
        btn.disabled = false;
    }
}

async function deleteLoreRelFromEdit() {
    const id = editingLoreRelId;
    closeModal(document.getElementById('editLoreRelModal'));
    if (!id) return;
    try {
        await api('DELETE', `/api/lore-relationships/${id}`);
        if (document.getElementById('loreWebOverlay').style.display !== 'none') await openLoreWeb();
        if (document.getElementById('loreTimelineOverlay').style.display !== 'none') await openLoreTimeline();
        if (document.getElementById('loreMapOverlay').style.display !== 'none') await openLoreMap();
    } catch (e) { console.error('deleteLoreRelFromEdit:', e); }
}

function resizeLoreCanvas() {
    if (!loreCanvas || !loreCtx || document.getElementById('loreWebOverlay').style.display === 'none') return;
    const dpr = window.devicePixelRatio || 1;
    loreCanvas.width = loreCanvas.offsetWidth * dpr;
    loreCanvas.height = loreCanvas.offsetHeight * dpr;
    loreCanvas._cssW = loreCanvas.offsetWidth;
    loreCanvas._cssH = loreCanvas.offsetHeight;
    loreCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLoreWeb();
}

function drawLoreWeb() {
    if (!loreCtx || !loreCanvas) return;
    const ctx = loreCtx;
    const width = loreCanvas._cssW || loreCanvas.offsetWidth;
    const height = loreCanvas._cssH || loreCanvas.offsetHeight;
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim() || '#f0eeff';
    const bgModal = style.getPropertyValue('--bg-modal').trim() || '#181a2e';
    const bgHover = style.getPropertyValue('--bg-hover').trim() || 'rgba(160,160,170,0.25)';
    const connectedNodeIds = new Set();
    const nodeById = new Map(loreNodes.map(node => [node.id, node]));
    if (loreHoveredNodeId) {
        connectedNodeIds.add(loreHoveredNodeId);
        loreEdges.forEach(edge => {
            if (edge.lore_a_id === loreHoveredNodeId || edge.lore_b_id === loreHoveredNodeId) {
                connectedNodeIds.add(edge.lore_a_id);
                connectedNodeIds.add(edge.lore_b_id);
            }
        });
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(lorePanX, lorePanY);
    ctx.scale(loreZoom, loreZoom);

    const pairCount = {};
    const pairIndex = {};
    loreEdges.forEach(edge => {
        const key = [Math.min(edge.lore_a_id, edge.lore_b_id), Math.max(edge.lore_a_id, edge.lore_b_id)].join('-');
        pairCount[key] = (pairCount[key] || 0) + 1;
    });

    loreEdges.forEach(edge => {
        const a = nodeById.get(edge.lore_a_id);
        const b = nodeById.get(edge.lore_b_id);
        if (!a || !b) return;
        const isRelatedToHover = loreHoveredNodeId && (edge.lore_a_id === loreHoveredNodeId || edge.lore_b_id === loreHoveredNodeId);
        const key = [Math.min(edge.lore_a_id, edge.lore_b_id), Math.max(edge.lore_a_id, edge.lore_b_id)].join('-');
        const total = pairCount[key] || 1;
        pairIndex[key] = pairIndex[key] || 0;
        const idx = pairIndex[key]++;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const offset = total === 1 ? 0 : (idx - (total - 1) / 2) * 55;
        const cpX = (a.x + b.x) / 2 + (-dy / len) * offset;
        const cpY = (a.y + b.y) / 2 + (dx / len) * offset;
        const midX = 0.25 * a.x + 0.5 * cpX + 0.25 * b.x;
        const midY = 0.25 * a.y + 0.5 * cpY + 0.25 * b.y;
        edge._ax = a.x;
        edge._ay = a.y;
        edge._bx = b.x;
        edge._by = b.y;
        edge._cpX = cpX;
        edge._cpY = cpY;
        edge._mx = midX;
        edge._my = midY;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cpX, cpY, b.x, b.y);
        ctx.strokeStyle = edge.color || '#5f8fd6';
        ctx.lineWidth = isRelatedToHover ? 4.5 : 2.5;
        ctx.globalAlpha = loreHoveredNodeId ? (isRelatedToHover ? 1 : 0.06) : 0.8;
        ctx.stroke();
        ctx.globalAlpha = 1;

        const label = formatLoreRelationLabel(edge.relation_type);
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelWidth = Math.max(42, ctx.measureText(label).width + 16);
        ctx.fillStyle = loreHoveredNodeId ? (isRelatedToHover ? bgHover : 'rgba(118,118,126,0.24)') : bgModal;
        ctx.beginPath();
        ctx.roundRect(midX - labelWidth / 2, midY - 11, labelWidth, 22, 6);
        ctx.fill();
        ctx.globalAlpha = loreHoveredNodeId ? (isRelatedToHover ? 1 : 0.12) : 1;
        ctx.strokeStyle = edge.color || '#5f8fd6';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = loreHoveredNodeId ? (isRelatedToHover ? 1 : 0.4) : 1;
        ctx.fillStyle = loreHoveredNodeId ? (isRelatedToHover ? textPrimary : 'rgba(225,225,232,0.42)') : textPrimary;
        ctx.fillText(label, midX, midY);
        ctx.globalAlpha = 1;
    });

    const baseRadius = 38;
    loreNodes.forEach(node => {
        const isHoverFocus = loreHoveredNodeId === node.id;
        const isHoverRelated = connectedNodeIds.has(node.id);
        const drawY = node.y - (isHoverRelated ? 6 : 0);
        const drawR = baseRadius + (isHoverFocus ? 3 : 0);

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, drawY, drawR, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = loreHoveredNodeId ? (isHoverRelated ? 1 : 0.16) : 1;
        if (node.img && node.img.complete && node.img.naturalWidth > 0) {
            const iw = node.img.naturalWidth;
            const ih = node.img.naturalHeight;
            const srcSize = Math.min(iw, ih);
            const srcX = (iw - srcSize) / 2;
            const srcY = (ih - srcSize) / 2;
            ctx.drawImage(node.img, srcX, srcY, srcSize, srcSize, node.x - drawR, drawY - drawR, drawR * 2, drawR * 2);
        } else {
            const gradient = ctx.createRadialGradient(node.x, drawY - drawR * 0.3, 0, node.x, drawY, drawR);
            gradient.addColorStop(0, node.color);
            gradient.addColorStop(1, '#18243c');
            ctx.fillStyle = gradient;
            ctx.fillRect(node.x - drawR, drawY - drawR, drawR * 2, drawR * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = 'bold 18px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.shortLabel, node.x, drawY);
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(node.x, drawY, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = loreHoveredNodeId ? (isHoverRelated ? '#d7d2e2' : 'rgba(123,111,176,0.22)') : node.color;
        ctx.lineWidth = isHoverFocus ? 4.5 : 2.5;
        ctx.stroke();

        ctx.font = `600 13px 'DM Sans', sans-serif`;
        const pillWidth = Math.max(84, ctx.measureText(node.name).width + 16);
        const nameX = node.x - pillWidth / 2;
        const nameY = drawY + drawR + 6;
        ctx.fillStyle = loreHoveredNodeId ? (isHoverRelated ? bgHover : 'rgba(118,118,126,0.26)') : bgModal;
        ctx.beginPath();
        ctx.roundRect(nameX, nameY, pillWidth, 22, 6);
        ctx.fill();
        ctx.fillStyle = loreHoveredNodeId ? (isHoverRelated ? textPrimary : 'rgba(225,225,232,0.42)') : textPrimary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x, nameY + 11);

        const metaLabel = getLoreCategoryLabel(node.category);
        ctx.font = `600 10px 'DM Sans', sans-serif`;
        const metaWidth = Math.max(58, ctx.measureText(metaLabel).width + 14);
        const metaX = node.x - metaWidth / 2;
        const metaY = nameY + 25;
        ctx.fillStyle = loreHoveredNodeId ? (isHoverRelated ? bgHover : 'rgba(118,118,126,0.22)') : 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(metaX, metaY, metaWidth, 18, 5);
        ctx.fill();
        ctx.fillStyle = loreHoveredNodeId ? (isHoverRelated ? node.color : 'rgba(190,190,205,0.38)') : node.color;
        ctx.fillText(metaLabel, node.x, metaY + 9);

        node._hoverBounds = {
            cx: node.x,
            cy: drawY,
            r: drawR,
            nameX,
            nameY,
            nameW: pillWidth,
            nameH: 22,
            roleBounds: { x: metaX, y: metaY, w: metaWidth, h: 18 }
        };
    });

    ctx.restore();
}

function isNearLoreEdge(mx, my, edge) {
    return isNearCurve(mx, my, edge);
}

function getLoreNodeAtPoint(cx, cy) {
    return loreNodes.find(node => {
        const bounds = node._hoverBounds;
        if (!bounds) return false;
        const onCircle = Math.hypot(bounds.cx - cx, bounds.cy - cy) <= bounds.r;
        const onName = cx >= bounds.nameX && cx <= bounds.nameX + bounds.nameW && cy >= bounds.nameY && cy <= bounds.nameY + bounds.nameH;
        const onMeta = bounds.roleBounds && cx >= bounds.roleBounds.x && cx <= bounds.roleBounds.x + bounds.roleBounds.w &&
            cy >= bounds.roleBounds.y && cy <= bounds.roleBounds.y + bounds.roleBounds.h;
        return onCircle || onName || onMeta;
    }) || null;
}

function setupLoreCanvasEvents() {
    let mouseDownPos = null;
    let mouseDownTime = 0;

    loreCanvas.onwheel = (e) => {
        e.preventDefault();
        const rect = loreCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const newZoom = Math.min(Math.max(loreZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.25), 4);
        lorePanX = mx - (mx - lorePanX) * (newZoom / loreZoom);
        lorePanY = my - (my - lorePanY) * (newZoom / loreZoom);
        loreZoom = newZoom;
        drawLoreWeb();
    };

    loreCanvas.onmousedown = (e) => {
        const rect = loreCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        mouseDownPos = { x: mx, y: my };
        mouseDownTime = Date.now();
        const cx = (mx - lorePanX) / loreZoom;
        const cy = (my - lorePanY) / loreZoom;
        loreDragging = getLoreNodeAtPoint(cx, cy);
        hideWikiTooltip();
        if (loreDragging) {
            loreDragOffX = loreDragging.x - cx;
            loreDragOffY = loreDragging.y - cy;
        } else {
            loreIsPanning = true;
            lorePanStart = { x: mx - lorePanX, y: my - lorePanY };
            loreCanvas.style.cursor = 'grabbing';
        }
    };

    loreCanvas.onmousemove = (e) => {
        const rect = loreCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (loreDragging) {
            loreDragging.x = (mx - lorePanX) / loreZoom + loreDragOffX;
            loreDragging.y = (my - lorePanY) / loreZoom + loreDragOffY;
            drawLoreWeb();
            return;
        }
        if (loreIsPanning) {
            lorePanX = mx - lorePanStart.x;
            lorePanY = my - lorePanStart.y;
            drawLoreWeb();
            return;
        }

        const cx = (mx - lorePanX) / loreZoom;
        const cy = (my - lorePanY) / loreZoom;
        const hovered = getLoreNodeAtPoint(cx, cy);
        const hoveredId = hovered?.id || null;
        if (hoveredId !== loreHoveredNodeId) {
            loreHoveredNodeId = hoveredId;
            drawLoreWeb();
        }
        const hoveredEdge = hovered ? null : loreEdges.find(item => isNearLoreEdge(cx, cy, item));
        loreHoveredEdgeId = hoveredEdge?.id || null;
        if (hovered) {
            loreCanvas.style.cursor = 'pointer';
            showWikiTooltipAtPointer({
                type: 'lore',
                id: hovered.id,
                name: hovered.name,
                category: hovered.category,
                image_url: hovered.image_url,
                summary: hovered.description
            }, e.clientX, e.clientY, true);
        } else if (hoveredEdge) {
            loreCanvas.style.cursor = 'pointer';
            showConnectionTooltip(
                `${hoveredEdge.lore_a_name} -> ${formatLoreRelationLabel(hoveredEdge.relation_type)} -> ${hoveredEdge.lore_b_name}`,
                hoveredEdge.description || 'No description added yet.',
                e.clientX,
                e.clientY
            );
        } else {
            loreCanvas.style.cursor = 'grab';
            hideWikiTooltip();
        }
    };

    loreCanvas.onmouseup = (e) => {
        const rect = loreCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const moved = mouseDownPos && Math.hypot(mx - mouseDownPos.x, my - mouseDownPos.y) > 5;
        const draggedNode = loreDragging;
        if (!moved && Date.now() - mouseDownTime < 300 && !loreDragging) {
            const cx = (mx - lorePanX) / loreZoom;
            const cy = (my - lorePanY) / loreZoom;
            const edge = loreEdges.find(item => isNearLoreEdge(cx, cy, item));
            if (edge) openEditLoreRelModal(edge);
        }
        loreDragging = null;
        loreIsPanning = false;
        mouseDownPos = null;
        loreCanvas.style.cursor = 'grab';
        if (draggedNode) {
            api('PUT', `/api/lore/${draggedNode.id}`, {
                web_x: draggedNode.x,
                web_y: draggedNode.y
            }).catch(err => console.error('persistLoreWebPosition:', err));
        }
    };

    loreCanvas.ondblclick = (e) => {
        const rect = loreCanvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left - lorePanX) / loreZoom;
        const cy = (e.clientY - rect.top - lorePanY) / loreZoom;
        const node = getLoreNodeAtPoint(cx, cy);
        if (node) openNewLoreRelModal({ preselectLoreA: node.id });
    };

    loreCanvas.onmouseleave = () => {
        loreDragging = null;
        loreIsPanning = false;
        loreHoveredNodeId = null;
        loreHoveredEdgeId = null;
        loreCanvas.style.cursor = 'grab';
        hideWikiTooltip();
        drawLoreWeb();
    };

    if (!loreWebResizeHandler) {
        loreWebResizeHandler = () => resizeLoreCanvas();
        window.addEventListener('resize', loreWebResizeHandler);
    }
}

function getLoreCategoryColor(category) {
    const map = {
        item: '#c9785d',
        place: '#78b86f',
        organization: '#d2a854',
        concept: '#8e73d8',
        creature: '#cc6f9f',
        event: '#5f8fd6',
        other: '#7b6fb0'
    };
    return map[category] || '#7b6fb0';
}

function getLoreCategoryLabel(category) {
    const map = {
        item: 'Item',
        place: 'Place',
        organization: 'Faction',
        concept: 'Concept',
        creature: 'Creature',
        event: 'Event',
        other: 'Other'
    };
    return map[category] || 'Lore';
}

function getLoreCategoryKey(category) {
    return String(category || 'other').trim().toLowerCase() || 'other';
}

function getLoreCategoryViewLabel(category) {
    const normalized = getLoreCategoryKey(category);
    const preset = getLoreCategoryLabel(normalized);
    if (preset !== 'Lore') return `${preset} Web`;
    return `${normalized.replace(/[-_]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())} Web`;
}

function buildLoreWebViews(items) {
    const visibleItems = items.filter(item => item.show_in_web !== false);
    const groups = new Map();
    visibleItems.forEach(item => {
        const key = getLoreCategoryKey(item.category);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });

    const views = [];
    const mixedItems = [];
    [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([category, group]) => {
            if (group.length >= 3) {
                views.push({
                    key: category,
                    label: getLoreCategoryViewLabel(category),
                    items: group
                });
            } else {
                mixedItems.push(...group);
            }
        });

    if (mixedItems.length || !views.length) {
        views.unshift({
            key: 'mixed',
            label: views.length ? 'Mixed Lore Web' : 'Lore Web',
            items: mixedItems.length ? mixedItems : visibleItems
        });
    }

    return views;
}

function populateLoreWebViewSelect(views) {
    if (!loreWebViewSelect) return;
    loreWebViewSelect.innerHTML = views
        .map(view => `<option value="${escapeHtml(view.key)}">${escapeHtml(view.label)} (${view.items.length})</option>`)
        .join('');
    const nextValue = views.some(view => view.key === currentLoreWebView) ? currentLoreWebView : (views[0]?.key || 'mixed');
    currentLoreWebView = nextValue;
    loreWebViewSelect.value = nextValue;
}

function getLoreWebViewItems() {
    const selectedView = currentLoreWebViews.find(view => view.key === currentLoreWebView) || currentLoreWebViews[0];
    return selectedView?.items || [];
}

function buildLoreWebPositions(items, width, height) {
    const categories = [...new Set(items.map(item => item.category || 'other'))];
    const centerX = width / 2;
    const centerY = height / 2;
    const clusterRadius = Math.min(width, height) * 0.24;
    const innerRadius = 90;
    const positions = new Map();
    categories.forEach((category, categoryIndex) => {
        const group = items.filter(item => (item.category || 'other') === category);
        const angleBase = (Math.PI * 2 * categoryIndex) / Math.max(categories.length, 1) - Math.PI / 2;
        const groupCenterX = centerX + Math.cos(angleBase) * clusterRadius;
        const groupCenterY = centerY + Math.sin(angleBase) * clusterRadius;
        group.forEach((item, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(group.length, 1);
            positions.set(item.id, {
                x: groupCenterX + Math.cos(angle) * innerRadius,
                y: groupCenterY + Math.sin(angle) * innerRadius
            });
        });
    });
    return positions;
}

async function persistCharacterWebPosition(id, x, y) {
    const item = currentCharacters.find(entry => entry.id === id);
    if (!item) return;
    item.web_x = x;
    item.web_y = y;
    try {
        await api('PUT', `/api/characters/${id}`, { web_x: x, web_y: y });
    } catch (e) { console.error('persistCharacterWebPosition:', e); }
}

async function openLoreWeb() {
    try {
        const [items, rels] = await Promise.all([
            api('GET', `/api/projects/${currentProjectId}/lore`),
            loadLoreRelationships(currentProjectId)
        ]);
        currentLoreItems = items;
        loreAllRelationships = rels;
        document.getElementById('loreWebOverlay').style.display = 'flex';
        document.body.classList.add('rel-web-open');
        loreCanvas = document.getElementById('loreWebCanvas');
        loreCtx = loreCanvas.getContext('2d');
        await new Promise(r => setTimeout(r, 40));
        await renderActiveLoreWeb();
        setupLoreCanvasEvents();
    } catch (e) { console.error('openLoreWeb:', e); }
}

async function renderActiveLoreWeb() {
    currentLoreWebViews = buildLoreWebViews(currentLoreItems);
    const selectedItems = getLoreWebViewItems();
    if (!selectedItems.length) {
        await showNotice('No lore entries yet.', 'Nothing To Show', 'warning');
        closeLoreWeb();
        return;
    }
    populateLoreWebViewSelect(currentLoreWebViews);
    const selectedView = currentLoreWebViews.find(view => view.key === currentLoreWebView) || currentLoreWebViews[0];
    document.getElementById('loreWebProjectName').textContent = `${currentProjectData?.title || ''} - ${selectedView?.label || 'Lore Web'}`;
    if (!loreCanvas || !loreCtx) return;
    await new Promise(r => setTimeout(r, 10));
    resizeLoreCanvas();
    const width = loreCanvas._cssW || loreCanvas.offsetWidth;
    const height = loreCanvas._cssH || loreCanvas.offsetHeight;
    const fallbackPositions = buildLoreWebPositions(selectedItems, width, height);
    loreZoom = 1;
    lorePanX = 0;
    lorePanY = 0;
    loreNodes = selectedItems.map((item) => {
        const fallback = fallbackPositions.get(item.id) || { x: width / 2, y: height / 2 };
        return {
            ...item,
            x: Number.isFinite(item.web_x) ? item.web_x : fallback.x,
            y: Number.isFinite(item.web_y) ? item.web_y : fallback.y,
            color: getLoreCategoryColor(item.category),
            shortLabel: (item.name || '?').slice(0, 2).toUpperCase(),
            img: null
        };
    });
    const visibleIds = new Set(selectedItems.map(item => item.id));
    loreEdges = loreAllRelationships.filter(rel => visibleIds.has(rel.lore_a_id) && visibleIds.has(rel.lore_b_id));
    loreHoveredNodeId = null;
    loreNodes.forEach(node => {
        if (node.image_url) {
            const img = new Image();
            img.src = node.image_url;
            img.onload = () => {
                node.img = img;
                drawLoreWeb();
            };
        }
    });
    drawLoreWeb();
}

function loreZoomIn() { loreZoom = Math.min(loreZoom * 1.15, 4); drawLoreWeb(); }
function loreZoomOut() { loreZoom = Math.max(loreZoom * 0.85, 0.25); drawLoreWeb(); }
function loreZoomReset() { loreZoom = 1; lorePanX = 0; lorePanY = 0; drawLoreWeb(); }

function closeLoreWeb() {
    document.getElementById('loreWebOverlay').style.display = 'none';
    document.body.classList.remove('rel-web-open');
    loreDragging = null;
    loreIsPanning = false;
    loreHoveredNodeId = null;
    hideWikiTooltip();
}

function buildTimelineLinks(item, rels) {
    return rels
        .filter(rel => rel.lore_a_id === item.id || rel.lore_b_id === item.id)
        .map(rel => {
            const otherName = rel.lore_a_id === item.id ? rel.lore_b_name : rel.lore_a_name;
            return `<span class="timeline-link-chip">${escapeHtml(formatLoreRelationLabel(rel.relation_type))}: ${escapeHtml(otherName)}</span>`;
        })
        .join('');
}

function parseLoreTimelineValue(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return Number.POSITIVE_INFINITY;
    const numberMatch = raw.match(/-?\d+(?:\.\d+)?/);
    if (!numberMatch) return Number.POSITIVE_INFINITY;
    const numeric = parseFloat(numberMatch[0]);
    if (raw.includes('bce') || raw.includes('bc')) return numeric * -1;
    if (raw.includes('ago') || raw.includes('before')) return numeric * -1;
    return numeric;
}

function closeLoreTimeline() {
    document.getElementById('loreTimelineOverlay').style.display = 'none';
    document.body.classList.remove('rel-web-open');
}

function renderLoreTimelineList(items, rels) {
    loreTimelineEl.innerHTML = items.length ? items.map(item => `
        <article class="timeline-event" onclick="openEditLoreModal(${item.id})">
            <div class="timeline-meta">
                <span class="timeline-date">${escapeHtml(item.event_date || 'Undated Event')}</span>
                <span class="timeline-order">Order ${item.event_order ?? 0}</span>
                <span class="timeline-category">${escapeHtml((item.category || 'other').replace('-', ' '))}</span>
            </div>
            <div class="timeline-title">${escapeHtml(item.name)}</div>
            <div class="timeline-desc">${escapeHtml(item.description || 'No description yet.')}</div>
            <div class="timeline-links">${buildTimelineLinks(item, rels)}</div>
        </article>
    `).join('') : '<div class="lore-timeline-empty">No timeline items match this filter yet.</div>';
}

function applyLoreTimelineFilters() {
    const category = document.getElementById('loreTimelineCategoryFilter')?.value || 'all';
    const query = (document.getElementById('loreTimelineSearch')?.value || '').trim().toLowerCase();
    const filtered = loreTimelineItems.filter(item => {
        const categoryOk = category === 'all'
            ? (item.category === 'event' || !!item.event_date)
            : item.category === category;
        if (!categoryOk) return false;
        if (!query) return true;
        return [item.name, item.description, item.event_date, item.category]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(query));
    });
    renderLoreTimelineList(filtered, loreTimelineEdges);
}

async function openLoreTimeline() {
    try {
        const [items, rels] = await Promise.all([
            api('GET', `/api/projects/${currentProjectId}/lore`),
            loadLoreRelationships(currentProjectId)
        ]);
        loreTimelineItems = items
            .filter(item => item.category === 'event' || item.event_date)
            .sort((a, b) =>
                parseLoreTimelineValue(a.event_date) - parseLoreTimelineValue(b.event_date) ||
                (a.event_order ?? 0) - (b.event_order ?? 0) ||
                (a.event_date || '').localeCompare(b.event_date || '') ||
                a.name.localeCompare(b.name)
            );
        loreTimelineEdges = rels;
        document.getElementById('loreTimelineProjectName').textContent = `${currentProjectData?.title || ''} - Lore Timeline`;
        document.getElementById('loreTimelineOverlay').style.display = 'flex';
        document.body.classList.add('rel-web-open');
        document.getElementById('loreTimelineCategoryFilter').value = 'all';
        document.getElementById('loreTimelineSearch').value = '';
        applyLoreTimelineFilters();
    } catch (e) { console.error('openLoreTimeline:', e); }
}

function renderLoreMap(items, rels) {
    loreMapRelations = rels;
    const places = items.filter(item => item.category === 'place');
    loreMapBoard.style.backgroundImage = currentProjectData?.map_image_url ? `url("${currentProjectData.map_image_url}")` : 'none';
    loreMapBoard.style.backgroundSize = currentProjectData?.map_image_url ? 'contain' : '';
    loreMapBoard.style.backgroundPosition = currentProjectData?.map_image_url ? 'center center' : '';
    loreMapBoard.style.backgroundRepeat = currentProjectData?.map_image_url ? 'no-repeat' : '';
    const connectionCounts = new Map();
    const placesById = new Map(places.map(item => [item.id, item]));
    rels.forEach(rel => {
        connectionCounts.set(rel.lore_a_id, (connectionCounts.get(rel.lore_a_id) || 0) + 1);
        connectionCounts.set(rel.lore_b_id, (connectionCounts.get(rel.lore_b_id) || 0) + 1);
    });
    loreMapBoard.querySelectorAll('.lore-map-node').forEach(node => node.remove());
    loreMapList.innerHTML = places.length ? places.map(item => `
        <div class="lore-map-list-item" onclick="openEditLoreModal(${item.id})">
            <div class="lore-map-list-head">
                <div class="lore-map-node-name">${escapeHtml(item.name)}</div>
                <div class="lore-map-list-badge">${connectionCounts.get(item.id) || 0} link${(connectionCounts.get(item.id) || 0) === 1 ? '' : 's'}</div>
            </div>
            <div class="lore-map-node-meta">${escapeHtml(item.event_date || 'Place')}</div>
            <div class="lore-map-list-coords">X ${Math.round(item.map_x ?? 50)}% | Y ${Math.round(item.map_y ?? 50)}%</div>
        </div>
    `).join('') : '<div class="lore-timeline-empty" style="padding:0;">Add lore entries with the Place / Location category to build the map.</div>';

    places.forEach(item => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'lore-map-node';
        node.style.left = `${item.map_x ?? 50}%`;
        node.style.top = `${item.map_y ?? 50}%`;
        node.dataset.id = item.id;
        node.innerHTML = `
            <div class="lore-map-node-name">${escapeHtml(item.name)}</div>
            <div class="lore-map-node-meta">${escapeHtml(getLoreCategoryLabel(item.category))}</div>
            <div class="lore-map-node-subtle">${escapeHtml(item.description || 'Double-click to edit')}</div>
        `;
        node.addEventListener('dblclick', () => openEditLoreModal(item.id));
        node.addEventListener('mousedown', (e) => {
            loreMapDragState = { id: item.id, offsetX: e.offsetX, offsetY: e.offsetY };
            e.preventDefault();
        });
        loreMapBoard.appendChild(node);
    });

    const placeIds = new Set(places.map(item => item.id));
    loreMapLines.innerHTML = rels
        .filter(rel => placeIds.has(rel.lore_a_id) && placeIds.has(rel.lore_b_id))
        .map(rel => {
            const a = placesById.get(rel.lore_a_id);
            const b = placesById.get(rel.lore_b_id);
            if (!a || !b) return '';
            return `<line class="lore-map-line" x1="${a.map_x}%" y1="${a.map_y}%" x2="${b.map_x}%" y2="${b.map_y}%" stroke="${rel.color || '#5f8fd6'}"></line>`;
        })
        .join('');
}

async function persistLoreMapPosition(id, x, y) {
    const item = currentLoreItems.find(entry => entry.id === id);
    if (!item) return;
    item.map_x = x;
    item.map_y = y;
    try {
        await api('PUT', `/api/lore/${id}`, {
            name: item.name,
            category: item.category,
            description: item.description,
            image_url: item.image_url,
            event_date: item.event_date,
            event_order: item.event_order,
            map_x: x,
            map_y: y
        });
    } catch (e) { console.error('persistLoreMapPosition:', e); }
}

function setupLoreMapDrag() {
    const getPlaceMap = () => new Map(currentLoreItems.filter(item => item.category === 'place').map(item => [item.id, item]));
    loreMapBoard.onmousemove = (e) => {
        if (!loreMapDragState) {
            const placeMap = getPlaceMap();
            const rect = loreMapBoard.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
            const mouseY = ((e.clientY - rect.top) / rect.height) * 100;
            const hoveredEdge = loreMapRelations.find(rel => {
                const a = placeMap.get(rel.lore_a_id);
                const b = placeMap.get(rel.lore_b_id);
                if (!a || !b) return false;
                const distance = Math.abs((b.map_y - a.map_y) * mouseX - (b.map_x - a.map_x) * mouseY + b.map_x * a.map_y - b.map_y * a.map_x) /
                    (Math.hypot(b.map_y - a.map_y, b.map_x - a.map_x) || 1);
                const minX = Math.min(a.map_x, b.map_x) - 1.5;
                const maxX = Math.max(a.map_x, b.map_x) + 1.5;
                const minY = Math.min(a.map_y, b.map_y) - 1.5;
                const maxY = Math.max(a.map_y, b.map_y) + 1.5;
                return distance < 1.8 && mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
            });
            if (hoveredEdge) {
                showConnectionTooltip(
                    `${hoveredEdge.lore_a_name} -> ${formatLoreRelationLabel(hoveredEdge.relation_type)} -> ${hoveredEdge.lore_b_name}`,
                    hoveredEdge.description || 'No description added yet.',
                    e.clientX,
                    e.clientY
                );
            } else {
                hideWikiTooltip();
            }
            return;
        }
        const rect = loreMapBoard.getBoundingClientRect();
        const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(94, Math.max(6, ((e.clientY - rect.top) / rect.height) * 100));
        const item = currentLoreItems.find(entry => entry.id === loreMapDragState.id);
        if (!item) return;
        item.map_x = x;
        item.map_y = y;
        renderLoreMap(currentLoreItems, loreMapRelations);
    };
    loreMapBoard.onmouseup = async () => {
        if (!loreMapDragState) return;
        const item = currentLoreItems.find(entry => entry.id === loreMapDragState.id);
        const id = loreMapDragState.id;
        loreMapDragState = null;
        if (item) await persistLoreMapPosition(id, item.map_x ?? 50, item.map_y ?? 50);
    };
    loreMapBoard.onmouseleave = async () => {
        if (loreMapDragState) {
            const item = currentLoreItems.find(entry => entry.id === loreMapDragState.id);
            const id = loreMapDragState.id;
            loreMapDragState = null;
            if (item) await persistLoreMapPosition(id, item.map_x ?? 50, item.map_y ?? 50);
        }
        hideWikiTooltip();
    };
}

async function openLoreMap() {
    try {
        const [items, rels] = await Promise.all([
            api('GET', `/api/projects/${currentProjectId}/lore`),
            loadLoreRelationships(currentProjectId)
        ]);
        currentLoreItems = items;
        document.getElementById('loreMapProjectName').textContent = `${currentProjectData?.title || ''} - Lore Map`;
        document.getElementById('loreMapOverlay').style.display = 'flex';
        document.body.classList.add('rel-web-open');
        renderLoreMap(items, rels);
        setupLoreMapDrag();
    } catch (e) { console.error('openLoreMap:', e); }
}

async function updateProjectMapImage(imageUrl) {
    if (!currentProjectId) return;
    try {
        currentProjectData = await api('PUT', `/api/projects/${currentProjectId}`, {
            map_image_url: imageUrl || ''
        });
        if (document.getElementById('loreMapOverlay').style.display !== 'none') {
            renderLoreMap(currentLoreItems, loreMapRelations);
        }
    } catch (e) {
        console.error('updateProjectMapImage:', e);
        await showNotice(e.message || 'Could not update the map image.', 'Map Image Failed', 'danger');
    }
}

function closeLoreMap() {
    document.getElementById('loreMapOverlay').style.display = 'none';
    document.body.classList.remove('rel-web-open');
}

function showConnectionTooltip(title, description, x, y) {
    wikiTooltip.classList.add('compact');
    document.getElementById('wikiTooltipName').textContent = title || 'Connection';
    document.getElementById('wikiTooltipType').textContent = 'Connection';
    const body = document.getElementById('wikiCardBodyFlow');
    body.innerHTML = `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(description || 'No description added yet.')}</div></div>`;
    const imgWrap = document.querySelector('.wiki-card-flow .wiki-card-img-wrap');
    const imgEl = document.getElementById('wikiTooltipImgEl');
    imgEl.src = '';
    imgWrap.style.display = 'none';
    wikiTooltip.style.display = 'block';
    wikiTooltip.style.left = `${Math.min(window.innerWidth - 340, x + 18)}px`;
    wikiTooltip.style.top = `${Math.min(window.innerHeight - 220, y + 18)}px`;
}

function attachLoreListHoverTooltips() {
    loreList.querySelectorAll('.lore-list-entry').forEach(item => {
        item.addEventListener('mouseenter', handleLoreListHover);
        item.addEventListener('mousemove', handleLoreListHover);
        item.addEventListener('mouseleave', hideWikiTooltip);
    });
}

function handleLoreListHover(e) {
    const loreId = parseInt(e.currentTarget.dataset.loreId, 10);
    const item = currentLoreItems.find(entry => entry.id === loreId);
    if (!item) return;
    showWikiTooltipAtPointer({
        type: 'lore',
        name: item.name,
        category: item.category,
        image_url: item.image_url,
        summary: item.description || 'No description yet.'
    }, e.clientX, e.clientY, true);
}

function renderLore(items) {
    const catEmoji = {
        item: '\u2694\uFE0F',
        place: '\u{1F5FA}\uFE0F',
        organization: '\u{1F3DB}\uFE0F',
        concept: '\u2728',
        creature: '\u{1F409}',
        event: '\u{1F4C5}',
        other: '\u{1F4CC}'
    };
    if (!items.length) {
        loreList.innerHTML = '<li class="empty-state">No lore entries yet.</li>';
        return;
    }
    loreList.innerHTML = items.map(i => `
        <li class="item-list-entry lore-list-entry" data-lore-id="${i.id}" onclick="openEditLoreModal(${i.id})">
            <span class="item-name" title="${escapeHtml(i.name)}">${escapeHtml(i.name)}</span>
            <span class="item-badge">${catEmoji[i.category] || '\u2726'}${catEmoji[i.category] ? '' : ` ${escapeHtml(i.category || 'Custom')}`}</span>
            <button class="item-delete" onclick="deleteLore(event,${i.id})">&times;</button>
        </li>`).join('');
    attachLoreListHoverTooltips();
}

function updateLoreCategoryCustomInput() {
    const select = document.getElementById('loreCategoryInput');
    const input = document.getElementById('loreCustomCategoryInput');
    if (!select || !input) return;
    const isCustom = select.value === 'custom';
    input.style.display = isCustom ? 'block' : 'none';
    input.required = isCustom;
}

function showWikiTooltipAtPointer(item, x, y, compact = false) {
    if (!item) return;
    const signature = `pointer:${item.type || 'entry'}:${item.id || item.name || 'unknown'}:${compact ? 'compact' : 'full'}`;
    const tooltipEntry = item.type === 'character'
        ? buildCharacterTooltipEntry(item, { compact })
        : buildLoreTooltipEntry(item);
    if (activeTooltipSignature !== signature || wikiTooltip.style.display !== 'block') {
        if (!renderTooltipCard(tooltipEntry, { compact })) return;
        activeTooltipSignature = signature;
        wikiTooltip.style.visibility = 'hidden';
        wikiTooltip.style.display = 'block';
    }
    positionWikiTooltip(x, y);
    wikiTooltip.style.visibility = 'visible';
}

// --- WIKI TOOLTIPS ---
async function loadWikiData(projectId) {
    try { wikiData = await api('GET', `/api/projects/${projectId}/wiki`); }
    catch (e) { console.error('loadWikiData:', e); }
}
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let wikiHoverTimer = null;
let activeTooltipSignature = '';

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
    const meta = [character.role, character.age ? `Age ${character.age}` : ''].filter(Boolean).join(' | ') || 'Character';
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
        titlesText: titleList.join(' | '),
        image_url: character.image_url || '',
        bodyHtml: fields.join('')
    };
}

function buildLoreTooltipEntry(entry) {
    const aliasList = Array.isArray(entry.aliases) ? entry.aliases.filter(Boolean) : [];
    return {
        name: entry.name || '',
        meta: entry.category ? `Lore | ${getLoreCategoryLabel(entry.category)}` : 'Lore',
        titlesText: aliasList.join(' | '),
        image_url: entry.image_url || '',
        bodyHtml: entry.summary
            ? `<div class="wiki-card-field"><div class="wiki-card-field-value">${escapeHtml(entry.summary)}</div></div>`
            : ''
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

    return buildLoreTooltipEntry(entry);
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
    document.getElementById('focusModeBtn').textContent = 'Exit Focus';
}

function exitFocusMode() {
    isFocusMode = false;
    document.body.classList.remove('focus-mode', 'hide-cursor');
    clearTimeout(cursorHideTimer);
    document.getElementById('focusExitHint').classList.remove('visible');
    document.getElementById('focusModeBtn').textContent = 'Focus';
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
    const labels = { chapter: 'Chapters', scene: 'Scenes', character: 'Characters', lore: 'Lore' };
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
    ['allies', '\u{1F91D} Allies'],
    ['rivals', '\u2694\uFE0F Rivals'],
    ['lovers', '\u{1F495} Lovers'],
    ['enemies', '\u{1F5A4} Enemies'],
    ['family', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} Family'],
    ['mentor', '\u{1F9ED} Mentor / Student'],
    ['friends', '\u{1F60A} Friends'],
    ['complicated', '\u{1F300} Complicated'],
    ['strangers', '\u{1F465} Strangers'],
    ['custom', '\u2726 Custom']
];
const LORE_RELATION_TYPE_OPTIONS = [
    ['related to', 'Related To'],
    ['part of', 'Part Of'],
    ['belongs to', 'Belongs To'],
    ['located in', 'Located In'],
    ['created by', 'Created By'],
    ['caused by', 'Caused By'],
    ['used by', 'Used By'],
    ['guards', 'Guards'],
    ['enemy of', 'Enemy Of'],
    ['descended from', 'Descended From'],
    ['custom', 'Custom']
];

function formatRelationLabel(value) {
    if (!value) return 'Relationship';
    const preset = RELATION_TYPE_OPTIONS.find(([key]) => key === value);
    return preset ? preset[1] : value;
}

function formatLoreRelationLabel(value) {
    if (!value) return 'Related To';
    const preset = LORE_RELATION_TYPE_OPTIONS.find(([key]) => key === value);
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
        if (chars.length < 2) { await showNotice('You need at least 2 characters first.', 'Not Enough Characters', 'warning'); return; }
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
    if (charA === charB) { await showNotice('Select two different characters.', 'Choose Different Characters', 'warning'); return; }
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
        if (!chars.length) { await showNotice('No characters in this project yet.', 'Nothing To Show', 'warning'); return; }
        document.getElementById('relWebProjectName').textContent = `${currentProjectData?.title || ''} - Character Web`;
        document.getElementById('relWebOverlay').style.display = 'flex';
        document.body.classList.add("rel-web-open");
        relCanvas = document.getElementById('relWebCanvas');
        relCtx = relCanvas.getContext('2d');
        await new Promise(r => setTimeout(r, 50));
        resizeRelCanvas();
        const cssW = relCanvas._cssW || relCanvas.offsetWidth;
        const cssH = relCanvas._cssH || relCanvas.offsetHeight;
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
                x: Number.isFinite(c.web_x) ? c.web_x : cx + radius * Math.cos(angle),
                y: Number.isFinite(c.web_y) ? c.web_y : cy + radius * Math.sin(angle),
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

function resizeRelCanvas() {
    if (!relCanvas || !relCtx || !isRelWebOpen()) return;
    const dpr = window.devicePixelRatio || 1;
    relCanvas.width = relCanvas.offsetWidth * dpr;
    relCanvas.height = relCanvas.offsetHeight * dpr;
    relCanvas._dpr = dpr;
    relCanvas._cssW = relCanvas.offsetWidth;
    relCanvas._cssH = relCanvas.offsetHeight;
    relCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRelWeb();
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
        const draggedNode = relDragging;
        if (!moved && Date.now() - mouseDownTime < 300 && !relDragging) {
            const cx = (mx - relPanX) / relZoom, cy = (my - relPanY) / relZoom;
            const clicked = relEdges.find(edge => isNearCurve(cx, cy, edge));
            if (clicked) openEditRelModal(clicked);
        }
        relDragging = null; relIsPanning = false; mouseDownPos = null;
        relCanvas.style.cursor = 'grab';
        if (draggedNode) {
            persistCharacterWebPosition(draggedNode.id, draggedNode.x, draggedNode.y);
        }
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

    if (!relResizeHandler) {
        relResizeHandler = () => resizeRelCanvas();
        window.addEventListener('resize', relResizeHandler);
    }
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
    relIsPanning = false;
    relHoveredNodeId = null;
    hideWikiTooltip();
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
    const icon = { chapter: '\u{1F4C4}', scene: '\u26A1' };
    openTabsEl.innerHTML = openTabs.map(t => `
        <div class="open-tab ${t.id === currentDocId && t.type === currentDocType ? 'active' : ''}"
             data-id="${t.id}" data-type="${t.type}" onclick="openDocument(${t.id},'${t.type}')">
            <span style="font-size:11px;margin-right:4px;">${icon[t.type] || '\u{1F4C4}'}</span>
            <span class="open-tab-name">${escapeHtml(t.title)}</span>
            <button class="open-tab-close" onclick="closeTab(event,${t.id},'${t.type}')">&times;</button>
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

async function checkLocalStorageRestore(key, serverContent) {
    const backup = loadFromLocalStorage(key);
    if (!backup) return false;
    if (Date.now() - backup.savedAt > 86400000) { clearLocalStorage(key); return false; }
    if (backup.content !== serverContent) {
        const shouldRestore = await showDecision(
            `Unsaved changes found from ${formatTimeAgo(backup.savedAt)}.\n\nRestore them?`,
            { title: 'Restore Unsaved Changes?', confirmText: 'Restore', cancelText: 'Discard', tone: 'warning' }
        );
        if (shouldRestore) {
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
        if (saveStatus.classList.contains('unsaved') && secondsUntilSave > 0) saveStatus.textContent = `Saving in ${secondsUntilSave}s`;
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
    updateSaveButtonState();
    if (pendingSync && canAttemptDriveSync() && currentDocId && currentDocType === 'chapter') {
        setSaveStatus('syncing');
        try { await queueDriveSync(currentDocId); } catch (e) { }
    }
});

window.addEventListener('offline', () => {
    updateSaveButtonState();
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

function queueDriveSync(docId) {
    pendingSync = false;
    pendingSyncPromise = api('POST', `/api/documents/${docId}/sync`)
        .then(() => {
            if (currentDocId === docId && currentDocType === 'chapter') {
                setSaveStatus('synced');
                setTimeout(() => {
                    if (currentDocId === docId && currentDocType === 'chapter' && !saveStatus.classList.contains('unsaved')) {
                        setSaveStatus('saved');
                    }
                }, 1500);
            }
        })
        .catch(async e => {
            console.error('driveSync:', e);
            if (currentDocId === docId && currentDocType === 'chapter') {
                setSaveStatus('error');
            }
            await showNotice('Drive sync failed. Please try again after restarting the app.', 'Sync Failed', 'danger');
        })
        .finally(() => {
            pendingSyncPromise = null;
        });
    return pendingSyncPromise;
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
    const map = { saved: 'Saved', saving: 'Saving...', syncing: 'Syncing...', synced: 'Synced', unsaved: 'Unsaved', error: 'Error', '': '' };
    saveStatus.textContent = map[status] ?? status;
    saveStatus.className = 'save-status ' + status;
}

function enableHeaderBtns(on) {
    saveBtn.disabled = exportPdfBtn.disabled = exportDocxBtn.disabled = !on;
    updateSaveButtonState();
}

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
    document.getElementById('themeIcon').textContent = isDark ? '\u{1F319}' : '\u2600\uFE0F';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark Mode' : 'Light Mode';
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
        const userAvatar = document.getElementById('userAvatar');
        if (data.logged_in) {
            authState = { loggedIn: true, mode: 'account' };
            storageScopeKey = data.scope_key || `user_${data.user.id}`;
            localStorage.removeItem('scripvia_guest');
            localStorage.removeItem('scripvia_guest_scope');
            loginBtn.style.display = 'none'; userInfo.classList.remove('hidden');
            setUserAvatar(data.user.name, data.user.picture);
            document.getElementById('userName').textContent = data.user.name.split(' ')[0];
        } else {
            authState = { loggedIn: false, mode: 'guest' };
            pendingSync = false;
            storageScopeKey = data.scope_key || localStorage.getItem('scripvia_guest_scope') || `guest_${Date.now()}`;
            localStorage.setItem('scripvia_guest_scope', storageScopeKey);
            const guest = localStorage.getItem('scripvia_guest');
            if (guest) showGuestUser(JSON.parse(guest).name);
            else { loginBtn.style.display = 'flex'; userInfo.classList.add('hidden'); }
        }
        updateSaveButtonState();
    } catch (e) {
        console.error('checkAuthState:', e);
        authState = { loggedIn: false, mode: 'guest' };
        updateSaveButtonState();
    }
}

function showGuestUser(name) {
    authState = { loggedIn: false, mode: 'guest' };
    pendingSync = false;
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('userName').textContent = name + ' (guest)';
    document.getElementById('userAvatar').style.display = 'none';
    updateSaveButtonState();
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

document.getElementById('newLoreBtn').addEventListener('click', () => {
    resetLoreModal();
    openModal(newLoreModal);
});
document.getElementById('cancelLoreBtn').addEventListener('click', () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('cancelLoreBtnX').addEventListener('click', () => { resetLoreModal(); closeModal(newLoreModal); });
document.getElementById('confirmLoreBtn').addEventListener('click', () => {
    const btn = document.getElementById('confirmLoreBtn');
    btn.dataset.mode === 'edit' && btn.dataset.editId ? saveEditLore(parseInt(btn.dataset.editId)) : createLore();
});

saveBtn.addEventListener('click', saveDocument);

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateSaveButtonState();

    ensureWikiTooltipLayout();
    ensureRelationTypeInputs();
    ensureCharacterTitlesUI();
    setLoreAliases([]);
    document.getElementById('addLoreAliasBtn').addEventListener('click', () => addLoreAliasInput(''));
    document.getElementById('wikiCardClose').addEventListener('click', hideWikiTooltip);
    document.getElementById('backToOverview').addEventListener('click', () => { hideEditor(); showProjectOverview(currentProjectId); });
    document.getElementById('notesToggleBtn').addEventListener('click', toggleNotesPanel);
    document.getElementById('notesPanelClose').addEventListener('click', closeNotesPanel);
    document.getElementById('focusModeBtn').addEventListener('click', toggleFocusMode);
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('newRelBtn').addEventListener('click', openNewRelModal);
    document.getElementById('viewRelWebBtn').addEventListener('click', openRelWeb);
    document.getElementById('newLoreRelBtn').addEventListener('click', () => openNewLoreRelModal());
    document.getElementById('viewLoreWebBtn').addEventListener('click', openLoreWeb);
    document.getElementById('viewLoreTimelineBtn').addEventListener('click', openLoreTimeline);
    document.getElementById('viewLoreMapBtn').addEventListener('click', openLoreMap);
    document.getElementById('loreWebViewSelect').addEventListener('change', async e => {
        currentLoreWebView = e.target.value || 'mixed';
        if (document.getElementById('loreWebOverlay').style.display !== 'none') await renderActiveLoreWeb();
    });
    document.getElementById('relWebClose').addEventListener('click', closeRelWeb);
    document.getElementById('relWebAddBtn').addEventListener('click', () => openNewRelModal());
    document.getElementById('loreWebClose').addEventListener('click', closeLoreWeb);
    document.getElementById('loreWebAddBtn').addEventListener('click', () => openNewLoreRelModal());
    document.getElementById('loreTimelineClose').addEventListener('click', closeLoreTimeline);
    document.getElementById('loreMapClose').addEventListener('click', closeLoreMap);
    document.getElementById('loreMapHelpBtn').addEventListener('click', () => {
        showNotice('Drag location nodes around the board to arrange your world map. Double-click a place to edit it.', 'Lore Map Help', 'info');
    });
    document.getElementById('loreMapSetImageBtn').addEventListener('click', () => {
        document.getElementById('loreMapImageFile').click();
    });
    document.getElementById('loreMapImageFile').addEventListener('change', () => {
        const file = document.getElementById('loreMapImageFile').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async e => {
            await updateProjectMapImage(e.target.result);
            document.getElementById('loreMapImageFile').value = '';
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('loreMapClearImageBtn').addEventListener('click', () => updateProjectMapImage(''));
    document.getElementById('loreTimelineCategoryFilter').addEventListener('change', applyLoreTimelineFilters);
    document.getElementById('loreTimelineSearch').addEventListener('input', applyLoreTimelineFilters);
    document.getElementById('cancelRelBtn').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('cancelRelBtnX').addEventListener('click', () => closeModal(newRelModal));
    document.getElementById('confirmRelBtn').addEventListener('click', createRelationship);
    document.getElementById('confirmEditRelBtn').addEventListener('click', saveEditRel);
    document.getElementById('cancelLoreRelBtn').addEventListener('click', () => closeModal(newLoreRelModal));
    document.getElementById('cancelLoreRelBtnX').addEventListener('click', () => closeModal(newLoreRelModal));
    document.getElementById('confirmLoreRelBtn').addEventListener('click', createLoreRelationship);
    document.getElementById('cancelEditLoreRelBtn').addEventListener('click', () => closeModal(document.getElementById('editLoreRelModal')));
    document.getElementById('cancelEditLoreRelBtnX').addEventListener('click', () => closeModal(document.getElementById('editLoreRelModal')));
    document.getElementById('confirmEditLoreRelBtn').addEventListener('click', saveEditLoreRel);
    document.getElementById('deleteLoreRelFromEditBtn').addEventListener('click', deleteLoreRelFromEdit);
    document.getElementById('loreRelTypeInput').addEventListener('change', () => updateLoreRelationCustomInput('new'));
    document.getElementById('editLoreRelTypeInput').addEventListener('change', () => updateLoreRelationCustomInput('edit'));
    document.getElementById('relTypeInput').addEventListener('change', () => updateRelationCustomInput('new'));
    document.getElementById('editRelTypeInput').addEventListener('change', () => updateRelationCustomInput('edit'));
    document.getElementById('cancelEditRelBtn').addEventListener('click', () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('cancelEditRelBtnX').addEventListener('click', () => closeModal(document.getElementById('editRelModal')));
    document.getElementById('deleteRelFromEditBtn').addEventListener('click', deleteRelFromEdit);
    document.getElementById('loreCategoryInput').addEventListener('change', updateLoreCategoryCustomInput);

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
    document.querySelectorAll('#loreRelColorPicker .rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#loreRelColorPicker .rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected'); loreRelSelectedColor = opt.dataset.color;
        });
    });
    document.querySelectorAll('#editLoreRelColorPicker .rel-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('#editLoreRelColorPicker .rel-color-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected'); editLoreRelColor = opt.dataset.color;
        });
    });

    fetch('/auth/me').then(r => r.json()).then(data => {
        // If online account is active, clear any stale guest data
        if (data.logged_in) {
            localStorage.removeItem('scripvia_guest');
            localStorage.removeItem('scripvia_guest_scope');
        }

        // If no session at all → go to login
        if (!data.logged_in && !localStorage.getItem('scripvia_guest')) {
            window.location.href = '/login';
            return;
        }

        applyTheme();
        applySidebar();
        initQuill();
        loadProjects();
        checkAuthState();
    }).catch(() => {
        applyTheme();
        applySidebar();
        initQuill();
        loadProjects();
    });
    populateLoreRelationTypeSelects();
    document.querySelector('#loreWebOverlay .rel-web-hint').textContent = 'Scroll to zoom | Drag canvas to pan | Click connection to edit | Double-click a lore node to connect it';
    setupImageUpload('charImageFile', 'charImageInput', 'charImgPreview', 'charImgPreviewEl', 'clearCharImg', true);
    setupImageUpload('loreImageFile', 'loreImageInput', 'loreImgPreview', 'loreImgPreviewEl', 'clearLoreImg', false);
    updateLoreCategoryCustomInput();
    document.getElementById('cropConfirmBtn')?.addEventListener('click', confirmCrop);
    document.getElementById('cropModalClose')?.addEventListener('click', () => closeModal(document.getElementById('cropModal')));
    document.getElementById('cropCancelBtn')?.addEventListener('click', () => closeModal(document.getElementById('cropModal')));
});

