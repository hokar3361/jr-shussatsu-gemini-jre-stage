import asyncio
import json
import os
from typing import Optional
import logging
import base64
from aiohttp import web
import aiohttp_cors
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

# ログ設定
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Google Cloud TTS service をインポート（存在する場合）
try:
    from google_cloud_tts import GoogleCloudTTSService
    tts_service = GoogleCloudTTSService()
    HAS_TTS_SERVICE = True
    logger.info("[TTS] Google Cloud TTS service initialized")
except ImportError as e:
    HAS_TTS_SERVICE = False
    tts_service = None
    logger.warning(f"[TTS] Google Cloud TTS service not available: {e}")

# 基本認証の設定
BASIC_AUTH_USERNAME = os.getenv("BASIC_AUTH_USERNAME", "jre-admin")
BASIC_AUTH_PASSWORD = os.getenv("BASIC_AUTH_PASSWORD", "jre-password-axcxeptplt")

# デバッグ: 認証情報を確認
logger.info(f"[Basic Auth] Username configured: {BASIC_AUTH_USERNAME}")
logger.info(f"[Basic Auth] Password configured: {'*' * len(BASIC_AUTH_PASSWORD) if BASIC_AUTH_PASSWORD else 'NOT SET'}")

# 既存のWebSocketハンドラーをインポート
try:
    from main import handle_client, proxy, PROJECT_ID, PORT
except ImportError as e:
    logger.warning(f"Failed to import from main.py: {e}")
    # デフォルト値を設定
    PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    PORT = int(os.getenv("PORT", "8080"))
    handle_client = None
    proxy = None

app = web.Application()

# 環境変数で開発環境かどうかを判定
is_development = os.getenv('ENV', 'production').lower() == 'development'

if is_development:
    logger.info("[Environment] Development mode detected - Basic auth will be DISABLED")
else:
    logger.info("[Environment] Production mode detected - Basic auth will be ENABLED")

# 基本認証ミドルウェア
@web.middleware
async def basic_auth_middleware(request, handler):
    """基本認証を処理するミドルウェア"""
    # 開発環境では認証をスキップ
    if is_development:
        return await handler(request)
    
    # APIエンドポイント、WebSocket接続、静的リソースは認証をスキップ
    # 静的リソース（JS、CSS、画像など）へのアクセスは認証不要
    if (request.path.startswith('/api/') or 
        request.path == '/ws' or
        request.path.endswith(('.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.json')) or
        request.path.startswith('/assets/')):
        return await handler(request)
    
    # Authorization ヘッダーをチェック
    auth_header = request.headers.get('Authorization', '')
    
    # デバッグ: リクエストパスと認証ヘッダーの存在を確認
    logger.debug(f"[Auth] Request path: {request.path}")
    logger.debug(f"[Auth] Authorization header present: {bool(auth_header)}")
    
    if auth_header.startswith('Basic '):
        try:
            # Basic認証のデコード
            encoded_credentials = auth_header[6:]  # "Basic "の後の部分
            decoded = base64.b64decode(encoded_credentials).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            # デバッグ: 受信した認証情報を確認
            logger.debug(f"[Auth] Received username: {username}")
            logger.debug(f"[Auth] Expected username: {BASIC_AUTH_USERNAME}")
            logger.debug(f"[Auth] Password match: {password == BASIC_AUTH_PASSWORD}")
            
            # 認証情報の確認
            if username == BASIC_AUTH_USERNAME and password == BASIC_AUTH_PASSWORD:
                # 認証成功
                logger.debug(f"[Auth] Authentication successful for user: {username}")
                return await handler(request)
            else:
                logger.warning(f"[Auth] Authentication failed - username or password mismatch")
        except Exception as e:
            logger.error(f"[Auth] Error decoding authorization header: {e}")
    else:
        logger.debug(f"[Auth] No Basic auth header found")
    
    # 認証失敗
    return web.Response(
        text='Authentication required',
        status=401,
        headers={'WWW-Authenticate': 'Basic realm="Secure Area"'}
    )

# ミドルウェアを適用
app.middlewares.append(basic_auth_middleware)

# =====================================
# TTSエンドポイント
# =====================================

async def health_handler(request):
    """ヘルスチェックエンドポイント"""
    return web.json_response({
        'status': 'healthy',
        'service': 'JR Ticket System Backend'
    })

