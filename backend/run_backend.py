import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# .envファイルを読み込む
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    print(f"Loading environment variables from {env_path}")
    load_dotenv(env_path)
    
    # デバッグ: 重要な環境変数の存在確認
    print(f"AZURE_SPEECH_KEY: {'Set' if os.getenv('AZURE_SPEECH_KEY') else 'Not set'}")
    print(f"AZURE_OPENAI_ENDPOINT: {'Set' if os.getenv('AZURE_OPENAI_ENDPOINT') else 'Not set'}")
    print(f"GEMINI_API_KEY: {'Set' if os.getenv('GEMINI_API_KEY') else 'Not set'}")
else:
    print(f"Warning: {env_path} not found")

# app.pyを実行
from app import app
from aiohttp import web

if __name__ == '__main__':
    PORT = int(os.getenv("PORT", "8080"))
    print(f"Starting server on http://localhost:{PORT}")
    web.run_app(app, host='0.0.0.0', port=PORT)