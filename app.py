from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from config import Config
import os, urllib.parse, requests as http_requests, secrets, re, threading, io
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable
from reportlab.lib import colors
from docx import Document as DocxDocument
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from bs4 import BeautifulSoup

app = Flask(__name__)
app.config.from_object(Config)
app.permanent_session_lifetime = timedelta(days=30)

db = SQLAlchemy(app)
from flask_migrate import Migrate
migrate = Migrate(app, db)

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


# --- MODELS ---

class User(db.Model):
    id                 = db.Column(db.Integer, primary_key=True)
    google_id          = db.Column(db.String(200), unique=True, nullable=False)
    email              = db.Column(db.String(200), nullable=False)
    name               = db.Column(db.String(200), default='')
    picture            = db.Column(db.String(500), default='')
    access_token       = db.Column(db.Text, default='')
    refresh_token      = db.Column(db.Text, default='')
    scripvia_folder_id = db.Column(db.String(200), default='')
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)
    projects           = db.relationship('Project', backref='owner', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'email': self.email, 'name': self.name, 'picture': self.picture}


CREATIVE_GENRES = ['fantasy', 'sci-fi', 'fiction', 'romance', 'mystery', 'thriller', 'horror', 'historical']

class Project(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    title           = db.Column(db.String(200), nullable=False)
    description     = db.Column(db.Text, default='')
    genre           = db.Column(db.String(100), default='general')
    user_id         = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    drive_folder_id = db.Column(db.String(200), default='')
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    documents       = db.relationship('Document',  backref='project', lazy=True, cascade='all, delete-orphan')
    characters      = db.relationship('Character', backref='project', lazy=True, cascade='all, delete-orphan')
    scenes          = db.relationship('Scene',     backref='project', lazy=True, cascade='all, delete-orphan')
    lore_items      = db.relationship('LoreItem',  backref='project', lazy=True, cascade='all, delete-orphan')
    notes           = db.relationship('Note',      backref='project', lazy=True, cascade='all, delete-orphan')
    CREATIVE_GENRES = CREATIVE_GENRES

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'description': self.description,
            'genre': self.genre, 'is_creative': self.genre in CREATIVE_GENRES,
            'created_at': self.created_at.isoformat(), 'updated_at': self.updated_at.isoformat(),
            'document_count': len(self.documents)
        }


class Document(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    title         = db.Column(db.String(200), nullable=False)
    content       = db.Column(db.Text, default='')
    project_id    = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    drive_file_id = db.Column(db.String(200), default='')
    order_index   = db.Column(db.Integer, default=0)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'content': self.content,
            'project_id': self.project_id, 'drive_file_id': self.drive_file_id,
            'created_at': self.created_at.isoformat(), 'updated_at': self.updated_at.isoformat()
        }


class Character(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name        = db.Column(db.String(200), nullable=False)
    role        = db.Column(db.String(100), default='')
    age         = db.Column(db.String(50), default='')
    personality = db.Column(db.Text, default='')
    backstory   = db.Column(db.Text, default='')
    appearance  = db.Column(db.Text, default='')
    image_url   = db.Column(db.String(500), default='')
    extra_notes = db.Column(db.Text, default='')
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'project_id': self.project_id, 'name': self.name,
            'role': self.role, 'age': self.age, 'personality': self.personality,
            'backstory': self.backstory, 'appearance': self.appearance,
            'image_url': self.image_url, 'extra_notes': self.extra_notes,
            'created_at': self.created_at.isoformat()
        }


class Scene(db.Model):
    id                = db.Column(db.Integer, primary_key=True)
    project_id        = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    title             = db.Column(db.String(200), nullable=False)
    content           = db.Column(db.Text, default='')
    mood              = db.Column(db.String(100), default='')
    connected_chapter = db.Column(db.String(200), default='')
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at        = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'project_id': self.project_id, 'title': self.title,
            'content': self.content, 'mood': self.mood,
            'connected_chapter': self.connected_chapter,
            'created_at': self.created_at.isoformat(), 'updated_at': self.updated_at.isoformat()
        }


class LoreItem(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name        = db.Column(db.String(200), nullable=False)
    category    = db.Column(db.String(100), default='item')
    description = db.Column(db.Text, default='')
    image_url   = db.Column(db.String(500), default='')
    extra_notes = db.Column(db.Text, default='')
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'project_id': self.project_id, 'name': self.name,
            'category': self.category, 'description': self.description,
            'image_url': self.image_url, 'extra_notes': self.extra_notes,
            'created_at': self.created_at.isoformat()
        }


class Note(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    content    = db.Column(db.Text, default='')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'project_id': self.project_id,
                'content': self.content, 'updated_at': self.updated_at.isoformat()}


class CharacterRelationship(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    project_id    = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    char_a_id     = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    char_b_id     = db.Column(db.Integer, db.ForeignKey('character.id'), nullable=False)
    relation_type = db.Column(db.String(100), default='')
    description   = db.Column(db.Text, default='')
    color         = db.Column(db.String(20), default='#7b6fb0')
    char_a        = db.relationship('Character', foreign_keys=[char_a_id], overlaps="char_b")
    char_b        = db.relationship('Character', foreign_keys=[char_b_id], overlaps="char_a")

    def to_dict(self):
        return {
            'id': self.id, 'project_id': self.project_id,
            'char_a_id': self.char_a_id, 'char_b_id': self.char_b_id,
            'char_a_name': self.char_a.name if self.char_a else '',
            'char_b_name': self.char_b.name if self.char_b else '',
            'relation_type': self.relation_type, 'description': self.description, 'color': self.color
        }


# --- HELPERS ---

def get_current_user():
    user_id = session.get('user_id')
    return User.query.get(user_id) if user_id else None


def get_drive_service(user):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    creds = Credentials(
        token=user.access_token, refresh_token=user.refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=app.config['GOOGLE_CLIENT_ID'],
        client_secret=app.config['GOOGLE_CLIENT_SECRET']
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        user.access_token = creds.token
        db.session.commit()
    return build('drive', 'v3', credentials=creds)


def get_or_create_folder(drive, name, parent_id=None):
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
    files = drive.files().list(q=query, fields='files(id)', pageSize=1).execute().get('files', [])
    if files:
        return files[0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]
    return drive.files().create(body=meta, fields='id').execute().get('id')


def create_drive_file(drive, name, content, parent_id):
    media  = MediaInMemoryUpload(content.encode('utf-8'), mimetype='text/plain', resumable=False)
    meta   = {'name': f"{name}.txt", 'parents': [parent_id]}
    return drive.files().create(body=meta, media_body=media, fields='id').execute().get('id')


def update_drive_file(drive, file_id, name, content):
    media = MediaInMemoryUpload(content.encode('utf-8'), mimetype='text/plain', resumable=False)
    drive.files().update(fileId=file_id, body={'name': f"{name}.txt"}, media_body=media).execute()


def html_to_plain_text(html):
    text = re.sub(r'<br\s*/?>', '\n', html)
    text = re.sub(r'</p>|</h[1-3]>', '\n\n', text)
    text = re.sub(r'<li>', '• ', text)
    text = re.sub(r'</li>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def setup_scripvia_folder(user):
    if user.scripvia_folder_id:
        return user.scripvia_folder_id
    try:
        drive = get_drive_service(user)
        folder_id = get_or_create_folder(drive, 'Scripvia')
        user.scripvia_folder_id = folder_id
        db.session.commit()
        return folder_id
    except Exception as e:
        print(f"Could not create Scripvia folder: {e}")
        return None


def drive_bg(fn, *args):
    """Run a Drive operation in a background thread."""
    t = threading.Thread(target=fn, args=args)
    t.daemon = True
    t.start()


# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login_page():
    return redirect('/') if get_current_user() else render_template('login.html')


# --- AUTH ---

@app.route('/auth/login')
def auth_login():
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    params = {
        'client_id': app.config['GOOGLE_CLIENT_ID'],
        'redirect_uri': app.config['GOOGLE_REDIRECT_URI'],
        'response_type': 'code', 'scope': ' '.join(app.config['GOOGLE_SCOPES']),
        'access_type': 'offline', 'prompt': 'consent', 'state': state
    }
    return redirect('https://accounts.google.com/o/oauth2/auth?' + urllib.parse.urlencode(params))


@app.route('/auth/callback')
def auth_callback():
    code = request.args.get('code')
    if not code:
        return 'Login failed', 400
    tokens = http_requests.post('https://oauth2.googleapis.com/token', data={
        'code': code, 'client_id': app.config['GOOGLE_CLIENT_ID'],
        'client_secret': app.config['GOOGLE_CLIENT_SECRET'],
        'redirect_uri': app.config['GOOGLE_REDIRECT_URI'], 'grant_type': 'authorization_code'
    }).json()
    if 'error' in tokens:
        return f"Token error: {tokens.get('error_description', tokens['error'])}", 400
    profile = http_requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers={'Authorization': f"Bearer {tokens['access_token']}"}
    ).json()
    user = User.query.filter_by(google_id=profile['id']).first()
    if not user:
        user = User(google_id=profile['id'], email=profile.get('email', ''),
                    name=profile.get('name', ''), picture=profile.get('picture', ''))
        db.session.add(user)
    user.access_token  = tokens.get('access_token', '')
    user.refresh_token = tokens.get('refresh_token', getattr(user, 'refresh_token', ''))
    db.session.commit()
    session['user_id'] = user.id
    session.permanent  = True
    setup_scripvia_folder(user)
    return redirect('/?logged_in=true')


@app.route('/auth/logout')
def auth_logout():
    session.clear()
    return redirect('/login')


@app.route('/auth/me')
def auth_me():
    user = get_current_user()
    return jsonify({'logged_in': False}) if not user else jsonify({'logged_in': True, 'user': user.to_dict()})


# --- PROJECTS ---

@app.route('/api/projects', methods=['GET'])
def get_projects():
    return jsonify([p.to_dict() for p in Project.query.order_by(Project.updated_at.desc()).all()])


@app.route('/api/projects/<int:project_id>/stats', methods=['GET'])
def get_project_stats(project_id):
    project     = Project.query.get_or_404(project_id)
    total_words = sum(len(html_to_plain_text(d.content or '').split()) for d in project.documents if d.content)
    scene_words = sum(len(html_to_plain_text(s.content or '').split()) for s in project.scenes if s.content)
    all_dates   = [project.updated_at] + [d.updated_at for d in project.documents]
    return jsonify({
        'id': project.id, 'title': project.title, 'description': project.description,
        'genre': project.genre, 'is_creative': project.genre in CREATIVE_GENRES,
        'chapter_count': len(project.documents), 'character_count': len(project.characters),
        'scene_count': len(project.scenes), 'lore_count': len(project.lore_items),
        'total_words': total_words + scene_words,
        'last_edited': max(all_dates).isoformat() if all_dates else None,
        'created_at': project.created_at.isoformat()
    })


@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400
    project = Project(title=data['title'], description=data.get('description', ''),
                      genre=data.get('genre', 'general'))
    db.session.add(project)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, pid, uid):
            with app.app_context():
                u, p = User.query.get(uid), Project.query.get(pid)
                if not u or not p: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                    db.session.commit()
                except Exception as e:
                    print(f"Drive folder error: {e}")
        drive_bg(_bg, app, project.id, user.id)

    return jsonify(project.to_dict()), 201


@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    folder_id = project.drive_folder_id
    db.session.delete(project)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token and folder_id:
        def _bg(app, fid, uid):
            with app.app_context():
                u = User.query.get(uid)
                if not u: return
                try:
                    get_drive_service(u).files().delete(fileId=fid).execute()
                except Exception as e:
                    print(f"Drive folder delete error: {e}")
        drive_bg(_bg, app, folder_id, user.id)

    return jsonify({'message': 'Deleted'})


# --- DOCUMENTS ---

@app.route('/api/projects/<int:project_id>/documents', methods=['GET'])
def get_documents(project_id):
    Project.query.get_or_404(project_id)
    docs = Document.query.filter_by(project_id=project_id).order_by(
        Document.order_index.asc(), Document.created_at.asc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/api/projects/<int:project_id>/documents/reorder', methods=['POST'])
def reorder_documents(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or 'order' not in data:
        return jsonify({'error': 'order required'}), 400
    for i, doc_id in enumerate(data['order']):
        doc = Document.query.get(doc_id)
        if doc and doc.project_id == project_id:
            doc.order_index = i
    db.session.commit()
    return jsonify({'message': 'Reordered'})


@app.route('/api/projects/<int:project_id>/documents', methods=['POST'])
def create_document(project_id):
    project = Project.query.get_or_404(project_id)
    data    = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400
    last  = Document.query.filter_by(project_id=project_id).order_by(Document.order_index.desc()).first()
    doc   = Document(title=data['title'], content=data.get('content', ''),
                     project_id=project_id, drive_file_id='',
                     order_index=(last.order_index + 1) if last else 0)
    db.session.add(doc)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, did, pid, uid):
            with app.app_context():
                u, p, d = User.query.get(uid), Project.query.get(pid), Document.query.get(did)
                if not u or not p or not d: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    d.drive_file_id = create_drive_file(
                        drive, d.title, f"{d.title}\n{'='*len(d.title)}\n\n(empty)", p.drive_folder_id)
                    db.session.commit()
                except Exception as e:
                    print(f"Drive file error: {e}")
        drive_bg(_bg, app, doc.id, project.id, user.id)

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
    file_id = doc.drive_file_id
    db.session.delete(doc)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token and file_id:
        def _bg(app, fid, uid):
            with app.app_context():
                u = User.query.get(uid)
                if not u: return
                try:
                    get_drive_service(u).files().delete(fileId=fid).execute()
                except Exception as e:
                    print(f"Drive delete error: {e}")
        drive_bg(_bg, app, file_id, user.id)

    return jsonify({'message': 'Deleted'})


# --- CHARACTERS ---

@app.route('/api/projects/<int:project_id>/characters', methods=['GET'])
def get_characters(project_id):
    Project.query.get_or_404(project_id)
    return jsonify([c.to_dict() for c in Character.query.filter_by(project_id=project_id).order_by(Character.name).all()])


@app.route('/api/projects/<int:project_id>/characters', methods=['POST'])
def create_character(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name required'}), 400
    char = Character(project_id=project_id, name=data['name'], role=data.get('role', ''),
                     age=data.get('age', ''), personality=data.get('personality', ''),
                     backstory=data.get('backstory', ''), appearance=data.get('appearance', ''),
                     image_url=data.get('image_url', ''), extra_notes=data.get('extra_notes', ''))
    db.session.add(char)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, cid, pid, uid):
            with app.app_context():
                u, p, c = User.query.get(uid), Project.query.get(pid), Character.query.get(cid)
                if not u or not p or not c: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    folder = get_or_create_folder(drive, 'Characters', parent_id=p.drive_folder_id)
                    content = f"Name: {c.name}\nRole: {c.role}\nAge: {c.age}\n\nAppearance:\n{c.appearance}\n\nPersonality:\n{c.personality}\n\nBackstory:\n{c.backstory}\n\nNotes:\n{c.extra_notes}"
                    create_drive_file(drive, c.name, content, folder)
                except Exception as e:
                    print(f"Character Drive sync error: {e}")
        drive_bg(_bg, app, char.id, project_id, user.id)

    return jsonify(char.to_dict()), 201


@app.route('/api/characters/<int:char_id>', methods=['GET'])
def get_character(char_id):
    return jsonify(Character.query.get_or_404(char_id).to_dict())


@app.route('/api/characters/<int:char_id>', methods=['PUT'])
def update_character(char_id):
    char = Character.query.get_or_404(char_id)
    data = request.get_json()
    for f in ['name','role','age','personality','backstory','appearance','image_url','extra_notes']:
        if f in data: setattr(char, f, data[f])
    db.session.commit()
    return jsonify(char.to_dict())


@app.route('/api/characters/<int:char_id>', methods=['DELETE'])
def delete_character(char_id):
    char = Character.query.get_or_404(char_id)
    db.session.delete(char)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# --- SCENES ---

@app.route('/api/projects/<int:project_id>/scenes', methods=['GET'])
def get_scenes(project_id):
    Project.query.get_or_404(project_id)
    return jsonify([s.to_dict() for s in Scene.query.filter_by(project_id=project_id).order_by(Scene.updated_at.desc()).all()])


@app.route('/api/projects/<int:project_id>/scenes', methods=['POST'])
def create_scene(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400
    scene = Scene(project_id=project_id, title=data['title'], content=data.get('content', ''),
                  mood=data.get('mood', ''), connected_chapter=data.get('connected_chapter', ''))
    db.session.add(scene)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, sid, pid, uid):
            with app.app_context():
                u, p, s = User.query.get(uid), Project.query.get(pid), Scene.query.get(sid)
                if not u or not p or not s: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    folder  = get_or_create_folder(drive, 'Scenes', parent_id=p.drive_folder_id)
                    content = f"Scene: {s.title}\nMood: {s.mood}\nConnected Chapter: {s.connected_chapter}\n\n{html_to_plain_text(s.content)}"
                    create_drive_file(drive, s.title, content, folder)
                except Exception as e:
                    print(f"Scene Drive sync error: {e}")
        drive_bg(_bg, app, scene.id, scene.project_id, user.id)

    return jsonify(scene.to_dict()), 201


@app.route('/api/scenes/<int:scene_id>', methods=['GET'])
def get_scene(scene_id):
    return jsonify(Scene.query.get_or_404(scene_id).to_dict())


@app.route('/api/scenes/<int:scene_id>', methods=['PUT'])
def update_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    data  = request.get_json()
    for f in ['title','content','mood','connected_chapter']:
        if f in data: setattr(scene, f, data[f])
    scene.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(scene.to_dict())


@app.route('/api/scenes/<int:scene_id>', methods=['DELETE'])
def delete_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    db.session.delete(scene)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# --- LORE ---

@app.route('/api/projects/<int:project_id>/lore', methods=['GET'])
def get_lore(project_id):
    Project.query.get_or_404(project_id)
    return jsonify([i.to_dict() for i in LoreItem.query.filter_by(project_id=project_id).order_by(LoreItem.name).all()])


@app.route('/api/projects/<int:project_id>/lore', methods=['POST'])
def create_lore(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Name required'}), 400
    item = LoreItem(project_id=project_id, name=data['name'], category=data.get('category', 'item'),
                    description=data.get('description', ''), image_url=data.get('image_url', ''),
                    extra_notes=data.get('extra_notes', ''))
    db.session.add(item)
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, iid, pid, uid):
            with app.app_context():
                u, p, l = User.query.get(uid), Project.query.get(pid), LoreItem.query.get(iid)
                if not u or not p or not l: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    folder  = get_or_create_folder(drive, 'Lore', parent_id=p.drive_folder_id)
                    content = f"Name: {l.name}\nCategory: {l.category}\n\nDescription:\n{l.description}\n\nNotes:\n{l.extra_notes}"
                    create_drive_file(drive, l.name, content, folder)
                except Exception as e:
                    print(f"Lore Drive sync error: {e}")
        drive_bg(_bg, app, item.id, item.project_id, user.id)

    return jsonify(item.to_dict()), 201


@app.route('/api/lore/<int:item_id>', methods=['GET'])
def get_lore_item(item_id):
    return jsonify(LoreItem.query.get_or_404(item_id).to_dict())


@app.route('/api/lore/<int:item_id>', methods=['PUT'])
def update_lore_item(item_id):
    item = LoreItem.query.get_or_404(item_id)
    data = request.get_json()
    for f in ['name','category','description','image_url','extra_notes']:
        if f in data: setattr(item, f, data[f])
    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/api/lore/<int:item_id>', methods=['DELETE'])
def delete_lore_item(item_id):
    item = LoreItem.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# --- NOTES ---

@app.route('/api/projects/<int:project_id>/notes', methods=['GET'])
def get_notes(project_id):
    Project.query.get_or_404(project_id)
    note = Note.query.filter_by(project_id=project_id).first()
    if not note:
        note = Note(project_id=project_id, content='')
        db.session.add(note)
        db.session.commit()
    return jsonify(note.to_dict())


@app.route('/api/projects/<int:project_id>/notes', methods=['PUT'])
def update_notes(project_id):
    Project.query.get_or_404(project_id)
    note = Note.query.filter_by(project_id=project_id).first()
    if not note:
        note = Note(project_id=project_id, content='')
        db.session.add(note)
    data            = request.get_json()
    note.content    = data.get('content', '')
    note.updated_at = datetime.utcnow()
    db.session.commit()

    user = get_current_user()
    if user and user.access_token:
        def _bg(app, pid, content, uid):
            with app.app_context():
                u, p = User.query.get(uid), Project.query.get(pid)
                if not u or not p: return
                try:
                    drive = get_drive_service(u)
                    if not u.scripvia_folder_id:
                        u.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
                        db.session.commit()
                    if not p.drive_folder_id:
                        p.drive_folder_id = get_or_create_folder(drive, p.title, parent_id=u.scripvia_folder_id)
                        db.session.commit()
                    results = drive.files().list(
                        q=f"name='_notes.txt' and '{p.drive_folder_id}' in parents and trashed=false",
                        fields='files(id)').execute()
                    files = results.get('files', [])
                    if files:
                        drive.files().update(
                            fileId=files[0]['id'],
                            media_body=MediaInMemoryUpload(content.encode('utf-8'), mimetype='text/plain')
                        ).execute()
                    else:
                        create_drive_file(drive, '_notes', content, p.drive_folder_id)
                except Exception as e:
                    print(f"Notes Drive sync error: {e}")
        drive_bg(_bg, app, project_id, note.content, user.id)

    return jsonify(note.to_dict())


# --- RELATIONSHIPS ---

@app.route('/api/projects/<int:project_id>/relationships', methods=['GET'])
def get_relationships(project_id):
    Project.query.get_or_404(project_id)
    return jsonify([r.to_dict() for r in CharacterRelationship.query.filter_by(project_id=project_id).all()])


@app.route('/api/projects/<int:project_id>/relationships', methods=['POST'])
def create_relationship(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('char_a_id') or not data.get('char_b_id'):
        return jsonify({'error': 'Both characters required'}), 400
    if data['char_a_id'] == data['char_b_id']:
        return jsonify({'error': 'Cannot relate a character to themselves'}), 400
    rel = CharacterRelationship(project_id=project_id, char_a_id=data['char_a_id'],
                                char_b_id=data['char_b_id'], relation_type=data.get('relation_type', ''),
                                description=data.get('description', ''), color=data.get('color', '#7b6fb0'))
    db.session.add(rel)
    db.session.commit()
    return jsonify(rel.to_dict()), 201


@app.route('/api/relationships/<int:rel_id>', methods=['PUT'])
def update_relationship(rel_id):
    rel  = CharacterRelationship.query.get_or_404(rel_id)
    data = request.get_json()
    for f in ['relation_type','description','color']:
        if f in data: setattr(rel, f, data[f])
    db.session.commit()
    return jsonify(rel.to_dict())


@app.route('/api/relationships/<int:rel_id>', methods=['DELETE'])
def delete_relationship(rel_id):
    rel = CharacterRelationship.query.get_or_404(rel_id)
    db.session.delete(rel)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# --- SEARCH ---

@app.route('/api/projects/<int:project_id>/search', methods=['GET'])
def search_project(project_id):
    Project.query.get_or_404(project_id)
    q = request.args.get('q', '').strip().lower()
    if not q or len(q) < 2:
        return jsonify([])

    def snippet(text, query):
        idx = text.lower().find(query)
        if idx < 0: return ''
        s, e = max(0, idx-60), min(len(text), idx+100)
        return ('...' if s > 0 else '') + text[s:e].strip() + ('...' if e < len(text) else '')

    results = []
    for doc in Document.query.filter_by(project_id=project_id).all():
        text = html_to_plain_text(doc.content or '')
        if q in doc.title.lower() or q in text.lower():
            results.append({'type':'chapter','id':doc.id,'title':doc.title,'snippet':snippet(text,q),'icon':'📄'})

    for scene in Scene.query.filter_by(project_id=project_id).all():
        text = html_to_plain_text(scene.content or '')
        if q in scene.title.lower() or q in text.lower():
            results.append({'type':'scene','id':scene.id,'title':scene.title,'snippet':snippet(text,q),'icon':'⚡'})

    for c in Character.query.filter_by(project_id=project_id).all():
        if q in c.name.lower() or q in (c.personality or '').lower() or q in (c.backstory or '').lower():
            results.append({'type':'character','id':c.id,'title':c.name,'snippet':c.role or '','icon':'👤'})

    for l in LoreItem.query.filter_by(project_id=project_id).all():
        if q in l.name.lower() or q in (l.description or '').lower():
            results.append({'type':'lore','id':l.id,'title':l.name,'snippet':l.category or '','icon':'📖'})

    return jsonify(results)


# --- WIKI ---

@app.route('/api/projects/<int:project_id>/wiki', methods=['GET'])
def get_wiki_data(project_id):
    chars = Character.query.filter_by(project_id=project_id).all()
    lore  = LoreItem.query.filter_by(project_id=project_id).all()
    wiki  = {}
    for c in chars:
        wiki[c.name.lower()] = {
            'type': 'character', 'name': c.name, 'role': c.role, 'age': c.age,
            'image_url': c.image_url, 'id': c.id,
            'summary':    c.personality[:200] + '...' if len(c.personality) > 200 else c.personality,
            'backstory':  c.backstory[:200]   + '...' if len(c.backstory)   > 200 else c.backstory,
            'appearance': c.appearance[:150]  + '...' if len(c.appearance)  > 150 else c.appearance,
        }
    for l in lore:
        wiki[l.name.lower()] = {
            'type': 'lore', 'name': l.name, 'category': l.category,
            'image_url': l.image_url, 'id': l.id,
            'summary': l.description[:150] + '...' if len(l.description) > 150 else l.description,
        }
    return jsonify(wiki)


# --- DRIVE SYNC ---

@app.route('/api/documents/<int:doc_id>/sync', methods=['POST'])
def sync_to_drive(doc_id):
    user = get_current_user()
    if not user or not user.access_token:
        return jsonify({'error': 'Not logged in'}), 401
    doc     = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)
    try:
        drive = get_drive_service(user)
        if not user.scripvia_folder_id:
            user.scripvia_folder_id = get_or_create_folder(drive, 'Scripvia')
            db.session.commit()
        if not project.drive_folder_id:
            project.drive_folder_id = get_or_create_folder(drive, project.title, parent_id=user.scripvia_folder_id)
            db.session.commit()
        text = f"{doc.title}\n{'='*len(doc.title)}\n\n{html_to_plain_text(doc.content or '')}"
        if doc.drive_file_id:
            update_drive_file(drive, doc.drive_file_id, doc.title, text)
            action = 'updated'
        else:
            doc.drive_file_id = create_drive_file(drive, doc.title, text, project.drive_folder_id)
            db.session.commit()
            action = 'created'
        return jsonify({'success': True, 'action': action})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/documents/<int:doc_id>/sync-status', methods=['GET'])
def sync_status(doc_id):
    doc = Document.query.get_or_404(doc_id)
    return jsonify({'synced': bool(doc.drive_file_id), 'drive_file_id': doc.drive_file_id})


# --- SINGLE DOC EXPORT ---

@app.route('/api/documents/<int:doc_id>/export/pdf', methods=['GET'])
def export_pdf(doc_id):
    from reportlab.lib.enums import TA_LEFT
    doc     = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)
    buffer  = io.BytesIO()
    styles  = getSampleStyleSheet()

    def style(name, parent='Normal', **kw):
        return ParagraphStyle(name, parent=styles[parent], **kw)

    title_s = style('T', 'Title', fontSize=24, textColor=colors.HexColor('#3d3580'), spaceAfter=6, fontName='Helvetica-Bold')
    sub_s   = style('S', fontSize=11, textColor=colors.HexColor('#888888'), spaceAfter=24)
    h1_s    = style('H1', 'Heading1', fontSize=18, textColor=colors.HexColor('#3d3580'), fontName='Helvetica-Bold')
    h2_s    = style('H2', 'Heading2', fontSize=14, textColor=colors.HexColor('#5548a0'), fontName='Helvetica-Bold')
    h3_s    = style('H3', 'Heading3', fontSize=12, textColor=colors.HexColor('#7b6fb0'), fontName='Helvetica-Bold')
    body_s  = style('B', fontSize=11, leading=18, spaceAfter=8, textColor=colors.HexColor('#1a1a2e'))
    quote_s = style('Q', fontSize=11, leading=18, leftIndent=24, fontName='Helvetica-Oblique', textColor=colors.HexColor('#555555'))

    pdf  = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=inch, leftMargin=inch, topMargin=1.2*inch, bottomMargin=inch)
    story = [Paragraph(doc.title, title_s),
             Paragraph(f"from {project.title} · exported via Scripvia", sub_s),
             Spacer(1, 0.2*inch)]

    tag_map = {'h1': h1_s, 'h2': h2_s, 'h3': h3_s}
    for el in BeautifulSoup(doc.content or '', 'html.parser').find_all(['p','h1','h2','h3','blockquote','li']):
        text = el.get_text(strip=True)
        if not text: continue
        if el.name in tag_map:
            story.append(Paragraph(text, tag_map[el.name]))
        elif el.name == 'blockquote':
            story.append(Paragraph(f'"{text}"', quote_s))
        elif el.name == 'li':
            story.append(Paragraph(f'• {text}', body_s))
        else:
            story.append(Paragraph(text, body_s))
        story.append(Spacer(1, 0.05*inch))

    pdf.build(story)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"{doc.title}.pdf", mimetype='application/pdf')