async def tts_synthesize_handler(request):
    """TTSテキスト合成エンドポイント"""
    if not HAS_TTS_SERVICE:
        return web.json_response(
            {'error': 'TTS service is not available'},
            status=503
        )
    
    try:
        # POSTデータを取得
        data = await request.json()
        text = data.get('text', '')
        voice_name = data.get('voiceName', 'Kore')
        language_code = data.get('languageCode', 'ja-JP')
        
        if not text:
            return web.json_response(
                {'error': 'Text is required'},
                status=400
            )
        
        logger.info(f"[TTS] Synthesizing: {text[:50]}... with voice: {voice_name}")
        
        # 音声合成を実行
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
                'Content-Length': str(len(audio_data))
            }
        )
    except ValueError as e:
        logger.error(f"[TTS] Validation error: {e}")
        return web.json_response({'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"[TTS] Error: {e}")
        return web.json_response({'error': str(e)}, status=500)

async def tts_voices_handler(request):
    """利用可能な音声リストを取得するエンドポイント"""
    if not HAS_TTS_SERVICE:
        return web.json_response(
            {'error': 'TTS service is not available'},
            status=503
        )
    
    try:
        voices = tts_service.get_available_voices()
        return web.json_response({'voices': voices})
    except Exception as e:
        logger.error(f"[TTS] Error getting voices: {e}")
        return web.json_response({'error': str(e)}, status=500)

# CORS設定
cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})

# WebSocketエンドポイント
async def websocket_handler(request):
    if not handle_client:
        logger.error("WebSocket handler not available - Gemini API configuration may be missing")
        return web.Response(text="WebSocket service unavailable", status=503)
    
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # 既存のhandle_client関数を使用
    try:
        await handle_client(ws)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await ws.close()
    
    return ws

# ルート設定
# WebSocketルート
ws_route = app.router.add_get('/ws', websocket_handler)
cors.add(ws_route)



# 環境変数を提供するAPIエンドポイント（常に登録）
async def config_handler(request):
    try:
        # デバッグ: 環境変数の取得状況をログ出力
        azure_speech_key = os.getenv('AZURE_SPEECH_KEY', '')
        logger.info(f"[Config API] AZURE_SPEECH_KEY exists: {bool(azure_speech_key)}")
        logger.info(f"[Config API] AZURE_SPEECH_REGION: {os.getenv('AZURE_SPEECH_REGION', 'japaneast')}")
        logger.info(f"[Config API] AZURE_OPENAI_ENDPOINT exists: {bool(os.getenv('AZURE_OPENAI_ENDPOINT'))}")
        
        # WebSocket URLの決定
        ws_url = os.getenv('WEBSOCKET_URL', '')
        if not ws_url:
            # デフォルト: 現在のホストを使用（ブラウザ側で判定）
            ws_url = ''  # 空の場合、フロントエンドで現在のホストを使用
        
        config = {
            'azure': {
                'speechSubscriptionKey': azure_speech_key,
                'speechRegion': os.getenv('AZURE_SPEECH_REGION', 'japaneast'),
                'openAIEndpoint': os.getenv('AZURE_OPENAI_ENDPOINT', ''),
                'openAIApiKey': os.getenv('AZURE_OPENAI_KEY', ''),
                'openAIDeployment': os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o'),
                'openAIDeploymentGpt4o': os.getenv('AZURE_OPENAI_DEPLOYMENT_GPT4O', 'gpt-4o'),
                'voiceName': os.getenv('AZURE_VOICE_NAME', 'ja-JP-NanamiNeural'),
                'openAIEastUsEndpoint': os.getenv('AZURE_OPENAI_EASTUS_ENDPOINT', ''),
                'openAIEastUsApiKey': os.getenv('AZURE_OPENAI_EASTUS_KEY', ''),
                'openAIEastUsDeployment': os.getenv('AZURE_OPENAI_EASTUS_DEPLOYMENT', 'gpt-5'),
                'openAIEastUsDeploymentGpt5': os.getenv('AZURE_OPENAI_EASTUS_DEPLOYMENT_GPT5', 'gpt-5'),
            },
            'cosmos': {
                'endpoint': os.getenv('COSMOS_ENDPOINT', ''),
                'key': os.getenv('COSMOS_KEY', '')
            },
            'google': {
                'projectId': os.getenv('GCP_PROJECT_ID', os.getenv('PROJECT_ID', 'formal-hybrid-424011-t0')),
                'accessToken': os.getenv('GOOGLE_ACCESS_TOKEN', ''),
                'geminiApiKey': os.getenv('GEMINI_API_KEY', ''),
                'ttsApiKey': os.getenv('GOOGLE_TTS_API_KEY', ''),  # Google Cloud TTS API Key
                'ttsProjectId': os.getenv('GOOGLE_TTS_PROJECT_ID', ''),  # Google Cloud TTS Project ID
                'ttsApiUrl': os.getenv('GOOGLE_TTS_API_URL', '/api/tts/synthesize'),  # TTS APIのURL
                'websocketUrl': ws_url  # WebSocket接続URL
            },
            'app': {
                'departureStation': os.getenv('DEPARTURE_STATION', '水戸'),
                'useTicketSystem': os.getenv('USE_TICKET_SYSTEM', 'false').lower() == 'true',
                'wsUrl': ws_url or os.getenv('WS_URL', ''),  # WebSocket URL（互換性のため）
                'apiUrl': os.getenv('API_URL', ''),  # API URL（必要に応じて）
            }
        }
        
        # デバッグ: 返却する設定の内容を確認
        logger.info(f"[Config API] Returning config with speechSubscriptionKey: {bool(config['azure']['speechSubscriptionKey'])}")
        
        return web.json_response(config)
    except Exception as e:
        logger.error(f"[Config API] Error occurred: {str(e)}", exc_info=True)
        return web.json_response(
            {'error': f'Failed to get configuration: {str(e)}'},
            status=500
        )

