# ✍️ Scripvia

> *Write anything. Remember everything.*

Scripvia is a local-first writing app built for long-form projects, worldbuilding, and creative planning. It blends a rich writing editor with characters, scenes, lore tools, relationship webs, notes, search, export, and optional Google Drive sync, all inside one focused workspace.

---

## ✨ Features At a Glance

| Feature | Description |
|---------|-------------|
| 📝 Rich Text Editor | Quill-powered writing with formatting, autosave, and restore |
| 🎭 Genre System | Creative genres unlock the full storytelling toolkit |
| 👤 Characters | Profiles, aliases, images, notes, and hover wiki cards |
| ⚡ Scenes | Mood-tagged scene drafting in full editor tabs |
| 📖 Lore | Entries, custom categories, timeline data, and map placement |
| 🕸️ Character Web | Interactive relationship canvas between characters |
| 🔗 Lore Web | Visual connection map for worldbuilding entries |
| 🗓️ Lore Timeline | Timeline view for events and dated lore |
| 🗺️ Lore Map | Drag places around a visual map board |
| 🔍 Search | Project-wide search across writing and reference content |
| 📝 Notes Panel | Slide-out project notes with autosave |
| ☁️ Google Drive Sync | Optional background sync for writing and project data |
| 📤 Export | PDF and DOCX export for chapters and full projects |
| 🎯 Focus Mode | Fullscreen distraction-free writing |
| 🖥️ Desktop App | Run in browser or via native desktop launcher |

---

## 🎭 Genre System

When you create a project, Scripvia asks for a genre. In creative genres, that choice unlocks the full story-planning toolkit.

### Creative genres

| Genre | Unlocks |
|-------|---------|
| ⚔️ Fantasy | Characters, Scenes, Lore, Web tools |
| 🚀 Sci-Fi | Characters, Scenes, Lore, Web tools |
| 📖 Fiction | Characters, Scenes, Lore, Web tools |
| 💕 Romance | Characters, Scenes, Lore, Web tools |
| 🔍 Mystery | Characters, Scenes, Lore, Web tools |
| ⚡ Thriller | Characters, Scenes, Lore, Web tools |
| 🕯️ Horror | Characters, Scenes, Lore, Web tools |
| 🏛️ Historical | Characters, Scenes, Lore, Web tools |

### Simpler project types

For non-creative genres, Scripvia keeps the workspace lighter by focusing on chapters and core writing tools.

---

## 📝 Writing Experience

### Rich Text Editor

The editor supports:

- Headings
- Bold, italic, underline, and strike
- Text color and highlight
- Lists, blockquotes, and code blocks
- Alignment and indentation
- Links and formatting cleanup

### VS Code-Style Tabs

- Open multiple chapters and scenes at once
- Switch between them from a tabs bar
- Scene tabs use a lightning icon
- Closing one tab returns you to the previous open item

### Auto-Save + Restore

- Autosaves every 30 seconds
- Stores a local backup on every keystroke
- Prompts to restore newer unsaved local changes
- Tracks save state visually: Unsaved, Saving, Syncing, Synced

### Live Writing Stats

- Word count
- Character count
- Estimated read time
- Last saved time

### Focus Mode

- Toggle with `F11`
- Hides surrounding UI for immersive drafting
- Shows a floating word count
- Supports `Esc` to exit quickly
- Auto-hides the cursor after inactivity

### Workspace Comfort

- 🌙 Light and dark theme toggle
- 📚 Collapsible sidebar

---

## 📁 Project Management

### Project Overview

Every project opens into an overview page with:

- Title, genre, and description
- Total words across chapters and scenes
- Chapter, character, scene, and lore counts
- Created and last-edited timestamps
- Quick actions for writing, worldbuilding, and export

### Chapter Reordering

- Drag chapters by handle
- Reorder them instantly
- Export follows the saved chapter order

---

## 👤 Characters

Each character can include:

- Name
- Role
- Age
- Personality
- Appearance
- Backstory
- Extra notes
- Multiple titles or aliases
- Image from upload or URL

### Character extras

- Click a character in the list to edit instantly
- Crop uploaded images before saving
- Hover character names while writing to see wiki-style info cards
- Character aliases are included in the richer tooltip display

---

## ⚡ Scenes

Scenes are lightweight writing units that still open in the full editor.

- Title
- Mood tag
- Optional connected chapter
- Full rich-text content
- Search support
- Included in total project word counts

---

## 📖 Lore

Lore entries help build your world beyond the manuscript.

Each lore item can include:

- Name
- Category
- Custom category support
- Description
- Extra notes
- Image
- Timeline date
- Timeline order
- Map X/Y placement

### Lore views

- 📖 Lore list for quick browsing
- 🔗 Lore Web for visual relationships
- 🗓️ Lore Timeline for dated entries and events
- 🗺️ Lore Map for placing locations spatially

### Lore extras