@app.route('/api/documents/<int:doc_id>/export/docx', methods=['GET'])
def export_docx(doc_id):
    doc     = Document.query.get_or_404(doc_id)
    project = Project.query.get_or_404(doc.project_id)
    word    = DocxDocument()
    section = word.sections[0]
    section.top_margin = section.bottom_margin = Inches(1.2)
    section.left_margin = section.right_margin = Inches(1)

    def color(run, h):
        h = h.lstrip('#')
        run.font.color.rgb = RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

    def para(text, size, bold=False, italic=False, hex_color='1a1a2e', indent=None):
        p = word.add_paragraph()
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.font.bold, r.font.italic = bold, italic
        color(r, hex_color)
        if indent: p.paragraph_format.left_indent = indent
        return p

    para(doc.title, 24, bold=True, hex_color='3d3580')
    para(f"from {project.title} · exported via Scripvia", 10, italic=True, hex_color='888888')
    word.add_paragraph()

    tag_cfg = {'h1':(18,True,'3d3580'), 'h2':(14,True,'5548a0'), 'h3':(12,True,'7b6fb0')}
    for el in BeautifulSoup(doc.content or '', 'html.parser').find_all(['p','h1','h2','h3','blockquote','li']):
        text = el.get_text(strip=True)
        if not text: continue
        if el.name in tag_cfg:
            sz, bd, col = tag_cfg[el.name]
            para(text, sz, bold=bd, hex_color=col)
        elif el.name == 'blockquote':
            para(f'"{text}"', 11, italic=True, hex_color='555555', indent=Inches(0.4))
        elif el.name == 'li':
            para(f'• {text}', 11)
        else:
            para(text, 11)

    buffer = io.BytesIO()
    word.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"{doc.title}.docx",
                     mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


