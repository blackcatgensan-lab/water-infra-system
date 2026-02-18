# Phase 5: SmartGEMBA対応データ移行設計書

## 📋 プロジェクト概要

**目的**: SmartGEMBA形式のCSVデータから、Facility_DB（M_Locations, M_Equipment, M_Inspection_Items）への完全自動移行を実現する。

**対象施設**:
- F-001 川俣水みらいセンター（SmartGEMBA形式）
- F-002〜F-006（SmartGEMBA形式）
- F-007 石津水再生センター（Blitz GROW形式・従来ロジック）

**実装日**: 2026年2月16日

---

## 🔍 診断結果と問題の特定

### 初回テスト（川俣 F-001）で発見された問題

| 問題ID | 症状 | 原因 | 影響 |
|--------|------|------|------|
| **P1** | 階層解析の失敗 | ヘッダー行から列インデックスを動的検索していたが、SmartGEMBAのCSV構造では列位置が固定されている | Building/Room/Equipmentの名称が取得できない |
| **P2** | データ構造の不一致 | Facility_DBのM_Equipmentは24列構成だが、スクリプトが11列しか送っていない | データが正しく認識されず、シートが破損 |
| **P3** | 残留データの問題 | テンプレート由来の石津（F-007）データが残っており、その下（1000行目以降）に書き込まれる | データの重複と混在が発生 |
| **P4** | ヘッダー行のスキップ漏れ | ループが `i = lastProcessedIndex + 1` から開始し、初回実行時に `i = 0`（ヘッダー行）を処理 | ヘッダーを施設データとして誤認識 |

---

## 🛠️ 修正内容（Step 1〜4）

### Step 1: 実行ループの修正

**修正箇所**: `executeSmartGEMBAMigration()` の施設ループ  
**修正内容**:
```javascript
// 修正前
for (let i = lastProcessedIndex + 1; i < facilityData.length; i++) {

// 修正後
for (let i = Math.max(lastProcessedIndex + 1, 1); i < facilityData.length; i++) {
```

**効果**: 初回実行時に必ずインデックス1（最初のデータ行）から開始し、ヘッダー行を処理しないことを保証。

---

### Step 2: SmartGEMBA階層解析ロジックの刷新

**修正箇所**: `parseSmartGEMBAHierarchy()` 関数  
**修正内容**:

#### 2-1. 固定列インデックスの適用

SmartGEMBAのCSV構造に基づき、以下の固定列を使用：

| 種別コード | CSV列インデックス | 取得データ | 用途 |
|-----------|------------------|-----------|------|
| `01作業場所` | `CSV[2]` | Building名 | M_Locations（親階層） |
| `02対象グループ` | `CSV[3]` | Room名 | M_Locations（子階層） |
| `03点検対象` | `CSV[4]` | Equipment名 | M_Equipment |
| `04点検項目` | `CSV[5]` | Inspection Item名 | M_Inspection_Items |

**コード例**:
```javascript
if (typeCell.indexOf('01') === 0) {
  const buildingName = (row[2] || '').trim(); // 固定列 CSV[2]
  // ...
}
else if (typeCell.indexOf('02') === 0) {
  const roomName = (row[3] || '').trim(); // 固定列 CSV[3]
  // ...
}
else if (typeCell.indexOf('03') === 0) {
  const equipmentName = (row[4] || '').trim(); // 固定列 CSV[4]
  // ...
}
else if (typeCell.indexOf('04') === 0) {
  const itemName = (row[5] || '').trim(); // 固定列 CSV[5]
  // ...
}
```

#### 2-2. Parent_Location_ID の構築

M_Locationsに親子関係を導入：

```javascript
// Building（親階層）
locations.push({
  Location_ID: locationId,
  Facility_ID: facilityId,
  Parent_Location_ID: '',  // 親なし
  Building: buildingName,
  Floor: '',
  Room: '',
  Remarks: ''
});

// Room（子階層）
locations.push({
  Location_ID: locationId,
  Facility_ID: facilityId,
  Parent_Location_ID: currentBuildingId,  // 親はBuilding
  Building: currentBuildingName,
  Floor: '',
  Room: roomName,
  Remarks: ''
});
```

