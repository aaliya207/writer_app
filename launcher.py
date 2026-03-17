import sys
import os
import threading
import webview
import urllib.request
import time

def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath('.'), relative_path)

if hasattr(sys, '_MEIPASS'):
    os.chdir(sys._MEIPASS)

sys.path.insert(0, resource_path('.'))
from app import app, db

def start_flask():
    with app.app_context():
        db.create_all()
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False, threaded=True)

def wait_for_flask():
    """Wait until Flask is actually responding before opening window"""
    for _ in range(20):
        try:
            urllib.request.urlopen('http://127.0.0.1:5000')
            return True
        except:
            time.sleep(0.5)
    return False

if __name__ == '__main__':
    t = threading.Thread(target=start_flask, daemon=True)
    t.start()

    wait_for_flask()

    window = webview.create_window(
        'Scripvia',
        'http://127.0.0.1:5000',
        width=1280,
        height=800,
        min_size=(900, 600),
        resizable=True,
    )
    webview.start()