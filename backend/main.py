import asyncio
import json
import os
from typing import Optional
import logging

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol
from google.oauth2 import service_account
from google.auth.transport.requests import Request

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数から設定を読み込み
HOST = os.getenv("GEMINI_HOST", "us-central1-aiplatform.googleapis.com")
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
PORT = int(os.getenv("PORT", "8080"))
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "")
SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

DEBUG = os.getenv("DEBUG", "false").lower() == "true"


class GeminiProxy:
    """Gemini Live APIへのプロキシクラス"""
    
    def __init__(self):
        self.credentials = None
        self.access_token = None
        self._init_credentials()
    
    def _init_credentials(self):
        """サービスアカウントからクレデンシャルを初期化"""
        service_account_path = SERVICE_ACCOUNT_FILE
        if service_account_path and not os.path.isabs(service_account_path):
            service_account_path = os.path.join(os.path.dirname(__file__), service_account_path)
        
        if service_account_path and os.path.exists(service_account_path):
            self.credentials = service_account.Credentials.from_service_account_file(
                service_account_path,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            logger.info("Service account credentials loaded")
        else:
            logger.warning("No service account file found. Using default credentials.")
    
    def get_access_token(self) -> str:
        """アクセストークンを取得（必要に応じてリフレッシュ）"""
        if self.credentials:
            if not self.credentials.valid:
                self.credentials.refresh(Request())
            return self.credentials.token
        return ""


proxy = GeminiProxy()


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """クライアント接続を処理"""
    logger.info("New client connection...")
    
    try:
        # サーバー側でアクセストークンを取得
        access_token = proxy.get_access_token()
        if not access_token:
            logger.error("Failed to get access token")
            await client_websocket.close(code=1008, reason="Authentication failed")
            return
        
        # サンプルと同じように、単純なプロキシとして動作
        await create_proxy(client_websocket, access_token)
            
    except Exception as e:
        logger.error(f"Error handling client: {e}")
        await client_websocket.close(code=1011, reason="Internal server error")


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str
) -> None:
    """
    サンプルと同じプロキシ実装
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    async with websockets.connect(
        SERVICE_URL, additional_headers=headers
    ) as server_websocket:
        client_to_server_task = asyncio.create_task(
            proxy_task(client_websocket, server_websocket)
        )
        server_to_client_task = asyncio.create_task(
            proxy_task(server_websocket, client_websocket)
        )
        await asyncio.gather(client_to_server_task, server_to_client_task)


async def proxy_task(
    client_websocket: WebSocketCommonProtocol, server_websocket: WebSocketCommonProtocol
) -> None:
    """
    サンプルと同じメッセージ転送
    """
    async for message in client_websocket:
        try:
            data = json.loads(message)
            if DEBUG:
                logger.debug(f"proxying: {data}")
            await server_websocket.send(json.dumps(data))
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    await server_websocket.close()


async def main() -> None:
    """WebSocketサーバーを起動"""
    if not PROJECT_ID:
        logger.error("GOOGLE_CLOUD_PROJECT environment variable is not set")
        return
    
    logger.info(f"Project ID: {PROJECT_ID}")
    logger.info(f"Starting WebSocket server on port {PORT}...")
    
    async with websockets.serve(handle_client, "0.0.0.0", PORT):
        logger.info(f"WebSocket server running on ws://localhost:{PORT}")
        await asyncio.Future()  # 永続的に実行


if __name__ == "__main__":
    asyncio.run(main())