#### 2-3. Location_IDの継承ロジック

設備は、以下の優先順位でLocation_IDを決定：
1. **Room が存在** → `currentRoomId`
2. **Roomがない** → `currentBuildingId`
3. **どちらもない** → 空文字（場所未設定）

---

### Step 3: シート初期化ロジックの追加

**修正箇所**: `migrateSingleFacility_SmartGEMBA()` 関数  
**新規関数**: `clearFacilitySheetData()`

**修正内容**:
```javascript
// 各施設の移行開始前に実行
Logger.log('    既存データをクリア中...');
clearFacilitySheetData(facilitySS, 'M_Locations');
clearFacilitySheetData(facilitySS, 'M_Equipment');
clearFacilitySheetData(facilitySS, 'M_Inspection_Items');
```

**clearFacilitySheetData() の実装**:
```javascript
function clearFacilitySheetData(facilitySS, sheetName) {
  const sheet = facilitySS.getSheetByName(sheetName);
  if (!sheet) return;
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // 2行目以降（データ行）をクリア
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    Logger.log(`      ${sheetName}: ${lastRow - 1}行のデータをクリアしました`);
  }
}
```

**効果**: テンプレート由来の残留データ（石津のデータ等）を削除し、各施設のデータを正しい位置（2行目以降）に書き込む。

---

### Step 4: 書き込み配列の完全同期

**修正箇所**: `writeLocationsToSheet()`, `writeEquipmentToSheet()` 関数

**修正内容**: シートのヘッダーを読み取り、動的に配列を構築する方式に変更。

#### 4-1. M_Locations の書き込み

```javascript
function writeLocationsToSheet(facilitySS, locations) {
  const sheet = facilitySS.getSheetByName('M_Locations');
  // ヘッダー構造を確認
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // ヘッダーに基づいて動的に配列を構築
  const outputData = locations.map(loc => {
    const row = [];
    headers.forEach(header => {
      row.push(loc[header] !== undefined ? loc[header] : '');
    });
    return row;
  });
  
  sheet.getRange(startRow, 1, outputData.length, headers.length).setValues(outputData);
}
```

**想定ヘッダー構造**（M_Locations, 7列）:
```
Location_ID | Facility_ID | Parent_Location_ID | Building | Floor | Room | Remarks
```

#### 4-2. M_Equipment の書き込み

```javascript
function writeEquipmentToSheet(facilitySS, equipment) {
  const sheet = facilitySS.getSheetByName('M_Equipment');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // 同様に動的構築
  const outputData = equipment.map(eq => {
    const row = [];
    headers.forEach(header => {
      row.push(eq[header] !== undefined ? eq[header] : '');
    });
    return row;
  });
  
  sheet.getRange(startRow, 1, outputData.length, headers.length).setValues(outputData);
}
```

**想定ヘッダー構造**（M_Equipment, 24列）:
```
Equipment_ID | Facility_ID | Location_ID | Name | Type | Manufacturer | Model | 
Serial_Number | Install_Date | Status | Remarks | Warranty_Expiry | 
Last_Maintenance | Next_Maintenance | Criticality | Parent_Equipment_ID | 
QR_Code | Photo_URL | Manual_URL | Purchase_Date | Purchase_Cost | 
Disposal_Date | Responsible_Staff | Inspection_Frequency
```

**効果**: スクリプト側でハードコードされた列数に依存せず、シートの実際のヘッダー構造に完全同期。不足列は自動的に空文字で埋められる。

---

## 🔄 データフロー図

