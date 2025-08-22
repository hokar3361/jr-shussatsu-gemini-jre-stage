# jr-shussatsu-gemini

Gemini Live APIを使用した音声対話システムです。

## プロジェクト構成

```
.
├── frontend/          # React + TypeScript + Vite フロントエンド
├── backend/           # Node.js + TypeScript バックエンド
├── examples/          # サンプル実装
└── sow/              # 作業記録

```

## セットアップ

### 前提条件

- Node.js 18以上
- Google Cloud Project
- Gemini API アクセス権限

### バックエンドのセットアップ

1. 依存関係のインストール
```bash
cd backend
npm install
```

2. 環境変数の設定
```bash
cp .env.example .env
```

`.env`ファイルを編集:
```
PORT=8080
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
```

3. サービスアカウントの設定
- Google Cloud ConsoleでサービスアカウントをCreate
- 必要な権限を付与 (Vertex AI User)
- JSONキーをダウンロードして指定したパスに配置

4. 開発サーバーの起動
```bash
npm run dev
```

### フロントエンドのセットアップ

1. 依存関係のインストール
```bash
cd frontend
npm install
```

2. 環境変数の設定
```bash
cp .env.example .env
```

3. 開発サーバーの起動
```bash
npm run dev
```

## 使い方

### 起動方法（Windows）
```bash
# プロジェクトルートで実行
start-servers.bat
```

### 起動方法（Mac/Linux）
```bash
# ターミナル1
cd backend
npm run dev

# ターミナル2
cd frontend
npm run dev
```

1. バックエンドとフロントエンドの両方を起動
2. ブラウザで http://localhost:5173 にアクセス
3. マイクボタンをクリックして録音開始
4. 話した内容がGeminiに送信され、音声で返答されます

## アーキテクチャ

- **フロントエンド**: React + TypeScript
  - WebSocketでバックエンドと通信
  - Web Audio APIで音声録音・再生
  
- **バックエンド**: Node.js + TypeScript
  - WebSocketサーバー
  - Google認証
  - Gemini Live APIとの通信

## セキュリティ

- APIキーはバックエンドで管理
- WebSocket通信でフロントエンドとバックエンドを分離
- 環境変数で機密情報を管理