app.router.add_get('/api/config', config_handler)
app.router.add_get('/api/health', health_handler)
app.router.add_post('/api/tts/synthesize', tts_synthesize_handler)
app.router.add_get('/api/tts/voices', tts_voices_handler)

# APIルートにCORSを適用
for route in app.router.routes():
    if route.resource and route.resource.canonical.startswith('/api/'):
        cors.add(route)

# 静的ファイルの配信（フロントエンド）
static_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.exists(static_path):
    # index.htmlのパス
    index_path = os.path.join(static_path, 'index.html')
    
    # SPAのためのフォールバックハンドラー（すべてのHTMLリクエストをindex.htmlに）
    async def spa_handler(request):
        """SPAのルーティングをサポートするためのハンドラー"""
        # 静的ファイルのパスを構築
        file_path = os.path.join(static_path, request.path.lstrip('/'))
        
        # ファイルが実際に存在する場合（JS、CSS、画像など）
        if os.path.exists(file_path) and os.path.isfile(file_path):
            # 静的ファイルとして処理（aiohttp.webが処理）
            return web.FileResponse(file_path)
        
        # ファイルが存在しない、またはディレクトリの場合はindex.htmlを返す
        # これによりSPAのルーティングが機能する
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return web.Response(text=content, content_type='text/html')
        else:
            return web.Response(text="index.html not found", status=404)
    
    # 静的ファイルの配信（高優先度）
    app.router.add_static('/assets/', path=os.path.join(static_path, 'assets'), name='assets')
    
    # SPAのルートハンドラー（すべてのルートをキャッチ）
    # この順番が重要：先に静的ファイルを処理してから、残りをSPAハンドラーに
    app.router.add_get('/{path:.*}', spa_handler)
    
    logger.info(f"Serving static files from: {static_path}")
else:
    logger.warning(f"Static directory not found: {static_path}")
    # 開発環境用のフォールバック
    index_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>JR出札システム</title>
    </head>
    <body>
        <h1>JR出札システム</h1>
        <p>フロントエンドがビルドされていません。</p>
        <p>以下のコマンドを実行してください：</p>
        <pre>
cd frontend
npm install
npm run build
        </pre>
    </body>
    </html>
    """
    
    async def index_handler(request):
        return web.Response(text=index_html, content_type='text/html')
    
    app.router.add_get('/', index_handler)

# Gunicornから呼び出されるアプリケーションオブジェクト
application = app

if __name__ == '__main__':
    if not PROJECT_ID:
        logger.error("GOOGLE_CLOUD_PROJECT environment variable is not set")
        exit(1)
    
    logger.info(f"Project ID: {PROJECT_ID}")
    logger.info(f"Starting server on port {PORT}...")
    
    web.run_app(app, host='0.0.0.0', port=PORT)