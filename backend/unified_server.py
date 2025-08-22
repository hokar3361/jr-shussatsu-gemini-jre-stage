"""
統合サーバー - 既存のWebSocketプロキシとGoogle Cloud TTSを1つのプロセスで実行
run_backend.pyの代わりにこれを実行する
"""
import os
import sys
import asyncio
import json
import base64
import logging
from pathlib import Path
from typing import Optional
from aiohttp import web, WSMsgType
import aiohttp_cors
from dotenv import load_dotenv

# Google Cloud TTSをインポート
from google_cloud_tts import GoogleCloudTTSService

# .envファイルを読み込む
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    print(f"Loading environment variables from {env_path}")
    load_dotenv(env_path)

# ログ設定
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 既存のWebSocketハンドラーをインポート
try:
    from main import handle_client, proxy, PROJECT_ID, PORT
    logger.info("Successfully imported WebSocket handlers from main.py")
except ImportError as e:
    logger.warning(f"Failed to import from main.py: {e}")
    PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    PORT = int(os.getenv("PORT", "8080"))
    handle_client = None
    proxy = None

# 基本認証の設定
BASIC_AUTH_USERNAME = os.getenv("BASIC_AUTH_USERNAME", "jre-admin")
BASIC_AUTH_PASSWORD = os.getenv("BASIC_AUTH_PASSWORD", "jre-password-axcxeptplt")

# Google Cloud TTSサービスの初期化
tts_service = GoogleCloudTTSService()

# aiohttp Applicationの作成
app = web.Application()

# 環境変数で開発環境かどうかを判定
is_development = os.getenv('ENV', 'production').lower() == 'development'

# =====================================
# 基本認証ミドルウェア（既存のコードから）
# =====================================

@web.middleware
async def basic_auth_middleware(request, handler):
    """基本認証を処理するミドルウェア"""
    if is_development:
        return await handler(request)
    
    # APIエンドポイント、WebSocket接続、静的リソースは認証をスキップ
    # 静的リソース（JS、CSS、画像など）へのアクセスは認証不要
    if (request.path.startswith('/api/') or 
        request.path == '/ws' or
        request.path.endswith(('.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.json')) or
        request.path.startswith('/assets/')):
        return await handler(request)
    
    auth_header = request.headers.get('Authorization', '')
    
    if auth_header.startswith('Basic '):
        try:
            encoded_credentials = auth_header[6:]
            decoded = base64.b64decode(encoded_credentials).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            if username == BASIC_AUTH_USERNAME and password == BASIC_AUTH_PASSWORD:
                return await handler(request)
        except Exception as e:
            logger.error(f"[Auth] Error: {e}")
    
    return web.Response(
        text='Authentication required',
        status=401,
        headers={'WWW-Authenticate': 'Basic realm="Secure Area"'}
    )

app.middlewares.append(basic_auth_middleware)

# =====================================
# Google Cloud TTS エンドポイント（新規追加）
# =====================================

async def health_check(request):
    """ヘルスチェック"""
    return web.json_response({
        "status": "ok",
        "service": "Unified Server (Python)",
        "features": ["WebSocket Proxy", "Google Cloud TTS"],
        "websocket": "ready" if handle_client else "not_available",
        "tts": "ready"
    })

async def synthesize_speech(request):
    """音声合成エンドポイント"""
    try:
        data = await request.json()
        text = data.get('text', '')
        voice_name = data.get('voiceName', 'Kore')
        language_code = data.get('languageCode', 'ja-JP')
        
        if not text:
            return web.json_response(
                {"error": "Text is required"},
                status=400
            )
        
        logger.info(f"[TTS] Synthesizing with voice: {voice_name}")
        
        # 音声合成
        audio_data = tts_service.synthesize_speech(
            text=text,
            voice_name=voice_name,
            language_code=language_code
        )
        
        # WAVファイルとして返す
        return web.Response(
            body=audio_data,
            content_type='audio/wav',
            headers={
                'Content-Disposition': 'inline; filename=speech.wav'
            }
        )
        
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        logger.error(f"[TTS] Error: {e}")
        return web.json_response(
            {"error": f"Speech synthesis failed: {str(e)}"},
            status=500
        )

async def get_voices(request):
    """利用可能な音声のリスト"""
    return web.json_response({
        "voices": tts_service.get_available_voices()
    })

# =====================================
# 既存のWebSocketハンドラー
# =====================================

async def websocket_handler(request):
    """既存のWebSocketハンドラー"""
    if handle_client:
        # main.pyのhandle_clientを使用
        return await handle_client(request)
    else:
        # フォールバック（main.pyがない場合）
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                # エコーバック（テスト用）
                await ws.send_str(f"Echo: {msg.data}")
            elif msg.type == WSMsgType.ERROR:
                logger.error(f'WebSocket error: {ws.exception()}')
        
        return ws

# =====================================
# 既存のAPIエンドポイント（app.pyから）
# =====================================

async def config_handler(request):
    """設定情報を返すエンドポイント"""
    config = {
        "projectId": PROJECT_ID,
        "wsUrl": f"ws://localhost:{PORT}/ws",
        "azure": {
            "speechKey": os.getenv("AZURE_SPEECH_KEY", ""),
            "speechRegion": os.getenv("AZURE_SPEECH_REGION", "japaneast"),
            "openAIEndpoint": os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            "openAIKey": os.getenv("AZURE_OPENAI_KEY", ""),
            "openAIDeployment": os.getenv("AZURE_OPENAI_DEPLOYMENT", ""),
        },
        "google": {
            "apiKey": os.getenv("GEMINI_API_KEY", ""),
        }
    }
    return web.json_response(config)

# =====================================
# ルーティング設定
# =====================================

# TTS API（新規）
app.router.add_get('/api/health', health_check)
app.router.add_post('/api/tts/synthesize', synthesize_speech)
app.router.add_get('/api/tts/voices', get_voices)

# 既存のAPI
app.router.add_get('/api/config', config_handler)

# WebSocket
app.router.add_get('/ws', websocket_handler)

# 静的ファイル（必要に応じて）
# app.router.add_static('/', path='../frontend/dist', name='static')

# =====================================
# CORS設定
# =====================================

cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
        allow_methods="*"
    )
})

# すべてのルートにCORSを適用
for route in list(app.router.routes()):
    cors.add(route)

# =====================================
# メイン起動処理
# =====================================

if __name__ == '__main__':
    PORT = int(os.getenv("PORT", "8080"))
    
    print(f"""
    ========================================
    Unified Server Starting
    ========================================
    Port: {PORT}
    
    Endpoints:
    - WebSocket: ws://localhost:{PORT}/ws
    - TTS API: http://localhost:{PORT}/api/tts/synthesize
    - Voices: http://localhost:{PORT}/api/tts/voices
    - Health: http://localhost:{PORT}/api/health
    - Config: http://localhost:{PORT}/api/config
    
    Auth: {'DISABLED (Development)' if is_development else 'ENABLED'}
    ========================================
    """)
    
    # サーバー起動（run_backend.pyと同じ）
    web.run_app(app, host='0.0.0.0', port=PORT)