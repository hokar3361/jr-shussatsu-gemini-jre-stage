from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import os
import logging
from typing import Optional
from ..services.storage_service import StorageService

logger = logging.getLogger(__name__)
router = APIRouter()

# Azure Storage設定を環境変数から取得
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "recordings")

# StorageServiceのインスタンス
storage_service = None

if AZURE_STORAGE_CONNECTION_STRING:
    try:
        storage_service = StorageService(
            connection_string=AZURE_STORAGE_CONNECTION_STRING,
            container_name=AZURE_STORAGE_CONTAINER
        )
        logger.info("Storage service initialized")
    except Exception as e:
        logger.error(f"Failed to initialize storage service: {e}")

class UploadRecordingRequest(BaseModel):
    conversation_id: str
    audio_data: str  # Base64エンコードされた音声データ

class UploadRecordingResponse(BaseModel):
    storage_url: str
    sas_token: str

@router.post("/upload-recording", response_model=UploadRecordingResponse)
async def upload_recording(request: UploadRecordingRequest):
    """録音データをAzure Storageにアップロード"""
    
    if not storage_service:
        raise HTTPException(
            status_code=503,
            detail="Storage service not available"
        )
    
    try:
        # Base64データをバイト列に変換
        import base64
        audio_bytes = base64.b64decode(request.audio_data)
        
        # Azure Storageにアップロード
        blob_url, sas_token = storage_service.upload_recording(
            audio_data=audio_bytes,
            conversation_id=request.conversation_id,
            file_extension="webm"
        )
        
        return UploadRecordingResponse(
            storage_url=blob_url,
            sas_token=sas_token
        )
        
    except Exception as e:
        logger.error(f"Failed to upload recording: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload recording: {str(e)}"
        )

@router.post("/upload-recording-file")
async def upload_recording_file(
    conversation_id: str,
    file: UploadFile = File(...)
):
    """録音ファイルを直接アップロード（マルチパートフォーム）"""
    
    if not storage_service:
        raise HTTPException(
            status_code=503,
            detail="Storage service not available"
        )
    
    try:
        # ファイルの内容を読み取る
        audio_bytes = await file.read()
        
        # ファイル拡張子を取得
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'webm'
        
        # Azure Storageにアップロード
        blob_url, sas_token = storage_service.upload_recording(
            audio_data=audio_bytes,
            conversation_id=conversation_id,
            file_extension=file_extension
        )
        
        return {
            "storage_url": blob_url,
            "sas_token": sas_token
        }
        
    except Exception as e:
        logger.error(f"Failed to upload recording file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload recording: {str(e)}"
        )

class GenerateSasTokenRequest(BaseModel):
    blob_name: str
    hours_valid: Optional[int] = 24

class GenerateSasTokenResponse(BaseModel):
    sas_token: str
    full_url: str

@router.post("/generate-sas-token", response_model=GenerateSasTokenResponse)
async def generate_sas_token(request: GenerateSasTokenRequest):
    """既存の録音ファイルに対して新しいSASトークンを生成"""
    
    if not storage_service:
        raise HTTPException(
            status_code=503,
            detail="Storage service not available"
        )
    
    try:
        sas_token = storage_service.generate_sas_token(
            blob_name=request.blob_name,
            hours_valid=request.hours_valid
        )
        
        full_url = storage_service.get_recording_url_with_sas(
            blob_name=request.blob_name,
            hours_valid=request.hours_valid
        )
        
        return GenerateSasTokenResponse(
            sas_token=sas_token,
            full_url=full_url
        )
        
    except Exception as e:
        logger.error(f"Failed to generate SAS token: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SAS token: {str(e)}"
        )