/**
 * ============================================================
 * ハブ＆スポーク型アーキテクチャ - DB枠組み構築スクリプト v2
 * ============================================================
 * 
 * Phase 2: 新規データベース（スプレッドシート）の枠組み作成
 * 
 * 実行手順:
 *   1. Google Apps Script エディタで新規プロジェクト作成
 *   2. このコードを貼り付け
 *   3. createMasterDB() を実行 → Master_DB を作成
 *   4. createFacilityDBTemplate() を実行 → Facility_DB_Template を作成
 *   5. ログに出力されたURLを確認
 */

// ============================================================
// 色定義 (重複回避のためV2プレフィックスを付与)
// ============================================================
const V2_MASTER_COLOR = '#1565C0';       // Master: ブルー
const V2_FACILITY_COLOR = '#2E7D32';     // Facility: グリーン
const V2_TRANSACTION_COLOR = '#F57C00';  // Transaction: オレンジ

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * シートを作成し、ヘッダー行を設定する共通関数
 * @param {Spreadsheet} ss - スプレッドシートオブジェクト
 * @param {string} sheetName - シート名
 * @param {string[]} headers - ヘッダー列名の配列
 * @param {string} headerColor - ヘッダー背景色 (HEX)
 * @param {number[]} columnWidths - 各列幅の配列
 * @returns {Sheet} 作成されたシートオブジェクト
 */
function v2_createSheet_(ss, sheetName, headers, headerColor, columnWidths) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    ss.deleteSheet(sheet);
  }
  
  sheet = ss.insertSheet(sheetName);
  
  // ヘッダー設定
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground(headerColor);
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setWrap(true);
  
  // ヘッダー行の高さ
  sheet.setRowHeight(1, 36);
  
  // ヘッダー行をフリーズ
  sheet.setFrozenRows(1);
  
  // 列幅設定
  for (let i = 0; i < columnWidths.length; i++) {
    sheet.setColumnWidth(i + 1, columnWidths[i]);
  }
  
  Logger.log(`✅ ${sheetName} 作成完了`);
  return sheet;
}

/**
 * プルダウン (データ検証) を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 * @param {string[]} values - 選択肢の配列
 */
function v2_setDropdown_(sheet, colIndex, values) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, colIndex, 998, 1).setDataValidation(rule);
}

/**
 * 日付形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function v2_setDateFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, 998, 1).setNumberFormat('yyyy/MM/dd');
}

/**
 * 日時形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function v2_setDateTimeFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, 998, 1).setNumberFormat('yyyy/MM/dd HH:mm');
}

/**
 * 通貨形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function v2_setCurrencyFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, 998, 1).setNumberFormat('¥#,##0');
}

// ============================================================
// Master_DB 作成関数
// ============================================================

/**
 * Master_DB スプレッドシートを作成
 */
