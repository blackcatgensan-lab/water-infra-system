# 実装計画: 起動プロセスの軽量化とオンデマンドロード

## 1. サーバーサイド (Code.gs)
### 初期データ取得 (`getInitialData`)
- **変更前**: 全データ（一部施設固有データ含む可能性あり）を一括取得。
- **変更後**: 共通マスタのみを取得。
  - `M_Facilities`
  - `M_Organizations`
  - `M_Staff`
  - `M_Contracts`, `M_Qualifications`, `M_Items_Common` 等
  - **重要**: `M_Equipment` や `T_Inspection_Results` は一切含めない。

### 施設データ取得 (`getFacilityData`)
- **機能**: 指定された `facilityId` に紐づく全固有データを取得。
- **実装**:
  - `getEquipment(facilityId)`: ロケーション・設備情報の結合（ハイブリッドロジック）。
  - 各種マスタ（アイテム、点検項目、ルート）の個別取得。
  - 6時間キャッシュは `setCurrentFacility` 内で管理。

## 2. クライアントサイド (index.html)
### Vueライフサイクル (`onMounted`)
- `getInitialData` を呼び出し。
- `facilities`, `staff`, `organizations` を初期化。
- `equipment`, `inspectionRoutes` 等は空配列で初期化。
- `loading` ステートを管理し、スピナーを表示。

### 施設選択処理 (`loadFacilityData`)
- プルダウンまたはダッシュボードから施設を選択した際に発火。
- `loading` ステートを `true` に設定し、UIブロック（オーバーレイ）。
- `getFacilityData` を呼び出し、結果をVueインスタンスに反映。
- `equipment` 更新後、`treeData` や `statusCounts` 等の算出プロパティが自動更新されることを確認。

### エンプティステート
- 施設未選択時は「設備管理」「点検ルート」画面で「施設を選択してください」と表示し、不用意なエラー（`undefined`参照）を防ぐ。
