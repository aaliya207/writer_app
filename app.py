# app.py
from flask import Flask, render_template, request, jsonify, redirect, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from config import Config
import os
import urllib.parse
import requests as http_requests
import secrets
import re
import threading
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

from datetime import timedelta

app = Flask(__name__)
app.config.from_object(Config)
app.permanent_session_lifetime = timedelta(days=30)  # Stay logged in for 30 days

db = SQLAlchemy(app)
from flask_migrate import Migrate
migrate = Migrate(app, db)

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


# =============================================
# DATABASE MODELS
# =============================================

class User(db.Model):
    id                 = db.Column(db.Integer, primary_key=True)
    google_id          = db.Column(db.String(200), unique=True, nullable=False)
    email              = db.Column(db.String(200), nullable=False)
    name               = db.Column(db.String(200), default='')
    picture            = db.Column(db.String(500), default='')
    access_token       = db.Column(db.Text, default='')
    refresh_token      = db.Column(db.Text, default='')
    scripvia_folder_id = db.Column(db.String(200), default='')  # Root Scripvia folder on Drive
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)

    projects = db.relationship('Project', backref='owner', lazy=True)

    def to_dict(self):
        return {
            'id':      self.id,
            'email':   self.email,
            'name':    self.name,
            'picture': self.picture
        }

class Project(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    title           = db.Column(db.String(200), nullable=False)
    description     = db.Column(db.Text, default='')
    genre           = db.Column(db.String(100), default='general')  # NEW
    user_id         = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    drive_folder_id = db.Column(db.String(200), default='')
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents  = db.relationship('Document', backref='project', lazy=True, cascade='all, delete-orphan')
    characters = db.relationship('Character', backref='project', lazy=True, cascade='all, delete-orphan')
    scenes     = db.relationship('Scene', backref='project', lazy=True, cascade='all, delete-orphan')
    lore_items = db.relationship('LoreItem', backref='project', lazy=True, cascade='all, delete-orphan')

    # Genres that unlock Characters, Scenes, Lore tabs
    CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical']

    def to_dict(self):
        return {
            'id':             self.id,
            'title':          self.title,
            'description':    self.description,
            'genre':          self.genre,
            'is_creative':    self.genre in self.CREATIVE_GENRES,
            'created_at':     self.created_at.isoformat(),
            'updated_at':     self.updated_at.isoformat(),
            'document_count': len(self.documents)
        }

class Document(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    title         = db.Column(db.String(200), nullable=False)
    content       = db.Column(db.Text, default='')
    project_id    = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    drive_file_id = db.Column(db.String(200), default='')  # This document's file on Drive
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':            self.id,
            'title':         self.title,
            'content':       self.content,
            'project_id':    self.project_id,
            'drive_file_id': self.drive_file_id,
            'created_at':    self.created_at.isoformat(),
            'updated_at':    self.updated_at.isoformat()
        }

# Genre options that unlock creative tabs
CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical']


class Character(db.Model):
    """A character in a project"""
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name        = db.Column(db.String(200), nullable=False)
    role        = db.Column(db.String(100), default='')        # e.g. Protagonist, Antagonist
    age         = db.Column(db.String(50), default='')
    personality = db.Column(db.Text, default='')
    backstory   = db.Column(db.Text, default='')
    appearance  = db.Column(db.Text, default='')
    image_url   = db.Column(db.String(500), default='')        # URL or base64
    extra_notes = db.Column(db.Text, default='')
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'project_id':  self.project_id,
            'name':        self.name,
            'role':        self.role,
            'age':         self.age,
            'personality': self.personality,
            'backstory':   self.backstory,
            'appearance':  self.appearance,
            'image_url':   self.image_url,
            'extra_notes': self.extra_notes,
            'created_at':  self.created_at.isoformat()
        }


