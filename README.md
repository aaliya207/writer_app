# ✍️ Scripvia

> *Write anything. Remember everything.*

Scripvia is a personal writing app built for writers who want more than just a text editor — it's a full creative workspace with worldbuilding tools, character management, an interactive relationship web, Google Drive sync, and a beautiful distraction-free writing experience. Built from scratch with love for the craft of storytelling.

---

## ✨ Features at a Glance

| Feature | Description |
|---------|-------------|
| 📝 Rich Text Editor | Quill.js powered, full formatting |
| 🎭 Genre System | Unlocks creative tools per genre |
| 👤 Characters | Profiles, images, wiki tooltips |
| ⚡ Scenes | Mood-tagged scene capture |
| 📖 Lore | World-building wiki |
| 🕸️ Relationship Web | Interactive character connection canvas |
| 🔍 Search | Full-text search across everything |
| 📝 Notes Panel | Slide-in project notepad |
| ☁️ Google Drive Sync | Auto background sync |
| 📤 Export | PDF + DOCX, single chapter or full project |
| 🎯 Focus Mode | Distraction-free fullscreen writing |
| 🖥️ Desktop App | Electron-powered native window |

---

## 🎭 Genre System — Unlock Your Creative Tools

When creating a project, Scripvia asks you to pick a genre. This isn't just a label — it **unlocks an entire set of creative tools** tailored for fiction writers.

**Creative genres** that unlock the full toolkit:

| Genre | Emoji | Unlocks |
|-------|-------|---------|
| Fantasy | ⚔️ | Characters, Scenes, Lore, Relationship Web |
| Sci-Fi | 🚀 | Characters, Scenes, Lore, Relationship Web |
| Fiction | 📖 | Characters, Scenes, Lore, Relationship Web |
| Romance | 💕 | Characters, Scenes, Lore, Relationship Web |
| Mystery | 🔍 | Characters, Scenes, Lore, Relationship Web |
| Thriller | ⚡ | Characters, Scenes, Lore, Relationship Web |
| Horror | 🕯️ | Characters, Scenes, Lore, Relationship Web |
| Historical Fiction | 🏛️ | Characters, Scenes, Lore, Relationship Web |

**Non-creative genres** (Chapters only — no extra tabs):

- 📝 General / Notes
- 📓 Journal / Diary
- 🎬 Screenplay
- ✨ Poetry
- 📌 Other

When you select a creative genre, the sidebar automatically shows the **Characters, Scenes, Lore and Web tabs**. These tabs stay hidden for non-creative projects to keep things clean. The Project Overview page also shows/hides the relevant quick-action buttons based on your genre.

---

## 📝 Writing & Editor

### Rich Text Editor
Powered by **Quill.js** with a full formatting toolbar:
- Headings (H1, H2, H3)
- Bold, italic, underline, strikethrough
- Text colour and background colour
- Ordered and unordered lists
- Blockquotes and code blocks
- Text alignment and indentation
- Hyperlinks
- Clean formatting button

### VS Code-Style Open Tabs
- Open multiple chapters and scenes simultaneously
- Tabs appear at the top of the editor just like VS Code
- Each tab shows a type icon (📄 chapter, ⚡ scene)
- Click the × on any tab to close it — automatically switches to the last open tab
- Active tab highlighted with an accent underline

### Auto-Save System
- **Auto-saves every 30 seconds** with a live countdown shown in the save status
- **localStorage backup on every single keystroke** — you never lose a word
- If you close the app with unsaved changes, the next time you open that document it asks if you want to restore the backup
- Backup detection is smart — only prompts if the backup is newer than what's on the server and less than 24 hours old
- Save status indicator shows: Unsaved → Saving → Syncing → Synced

### Stats Bar
Live stats displayed at the bottom of every document:
- **Word count** — updates as you type
- **Character count** — updates as you type
- **Estimated read time** — calculated at 200 words per minute
- **Last saved time** — exact time of last successful save

---

## 🎯 Focus Mode

The ultimate distraction-free writing experience.

- Press **`F11`** or click **⛶ Focus** in the header
- Everything disappears — sidebar, toolbar, header, stats bar, notes panel
- Only your words remain on screen
- **Cursor auto-hides** after 3 seconds of no mouse movement — move the mouse to bring it back
- A floating **word count** appears in the bottom right corner
- An **exit hint** fades in briefly at the bottom telling you how to leave
- Press **`Esc`** or **`F11`** to exit focus mode and return to the full editor

---

## 📁 Project Management

### Project Overview Page
Every time you click a project, you land on a beautiful **overview page** before diving in:
- Large project title with gradient text
- Genre badge
- Project description
- **Live stats grid** — total word count across all chapters and scenes, chapter count, character count, scene count, lore entry count
- Last edited and created timestamps shown in relative time — "2h ago", "3d ago"
- Quick action buttons — Start Writing, Characters, Scenes, Lore, Character Web, Export PDF, Export DOCX
- Creative-only buttons automatically hidden for non-creative genres
- Animated background orbs for atmosphere