```
┌─────────────────────────────────────────────────────────────┐
│ Google Drive: CSV_FOLDER_ID                                 │
├─────────────────────────────────────────────────────────────┤
│ 📄 点検ツリー（川俣水処理）.csv                              │
│ 📄 点検ツリー（○○水処理）.csv                               │
│ 📄 選択肢マスタ（川俣水処理）.csv    ← [将来的に活用]       │
│ 📄 施設情報.csv (Legacy)                                    │
│ 📄 設備情報.csv (Legacy)                                    │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ executeSmartGEMBAMigration()                                │
├─────────────────────────────────────────────────────────────┤
│ 1. loadAllCSVData_SG()                                      │
│    - SmartGEMBA形式とLegacy形式を分類                        │
│    - 選択肢マスタを読み込み（Phase 6用）                    │
│                                                             │
│ 2. migrateMasterData_SG()                                   │
│    - M_Facilities, M_Organizations, M_Qualifications        │
│                                                             │
│ 3. For each facility:                                       │
│    - clearFacilitySheetData() [Step 3]                     │
│    - parseSmartGEMBAHierarchy() [Step 2]                   │
│    - writeLocationsToSheet() [Step 4]                      │
│    - writeEquipmentToSheet() [Step 4]                      │
│    - writeInspectionItemsToSheet()                         │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Master_DB: SG_MASTER_DB_ID                                  │
├─────────────────────────────────────────────────────────────┤
│ ✅ M_Facilities                                             │
│ ✅ M_Organizations                                          │
│ ✅ M_Qualifications                                         │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Facility_DB (各施設): DB_File_ID                            │
├─────────────────────────────────────────────────────────────┤
│ ✅ M_Locations (Parent_Location_ID付き)                     │
│ ✅ M_Equipment (Location_ID紐付け済み)                      │
│ ✅ M_Inspection_Items (Equipment_ID紐付け済み)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 データマッピング表

### SmartGEMBA CSV → M_Locations

| CSV構造 | 列位置 | M_Locations フィールド | 値 |
|---------|--------|----------------------|-----|
| 01作業場所 | CSV[2] | Location_ID | `{FacilityCode}_L-{連番}` |
| 01作業場所 | CSV[2] | Facility_ID | `{FacilityId}` (例: F-001) |
| 01作業場所 | CSV[2] | Parent_Location_ID | 空文字（親なし） |
| 01作業場所 | CSV[2] | Building | CSV[2]の値 |
| 01作業場所 | CSV[2] | Floor | 空文字 |
| 01作業場所 | CSV[2] | Room | 空文字 |
| 02対象グループ | CSV[3] | Location_ID | `{FacilityCode}_L-{連番}` |
| 02対象グループ | CSV[3] | Facility_ID | `{FacilityId}` |
| 02対象グループ | CSV[3] | Parent_Location_ID | 親BuildingのLocation_ID |
| 02対象グループ | CSV[3] | Building | 親BuildingのBuilding値 |
| 02対象グループ | CSV[3] | Floor | 空文字 |
| 02対象グループ | CSV[3] | Room | CSV[3]の値 |

### SmartGEMBA CSV → M_Equipment

| CSV構造 | 列位置 | M_Equipment フィールド | 値 |
|---------|--------|----------------------|-----|
| 03点検対象 | CSV[4] | Equipment_ID | `{FacilityCode}_E-{連番}` (例: F001_E-00001) |
| 03点検対象 | - | Facility_ID | `{FacilityId}` |
| 03点検対象 | - | Location_ID | currentRoomId または currentBuildingId |
| 03点検対象 | CSV[4] | Name | CSV[4]の値 |
| 03点検対象 | - | Type | '機械'（デフォルト） |
| 03点検対象 | - | Status | '稼働中'（デフォルト） |
| 03点検対象 | - | その他21列 | 空文字（将来的に拡張可） |

### SmartGEMBA CSV → M_Inspection_Items

| CSV構造 | 列位置 | M_Inspection_Items フィールド | 値 |
|---------|--------|------------------------------|-----|
| 04点検項目 | CSV[5] | Item_ID | `{FacilityCode}_II-{連番}` (例: F001_II-00001) |
| 04点検項目 | - | Equipment_ID | 直前の03点検対象のEquipment_ID |
| 04点検項目 | CSV[5] | Item_Name | CSV[5]の値 |
| 04点検項目 | - | Check_Method | 空文字 |
| 04点検項目 | - | Normal_Range | 空文字 |
| 04点検項目 | - | Unit | 空文字 |

---

## 🚀 実行手順

### 前提条件

1. **Task 1完了確認**: `deploy_facilities.gs` を実行し、全施設のFacility_DBが作成済みであること。
2. **CSVファイル配置**: `SG_CSV_FOLDER_ID` フォルダに以下を配置：
   - `点検ツリー（川俣水処理）.csv`
   - `点検ツリー（{施設名}水処理）.csv` （各施設分）
   - `選択肢マスタ（川俣水処理）.csv` （オプション、Phase 6用）
   - `施設情報.csv`, `設備情報.csv` など（F-007石津用）

### 実行ステップ

#### Step 1: 初回実行

```javascript
executeSmartGEMBAMigration()
```

**ログ出力例**:
```
========================================
Phase 5 - Task 2: SmartGEMBA対応データ移行開始
========================================

