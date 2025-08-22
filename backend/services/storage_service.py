import os
import logging
from datetime import datetime, timedelta
from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self, connection_string: str, container_name: str = "recordings"):
        """
        Azure Blob Storageサービスの初期化
        
        Args:
            connection_string: Azure Storage接続文字列
            container_name: 録音ファイルを保存するコンテナ名
        """
        self.connection_string = connection_string
        self.container_name = container_name
        self.blob_service_client = None
        self.container_client = None
        
        if connection_string:
            self._initialize_client()
    
    def _initialize_client(self):
        """Blob Storageクライアントを初期化"""
        try:
            self.blob_service_client = BlobServiceClient.from_connection_string(
                self.connection_string
            )
            self.container_client = self.blob_service_client.get_container_client(
                self.container_name
            )
            
            # コンテナが存在しない場合は作成
            if not self.container_client.exists():
                self.container_client.create_container()
                logger.info(f"Created container: {self.container_name}")
            
        except Exception as e:
            logger.error(f"Failed to initialize storage client: {e}")
            raise
    
    def upload_recording(
        self, 
        audio_data: bytes, 
        conversation_id: str,
        file_extension: str = "webm"
    ) -> Tuple[str, str]:
        """
        録音データをAzure Storageにアップロード
        
        Args:
            audio_data: 録音データ（バイト列）
            conversation_id: 会話ID
            file_extension: ファイル拡張子
            
        Returns:
            (blob_url, sas_token): BlobのURLとSASトークンのタプル
        """
        if not self.container_client:
            raise Exception("Storage client not initialized")
        
        try:
            # ファイル名を生成（会話IDとタイムスタンプを使用）
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            blob_name = f"{conversation_id}_{timestamp}.{file_extension}"
            
            # Blobクライアントを取得
            blob_client = self.container_client.get_blob_client(blob_name)
            
            # データをアップロード
            blob_client.upload_blob(audio_data, overwrite=True)
            logger.info(f"Uploaded recording: {blob_name}")
            
            # SASトークンを生成（24時間有効）
            sas_token = self.generate_sas_token(blob_name, hours_valid=24)
            
            # BlobのURLを取得
            blob_url = blob_client.url.split('?')[0]  # SASトークンなしのURL
            
            return blob_url, sas_token
            
        except Exception as e:
            logger.error(f"Failed to upload recording: {e}")
            raise
    
    def generate_sas_token(
        self, 
        blob_name: str, 
        hours_valid: int = 24
    ) -> str:
        """
        BlobへのアクセスのためのSASトークンを生成
        
        Args:
            blob_name: Blob名
            hours_valid: トークンの有効時間（時間単位）
            
        Returns:
            SASトークン文字列
        """
        if not self.blob_service_client:
            raise Exception("Storage client not initialized")
        
        try:
            # SASトークンの有効期限を設定
            start_time = datetime.utcnow()
            expiry_time = start_time + timedelta(hours=hours_valid)
            
            # SASトークンを生成（読み取り権限のみ）
            # 接続文字列からアカウント名とキーを抽出
            account_name = None
            account_key = None
            for part in self.connection_string.split(';'):
                if part.startswith('AccountName='):
                    account_name = part.split('=', 1)[1]
                elif part.startswith('AccountKey='):
                    account_key = part.split('=', 1)[1]
            
            if not account_name or not account_key:
                raise Exception("Failed to extract account name or key from connection string")
            
            sas_token = generate_blob_sas(
                account_name=account_name,
                container_name=self.container_name,
                blob_name=blob_name,
                account_key=account_key,
                permission=BlobSasPermissions(read=True),
                expiry=expiry_time,
                start=start_time
            )
            
            return sas_token
            
        except Exception as e:
            logger.error(f"Failed to generate SAS token: {e}")
            raise
    
    def delete_recording(self, blob_name: str) -> bool:
        """
        録音ファイルを削除
        
        Args:
            blob_name: 削除するBlob名
            
        Returns:
            削除成功の場合True
        """
        if not self.container_client:
            raise Exception("Storage client not initialized")
        
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_client.delete_blob()
            logger.info(f"Deleted recording: {blob_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete recording: {e}")
            return False
    
    def get_recording_url_with_sas(
        self, 
        blob_name: str, 
        hours_valid: int = 24
    ) -> str:
        """
        SASトークン付きの録音ファイルURLを取得
        
        Args:
            blob_name: Blob名
            hours_valid: トークンの有効時間
            
        Returns:
            SASトークン付きの完全なURL
        """
        if not self.container_client:
            raise Exception("Storage client not initialized")
        
        blob_client = self.container_client.get_blob_client(blob_name)
        base_url = blob_client.url.split('?')[0]
        sas_token = self.generate_sas_token(blob_name, hours_valid)
        
        return f"{base_url}?{sas_token}"