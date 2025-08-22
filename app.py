# Azure App Service用のエントリーポイント
# backendディレクトリのapp.pyをインポート
import sys
import os

# backendディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

# backend/app.pyからアプリケーションをインポート
from backend.app import app as application

# Gunicorn用のエントリーポイント
app = application