前回の進捗: NOT_STARTED, 最後に処理した施設インデックス: -1

[Step 1] CSVデータの読み込み...
  読み込み中: 点検ツリー（川俣水処理）.csv
  読み込み中: 選択肢マスタ（川俣水処理）.csv
    📋 選択肢マスタを読み込みました（Phase 6で活用予定）
  読み込み完了: SmartGEMBA=1件, Legacy=3テーブル, 選択肢=あり

[Step 2] Master_DB へのデータ移行...
  M_Facilities へ移行...
    7 件を追加
  ✅ Master_DB 移行完了

[Step 3] 各施設のFacility_DBへデータ移行...

  [1/7] F-001: 川俣水みらいセンター
    DB ID: 1abc...
    → SmartGEMBA形式で処理
    → 対応CSVファイル: 点検ツリー（川俣水処理）.csv
    既存データをクリア中...
      M_Locations: 0行のデータをクリアしました
      M_Equipment: 1000行のデータをクリアしました
      M_Inspection_Items: 0行のデータをクリアしました
    SmartGEMBA階層構造を解析中...
      CSV行数: 892
      データ開始行: 1
      [01] Building追加: 水処理施設 -> F001_L-00001
      [02] Room追加: 水処理施設 > 受水井室 -> F001_L-00002 (親: F001_L-00001)
      [03] Equipment追加: スクリーン -> F001_E-00001 (Location: F001_L-00002)
      [04] Inspection Item追加: 異音・異臭 -> F001_II-00001
      ...
      生成完了 - Location: 45, Equipment: 123, Inspection Item: 456
    M_Locations を生成中...
      M_Locations ヘッダー（7列）: Location_ID, Facility_ID, Parent_Location_ID, Building, Floor, Room, Remarks
      45 件のロケーションを追加（7列）
    M_Equipment を生成中...
      M_Equipment ヘッダー（24列）: Equipment_ID, Facility_ID, Location_ID, Name, Type, ...
      123 件の設備を追加（24列）
    M_Inspection_Items を生成中...
      456 件の点検項目を追加
    ✅ 完了
```

#### Step 2: タイムアウト時の再開

5分30秒を超えた場合、自動中断：

```
⏱️ 実行時間が制限に近づきました（330秒経過）
   施設インデックス 3 まで処理完了

⚠️ 処理を一時中断します。再度 executeSmartGEMBAMigration() を実行してください。
```

再度実行すると、施設インデックス4から自動再開：

```javascript
executeSmartGEMBAMigration()  // 続きから再開
```

#### Step 3: 進捗確認

```javascript
showSmartGEMBAMigrationProgress()
```

**出力例**:
```
========== SmartGEMBA移行進捗状況 ==========
ステータス: IN_PROGRESS
最後に処理した施設インデックス: 3
```

#### Step 4: やり直し（必要に応じて）

```javascript
resetSmartGEMBAMigrationProgress()
executeSmartGEMBAMigration()
```

---

## 📊 移行サマリー

移行完了時、以下のようなサマリーが出力されます：

```
========================================
📊 移行サマリー
========================================
✅ F-001 川俣水みらいセンター
   - Locations: 45
   - Equipment: 123
   - Inspection Items: 456