### Chapter Reordering
- Every chapter in the sidebar has a **⠿ drag handle**
- Drag chapters up and down to reorder them
- A blue line indicator shows where the chapter will be dropped
- New order saves to the database instantly
- Export respects the custom order

### Project Creation
- Title + genre + optional description
- Genre picker shows a note when a creative genre is selected: *"✦ This genre unlocks Characters, Scenes and Lore tabs"*
- Creating a project instantly creates a matching folder on Google Drive in the background

---

## 👤 Characters

### Character Profiles
Each character can have:
- **Name** (required)
- **Role** — Main Lead, Second Lead, Love Interest, Villain, Support Role, Mentor/Guide, Comic Relief, Side Character, Other
- **Age**
- **Appearance** — physical description
- **Personality** — how they think, feel, act
- **Backstory** — their history and background
- **Image** — upload from device (stored as base64, works offline) or paste a URL

### Click to Edit
- Click any character in the sidebar to open their profile in the edit modal — no separate edit button needed
- Modal opens pre-filled with all existing data including image preview
- Save Changes or Cancel — modal resets cleanly after either action

### Wiki Tooltip — Hover Over Names While Writing
One of Scripvia's most powerful features. While writing in the editor:
- Hover your mouse over any character's name in the text
- After 400ms, a **wiki card** appears near your cursor
- The card shows the full character image, name, role, personality, backstory and appearance
- Move mouse off the card to dismiss it
- Works for multi-word names — hovering any word in the name triggers it
- Longest names take priority — "Seo In Tae" matches before "Seo"
- Close with the × button or by moving away

### Image Upload
- Upload directly from your device — converted to base64 and stored in the database
- Works completely **offline** and for guest users — no URL needed
- Live preview appears as soon as you upload or paste a URL
- Remove button to clear the image

---

## ⚡ Scenes

Quick-capture story moments without the formality of a full chapter.

- **Title** — the scene concept
- **Mood tag** — ⚡ Tense, 💕 Romantic, 🌫️ Mysterious, 🔥 Action, 💧 Sad, 🌅 Hopeful, 🌑 Dark, 😄 Comedic
- Scenes open in the **same full editor** as chapters — write them out completely
- Appear in the VS Code tabs bar just like chapters (with ⚡ icon)
- Mood shown as a badge next to the scene title in the sidebar
- Scenes count toward the project total word count on the overview page

---

## 📖 Lore

Build the bible of your fictional world.

### Categories
- ⚔️ Item / Object
- 🗺️ Place / Location
- 🏛️ Organization / Faction
- ✨ Concept / Magic / Power
- 🐉 Creature / Species
- 📅 Historical Event
- 📌 Other

### Lore Entries
Each entry has a name, category, description, optional image (upload or URL), and extra notes.

### Click to Edit
Same as characters — click any lore entry to open it pre-filled for editing.

### Wiki Tooltip
Lore entries appear in the wiki tooltip system too. Hover over any lore name while writing to see its description and image instantly — right where you need it, without breaking your flow.

---

## 🕸️ Character Relationship Web

An interactive visual canvas showing how your characters connect.

### Adding Relationships
Choose two characters and a relationship type:
- 🤝 Allies, ⚔️ Rivals, 💕 Lovers, 🖤 Enemies, 👨‍👩‍👧 Family, 🧭 Mentor/Student, 😊 Friends, 🌀 Complicated, 👥 Strangers
- Pick a **colour** for the connection line — 6 colour options
- Add an optional description

### The Canvas
- Characters appear as **circular nodes** — showing their image if set, or a gradient initial if not
- Name and role shown below each node in a pill label
- Connection lines drawn between related characters with the chosen colour
- **Relationship emoji** shown at the midpoint of each line in a labelled badge

### Interactions
- **Drag characters** to arrange the web however makes sense for your story
- **Scroll to zoom in/out** — smooth zoom toward your cursor position
- **Drag the background** to pan around the canvas — infinite canvas like Eraser.io
- **+ / ⊙ / −** zoom control buttons at the bottom
- **Click any connection line** to open an edit modal — change type, description, colour or delete
- Multiple connections between the same pair shown as **curved lines** that separate so both are always visible
- Canvas is HiDPI/retina aware — perfectly sharp on high resolution displays

---

## 🔍 Search

Full-text search across your entire project.

- Press **`Ctrl+K`** or click **🔍 Search** in the header
- Searches simultaneously across all chapter content, scene content, character profiles and lore entries
- Results grouped by type — 📄 Chapters, ⚡ Scenes, 👤 Characters, 📖 Lore
- **Highlighted matches** — the search term highlighted in yellow in both titles and content snippets
- Content snippets show surrounding context of where the match was found
- Navigate with **↑↓ arrow keys**, open with **Enter**
- Click any result to jump directly to it — opens the document or edit modal
- Press **Esc** to close

