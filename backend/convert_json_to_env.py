#!/usr/bin/env python3
"""
Google Cloud認証JSONファイルを環境変数用の1行文字列に変換するスクリプト
"""
import json
import sys

def convert_json_to_env(json_file_path):
    """JSONファイルを読み込んで環境変数用の文字列に変換"""
    try:
        with open(json_file_path, 'r') as f:
            data = json.load(f)
        
        # コンパクトなJSON文字列に変換
        env_value = json.dumps(data, separators=(',', ':'))
        
        print("環境変数 GOOGLE_CREDENTIALS_JSON に以下の値を設定してください：")
        print("=" * 80)
        print(env_value)
        print("=" * 80)
        
        # 検証のため、逆変換できるか確認
        test = json.loads(env_value)
        print(f"\n✅ 検証成功: {len(test)} 個のキーを含むJSONです")
        print(f"   - project_id: {test.get('project_id')}")
        print(f"   - client_email: {test.get('client_email')}")
        
        # Azure App Service用のコマンド例
        print("\nAzure App Service CLI での設定例:")
        print(f'az webapp config appsettings set --name <app-name> --resource-group <resource-group> --settings GOOGLE_CREDENTIALS_JSON="{env_value}"')
        
    except FileNotFoundError:
        print(f"エラー: ファイル '{json_file_path}' が見つかりません")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"エラー: JSONファイルの解析に失敗しました: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"エラー: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("使用法: python convert_json_to_env.py <path-to-json-file>")
        print("例: python convert_json_to_env.py formal-hybrid-424011-t0-cb2529a8c33e.json")
        sys.exit(1)
    
    convert_json_to_env(sys.argv[1])
