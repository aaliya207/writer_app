# ✍️ Scripvia

> *Write anything. Remember everything.*

Scripvia is a personal writing app built for writers who want more than just a text editor — it's a full creative workspace with worldbuilding tools, character management, Google Drive sync, and a beautiful distraction-free writing experience.

---

## ✨ Features

### 📝 Writing & Editor
- **Rich text editor** powered by Quill.js — headings, bold, italic, lists, blockquotes, code blocks and more
- **VS Code-style open tabs** — have multiple chapters open at once and switch between them
- **Auto-save** every 30 seconds with a live countdown, plus localStorage backup on every keystroke
- **Focus mode** — press `F11` or click Focus to hide everything except your text. Cursor auto-hides after 3 seconds of stillness
- **Word count, character count and read time** displayed live at the bottom of the editor
- **Keyboard shortcuts** — `Ctrl+S` to save, `F11` for focus mode, `Ctrl+K` to search, `Esc` to exit

### 📁 Project Management
- Create unlimited projects with a **genre selector** — Fiction, Fantasy, Sci-Fi, Romance, Mystery, Thriller, Horror, Historical and more
- **Project Overview page** — see word count, chapter count, character count, scenes, lore, last edited date and created date at a glance
- **Chapter reordering** — drag and drop chapters into any order
- Export buttons directly from the overview page

### 👤 Characters
- Create detailed character profiles — name, role, age, appearance, personality, backstory
- Upload character images from your device or paste a URL — works fully offline
- **Click to edit** any character — same modal opens prefilled
- **Wiki tooltip** — hover over a character's name while writing and a card pops up showing their image, role, personality and backstory. No interruptions, just instant reference

### ⚡ Scenes
- Quick-capture scene ideas without creating a full chapter
- Assign a **mood** to each scene — Tense, Romantic, Mysterious, Action, Sad, Hopeful, Dark, Comedic
- Scenes open in the same editor so you can write them out fully

### 📖 Lore
- Build a wiki of your fictional world — items, places, organizations, concepts, creatures, historical events
- Upload images for lore entries
- **Wiki tooltip** works for lore too — hover over any lore name in your writing and see the description instantly

### 🕸️ Character Relationship Web
- Visual interactive canvas showing how your characters connect
- Add relationships — Allies, Rivals, Lovers, Enemies, Family, Mentor/Student, Friends, Complicated
- Color-code each relationship
- **Drag characters** to arrange the web however you like
- **Scroll to zoom**, drag canvas to pan — infinite canvas like Eraser or Canva
- **Click any connection line** to edit or delete the relationship
- Multiple connections between the same two characters shown as curved lines

### 🔍 Search
- Press `Ctrl+K` to open search from anywhere
- Searches across **all chapters, scenes, characters and lore** in the current project
- Results grouped by type with highlighted matches
- Arrow keys to navigate, Enter to open
- Instant results as you type

### 📝 Notes Panel
- Click **📝 Notes** in the editor header to slide open a project notes panel
- Write anything — reminders, plot ideas, loose thoughts
- Auto-saves 1.5 seconds after you stop typing
- Syncs to Google Drive as `_notes.txt` in your project folder

### ☁️ Google Drive Sync
- Sign in with Google and your writing syncs automatically
- Drive structure mirrors your app: `Scripvia / [Project] / [Chapter].txt`
- Characters, Scenes and Lore each get their own subfolders
- Sync happens in the **background** — no waiting, no blocking
- Works offline — saves locally and syncs when you reconnect
- Deleting a project or chapter also deletes it from Drive

### 📤 Export
- Export individual chapters as **PDF** or **DOCX**
- Export the **entire project** as one PDF or DOCX — includes a cover page, table of contents, and all chapters in order
- Professional styling with purple headings, proper margins and typography

### 🎨 UI & Theming
- **Dark mode and light mode** — preference saved and remembered
- **Collapsible sidebar** — state saved between sessions
- Palette: deep navy, mauve, purple gradient — elegant and distraction-free
- Fonts: Cormorant Garamond (display) + DM Sans (UI)
- Fully responsive modals with scroll support
- Custom confirm dialogs — no ugly browser popups

### 🔐 Auth & Accounts
- **Sign in with Google** for full Drive sync
- **Guest mode** — use the app without signing in, data saved locally

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Editor | Quill.js |
| Backend | Python + Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Migrations | Flask-Migrate |
| Cloud | Google Drive API v3 |
| Auth | Google OAuth 2.0 |
| PDF Export | ReportLab |
| DOCX Export | python-docx |
| HTML Parsing | BeautifulSoup4 |
| Desktop App | PyInstaller + pywebview |

---

## ⚙️ Setup

### Prerequisites
- Python 3.10+
- A Google Cloud project with Drive API and OAuth enabled

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/scripvia.git
cd scripvia

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Fill in your Google OAuth credentials in .env

# Run the app
python app.py
```

Open `http://localhost:5000` in your browser.

### Environment Variables

```
SECRET_KEY=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## 📂 Project Structure

```
scripvia/
├── app.py              # Flask backend + all routes
├── config.py           # Configuration
├── launcher.py         # Desktop app launcher
├── scripvia.spec       # PyInstaller build spec
├── templates/
│   ├── index.html      # Main app
│   └── login.html      # Login page
├── static/
│   ├── css/
│   │   ├── style.css   # Main styles
│   │   └── login.css   # Login styles
│   └── js/
│       ├── main.js     # Frontend logic
│       └── login.js    # Login logic
├── migrations/         # Database migrations
└── instance/           # SQLite database (local only)
```

---

## 🎯 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save & sync |
| `F11` | Toggle focus mode |
| `Ctrl+K` | Open search |
| `Esc` | Exit focus mode / close modals |

---

## 🗺️ Roadmap

- [ ] Electron desktop wrapper for faster startup
- [ ] Mobile PWA support
- [ ] Timeline / plot board (Act 1 / 2 / 3 kanban)
- [ ] Writing goals and daily word count targets
- [ ] Version history for documents
- [ ] Collaboration features

---

## 📄 License

Personal use. Built with 🖤 for writers.