# データ移行設計書 (migration_design.md)

本ドキュメントは、`raw_data/` フォルダ内の CSV データを、現在の Google Apps Script (GAS) システムに欠落なく取り込むための移行設計案です。

---

## 1. 設備データのギャップ分析と拡張案

### 現状 (M_Equipment) と raw_data の差異
現在の `M_Equipment` は最小限の項目（ID, 施設, 名称, 型式, 状態, 設置日, QR）のみを管理しています。取り込み対象の CSV には、資産管理や維持保全に不可欠な以下の項目が含まれています。

| 分類 | 追加すべき項目例 (CSVヘッダーより) |
| :--- | :--- |
| **詳細設置場所** | 棟屋, フロア, 部屋 |
| **分類体系** | 大分類, 中分類, 小分類 |
| **仕様詳細** | 形式, 型番, 製造番号, 仕様概要1〜3 |
| **耐用年数管理** | 地方公営企業法耐用年数, 標準耐用年数, 目標耐用年数, 最長使用年度 |
| **業者情報** | 製造会社, 施工業者 |
| **資産管理** | 資産管理番号, 保全区分 |

### 拡張案: `setupDatabase.gs` の変更
`createMEquipment` 関数を更新し、以下のカラムを追加・再定義します。

```javascript
// 追加するヘッダーのイメージ
var headers = [
  'Equipment_ID', 'Facility_ID', 'Name', 'Type', 'Status', 
  'Building', 'Floor', 'Room', 'Category_Major', 'Category_Middle', 'Category_Minor', 
  'Model_Number', 'Serial_Number', 'Spec_1', 'Spec_2', 'Spec_3',
  'Installation_Date', 'Operation_Start_Date', 'Legal_Lifespan', 'Standard_Lifespan',
  'Manufacturer', 'Contractor', 'Asset_No', 'Maintenance_Type', 'QR_Code'
];
```

---

## 2. 点検データの構造改革案

### 現在の課題
現状の `M_Inspection_Routes` は「ルート名称」と「設備リスト (IDをカンマ区切り)」のみを保持するフラットな構造です。CSVが持つ「5階層構造」と「点検項目ごとのしきい値」を表現できません。

### 構造改革案: `M_Inspection_Hierarchy` の新設
単一のルート定義ではなく、以下の階層を持つテーブル構造に刷新します。

1. **ワークグループ**: 管理の最上位（例: 汚泥処理、水質管理）
2. **作業場所 (Route)**: 従来のルートに相当。
3. **対象グループ (Area)**: 建物内の特定の区画や設備群。
4. **点検対象 (Equipment)**: `M_Equipment` と紐づく。
5. **点検項目 (Task)**: 具体的な点検内容（目視、圧力値など）。

### 保持すべき詳細な属性 (CSVより)
- **点検タイプ**: 数値入力、選択肢、写真のみ等。
- **しきい値**: 上限値、下限値。
- **単位**: MPa, ℃, % など。
- **異常時指示**: 異常時の対処メッセージ。

---

## 3. GASによるデータ移行ロジックの概要

### 設計方針
`raw_data/` フォルダは GitHub へのアップロードから除外されているため、GAS側から直接アクセスするには「Google ドライブ上の特定のフォルダ」に CSV を配置し、それを読み込む方式を提案します。

### 処理フロー (移行用関数の設計)
1. **CSVファイルの取得**: 指定したフォルダIDから `DriveApp` を使用して CSV ファイル（設備情報、点検情報）を取得。
2. **パース処理**:
   - `Utilities.parseCsv()` を利用（※Shift-JISの場合は一旦 Blob を作成し、charset変換を行う）。
3. **データクレンジング**:
   - `Facility_ID` や `Org_ID` など、既存マスタとの整合性チェック。
   - 重複レコードの排除。
4. **スプレッドシートへの展開**:
   - `setValues()` を用いた一括書き込み（実行速度の最適化）。
   - 既存の `setupDatabase.gs` のユーティリティ（`createSheet_` 等）を再利用。

### 実装予定の関数
- `migrateEquipmentData()`: 設備情報のインポート。
- `migrateInspectionTree()`: 階層構造を持つ点検マスタの構築。
- `readCsvFromDrive(fileName)`: ドライブ上の CSV を読み取る共通ヘルパー。

---

## 次のステップ
ユーザー様からの承認をいただいた後、以下の順序で実装を進めます。
1. `setupDatabase.gs` のスキーマ定義更新。
2. `migration_logic.gs` (新規) における移行関数の実装。
3. 実際の CSV ファイルを Google ドライブにアップロードしての移行テスト。
