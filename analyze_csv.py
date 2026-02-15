"""
設備情報CSVからユニークな値を抽出する調査スクリプト

setupDatabase.gs のプルダウン(入力規則)定義と、実際のCSVデータの乖離を
確認するために、選択肢になりそうなカラムのユニーク値を一覧表示する。
"""

import csv
import sys

# CSVファイルのパス
CSV_PATH = r"j:\マイドライブ\Antigravityテスト\水インフラ管理システム\raw_data\取り扱いデータ - 設備情報.csv"

# 調査対象カラム（設備種別・状態・保全区分・分類等、選択肢になりそうな列）
TARGET_COLUMNS = [
    '大分類',
    '中分類',
    '小分類',
    '診断形式',
    '設備形式',
    '保全区分',
    '状態',
    '単位',
    'デフレータ区分',
    '集約方法',
    # 機器セクション（ヘッダー後半）の対応カラム
    '機器種別',
    '登録区分',
]

def analyze_csv():
    """CSVを読み込み、対象カラムのユニーク値を抽出する"""
    
    # エンコーディングをいくつか試す
    encodings = ['utf-8', 'utf-8-sig', 'shift_jis', 'cp932']
    
    rows = None
    headers = None
    used_encoding = None
    
    for enc in encodings:
        try:
            with open(CSV_PATH, 'r', encoding=enc) as f:
                reader = csv.reader(f)
                headers = next(reader)
                rows = list(reader)
                used_encoding = enc
                break
        except (UnicodeDecodeError, UnicodeError):
            continue
    
    if rows is None:
        print("エラー: CSVファイルを読み込めませんでした。")
        sys.exit(1)
    
    print(f"=== 設備情報CSV 調査レポート ===")
    print(f"使用エンコーディング: {used_encoding}")
    print(f"総データ行数: {len(rows)}")
    print(f"総カラム数: {len(headers)}")
    print()
    
    # まず全ヘッダーを表示（番号付き）
    print("--- 全カラム一覧 ---")
    for i, h in enumerate(headers):
        print(f"  [{i}] {h}")
    print()
    
    # 対象カラムのユニーク値を抽出
    print("=" * 60)
    print("=== 選択肢候補カラムのユニーク値 ===")
    print("=" * 60)
    
    # 重複カラム名があるため、全ヘッダーからインデックスを作成
    # (同名カラムが前半(設備)と後半(機器)に存在する可能性あり)
    for target in TARGET_COLUMNS:
        # ヘッダー内で該当カラムのインデックスを全て検索
        indices = [i for i, h in enumerate(headers) if h == target]
        
        if not indices:
            print(f"\n▶ 【{target}】 ← カラムが見つかりません")
            continue
        
        for idx in indices:
            unique_values = set()
            for row in rows:
                if idx < len(row):
                    val = row[idx].strip()
                    if val:  # 空文字は除外
                        unique_values.add(val)
            
            sorted_values = sorted(unique_values)
            position = "前半(設備)" if idx < len(headers) // 2 else "後半(機器)"
            print(f"\n▶ 【{target}】 (列[{idx}], {position})")
            print(f"  ユニーク値数: {len(sorted_values)}")
            for v in sorted_values:
                print(f"    - {v}")
    
    # setupDatabase.gs との比較情報
    print()
    print("=" * 60)
    print("=== setupDatabase.gs のプルダウン定義（参考） ===")
    print("=" * 60)
    print()
    print("M_Equipment.Type:    ['機械', '電気', '計装', '管路']")
    print("M_Equipment.Status:  ['稼働中', '停止中', '故障中', '廃棄']")
    print("M_Equipment.Maintenance_Type: (プルダウン未定義)")

if __name__ == '__main__':
    analyze_csv()
