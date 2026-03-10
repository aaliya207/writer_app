# 📖 Fantasy Writer App

A personal writing app built for crafting fantasy stories — with project management, rich text editing, auto-save, Google Drive sync, and export features.

## Tech Stack
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Python + Flask
- **Database**: SQLite (via Flask-SQLAlchemy)
- **Cloud**: Google Drive API
- **Editor**: Quill.js (Rich Text)

## Setup

1. Clone the repo
2. Install dependencies:
```bash
   pip install -r requirements.txt
```
3. Run the app:
```bash
   python app.py
```
4. Open `http://localhost:5000` in your browser

## Features (Roadmap)
- [x] Flask backend with REST API
- [x] SQLite database (projects + documents)
- [ ] Rich text editor UI
- [ ] Local storage backup
- [ ] Google OAuth + Drive sync
- [ ] Auto-save every 30 seconds
- [ ] Export to PDF and DOCX
- [ ] Dark mode