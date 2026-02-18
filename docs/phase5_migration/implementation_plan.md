# 実装計画: フェーズ5 - スマート現場機能の段階的導入 (Step 3: 物品・点検ルート) (完了)

## 概要
Google Sheetsをバックエンドとし、設備管理、人材管理、点検記録などの基幹業務を「現場で使いやすい」UI/UXで提供するための移行プロジェクト。
Step 3では、物品管理（共通・施設別在庫）と点検ルート管理（点検順序設定）の実装、および既存機能（設備・人材・組織・資格）のUI/UX改善と統合作業を実施。

## 完了したタスク
- [x] **物品管理機能 (Inventory Management)**
  - [x] 共通在庫と施設別在庫のタブ分け表示
  - [x] 在庫状況（現在庫数、単位、カテゴリ）のグリッド表示
  - [x] 入出庫記録機能（入庫・出庫・棚卸のログ記録と在庫数更新）
  - [x] 新規物品登録モーダル（共通・施設別）

- [x] **点検ルート管理機能 (Inspection Route Management)**
  - [x] 点検ルート一覧のカード表示（ルート名、ID、対象設備数）
  - [x] ルート編集モーダル実装
    - [x] ルート名の編集
    - [x] 点検対象設備の検索・追加機能
    - [x] ドラッグ＆ドロップ（または矢印ボタン）による点検順序の並べ替え
    - [x] データの保存（ルート定義と詳細順序の一括保存）

- [x] **UI/UXの改善と復元 (UI Restoration & Enhancement)**
  - [x] **設備管理 (Equipment Management)**
    - [x] 3ペイン構成（ツリー、詳細/一覧、タイムライン）の完全復元
    - [x] 設備カードのリッチ化（ID、メーカー、型番、設置日、ステータスバッジ）
  - [x] **人材管理 (Staff Management)**
    - [x] 職員カードのリッチ化（ID、役職、雇用形態、所属組織）
    - [x] 登録/編集モーダルの全項目復活（フリガナ、メール、電話番号、役職、雇用形態など）
  - [x] **組織管理 (Organizations)**
    - [x] 閲覧ビューの再実装（テーブル形式での一覧表示）
    - [x] 登録/編集モーダルの実装
  - [x] **資格管理 (Qualifications)**
    - [x] 閲覧ビューの再実装（リスト形式）
    - [x] 登録/編集モーダルの実装
  - [x] **ダッシュボード (Dashboard)**
    - [x] 施設ごとの統計データ（点検ルート数など）の表示復元

- [x] **バックエンド (Code.gs)**
  - [x] `saveData` の汎用化とID自動採番ロジックの強化（`M_Inspection_Routes`, `M_Route_Details` 等に対応）
  - [x] `saveRouteDetails`（ルート詳細の一括更新）の実装
  - [x] `recordInventoryMove`（在庫移動ログ記録とM_Items更新）の実装
  - [x] キャッシュクリア (`clearAllCache`) の改善

## 技術的要件
- **Frontend**: Vue.js 3 (CDN), CSS Variables for theming (Material Design inspired)
- **Backend**: Google Apps Script (GAS)
- **Database**: Google Sheets (Multi-file architecture: Master DB + Facility DBs)

## 次のステップ (Step 4以降)
- [ ] **点検記録 (Inspection Log)**
  - [ ] 点検ルートに基づいた点検実施画面の実装（写真添付、判定入力）
  - [ ] 報告書作成機能
- [ ] **不具合管理 (Issue Tracking)**
  - [ ] 不具合報告、ステータス管理、対応履歴
- [ ] **オフライン対応 (PWA化の検討)**
