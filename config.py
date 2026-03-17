import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY                     = os.getenv('SECRET_KEY', 'scripvia-secret-key')
    SQLALCHEMY_DATABASE_URI        = 'sqlite:///scripvia.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    GOOGLE_CLIENT_ID               = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET           = os.getenv('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI            = 'http://localhost:5000/auth/callback'
    GOOGLE_SCOPES = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.file'
    ]
    SESSION_COOKIE_SECURE   = False
    SESSION_COOKIE_SAMESITE = 'Lax'