# --- FULL PROJECT EXPORT ---

@app.route('/api/projects/<int:project_id>/export/pdf', methods=['GET'])
def export_project_pdf(project_id):
    project = Project.query.get_or_404(project_id)
    docs    = Document.query.filter_by(project_id=project_id).order_by(
        Document.order_index.asc(), Document.created_at.asc()).all()
    buffer  = io.BytesIO()
    styles  = getSampleStyleSheet()

    def ps(name, parent='Normal', **kw):
        return ParagraphStyle(name, parent=styles[parent], **kw)

    cover_title = ps('CT','Title', fontSize=36, textColor=colors.HexColor('#7b6fb0'), spaceAfter=20, fontName='Times-Bold', alignment=1)
    cover_sub   = ps('CS', fontSize=13, textColor=colors.HexColor('#888888'), spaceAfter=8, alignment=1)
    toc_title   = ps('TT','Heading1', fontSize=20, textColor=colors.HexColor('#7b6fb0'), spaceAfter=20, fontName='Times-Bold')
    toc_entry   = ps('TE', fontSize=12, textColor=colors.HexColor('#333333'), spaceAfter=8, leftIndent=10)
    ch_title    = ps('ChT','Heading1', fontSize=24, textColor=colors.HexColor('#7b6fb0'), spaceAfter=6, fontName='Times-Bold', alignment=1)
    ch_num      = ps('ChN', fontSize=11, textColor=colors.HexColor('#aaaaaa'), spaceAfter=20, alignment=1)
    body        = ps('Bo', fontSize=12, leading=20, textColor=colors.HexColor('#1a1a1a'), spaceAfter=12, firstLineIndent=24)
    h2          = ps('H2','Heading2', fontSize=16, textColor=colors.HexColor('#5548a0'), spaceAfter=10, fontName='Times-Bold')
    h3          = ps('H3','Heading3', fontSize=13, textColor=colors.HexColor('#7b6fb0'), spaceAfter=8,  fontName='Times-Bold')

    total_words = sum(len(html_to_plain_text(d.content or '').split()) for d in docs if d.content)
    els = [Spacer(1, 2*inch), Paragraph(project.title, cover_title), Spacer(1, 0.2*inch)]
    if project.description: els.append(Paragraph(project.description, cover_sub))
    els += [Spacer(1,0.3*inch), Paragraph(f'Genre: {project.genre.title()}', cover_sub),
            Paragraph(f'{len(docs)} chapter{"s" if len(docs)!=1 else ""}', cover_sub),
            Paragraph(f'{total_words:,} words', cover_sub), PageBreak(),
            Paragraph('Table of Contents', toc_title),
            HRFlowable(width='100%', thickness=1, color=colors.HexColor('#cccccc')),
            Spacer(1, 0.15*inch)]
    for i, d in enumerate(docs, 1):
        els.append(Paragraph(f'{i}.  {d.title}', toc_entry))
    els.append(PageBreak())

    for i, doc in enumerate(docs, 1):
        els += [Paragraph(f'Chapter {i}', ch_num), Paragraph(doc.title, ch_title),
                HRFlowable(width='60%', thickness=1, color=colors.HexColor('#7b6fb0'), hAlign='CENTER'),
                Spacer(1, 0.3*inch)]
        if doc.content:
            bq_s = ps('BQ', parent='Normal', leftIndent=30, textColor=colors.HexColor('#666666'), fontName='Times-Italic')
            for el in BeautifulSoup(doc.content, 'html.parser').find_all(['p','h1','h2','h3','h4','blockquote','li']):
                text = el.get_text().strip()
                if not text: continue
                if   el.name == 'h1':                    els.append(Paragraph(text, ch_title))
                elif el.name in ['h2','h3','h4']:        els.append(Paragraph(text, h2 if el.name=='h2' else h3))
                elif el.name == 'blockquote':            els.append(Paragraph(f'"{text}"', bq_s))
                elif el.name == 'li':                    els.append(Paragraph(f'• {text}', body))
                else:                                    els.append(Paragraph(text, body))
        if i < len(docs): els.append(PageBreak())

    SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.2*inch, leftMargin=1.2*inch,
                      topMargin=1.2*inch, bottomMargin=1.2*inch).build(els)
    buffer.seek(0)
    return send_file(buffer, mimetype='application/pdf', as_attachment=True,
                     download_name=f"{project.title.replace(' ','_')}_complete.pdf")


