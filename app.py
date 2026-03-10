# app.py
# This is the MAIN server file. Flask reads this to know what URLs to handle.

from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

# Create the Flask app instance
app = Flask(__name__)

# --- DATABASE CONFIG ---
# SQLite database will be stored in the 'instance' folder Flask creates automatically
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///fantasy_writer.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your-secret-key-change-this-later'  # We'll move this to .env later

# Initialize the database
db = SQLAlchemy(app)


# --- DATABASE MODELS ---
# A "model" = a table in the database. Think of it like a class blueprint.

class Project(db.Model):
    """Represents a writing project (e.g., 'Fire Clan Arc')"""
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # One project can have many documents
    documents = db.relationship('Document', backref='project', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        """Convert model to dictionary so we can send it as JSON to the frontend"""
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'document_count': len(self.documents)
        }


class Document(db.Model):
    """Represents a single chapter/scene/note inside a project"""
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')  # Stores HTML from the rich text editor
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'project_id': self.project_id,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }


# --- ROUTES ---
# A "route" = a URL the server listens to. Like chapters in a book.

@app.route('/')
def index():
    """Serve the main HTML page"""
    return render_template('index.html')


# == PROJECT ROUTES ==

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """Return all projects as JSON"""
    projects = Project.query.order_by(Project.updated_at.desc()).all()
    return jsonify([p.to_dict() for p in projects])


@app.route('/api/projects', methods=['POST'])
def create_project():
    """Create a new project"""
    data = request.get_json()  # Get JSON data sent from frontend
    
    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    project = Project(
        title=data['title'],
        description=data.get('description', '')
    )
    db.session.add(project)
    db.session.commit()
    
    return jsonify(project.to_dict()), 201  # 201 = "Created"


@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project and all its documents"""
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Project deleted'})


# == DOCUMENT ROUTES ==

@app.route('/api/projects/<int:project_id>/documents', methods=['GET'])
def get_documents(project_id):
    """Get all documents in a project"""
    Project.query.get_or_404(project_id)  # Verify project exists
    docs = Document.query.filter_by(project_id=project_id).order_by(Document.updated_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/api/projects/<int:project_id>/documents', methods=['POST'])
def create_document(project_id):
    """Create a new document inside a project"""
    Project.query.get_or_404(project_id)
    data = request.get_json()
    
    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    doc = Document(
        title=data['title'],
        content=data.get('content', ''),
        project_id=project_id
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


@app.route('/api/documents/<int:doc_id>', methods=['GET'])
def get_document(doc_id):
    """Get a single document by ID"""
    doc = Document.query.get_or_404(doc_id)
    return jsonify(doc.to_dict())


@app.route('/api/documents/<int:doc_id>', methods=['PUT'])
def update_document(doc_id):
    """Update document content (used by auto-save)"""
    doc = Document.query.get_or_404(doc_id)
    data = request.get_json()
    
    if 'title' in data:
        doc.title = data['title']
    if 'content' in data:
        doc.content = data['content']
    
    doc.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(doc.to_dict())


@app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Delete a document"""
    doc = Document.query.get_or_404(doc_id)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'message': 'Document deleted'})


# --- APP ENTRY POINT ---
# This block runs the server when you do: python app.py

if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Create tables if they don't exist
        print("✅ Database initialized")
    
    print("🚀 Fantasy Writer App running at http://localhost:5000")
    app.run(debug=True)  # debug=True = auto-restart on code changes


## 📄 File: `.gitignore`
 # This tells Git to NOT upload sensitive/useless files:
#```
# Python
#__pycache__/
#*.pyc
#*.pyo
#.env
#venv/
#env/

# Flask
#instance/
#*.db

# VS Code
#.vscode/

# OS files
#.DS_Store
#Thumbs.db

# Node (just in case)
#node_modules/