class Scene(db.Model):
    """A quick-capture scene — like a sticky note for story moments"""
    id         = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    title      = db.Column(db.String(200), nullable=False)
    content    = db.Column(db.Text, default='')
    mood       = db.Column(db.String(100), default='')   # e.g. tense, romantic, mysterious
    connected_chapter = db.Column(db.String(200), default='')  # Optional link to a chapter
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':                self.id,
            'project_id':        self.project_id,
            'title':             self.title,
            'content':           self.content,
            'mood':              self.mood,
            'connected_chapter': self.connected_chapter,
            'created_at':        self.created_at.isoformat(),
            'updated_at':        self.updated_at.isoformat()
        }


class LoreItem(db.Model):
    """A lore entry — fictional places, items, organizations, magic systems etc."""
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name        = db.Column(db.String(200), nullable=False)
    category    = db.Column(db.String(100), default='item')  # item, place, organization, concept
    description = db.Column(db.Text, default='')
    image_url   = db.Column(db.String(500), default='')
    extra_notes = db.Column(db.Text, default='')
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'project_id':  self.project_id,
            'name':        self.name,
            'category':    self.category,
            'description': self.description,
            'image_url':   self.image_url,
            'extra_notes': self.extra_notes,
            'created_at':  self.created_at.isoformat()
        }

# =============================================
# HELPERS
# =============================================

def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return User.query.get(user_id)