function createMasterDB() {
  const ss = SpreadsheetApp.create('Master_DB（本部マスタ）');
  Logger.log('===== Master_DB 作成開始 =====');
  Logger.log('URL: ' + ss.getUrl());
  
  // マスタテーブル作成
  v2_createMOrganizations(ss);
  v2_createMContracts(ss);
  v2_createMFacilities(ss);
  v2_createMStaff(ss);
  v2_createMQualifications(ss);
  v2_createTQualApplications(ss);
  v2_createTStaffChanges(ss);
  v2_createMItemsCommon(ss);
  
  // デフォルトシートを最後に削除
  const sheets = ss.getSheets();
  const defaultSheet = sheets.find(s => s.getName() === 'シート1' || s.getName() === 'Sheet1');
  if (defaultSheet && sheets.length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  Logger.log('===== Master_DB 作成完了 =====');
  Logger.log('URL: ' + ss.getUrl());
  
  return ss.getUrl();
}

/**
 * M_Organizations (組織マスタ)
 */
function v2_createMOrganizations(ss) {
  const headers = ['Org_ID', 'Name', 'Type', 'Parent_Org_ID', 'Sort_Order', 'Is_Active', 'Org_Code'];
  const widths = [100, 200, 120, 100, 80, 80, 100];
  const sheet = v2_createSheet_(ss, 'M_Organizations', headers, V2_MASTER_COLOR, widths);
  v2_setDropdown_(sheet, 3, ['部', '事業部', '事業所', '課', '係']);
  v2_setDropdown_(sheet, 6, ['有効', '無効']);
}

/**
 * M_Contracts (契約マスタ)
 */
function v2_createMContracts(ss) {
  const headers = ['Contract_ID', 'Title', 'Office_ID', 'Start_Date', 'End_Date', 'Status'];
  const widths = [120, 250, 120, 100, 100, 100];
  const sheet = v2_createSheet_(ss, 'M_Contracts', headers, V2_MASTER_COLOR, widths);
  v2_setDateFormat_(sheet, 4);
  v2_setDateFormat_(sheet, 5);
  v2_setDropdown_(sheet, 6, ['有効', '終了']);
}

/**
 * M_Facilities (施設マスタ)
 */
function v2_createMFacilities(ss) {
  const headers = ['Facility_ID', 'Name', 'Address', 'Map_Link', 'Image_URL', 'Contract_ID'];
  const widths = [120, 200, 300, 150, 150, 120];
  v2_createSheet_(ss, 'M_Facilities', headers, V2_MASTER_COLOR, widths);
}

/**
 * M_Staff (職員マスタ)
 */
function v2_createMStaff(ss) {
  const headers = [
    'Staff_ID', 'Name', 'Email', 'Role', 'Org_ID',
    'Kana_Sei', 'Kana_Mei', 'Birth_Date', 'Blood_Type', 'Address',
    'Phone', 'Emergency_Contact', 'Joined_Date', 'Health_Check_Date',
    'Employment_Status', 'Position', 'Grade', 'Responsibility'
  ];
  const widths = [120, 150, 250, 100, 120, 100, 100, 100, 80, 250, 120, 150, 100, 120, 100, 100, 80, 120];
  const sheet = v2_createSheet_(ss, 'M_Staff', headers, V2_MASTER_COLOR, widths);
  v2_setDropdown_(sheet, 4, ['管理者', '作業員']);
  v2_setDateFormat_(sheet, 8);
  v2_setDateFormat_(sheet, 13);
  v2_setDateFormat_(sheet, 14);
  v2_setDropdown_(sheet, 16, ['', '主任', '係長', '課長補佐', '課長', '所長', '部長']);
  v2_setDropdown_(sheet, 17, ['', '1', '2', '3', '4', '5', '6', '7', '8']);
  v2_setDropdown_(sheet, 18, ['', '技術員', '技術責任者', '統括責任者']);
}

/**
 * M_Qualifications (資格マスタ)
 */
function v2_createMQualifications(ss) {
  const headers = ['Qual_ID', 'Name', 'Type', 'Organizer', 'Renewal_Period_Years'];
  const widths = [100, 250, 120, 200, 100];
  const sheet = v2_createSheet_(ss, 'M_Qualifications', headers, V2_MASTER_COLOR, widths);
  v2_setDropdown_(sheet, 3, ['国家資格', '技能講習', '特別教育', 'その他']);
}

/**
 * T_Qual_Applications (資格申込・保有管理)
 */
function v2_createTQualApplications(ss) {
  const headers = ['App_ID', 'Fiscal_Year', 'Staff_ID', 'Qual_ID', 'Status', 'Application_Date', 'Completion_Date', 'Expiration_Date', 'License_Number'];
  const widths = [120, 100, 120, 100, 120, 120, 120, 120, 150];
  const sheet = v2_createSheet_(ss, 'T_Qual_Applications', headers, V2_TRANSACTION_COLOR, widths);
  v2_setDropdown_(sheet, 5, ['計画', '申込済', '受講済', '合格', '不合格']);
  v2_setDateFormat_(sheet, 6);
  v2_setDateFormat_(sheet, 7);
  v2_setDateFormat_(sheet, 8);
}

/**
 * T_Staff_Changes (人事異動・昇進履歴)
 */
function v2_createTStaffChanges(ss) {
  const headers = ['Change_ID', 'Staff_ID', 'Change_Type', 'Change_Date', 'Field_Changed', 'Old_Value', 'New_Value', 'Remarks'];
  const widths = [120, 120, 100, 120, 120, 150, 150, 250];
  const sheet = v2_createSheet_(ss, 'T_Staff_Changes', headers, V2_TRANSACTION_COLOR, widths);
  v2_setDropdown_(sheet, 3, ['異動', '昇進', '昇格', '任命']);
  v2_setDateFormat_(sheet, 4);
}

/**
 * M_Items_Common (共通物品マスタ)
 */
function v2_createMItemsCommon(ss) {
  const headers = ['Item_ID', 'Name', 'Current_Stock', 'Safety_Stock', 'Item_Type'];
  const widths = [150, 250, 120, 120, 120];
  v2_createSheet_(ss, 'M_Items_Common', headers, V2_MASTER_COLOR, widths);
}

// ============================================================
// Facility_DB_Template 作成関数
// ============================================================

/**
 * Facility_DB_Template スプレッドシートを作成
 */
function createFacilityDBTemplate() {
  const ss = SpreadsheetApp.create('Facility_DB_Template（施設DBテンプレート）');
  Logger.log('===== Facility_DB_Template 作成開始 =====');
  Logger.log('URL: ' + ss.getUrl());
  
  // 施設固有テーブル作成
  v2_createMLocations(ss);
  v2_createMEquipment(ss);
  v2_createMInspectionGroups(ss);
  v2_createMInspectionItems(ss);
  v2_createTInspectionResults(ss);
  v2_createTConstructionHistory(ss);
  v2_createMItemsFacility(ss);
  v2_createTInventoryLogs(ss);
  
  // デフォルトシートを最後に削除
  const sheets = ss.getSheets();
  const defaultSheet = sheets.find(s => s.getName() === 'シート1' || s.getName() === 'Sheet1');
  if (defaultSheet && sheets.length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  Logger.log('===== Facility_DB_Template 作成完了 =====');
  Logger.log('URL: ' + ss.getUrl());
  
  return ss.getUrl();
}

/**
 * M_Locations (場所マスタ) [NEW]
 */
function v2_createMLocations(ss) {
  const headers = ['Location_ID', 'Facility_ID', 'Building', 'Floor', 'Room', 'Parent_Location_ID', 'Sort_Order'];
  const widths = [150, 120, 150, 100, 150, 150, 80];
  v2_createSheet_(ss, 'M_Locations', headers, V2_FACILITY_COLOR, widths);
}

/**
 * M_Equipment (設備マスタ)
 */
function v2_createMEquipment(ss) {
  const headers = [
    'Equipment_ID', 'Facility_ID', 'Location_ID', 'Name', 'Type', 'Status',
    'System_Category', 'Category_Major', 'Category_Middle', 'Category_Minor',
    'Model_Number', 'Serial_Number', 'Spec_1', 'Spec_2', 'Spec_3',
    'Installation_Date', 'Operation_Start_Date', 'Legal_Lifespan', 'Standard_Lifespan',
    'Manufacturer', 'Contractor', 'Asset_No', 'Maintenance_Type', 'QR_Code'
  ];
  const widths = [130, 120, 150, 220, 100, 100, 200, 120, 120, 120, 150, 150, 150, 150, 150, 130, 130, 100, 100, 180, 180, 150, 130, 150];
  const sheet = v2_createSheet_(ss, 'M_Equipment', headers, V2_FACILITY_COLOR, widths);
  v2_setDropdown_(sheet, 5, ['機械', '電気', '計装', '管路']);
  v2_setDropdown_(sheet, 6, ['稼働中', '停止中', '故障中', '廃棄', '設置']);
  v2_setDropdown_(sheet, 23, ['事後保全', '時間監視', '状態監視']);
  v2_setDateFormat_(sheet, 16);
  v2_setDateFormat_(sheet, 17);
}

/**
 * M_Inspection_Groups (点検グループマスタ)
 */
function v2_createMInspectionGroups(ss) {
  const headers = ['Group_ID', 'Work_Group', 'Route_Name', 'Area_Name', 'Equipment_ID', 'Sort_Order'];
  const widths = [120, 150, 150, 150, 130, 80];
  v2_createSheet_(ss, 'M_Inspection_Groups', headers, V2_FACILITY_COLOR, widths);
}

/**
 * M_Inspection_Items (点検項目マスタ)
 */
function v2_createMInspectionItems(ss) {
  const headers = ['Item_ID', 'Group_ID', 'Task_Name', 'Description', 'Type', 'Unit', 'Upper_Limit', 'Lower_Limit', 'Instructions', 'Sort_Order'];
  const widths = [120, 120, 200, 250, 100, 80, 100, 100, 250, 80];
  const sheet = v2_createSheet_(ss, 'M_Inspection_Items', headers, V2_FACILITY_COLOR, widths);
  v2_setDropdown_(sheet, 5, ['数値入力', 'OK/NG選択', '写真のみ', 'テキスト']);
}

/**
 * T_Inspection_Results (点検実績)
 */
function v2_createTInspectionResults(ss) {
  const headers = ['Result_ID', 'Equipment_ID', 'Timestamp', 'Status', 'Value', 'Photo', 'Inspector_ID'];
  const widths = [130, 130, 160, 100, 150, 200, 150];
  const sheet = v2_createSheet_(ss, 'T_Inspection_Results', headers, V2_TRANSACTION_COLOR, widths);
  v2_setDropdown_(sheet, 4, ['正常', '異常']);
  v2_setDateTimeFormat_(sheet, 3);
}

/**
 * T_Construction_History (工事・修繕履歴)
 */
function v2_createTConstructionHistory(ss) {
  const headers = ['Construction_ID', 'Equipment_ID', 'Title', 'Start_Date', 'End_Date', 'Contractor', 'Cost', 'Category'];
  const widths = [140, 130, 250, 130, 130, 180, 130, 100];
  const sheet = v2_createSheet_(ss, 'T_Construction_History', headers, V2_TRANSACTION_COLOR, widths);
  v2_setDropdown_(sheet, 8, ['点検', '修繕', '更新', '新設']);
  v2_setDateFormat_(sheet, 4);
  v2_setDateFormat_(sheet, 5);
  v2_setCurrencyFormat_(sheet, 7);
}

/**
 * M_Items_Facility (施設物品マスタ)
 */
function v2_createMItemsFacility(ss) {
  const headers = ['Item_ID', 'Name', 'Current_Stock', 'Safety_Stock', 'Facility_ID'];
  const widths = [150, 250, 120, 120, 120];
  v2_createSheet_(ss, 'M_Items_Facility', headers, V2_FACILITY_COLOR, widths);
}

/**
 * T_Inventory_Logs (入出庫ログ)
 */
function v2_createTInventoryLogs(ss) {
  const headers = ['Log_ID', 'Item_ID', 'Type', 'Quantity', 'Related_Construction_ID'];
  const widths = [130, 150, 80, 100, 180];
  const sheet = v2_createSheet_(ss, 'T_Inventory_Logs', headers, V2_TRANSACTION_COLOR, widths);
  v2_setDropdown_(sheet, 3, ['入庫', '出庫']);
}

// ============================================================
// 実行用メイン関数
// ============================================================

/**
 * 両方のDBを一括作成する
 */
function createBothDatabases() {
  Logger.log('========================================');
  Logger.log('ハブ＆スポーク型アーキテクチャ - DB作成開始');
  Logger.log('========================================');
  
  const masterUrl = createMasterDB();
  const facilityUrl = createFacilityDBTemplate();
  
  Logger.log('');
  Logger.log('========================================');
  Logger.log('✅ すべてのDB作成が完了しました');
  Logger.log('========================================');
  Logger.log('Master_DB URL: ' + masterUrl);
  Logger.log('Facility_DB_Template URL: ' + facilityUrl);
  Logger.log('');
  Logger.log('次のステップ: Phase 3 データ移行スクリプトの実装');
}