✅ F-002 ○○水処理センター
   - Locations: 38
   - Equipment: 98
   - Inspection Items: 345
...
❌ F-005 △△センター: CSVが見つかりません

---
処理施設数: 7 (成功: 6, 失敗: 1)
合計 - Locations: 312, Equipment: 876, Inspection Items: 2543
========================================
```

---

## 🔮 将来的な拡張性

### Phase 6: 選択肢マスタの活用

**現状**: `選択肢マスタ（川俣水処理）.csv` は読み込みのみ。

**将来実装予定**:
1. **M_Inspection_Choices テーブルの作成**
   ```
   Choice_ID | Item_ID | Choice_Text | Sort_Order
   ```

2. **選択肢の自動生成**
   ```javascript
   function migrateInspectionChoices(facilitySS, facilityCode, choicesCSV) {
     // 選択肢マスタから M_Inspection_Choices へ移行
   }
   ```

3. **点検アプリでの活用**
   - プルダウン選択肢として表示
   - 入力の標準化

### データ検証機能の追加

**Phase 7実装予定**:
- Location_IDの親子関係の整合性チェック
- Equipment_IDの重複チェック
- 必須フィールドの欠損チェック

---

## ⚠️ 注意事項

1. **CSVファイル命名規則**:
   - SmartGEMBA形式: `点検ツリー（{施設名}）.csv`
   - 選択肢マスタ: `選択肢マスタ（{施設名}）.csv`
   - 施設名は M_Facilities.Name との部分一致で判定

2. **テンプレートデータの削除**:
   - Step 3のシート初期化により、テンプレート由来のデータは自動削除される
   - ただし、Master_DBのデータは削除されないため、重複実行時は注意

3. **タイムアウト対策**:
   - 施設数が多い場合、複数回に分けて実行される
   - PropertiesServiceで進捗を管理し、中断・再開が可能

4. **エラーハンドリング**:
   - 特定施設でエラーが発生しても、次の施設へ処理を継続
   - サマリーで失敗施設を確認可能

---

## 📝 変更履歴

| 日付 | バージョン | 変更内容 | 担当 |
|------|----------|---------|------|
| 2026-02-16 | v1.0 | 初版作成（Step 1-4の修正を反映） | Antigravity AI |
| 2026-02-16 | v1.1 | 選択肢マスタの読み込み機能追加 | Antigravity AI |
| 2026-02-16 | v1.2 | 移行サマリー出力機能追加 | Antigravity AI |

---

## ✅ チェックリスト

### 実行前
- [ ] `deploy_facilities.gs` が完了し、全施設のDB_File_IDが記録されている
- [ ] CSVファイルがすべて配置されている
- [ ] Facility_DB_Templateが正しいヘッダー構造を持っている

### 実行中
- [ ] ログを確認し、各施設の処理が正常に進んでいるか監視
- [ ] タイムアウト時、PropertiesServiceの進捗が正しく保存されているか確認

### 実行後
- [ ] 移行サマリーで全施設の成功/失敗を確認
- [ ] Master_DBのM_Facilitiesにデータが追加されているか確認
- [ ] 各Facility_DBの以下を確認:
  - [ ] M_Locations: Parent_Location_IDが正しく設定されているか
  - [ ] M_Equipment: Location_IDが紐付いているか
  - [ ] M_Inspection_Items: Equipment_IDが紐付いているか
- [ ] Webアプリで階層ツリー表示が正しく動作するか確認

---

**作成者**: Antigravity AI (Google Deepmind)  
**最終更新**: 2026年2月16日
