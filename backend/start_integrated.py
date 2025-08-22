"""
統合サーバー起動スクリプト
既存のWebSocketサーバーとGoogle Cloud TTSを同時に起動
"""
import os
import sys
import asyncio
import threading
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import uvicorn
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

# 既存のバックエンドコードをインポート
# from main import your_existing_websocket_handler  # 既存のWebSocket処理があれば

# Google Cloud TTSサービスをインポート
from google_cloud_tts import GoogleCloudTTSService

# FastAPIアプリケーション
app = FastAPI(title="JR Ticket System Integrated API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174", 
        "http://localhost:3000",
        "https://your-frontend-domain.com"  # 本番環境のドメイン
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TTSサービスの初期化
tts_service = GoogleCloudTTSService()

# =====================================
# データモデル
# =====================================

class TTSSynthesizeRequest(BaseModel):
    text: str
    voiceName: Optional[str] = 'Kore'
    languageCode: Optional[str] = 'ja-JP'

# =====================================
# TTS APIエンドポイント
# =====================================

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "Integrated Server (Python)",
        "features": ["Google Cloud TTS", "WebSocket"],
        "tts_provider": "Google Cloud Chirp 3 HD"
    }

@app.get("/api/config")
async def get_config():
    """設定情報を提供するエンドポイント"""
    try:
        # WebSocket URLの決定
        # 本番環境では環境変数から、ローカルではデフォルト値を使用
        ws_url = os.getenv('WEBSOCKET_URL', '')
        if not ws_url:
            # デフォルト: 現在のホストを使用（ブラウザ側で判定）
            ws_url = ''  # 空の場合、フロントエンドで現在のホストを使用
        
        return {
            'azure': {
                'speechSubscriptionKey': os.getenv('AZURE_SPEECH_KEY', ''),
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
            'storage': {
                'connectionString': os.getenv('AZURE_STORAGE_CONNECTION_STRING', ''),
                'container': os.getenv('AZURE_STORAGE_CONTAINER', 'recordings')
            },
            'google': {
                'projectId': os.getenv('GCP_PROJECT_ID', os.getenv('PROJECT_ID', 'formal-hybrid-424011-t0')),
                'accessToken': os.getenv('GOOGLE_ACCESS_TOKEN', ''),
                'geminiApiKey': os.getenv('GEMINI_API_KEY', ''),
                'ttsApiKey': os.getenv('GOOGLE_TTS_API_KEY', ''),
                'ttsProjectId': os.getenv('GOOGLE_TTS_PROJECT_ID', ''),
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to get configuration: {str(e)}')

@app.post("/api/tts/synthesize")
async def synthesize_speech(request: TTSSynthesizeRequest):
    try:
        print(f"[TTS] Synthesizing: {request.text[:50]}... with voice: {request.voiceName}")
        
        audio_data = tts_service.synthesize_speech(
            text=request.text,
            voice_name=request.voiceName,
            language_code=request.languageCode
        )
        
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "Content-Length": str(len(audio_data))
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[TTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tts/voices")
async def get_voices():
    return {"voices": tts_service.get_available_voices()}

# =====================================
# 既存のWebSocketサーバーとの統合
# =====================================

def run_existing_websocket_server():
    """既存のPython WebSocketサーバーを別スレッドで実行"""
    # 既存のmain.pyやapp.pyを実行
    # import main
    # main.run()
    pass

# =====================================
# メイン起動処理
# =====================================

def main():
    """メインエントリーポイント"""
    
    # 既存のWebSocketサーバーを別スレッドで起動（必要な場合）
    # ws_thread = threading.Thread(target=run_existing_websocket_server)
    # ws_thread.daemon = True
    # ws_thread.start()
    
    # FastAPIサーバーを起動
    port = int(os.environ.get("PORT", 3001))
    
    print(f"""
    ========================================
    Integrated Server Starting
    ========================================
    Port: {port}
    TTS API: http://localhost:{port}/api/tts/synthesize
    Voices: http://localhost:{port}/api/tts/voices
    Health: http://localhost:{port}/api/health
    ========================================
    """)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    main()