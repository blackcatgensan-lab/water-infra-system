# 上下水道施設維持管理システム 統合DB設計仕様書 (Ver.2.1)

## 1. 全体設計方針 (Architecture Policy)
*   **Asset-Centric Design (設備中心設計):** すべてのデータ（点検、工事、在庫）は「設備ID (Equipment_ID)」をハブとして連携する。SmartGEMBAのような場所起点のツリー構造は採用しない。
*   **Hybrid Structure:**
    *   **Frontend A (Field):** AppSheet (オフライン対応、バーコードスキャン重視)
    *   **Frontend B (Office):** GAS + HTML/Vue.js (Blitz GROW風の3ペイン構成、SmartHR風の人材カード)
    *   **Backend:** Google Sheets (Single Source of Truth)

## 2. データベース定義 (Schema Definition)
※各テーブルの主キーには必ず `UNIQUEID()` を初期値として設定すること。

### 2.1 資産管理 (Asset Management - Blitz GROW Model)
階層構造：施設 (Facility) > 設備 (Equipment) > 機器 (Device)

**Table: M_Facilities (施設マスタ)**
*   `Facility_ID` (Key, Text): 命名規則 F-xxx
*   `Name` (Text): 施設名称 (例: 中央浄水場)
*   `Address` (Address): 住所
*   `Map_Link` (Url): Googleマップリンク

**Table: M_Equipment (設備マスタ - The HUB)**
*   `Equipment_ID` (Key, Text): 命名規則 E-xxx
*   `Facility_ID` (Ref): M_Facilities への参照 (IsPartOf: Yes)
*   `Name` (Text): 設備名称 (例: 1号沈殿池、送水ポンプ)
*   `Type` (Enum): 機械, 電気, 計装, 管路
*   `Status` (Enum): 稼働中, 停止中, 故障中, 廃棄
*   `Installation_Date` (Date): 設置日 (タイムライン起点)
*   `QR_Code` (Text): 現場スキャン用コード

### 2.2 点検管理 (Inspection - Flexible Route Model)
固定ツリーではなく、任意の設備を束ねて「ルート」を作る。

**Table: M_Inspection_Routes (点検ルート定義)**
*   `Route_ID` (Key, Text)
*   `Route_Name` (Text): ルート名 (例: 月曜ポンプ巡回)
*   `Target_Equipment_List` (EnumList, Ref): M_Equipment への参照リスト

**Table: T_Inspection_Results (点検実績)**
*   `Result_ID` (Key, Text)
*   `Equipment_ID` (Ref): M_Equipment への参照
*   `Timestamp` (DateTime): 点検日時
*   `Status` (Enum): 正常, 異常 (異常時はAutomationでアラート)
*   `Value` (Number/Text): 数値または判定
*   `Photo` (Image): 現場写真 (オフライン対応必須)
*   `Inspector_ID` (Ref): M_Staff への参照

### 2.3 工事・修繕管理 (Construction - Timeline Model)
**Table: T_Construction_History**
*   `Construction_ID` (Key, Text)
*   `Equipment_ID` (Ref): M_Equipment への参照
*   `Title` (Text): 工事件名
*   `Start_Date` (Date): 工期開始
*   `End_Date` (Date): 工期終了
*   `Contractor` (Text): 施工業者
*   `Cost` (Price): 費用
*   `Category` (Enum): 点検, 修繕, 更新, 新設

### 2.4 物品・在庫管理 (Inventory)
**Table: M_Items (物品マスタ)**
*   `Item_ID` (Key, Text): バーコード値
*   `Name` (Text): 物品名 (例: 次亜塩素酸ナトリウム)
*   `Current_Stock` (Number): 仮想カラム (SUM(In) - SUM(Out))
*   `Safety_Stock` (Number): 発注点アラート閾値

**Table: T_Inventory_Logs (入出庫ログ)**
*   `Log_ID` (Key, Text)
*   `Item_ID` (Ref): M_Items への参照
*   `Type` (Enum): 入庫, 出庫
*   `Quantity` (Number): 数量
*   `Related_Construction_ID` (Ref): 工事での使用時のみ入力

### 2.5 人材管理 (Personnel - SmartHR Model)
**Table: M_Staff (職員マスタ)**
*   `Email` (Key, Email): Googleアカウント
*   `Name` (Text): 氏名
*   `Role` (Enum): 管理者, 作業員
*   `Photo` (Image): 顔写真 (Webアプリでカード表示)
*   `Qualifications` (EnumList): 保有資格

## 3. Webアプリ (Management UI) 要件
*   **Tech Stack:** Google Apps Script (HTML Service) + Vue.js (CDN)
*   **Deployment:** Web Appとしてデプロイ (`doGet()`)
*   **UI Layout:**
    *   **Equipment View:** Left=Tree(Facilities/Equipment), Center=Detail/Photo, Right=Timeline(Construction History).
    *   **Staff View:** Card Layout (CSS Grid).