---

## 📝 Notes Panel

A slide-in notepad that stays alongside your writing.

- Click **📝 Notes** in the editor header to open
- Panel slides in from the right — the editor adjusts to make room
- One set of notes **per project** — persists between sessions
- **Auto-saves 1.5 seconds** after you stop typing
- Save status indicator shown in the footer
- Notes sync to Google Drive as `_notes.txt` in the project folder
- Closes automatically when entering focus mode

---

## ☁️ Google Drive Sync

Your writing lives in two places — on your device and in the cloud.

### Drive Structure
```
Scripvia/
└── [Project Name]/
    ├── Chapter One.txt
    ├── Chapter Two.txt
    ├── _notes.txt
    ├── Characters/
    │   └── Character Name.txt
    ├── Scenes/
    │   └── Scene Title.txt
    └── Lore/
        └── Lore Entry.txt
```

### Sync Behaviour
- Chapters sync on every **Save & Sync** — background, non-blocking
- Characters, Scenes and Lore sync to Drive when created
- Notes sync 1.5 seconds after you stop typing
- **Offline mode** — everything saves locally, syncs automatically when you reconnect
- Deleting a project deletes its Drive folder
- Deleting a chapter deletes its Drive file
- All Drive operations run in background threads — the UI never waits or blocks

---

## 📤 Export

### Single Chapter Export
- **PDF** — styled with purple headings, proper margins, title and project subtitle
- **DOCX** — matching Word document with proper font sizes and colour styling
- Supports H1/H2/H3 headings, blockquotes, bullet lists in both formats

### Full Project Export
Available from the Project Overview page:
- **Cover page** — project title, description, genre, chapter count, total word count
- **Table of contents** — numbered list of all chapters in order
- **All chapters** — each on its own page with chapter number and title heading
- Respects custom chapter order from drag-and-drop reordering
- Available as both **PDF** and **DOCX**

---

## 🖥️ Desktop App

Scripvia runs as a proper native desktop application.

- Packaged with **PyInstaller** + **Electron**
- Opens as a native window — no browser tabs, no address bar
- Custom app icon in taskbar and window title bar
- Window size: 1280×800 default, 900×600 minimum, fully resizable
- User data stored in `C:\Users\[name]\Scripvia\` — persists between versions
- Shareable `.exe` installer — no Python or Node.js needed to run
- Flask backend starts automatically on launch

---

## 🔐 Authentication

### Google Sign-In
- Full OAuth 2.0 flow
- Access to Google Drive for sync
- Session persists for 30 days — stay logged in across restarts

### Guest Mode
- Use Scripvia without a Google account
- Enter just your name to get started
- All data saved locally in the browser
- No Drive sync in guest mode

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save & sync current document |
| `F11` | Toggle focus mode |
| `Ctrl+K` | Open search |
| `Esc` | Exit focus mode / close modals / hide wiki tooltip |

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Editor | Quill.js 1.3.7 |
| Backend | Python + Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Migrations | Flask-Migrate + Alembic |
| Auth | Google OAuth 2.0 |
| Cloud Sync | Google Drive API v3 |
| PDF Export | ReportLab |
| DOCX Export | python-docx |
| HTML Parsing | BeautifulSoup4 |
| Desktop Wrapper | Electron |
| Packaging | PyInstaller |
| Fonts | Cormorant Garamond + DM Sans |

---

## ⚙️ Local Setup

### Prerequisites
- Python 3.10+
- Google Cloud project with Drive API + OAuth 2.0 enabled

### Run Locally

```bash
git clone https://github.com/your-username/scripvia.git
cd scripvia
pip install -r requirements.txt
python app.py
```

Create a `.env` file:
```
SECRET_KEY=your-secret-key
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Open `http://localhost:5000`

---

## 📂 Project Structure

```
scripvia/
├── app.py                  # Flask backend, all routes and models
├── config.py               # Environment config
├── launcher.py             # Desktop app entry point
├── scripvia.spec           # PyInstaller build config
├── requirements.txt
├── templates/
│   ├── index.html          # Main app UI
│   └── login.html          # Login / guest page
├── static/
│   ├── css/
│   │   ├── style.css       # Main styles (dark + light theme)
│   │   └── login.css       # Login page styles
│   └── js/
│       ├── main.js         # All frontend logic
│       └── login.js        # Login page logic
├── migrations/             # Alembic migration files
└── instance/               # SQLite database (gitignored)
```

---

## 🗺️ Roadmap

- [ ] Electron installer with auto-updater
- [ ] Mobile PWA support
- [ ] Timeline / plot board — Act 1 / Act 2 / Act 3 kanban
- [ ] Writing goals — daily word count targets with progress bar
- [ ] Version history — see previous saves of any document
- [ ] Collaboration — share projects with other writers

---

## 📄 License

Personal use. Built with 🖤 for writers who take their craft seriously.

---

*Scripvia — because your stories deserve a home as rich as the worlds you build.*