- Click entries to edit them directly
- Hover lore names in the editor to view instant wiki cards

---

## 🕸️ Relationship Tools

### Character Web

Build a relationship graph between characters with:

- Relationship type
- Custom labels
- Connection color
- Optional description

The canvas supports:

- Dragging nodes
- Zooming
- Panning
- Clicking connections to edit them
- Multiple visible links between the same pair

### Lore Web

Worldbuilding entries can also be connected in their own visual graph.

- Add lore-to-lore relationships
- Edit relationship labels and colors
- Double-click lore nodes to connect them faster
- Explore your world structure visually

---

## 🔍 Search

Project-wide search works across:

- 📄 Chapters
- ⚡ Scenes
- 👤 Characters
- 📖 Lore

Search includes:

- Highlighted matches
- Snippet previews
- Grouped result types
- Keyboard navigation with arrows and Enter

---

## 📝 Notes Panel

Each project has its own slide-out notes area.

- Opens beside the editor
- Autosaves shortly after typing stops
- Persists per project
- Closes automatically in focus mode

---

## ☁️ Google Drive Sync

Scripvia works locally first, but can also sync to Google Drive when Google sign-in is configured.

### Sync coverage

- Chapters
- Scenes
- Characters
- Lore entries
- Notes
- Character relationship summaries
- Lore relationship summaries

### Sync behavior

- Background, non-blocking sync
- Guest mode stays local-only
- Signed-in mode can create project folders on Drive
- Guest projects can be claimed after sign-in

---

## 📤 Export

### Single Chapter Export

- PDF export
- DOCX export
- Preserves rich-text structure for supported formatting

### Full Project Export

- Full manuscript export as PDF
- Full manuscript export as DOCX
- Includes cover-style project metadata
- Follows custom chapter order

---

## 🔐 Authentication

### Google Sign-In

- OAuth login
- Google Drive integration
- 30-day session persistence

### Guest Mode

- No account required
- Local-only writing flow
- Useful for offline drafting and quick start use

---

## 🖥️ Desktop App

Scripvia can be used in two ways:

### Browser mode

Run the Flask app and open it in your browser.

### Native desktop launcher

The current repo includes a native launcher in [`launcher.py`](D:/aaliya/study/projects/writer_app/launcher.py), which starts Flask and opens Scripvia in a desktop window.

The repo also includes Electron packaging files in [`electron/`](D:/aaliya/study/projects/writer_app/electron), but the Python launcher is the main runnable desktop entry point in this codebase.

User data is stored locally in:

`~/Scripvia/scripvia.db`

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current document |
| `Ctrl+K` | Open search |
| `F11` | Toggle focus mode |
| `Esc` | Exit focus mode or close overlays |

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Editor | Quill |
| Backend | Python + Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Migrations | Flask-Migrate + Alembic |
| Auth | Google OAuth 2.0 |
| Cloud Sync | Google Drive API |
| PDF Export | ReportLab |
| DOCX Export | python-docx |
| Parsing | BeautifulSoup |
| Desktop Launcher | pywebview |
| Packaging Assets | PyInstaller + Electron files |

---

## ⚙️ Local Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Create a `.env` file

Google credentials are only needed for Google login and Drive sync. Guest mode works without them.

```env
SECRET_KEY=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Run in browser

```bash
python app.py
```

Then open `http://127.0.0.1:5000`

### 4. Run as desktop app

```bash
python launcher.py
```

If `launcher.py` complains that `webview` is missing, install `pywebview` in your environment first.

---

## 📂 Project Structure

```text
writer_app/
├── app.py
├── launcher.py
├── config.py
├── requirements.txt
├── templates/
│   ├── index.html
│   └── login.html
├── static/
│   ├── css/
│   └── js/
├── migrations/
├── electron/
└── instance/
```

### Main files

- [`app.py`](D:/aaliya/study/projects/writer_app/app.py): backend routes, models, sync, and export logic
- [`launcher.py`](D:/aaliya/study/projects/writer_app/launcher.py): native desktop launcher
- [`config.py`](D:/aaliya/study/projects/writer_app/config.py): environment configuration
- [`templates/index.html`](D:/aaliya/study/projects/writer_app/templates/index.html): main UI structure
- [`static/js/main.js`](D:/aaliya/study/projects/writer_app/static/js/main.js): frontend behavior
- [`static/css/style.css`](D:/aaliya/study/projects/writer_app/static/css/style.css): application styling

---

## 🆕 Updated In This Version

This README now reflects the newer features already present in the app, including:

- Lore relationships
- Lore Web, Timeline, and Map views
- Character titles / aliases
- Image crop flow
- Connected chapter support for scenes
- Theme toggle and collapsible sidebar
- Guest project claim flow after sign-in
- More accurate desktop launcher documentation

---

## 📄 License

Personal project / private-use app unless you choose to apply a different license.

---

*Scripvia — because stories deserve a workspace as rich as the worlds behind them.*