def get_drive_service(user):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    creds = Credentials(
        token         = user.access_token,
        refresh_token = user.refresh_token,
        token_uri     = 'https://oauth2.googleapis.com/token',
        client_id     = app.config['GOOGLE_CLIENT_ID'],
        client_secret = app.config['GOOGLE_CLIENT_SECRET']
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        user.access_token = creds.token
        db.session.commit()
    return build('drive', 'v3', credentials=creds)


def get_or_create_folder(drive, name, parent_id=None):
    """Find or create a Drive folder by name, optionally inside a parent"""
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    results = drive.files().list(q=query, fields='files(id, name)', pageSize=1).execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']

    metadata = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        metadata['parents'] = [parent_id]

    folder = drive.files().create(body=metadata, fields='id').execute()
    return folder.get('id')


def create_drive_file(drive, name, content, parent_id):
    """Create a new .txt file on Drive inside a folder"""
    file_bytes = content.encode('utf-8')
    media      = MediaInMemoryUpload(file_bytes, mimetype='text/plain', resumable=False)
    metadata   = {'name': f"{name}.txt", 'parents': [parent_id]}
    created    = drive.files().create(body=metadata, media_body=media, fields='id').execute()
    return created.get('id')


def update_drive_file(drive, file_id, name, content):
    """Update an existing .txt file on Drive"""
    file_bytes = content.encode('utf-8')
    media      = MediaInMemoryUpload(file_bytes, mimetype='text/plain', resumable=False)
    drive.files().update(
        fileId     = file_id,
        body       = {'name': f"{name}.txt"},
        media_body = media
    ).execute()


def html_to_plain_text(html_content):
    """Convert Quill HTML to clean plain text"""
    text = re.sub(r'<br\s*/?>', '\n', html_content)
    text = re.sub(r'</p>', '\n\n', text)
    text = re.sub(r'</h[1-3]>', '\n\n', text)
    text = re.sub(r'<li>', '• ', text)
    text = re.sub(r'</li>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def setup_scripvia_folder(user):
    """Create the root Scripvia folder on Drive right after login"""
    if user.scripvia_folder_id:
        return user.scripvia_folder_id
    try:
        drive     = get_drive_service(user)
        folder_id = get_or_create_folder(drive, 'Scripvia')
        user.scripvia_folder_id = folder_id
        db.session.commit()
        print(f"✅ Scripvia root folder created: {folder_id}")
        return folder_id
    except Exception as e:
        print(f"Could not create Scripvia folder: {e}")
        return None


# =============================================
# MAIN ROUTE
# =============================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login_page():
    # If already logged in, go straight to app
    user = get_current_user()
    if user:
        return redirect('/')
    return render_template('login.html')
# =============================================
# AUTH ROUTES
# =============================================

@app.route('/auth/login')
def auth_login():
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state

    params = {
        'client_id':     app.config['GOOGLE_CLIENT_ID'],
        'redirect_uri':  app.config['GOOGLE_REDIRECT_URI'],
        'response_type': 'code',
        'scope':         ' '.join(app.config['GOOGLE_SCOPES']),
        'access_type':   'offline',
        'prompt':        'consent',
        'state':         state
    }

    auth_url = 'https://accounts.google.com/o/oauth2/auth?' + urllib.parse.urlencode(params)
    return redirect(auth_url)


@app.route('/auth/callback')
def auth_callback():
    code = request.args.get('code')
    if not code:
        return 'Login failed — no code received', 400

    token_response = http_requests.post(
        'https://oauth2.googleapis.com/token',
        data={
            'code':          code,
            'client_id':     app.config['GOOGLE_CLIENT_ID'],
            'client_secret': app.config['GOOGLE_CLIENT_SECRET'],
            'redirect_uri':  app.config['GOOGLE_REDIRECT_URI'],
            'grant_type':    'authorization_code'
        }
    )

    tokens = token_response.json()
    if 'error' in tokens:
        return f"Token error: {tokens.get('error_description', tokens['error'])}", 400

    profile_response = http_requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers={'Authorization': f"Bearer {tokens['access_token']}"}
    )
    profile = profile_response.json()

    user = User.query.filter_by(google_id=profile['id']).first()
    if not user:
        user = User(
            google_id = profile['id'],
            email     = profile.get('email', ''),
            name      = profile.get('name', ''),
            picture   = profile.get('picture', '')
        )
        db.session.add(user)

    user.access_token  = tokens.get('access_token', '')
    user.refresh_token = tokens.get('refresh_token', getattr(user, 'refresh_token', ''))
    db.session.commit()

    session['user_id'] = user.id
    session.permanent  = True

    # ✅ Create Scripvia root folder on Drive immediately after login
    setup_scripvia_folder(user)

    return redirect('/?logged_in=true')


@app.route('/auth/logout')
def auth_logout():
    session.clear()
    return redirect('/login')


@app.route('/auth/me')
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({'logged_in': False})
    return jsonify({'logged_in': True, 'user': user.to_dict()})


# =============================================
# PROJECT ROUTES
# =============================================

@app.route('/api/projects', methods=['GET'])
def get_projects():
    projects = Project.query.order_by(Project.updated_at.desc()).all()
    return jsonify([p.to_dict() for p in projects])


@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400

    project = Project(
    title=data['title'],
    description=data.get('description', ''),
    genre=data.get('genre', 'general')
    )
    db.session.add(project)
    db.session.commit()

   # Create Drive folder in background so UI doesn't wait
    user = get_current_user()
    if user and user.access_token:
        def create_drive_folder_bg(app, project_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                p = Project.query.get(project_id)
                if not u or not p: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    p.drive_folder_id = get_or_create_folder(
                        drive, p.title, parent_id=u.scripvia_folder_id
                    )
                    db.session.commit()
                    print(f"✅ Drive folder created: {p.title}")
                except Exception as e:
                    print(f"Drive folder error: {e}")

        t = threading.Thread(target=create_drive_folder_bg, args=(app, project.id, user.id))
        t.daemon = True
        t.start()

    return jsonify(project.to_dict()), 201


@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    drive_folder_id = project.drive_folder_id

    db.session.delete(project)
    db.session.commit()

    # Delete entire project folder from Drive in background
    user = get_current_user()
    if user and user.access_token and drive_folder_id:
        def delete_drive_folder_bg(app, folder_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                if not u: return
                try:
                    drive = get_drive_service(u)
                    drive.files().delete(fileId=folder_id).execute()
                    print(f"✅ Deleted Drive folder: {folder_id}")
                except Exception as e:
                    print(f"Drive folder delete error: {e}")

        t = threading.Thread(target=delete_drive_folder_bg, args=(app, drive_folder_id, user.id))
        t.daemon = True
        t.start()

    return jsonify({'message': 'Deleted'})


# =============================================
# DOCUMENT ROUTES
# =============================================

@app.route('/api/projects/<int:project_id>/documents', methods=['GET'])
def get_documents(project_id):
    Project.query.get_or_404(project_id)
    docs = Document.query.filter_by(project_id=project_id).order_by(Document.updated_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/api/projects/<int:project_id>/documents', methods=['POST'])
def create_document(project_id):
    project = Project.query.get_or_404(project_id)
    data    = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400

    doc = Document(title=data['title'], content=data.get('content', ''), project_id=project_id)
    db.session.add(doc)
    db.session.commit()

# Create Drive file in background so UI doesn't wait
    user = get_current_user()
    if user and user.access_token:
        def create_drive_file_bg(app, doc_id, project_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                p = Project.query.get(project_id)
                d = Document.query.get(doc_id)
                if not u or not p or not d: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(
                            drive, p.title, parent_id=u.scripvia_folder_id
                        )
                        db.session.commit()
                    file_id = create_drive_file(
                        drive, d.title,
                        f"{d.title}\n{'=' * len(d.title)}\n\n(empty)",
                        p.drive_folder_id
                    )
                    d.drive_file_id = file_id
                    db.session.commit()
                    print(f"✅ Drive file created: {d.title}.txt")
                except Exception as e:
                    print(f"Drive file error: {e}")

        t = threading.Thread(target=create_drive_file_bg, args=(app, doc.id, project.id, user.id))
        t.daemon = True
        t.start()

    return jsonify(doc.to_dict()), 201


@app.route('/api/documents/<int:doc_id>', methods=['GET'])
def get_document(doc_id):
    return jsonify(Document.query.get_or_404(doc_id).to_dict())


@app.route('/api/documents/<int:doc_id>', methods=['PUT'])
def update_document(doc_id):
    doc  = Document.query.get_or_404(doc_id)
    data = request.get_json()
    if 'title'   in data: doc.title   = data['title']
    if 'content' in data: doc.content = data['content']
    doc.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(doc.to_dict())


@app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    doc = Document.query.get_or_404(doc_id)
    drive_file_id = doc.drive_file_id

    db.session.delete(doc)
    db.session.commit()

    # Delete from Drive in background
    user = get_current_user()
    if user and user.access_token and drive_file_id:
        def delete_drive_file_bg(app, file_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                if not u: return
                try:
                    drive = get_drive_service(u)
                    drive.files().delete(fileId=file_id).execute()
                    print(f"✅ Deleted Drive file: {file_id}")
                except Exception as e:
                    print(f"Drive delete error: {e}")

        t = threading.Thread(target=delete_drive_file_bg, args=(app, drive_file_id, user.id))
        t.daemon = True
        t.start()

    return jsonify({'message': 'Deleted'})

# =============================================
# CHARACTER ROUTES
# =============================================

@app.route('/api/projects/<int:project_id>/characters', methods=['GET'])
def get_characters(project_id):
    Project.query.get_or_404(project_id)
    chars = Character.query.filter_by(project_id=project_id).order_by(Character.name).all()
    return jsonify([c.to_dict() for c in chars])

@app.route('/api/projects/<int:project_id>/characters', methods=['POST'])
def create_character(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name required'}), 400
    char = Character(
        project_id  = project_id,
        name        = data['name'],
        role        = data.get('role', ''),
        age         = data.get('age', ''),
        personality = data.get('personality', ''),
        backstory   = data.get('backstory', ''),
        appearance  = data.get('appearance', ''),
        image_url   = data.get('image_url', ''),
        extra_notes = data.get('extra_notes', '')
    )
    db.session.add(char)
    db.session.commit()

    # Sync character info to Drive as a .txt file
    user = get_current_user()
    if user and user.access_token:
        def sync_char_bg(app, char_id, project_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                p = Project.query.get(project_id)
                c = Character.query.get(char_id)
                if not u or not p or not c: return
                try:
                    drive = get_drive_service(u)
                    # Ensure root folder exists
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    # Ensure project folder exists
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    # Ensure Characters subfolder exists
                    chars_folder = get_or_create_folder(drive, 'Characters', parent_id=p.drive_folder_id)
                    # Create character file
                    content = f"Name: {c.name}\nRole: {c.role}\nAge: {c.age}\n\nAppearance:\n{c.appearance}\n\nPersonality:\n{c.personality}\n\nBackstory:\n{c.backstory}\n\nNotes:\n{c.extra_notes}"
                    file_id = create_drive_file(drive, c.name, content, chars_folder)
                    print(f"✅ Character synced to Drive: {c.name}")
                except Exception as e:
                    print(f"Character Drive sync error: {e}")

        t = threading.Thread(target=sync_char_bg, args=(app, char.id, project.id, user.id))
        t.daemon = True
        t.start()

    return jsonify(char.to_dict()), 201

@app.route('/api/characters/<int:char_id>', methods=['GET'])
def get_character(char_id):
    return jsonify(Character.query.get_or_404(char_id).to_dict())

@app.route('/api/characters/<int:char_id>', methods=['PUT'])
def update_character(char_id):
    char = Character.query.get_or_404(char_id)
    data = request.get_json()
    for field in ['name', 'role', 'age', 'personality', 'backstory', 'appearance', 'image_url', 'extra_notes']:
        if field in data:
            setattr(char, field, data[field])
    db.session.commit()
    return jsonify(char.to_dict())

@app.route('/api/characters/<int:char_id>', methods=['DELETE'])
def delete_character(char_id):
    char = Character.query.get_or_404(char_id)
    db.session.delete(char)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# =============================================
# SCENE ROUTES
# =============================================

@app.route('/api/projects/<int:project_id>/scenes', methods=['GET'])
def get_scenes(project_id):
    Project.query.get_or_404(project_id)
    scenes = Scene.query.filter_by(project_id=project_id).order_by(Scene.updated_at.desc()).all()
    return jsonify([s.to_dict() for s in scenes])

@app.route('/api/projects/<int:project_id>/scenes', methods=['POST'])
def create_scene(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400
    scene = Scene(
        project_id        = project_id,
        title             = data['title'],
        content           = data.get('content', ''),
        mood              = data.get('mood', ''),
        connected_chapter = data.get('connected_chapter', '')
    )
    db.session.add(scene)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def sync_scene_bg(app, scene_id, project_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                p = Project.query.get(project_id)
                s = Scene.query.get(scene_id)
                if not u or not p or not s: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    scenes_folder = get_or_create_folder(drive, 'Scenes', parent_id=p.drive_folder_id)
                    content = f"Scene: {s.title}\nMood: {s.mood}\nConnected Chapter: {s.connected_chapter}\n\n{html_to_plain_text(s.content)}"
                    create_drive_file(drive, s.title, content, scenes_folder)
                    print(f"✅ Scene synced to Drive: {s.title}")
                except Exception as e:
                    print(f"Scene Drive sync error: {e}")

        t = threading.Thread(target=sync_scene_bg, args=(app, scene.id, project.id, user.id))
        t.daemon = True
        t.start()

    return jsonify(scene.to_dict()), 201

@app.route('/api/scenes/<int:scene_id>', methods=['GET'])
def get_scene(scene_id):
    return jsonify(Scene.query.get_or_404(scene_id).to_dict())

@app.route('/api/scenes/<int:scene_id>', methods=['PUT'])
def update_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    data  = request.get_json()
    for field in ['title', 'content', 'mood', 'connected_chapter']:
        if field in data:
            setattr(scene, field, data[field])
    scene.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(scene.to_dict())

@app.route('/api/scenes/<int:scene_id>', methods=['DELETE'])
def delete_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    db.session.delete(scene)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# =============================================
# LORE ROUTES
# =============================================

@app.route('/api/projects/<int:project_id>/lore', methods=['GET'])
def get_lore(project_id):
    Project.query.get_or_404(project_id)
    items = LoreItem.query.filter_by(project_id=project_id).order_by(LoreItem.name).all()
    return jsonify([i.to_dict() for i in items])

@app.route('/api/projects/<int:project_id>/lore', methods=['POST'])
def create_lore(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name required'}), 400
    item = LoreItem(
        project_id  = project_id,
        name        = data['name'],
        category    = data.get('category', 'item'),
        description = data.get('description', ''),
        image_url   = data.get('image_url', ''),
        extra_notes = data.get('extra_notes', '')
    )
    db.session.add(item)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def sync_lore_bg(app, item_id, project_id, user_id):
            with app.app_context():
                u = User.query.get(user_id)
                p = Project.query.get(project_id)
                l = LoreItem.query.get(item_id)
                if not u or not p or not l: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    lore_folder = get_or_create_folder(drive, 'Lore', parent_id=p.drive_folder_id)
                    content = f"Name: {l.name}\nCategory: {l.category}\n\nDescription:\n{l.description}\n\nNotes:\n{l.extra_notes}"
                    create_drive_file(drive, l.name, content, lore_folder)
                    print(f"✅ Lore synced to Drive: {l.name}")
                except Exception as e:
                    print(f"Lore Drive sync error: {e}")

        t = threading.Thread(target=sync_lore_bg, args=(app, item.id, project.id, user.id))
        t.daemon = True
        t.start()

    return jsonify(item.to_dict()), 201

@app.route('/api/lore/<int:item_id>', methods=['GET'])
def get_lore_item(item_id):
    return jsonify(LoreItem.query.get_or_404(item_id).to_dict())

@app.route('/api/lore/<int:item_id>', methods=['PUT'])
def update_lore_item(item_id):
    item = LoreItem.query.get_or_404(item_id)
    data = request.get_json()
    for field in ['name', 'category', 'description', 'image_url', 'extra_notes']:
        if field in data:
            setattr(item, field, data[field])
    db.session.commit()
    return jsonify(item.to_dict())

@app.route('/api/lore/<int:item_id>', methods=['DELETE'])
def delete_lore_item(item_id):
    item = LoreItem.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# =============================================
# WIKI TOOLTIP ROUTE
# Returns all names (characters + lore) for a project
# Used by the hover tooltip system in the editor
# =============================================

@app.route('/api/projects/<int:project_id>/wiki', methods=['GET'])
def get_wiki_data(project_id):
    """Returns all characters and lore items for tooltip detection"""
    chars = Character.query.filter_by(project_id=project_id).all()
    lore  = LoreItem.query.filter_by(project_id=project_id).all()

    wiki = {}
    for c in chars:
        wiki[c.name.lower()] = {
            'type':       'character',
            'name':       c.name,
            'role':       c.role,
            'age':        c.age,
            'image_url':  c.image_url,
            'summary':    c.personality[:200] + '...' if len(c.personality) > 200 else c.personality,
            'backstory':  c.backstory[:200] + '...' if len(c.backstory) > 200 else c.backstory,
            'appearance': c.appearance[:150] + '...' if len(c.appearance) > 150 else c.appearance,
            'id':         c.id
        }
    for l in lore:
        wiki[l.name.lower()] = {
            'type':      'lore',
            'name':      l.name,
            'category':  l.category,
            'image_url': l.image_url,
            'summary':   l.description[:150] + '...' if len(l.description) > 150 else l.description,
            'id':        l.id
        }
    return jsonify(wiki)
# =============================================
# GOOGLE DRIVE SYNC ROUTE
# =============================================

@app.route('/api/documents/<int:doc_id>/sync', methods=['POST'])
def sync_to_drive(doc_id):
    """Called by auto-save to update the Drive file with latest content"""
    user = get_current_user()
    if not user or not user.access_token:
        return jsonify({'error': 'Not logged in'}), 401

    doc     = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)

    try:
        drive = get_drive_service(user)

        # Ensure folder structure exists (handles offline-created projects)
        if not user.scripvia_folder_id:
            user.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
            db.session.commit()

        if not project.drive_folder_id:
            project.drive_folder_id = get_or_create_folder(
                drive, project.title, parent_id=user.scripvia_folder_id
            )
            db.session.commit()

        # Convert HTML to plain text
        plain_text = html_to_plain_text(doc.content or '')
        file_text  = f"{doc.title}\n{'=' * len(doc.title)}\n\n{plain_text}"

        if doc.drive_file_id:
            # File already exists — update it
            update_drive_file(drive, doc.drive_file_id, doc.title, file_text)
            action = 'updated'
        else:
            # File doesn't exist yet (created offline) — create it now
            file_id = create_drive_file(drive, doc.title, file_text, project.drive_folder_id)
            doc.drive_file_id = file_id
            db.session.commit()
            action = 'created'

        return jsonify({'success': True, 'action': action})

    except Exception as e:
        print(f"Drive sync error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/documents/<int:doc_id>/sync-status', methods=['GET'])
def sync_status(doc_id):
    doc = Document.query.get_or_404(doc_id)
    return jsonify({'synced': bool(doc.drive_file_id), 'drive_file_id': doc.drive_file_id})

# =============================================
# EXPORT ROUTES
# =============================================

@app.route('/api/documents/<int:doc_id>/export/pdf', methods=['GET'])
def export_pdf(doc_id):
    """Export document as a formatted PDF"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.enums import TA_LEFT, TA_CENTER
    from bs4 import BeautifulSoup
    import io

    doc = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)

    # Create PDF in memory
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize      = A4,
        rightMargin   = 1 * inch,
        leftMargin    = 1 * inch,
        topMargin     = 1.2 * inch,
        bottomMargin  = 1 * inch,
        title         = doc.title,
        author        = 'Scripvia'
    )

    # Define styles
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle',
        parent    = styles['Title'],
        fontSize  = 24,
        textColor = colors.HexColor('#3d3580'),
        spaceAfter= 6,
        fontName  = 'Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent    = styles['Normal'],
        fontSize  = 11,
        textColor = colors.HexColor('#888888'),
        spaceAfter= 24,
        fontName  = 'Helvetica'
    )

    h1_style = ParagraphStyle(
        'H1',
        parent    = styles['Heading1'],
        fontSize  = 18,
        textColor = colors.HexColor('#3d3580'),
        spaceBefore = 16,
        spaceAfter  = 8,
        fontName  = 'Helvetica-Bold'
    )

    h2_style = ParagraphStyle(
        'H2',
        parent    = styles['Heading2'],
        fontSize  = 14,
        textColor = colors.HexColor('#5548a0'),
        spaceBefore = 12,
        spaceAfter  = 6,
        fontName  = 'Helvetica-Bold'
    )

    h3_style = ParagraphStyle(
        'H3',
        parent    = styles['Heading3'],
        fontSize  = 12,
        textColor = colors.HexColor('#7b6fb0'),
        spaceBefore = 10,
        spaceAfter  = 4,
        fontName  = 'Helvetica-Bold'
    )

    body_style = ParagraphStyle(
        'CustomBody',
        parent      = styles['Normal'],
        fontSize    = 11,
        leading     = 18,
        spaceAfter  = 8,
        fontName    = 'Helvetica',
        textColor   = colors.HexColor('#1a1a2e')
    )

    quote_style = ParagraphStyle(
        'Quote',
        parent      = styles['Normal'],
        fontSize    = 11,
        leading     = 18,
        leftIndent  = 24,
        spaceAfter  = 8,
        fontName    = 'Helvetica-Oblique',
        textColor   = colors.HexColor('#555555')
    )

    # Build content
    story = []

    # Title + project name
    story.append(Paragraph(doc.title, title_style))
    story.append(Paragraph(f"from {project.title} · exported via Scripvia", subtitle_style))
    story.append(Spacer(1, 0.2 * inch))

    # Parse HTML content
    soup = BeautifulSoup(doc.content or '', 'html.parser')

    for element in soup.find_all(['p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li']):
        text = element.get_text(strip=True)
        if not text:
            continue

        tag = element.name

        if tag == 'h1':
            story.append(Paragraph(text, h1_style))
        elif tag == 'h2':
            story.append(Paragraph(text, h2_style))
        elif tag == 'h3':
            story.append(Paragraph(text, h3_style))
        elif tag == 'blockquote':
            story.append(Paragraph(f'"{text}"', quote_style))
        elif tag == 'li':
            story.append(Paragraph(f"• {text}", body_style))
        elif tag == 'p':
            story.append(Paragraph(text, body_style))

        story.append(Spacer(1, 0.05 * inch))

    # Build the PDF
    pdf.build(story)
    buffer.seek(0)

    from flask import send_file
    return send_file(
        buffer,
        as_attachment  = True,
        download_name  = f"{doc.title}.pdf",
        mimetype       = 'application/pdf'
    )


@app.route('/api/documents/<int:doc_id>/export/docx', methods=['GET'])
def export_docx(doc_id):
    """Export document as a formatted DOCX"""
    from docx import Document as DocxDocument
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from bs4 import BeautifulSoup
    import io

    doc     = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)

    # Create Word document
    word = DocxDocument()

    # Set page margins
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    section = word.sections[0]
    section.top_margin    = Inches(1.2)
    section.bottom_margin = Inches(1)
    section.left_margin   = Inches(1)
    section.right_margin  = Inches(1)

    # Helper to set font color
    def set_color(run, hex_color):
        hex_color = hex_color.lstrip('#')
        r, g, b   = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        run.font.color.rgb = RGBColor(r, g, b)

    # Document title
    title_para = word.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    title_run  = title_para.add_run(doc.title)
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    set_color(title_run, '#3d3580')

    # Subtitle
    sub_para = word.add_paragraph()
    sub_run  = sub_para.add_run(f"from {project.title} · exported via Scripvia")
    sub_run.font.size   = Pt(10)
    sub_run.font.italic = True
    set_color(sub_run, '#888888')

    # Spacer
    word.add_paragraph()

    # Parse HTML
    soup = BeautifulSoup(doc.content or '', 'html.parser')

    for element in soup.find_all(['p', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li']):
        text = element.get_text(strip=True)
        if not text:
            continue

        tag = element.name

        if tag == 'h1':
            p   = word.add_paragraph()
            run = p.add_run(text)
            run.font.size = Pt(18)
            run.font.bold = True
            set_color(run, '#3d3580')

        elif tag == 'h2':
            p   = word.add_paragraph()
            run = p.add_run(text)
            run.font.size = Pt(14)
            run.font.bold = True
            set_color(run, '#5548a0')

        elif tag == 'h3':
            p   = word.add_paragraph()
            run = p.add_run(text)
            run.font.size = Pt(12)
            run.font.bold = True
            set_color(run, '#7b6fb0')

        elif tag == 'blockquote':
            p   = word.add_paragraph()
            run = p.add_run(f'"{text}"')
            run.font.size   = Pt(11)
            run.font.italic = True
            set_color(run, '#555555')
            p.paragraph_format.left_indent = Inches(0.4)

        elif tag == 'li':
            p   = word.add_paragraph()
            run = p.add_run(f"• {text}")
            run.font.size = Pt(11)
            set_color(run, '#1a1a2e')

        elif tag == 'p':
            p   = word.add_paragraph()
            run = p.add_run(text)
            run.font.size = Pt(11)
            set_color(run, '#1a1a2e')
            p.paragraph_format.space_after = Pt(6)

    # Save to memory buffer
    buffer = io.BytesIO()
    word.save(buffer)
    buffer.seek(0)

    from flask import send_file
    return send_file(
        buffer,
        as_attachment = True,
        download_name = f"{doc.title}.docx",
        mimetype      = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
# =============================================
# ENTRY POINT
# =============================================

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Database initialized")
    print("🚀 Scripvia running at http://localhost:5000")
    app.run(debug=True)