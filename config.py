# config.py
# Loads environment variables from .env file
# This keeps secrets OUT of your code

import os
from dotenv import load_dotenv

# Load the .env file
load_dotenv()

class Config:
    # Flask secret key (used for sessions/cookies)
    SECRET_KEY = os.getenv('SECRET_KEY', 'fallback-dev-key')

    # Database
    SQLALCHEMY_DATABASE_URI = 'sqlite:///fantasy_writer.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Google OAuth credentials (loaded from .env)
    GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')

    # Where Google sends the user after they log in
    GOOGLE_REDIRECT_URI  = 'http://localhost:5000/auth/callback'

    # What permissions we're asking Google for
    # drive.file = only access files Scripvia creates (not your whole Drive)
    GOOGLE_SCOPES = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.file'
    ]
    
    #session cookies
    SESSION_COOKIE_SECURE = False    # Fine for localhost
    SESSION_COOKIE_SAMESITE = 'Lax'