@app.route('/api/projects/<int:project_id>/export/docx', methods=['GET'])
def export_project_docx(project_id):
    project = Project.query.get_or_404(project_id)
    docs    = Document.query.filter_by(project_id=project_id).order_by(
        Document.order_index.asc(), Document.created_at.asc()).all()
    docx    = DocxDocument()
    section = docx.sections[0]
    section.top_margin = section.bottom_margin = Inches(1.2)
    section.left_margin = section.right_margin = Inches(1.3)

    def color(run, h):
        run.font.color.rgb = RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

    total_words = sum(len(html_to_plain_text(d.content or '').split()) for d in docs if d.content)

    # Cover
    for _ in range(8): docx.add_paragraph('')
    p = docx.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(project.title); r.font.size = Pt(36); r.font.bold = True; color(r, '7b6fb0')
    if project.description:
        p = docx.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(project.description); r.font.size = Pt(13); color(r, '888888')
    p = docx.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f'{project.genre.title()} · {len(docs)} chapters · {total_words:,} words')
    r.font.size = Pt(11); color(r, 'aaaaaa')
    docx.add_page_break()

    # TOC
    p = docx.add_paragraph(); r = p.add_run('Table of Contents')
    r.font.size = Pt(20); r.font.bold = True; color(r, '7b6fb0')
    for i, d in enumerate(docs, 1):
        p = docx.add_paragraph(); r = p.add_run(f'{i}.   {d.title}')
        r.font.size = Pt(12); color(r, '333333')
    docx.add_page_break()

    # Chapters
    for i, doc in enumerate(docs, 1):
        p = docx.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(f'Chapter {i}'); r.font.size = Pt(11); color(r, 'aaaaaa')
        p = docx.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(doc.title); r.font.size = Pt(24); r.font.bold = True; color(r, '7b6fb0')
        docx.add_paragraph('')

        if doc.content:
            for el in BeautifulSoup(doc.content, 'html.parser').find_all(['p','h1','h2','h3','h4','blockquote','li']):
                text = el.get_text().strip()
                if not text: continue
                p = docx.add_paragraph()
                r = p.add_run(text)
                if   el.name == 'h1':       r.font.size=Pt(20); r.font.bold=True;  color(r,'7b6fb0')
                elif el.name in ['h2','h3','h4']: r.font.size=Pt(16 if el.name=='h2' else 13); r.font.bold=True; color(r,'5548a0')
                elif el.name == 'blockquote':
                    r = p.add_run(f'"{text}"'); r.font.size=Pt(12); r.font.italic=True
                    color(r,'666666'); p.paragraph_format.left_indent=Inches(0.5)
                elif el.name == 'li':       r.font.size=Pt(12)
                else:
                    r.font.size=Pt(12); color(r,'1a1a1a')
                    p.paragraph_format.first_line_indent=Inches(0.3)

        if i < len(docs): docx.add_page_break()

    buffer = io.BytesIO()
    docx.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True,
                     download_name=f"{project.title.replace(' ','_')}_complete.docx",
                     mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


# --- ENTRY POINT ---

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Database initialized")
    print("🚀 Scripvia running at http://localhost:5000")
    app.run(debug=True)