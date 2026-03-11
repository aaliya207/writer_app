# app.py
from flask import Flask, render_template, request, jsonify, redirect, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from config import Config
import os
import urllib.parse
import requests as http_requests
import secrets

# Keep this for Drive API in Step 5
from googleapiclient.discovery import build

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)

# Allow HTTP for local development
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


# =============================================
# DATABASE MODELS
# =============================================

class User(db.Model):
    """Stores Google account info after login"""
    id            = db.Column(db.Integer, primary_key=True)
    google_id     = db.Column(db.String(200), unique=True, nullable=False)
    email         = db.Column(db.String(200), nullable=False)
    name          = db.Column(db.String(200), default='')
    picture       = db.Column(db.String(500), default='')
    access_token  = db.Column(db.Text, default='')
    refresh_token = db.Column(db.Text, default='')
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    projects = db.relationship('Project', backref='owner', lazy=True)

    def to_dict(self):
        return {
            'id':      self.id,
            'email':   self.email,
            'name':    self.name,
            'picture': self.picture
        }


class Project(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    user_id     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = db.relationship('Document', backref='project', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':             self.id,
            'title':          self.title,
            'description':    self.description,
            'created_at':     self.created_at.isoformat(),
            'updated_at':     self.updated_at.isoformat(),
            'document_count': len(self.documents)
        }


class Document(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    title      = db.Column(db.String(200), nullable=False)
    content    = db.Column(db.Text, default='')
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':         self.id,
            'title':      self.title,
            'content':    self.content,
            'project_id': self.project_id,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


# =============================================
# HELPER
# =============================================

def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return User.query.get(user_id)


# =============================================
# MAIN ROUTE
# =============================================

@app.route('/')
def index():
    return render_template('index.html')


# =============================================
# AUTH ROUTES
# =============================================

@app.route('/auth/login')
def auth_login():
    # Generate a random state token to prevent CSRF attacks
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state

    # Build the Google OAuth URL manually (avoids the buggy Flow class)
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
    # Get the auth code Google sent back
    code = request.args.get('code')
    if not code:
        return 'Login failed — no code received', 400

    # Exchange the auth code for access + refresh tokens
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

    # Use access token to get user's Google profile
    profile_response = http_requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers={'Authorization': f"Bearer {tokens['access_token']}"}
    )
    profile = profile_response.json()

    # Find or create user in database
    user = User.query.filter_by(google_id=profile['id']).first()
    if not user:
        user = User(
            google_id = profile['id'],
            email     = profile.get('email', ''),
            name      = profile.get('name', ''),
            picture   = profile.get('picture', '')
        )
        db.session.add(user)

    # Save tokens for Drive API calls in Step 5
    user.access_token  = tokens.get('access_token', '')
    user.refresh_token = tokens.get('refresh_token', getattr(user, 'refresh_token', ''))
    db.session.commit()

    session['user_id'] = user.id
    session.permanent  = True

    return redirect('/')


@app.route('/auth/logout')
def auth_logout():
    session.clear()
    return redirect('/')


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
    project = Project(title=data['title'], description=data.get('description', ''))
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Deleted'})

@app.route('/api/projects/<int:project_id>/documents', methods=['GET'])
def get_documents(project_id):
    Project.query.get_or_404(project_id)
    docs = Document.query.filter_by(project_id=project_id).order_by(Document.updated_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])

@app.route('/api/projects/<int:project_id>/documents', methods=['POST'])
def create_document(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    if not data or not data.get('title'):
        return jsonify({'error': 'Title required'}), 400
    doc = Document(title=data['title'], content=data.get('content', ''), project_id=project_id)
    db.session.add(doc)
    db.session.commit()
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
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# =============================================
# ENTRY POINT
# =============================================

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Database initialized")
    print("🚀 Scripvia running at http://localhost:5000")
    app.run(debug=True)