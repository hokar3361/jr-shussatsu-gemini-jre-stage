"""
統合サーバー（Python版）
WebSocketとGoogle Cloud TTS APIを1つのプロセスで提供
Azure App Service用
"""
import os
import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from google_cloud_tts import GoogleCloudTTSService
from routers import storage

# FastAPIアプリケーション
app = FastAPI(title="JR Ticket System API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切に制限
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Google Cloud TTSサービスのインスタンス
tts_service = GoogleCloudTTSService()

# ルーターを登録
app.include_router(storage.router, prefix="/api/storage", tags=["storage"])

# =====================================
# データモデル
# =====================================

class TTSSynthesizeRequest(BaseModel):
    text: str
    voiceName: Optional[str] = 'Kore'
    languageCode: Optional[str] = 'ja-JP'

# =====================================
# HTTP エンドポイント
# =====================================

@app.get("/api/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {
        "status": "ok",
        "service": "Integrated Python Server",
        "features": ["Google Cloud TTS", "WebSocket"]
    }

@app.post("/api/tts/synthesize")
async def synthesize_speech(request: TTSSynthesizeRequest):
    """
    テキストから音声を合成
    
    Args:
        request: 音声合成リクエスト
        
    Returns:
        WAV形式の音声データ
    """
    try:
        # 音声合成
        audio_data = tts_service.synthesize_speech(
            text=request.text,
            voice_name=request.voiceName,
            language_code=request.languageCode
        )
        
        # WAVファイルとして返す
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")

@app.get("/api/tts/voices")
async def get_voices():
    """利用可能な音声のリストを取得"""
    return {
        "voices": tts_service.get_available_voices()
    }

# =====================================
# WebSocket エンドポイント
# =====================================

class ConnectionManager:
    """WebSocket接続管理"""
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocketエンドポイント
    既存のPython WebSocketサーバーの機能をここに統合可能
    """
    await manager.connect(websocket)
    try:
        while True:
            # クライアントからのメッセージを受信
            data = await websocket.receive_text()
            
            # TODO: 既存のWebSocket処理ロジックをここに統合
            # 例: Gemini APIとの通信、音声処理など
            
            # エコーバック（テスト用）
            await manager.send_message(f"Echo: {data}", websocket)
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        manager.disconnect(websocket)

# =====================================
# 既存のPythonコードとの統合
# =====================================

# 既存のmain.pyやapp.pyのインポートと統合が可能
# 例:
# from main import existing_websocket_handler
# from app import gemini_api_handler

# =====================================
# サーバー起動
# =====================================

if __name__ == "__main__":
    import uvicorn
    
    # Azure App Serviceはポート8000を使用
    port = int(os.environ.get("PORT", 8000))
    
    # サーバー起動
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )