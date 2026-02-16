/**
 * ============================================================
 * 上下水道施設維持管理システム - スプレッドシートDB自動構築スクリプト
 * ============================================================
 * 
 * spec.md Ver.2.1 に完全準拠
 * 設備中心設計 (Asset-Centric): Equipment_ID をハブとするハブ＆スポーク構造
 * 
 * 使い方:
 *   1. Google Apps Script エディタ (https://script.google.com) で新規プロジェクト作成
 *   2. このコードを貼り付け
 *   3. setupDatabase() を実行
 *   4. 初回実行時にスプレッドシートへのアクセス許可を求められるので承認
 */

const SPREADSHEET_ID = '17xlItfPEhkzZj-rG8A_RBkaDscl_pWu24tr61-5knZ8';

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('セットアップ開始: ' + ss.getUrl());

  // --- マスタテーブル (青系ヘッダー) ---
  createMFacilities(ss);
  createMEquipment(ss);
  createMInspectionGroups(ss); // [NEW] parent
  createMInspectionItems(ss);  // [NEW] child
  createMItems(ss);
  createMStaff(ss);
  
  // [NEW] Phase 5 マスタ
  createMOrganizations(ss);
  createMContracts(ss);
  createMQualifications(ss);

  // --- 人事異動・昇進履歴 ---
  createTStaffChanges(ss);

  // --- トランザクションテーブル (緑系ヘッダー) ---
  createTInspectionResults(ss);
  createTConstructionHistory(ss);
  createTInventoryLogs(ss);
  
  // [NEW] Phase 5 トランザクション
  createTQualApplications(ss);

  // サンプルデータ投入
  insertSampleData(ss);

  Logger.log('===== セットアップ完了 =====');
  
  // UIに完了メッセージを表示
  try {
    SpreadsheetApp.getUi().alert(
      'セットアップ完了',
      'データベースの再構築（Phase 5対応）が完了しました。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    // スタンドアロンスクリプトの場合UIが使えないため無視
  }

  return ss.getUrl();
}


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
function createSheet_(ss, sheetName, headers, headerColor, columnWidths) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    // データは保護しつつ、古い入力規則とヘッダー書式のみクリアする
    // 1行目（ヘッダー）のみ書式と内容をクリア
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clear();
    // 全データ範囲の入力規則だけを解除
    sheet.getDataRange().setDataValidation(null);
    
    // 肥大化防止（100行未満の場合は調整しない）
    if (sheet.getMaxRows() > 1000) {
      sheet.deleteRows(1001, sheet.getMaxRows() - 1000);
    }
  } else {
    sheet = ss.insertSheet(sheetName);
  }
  
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
  
  return sheet;
}

/**
 * プルダウン (データ検証) を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 * @param {string[]} values - 選択肢の配列
 */
function setDropdown_(sheet, colIndex, values) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  // 2行目から最終行まで適用
  sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

/**
 * 日付形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function setDateFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy/MM/dd');
}

/**
 * 日時形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function setDateTimeFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy/MM/dd HH:mm');
}

/**
 * 通貨形式を設定する
 * @param {Sheet} sheet - シートオブジェクト
 * @param {number} colIndex - 列番号 (1-indexed)
 */
function setCurrencyFormat_(sheet, colIndex) {
  sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setNumberFormat('¥#,##0');
}


// ============================================================
// 個別テーブル作成関数
// ============================================================

// --- 色定義 ---
var MASTER_COLOR = '#1565C0';       // マスタ: ブルー
var TRANSACTION_COLOR = '#2E7D32';  // トランザクション: グリーン

/**
 * 2.1 M_Facilities (施設マスタ)
 */
function createMFacilities(ss) {
  var headers = [
    'Facility_ID',
    'Name',
    'Address',
    'Map_Link',
    'Image_URL',
    'Contract_ID' // [UPDATE] Phase 5
  ];
  var widths = [120, 200, 300, 150, 150, 120];
  
  var sheet = createSheet_(ss, 'M_Facilities', headers, MASTER_COLOR, widths);
  
  Logger.log('✅ M_Facilities 作成完了');
  return sheet;
}

/**
 * 2.1 M_Equipment (設備マスタ - THE HUB)
 * [UPDATE] CSVデータ構造に合わせてスキーマ拡張
 *   - System_Category (CSVの大分類) を追加
 *   - Status に '設置' を追加
 *   - Maintenance_Type にプルダウンを設定
 */
function createMEquipment(ss) {
  var headers = [
    'Equipment_ID',         // 1
    'Facility_ID',          // 2
    'Name',                 // 3
    'Type',                 // 4  (機械/電気/計装/管路 - マッピング用)
    'Status',               // 5
    'Building',             // 6
    'Floor',                // 7
    'Room',                 // 8
    'System_Category',      // 9  [NEW] CSVの大分類 (施設系の詳細分類)
    'Category_Major',       // 10
    'Category_Middle',      // 11
    'Category_Minor',       // 12
    'Model_Number',         // 13
    'Serial_Number',        // 14
    'Spec_1',               // 15
    'Spec_2',               // 16
    'Spec_3',               // 17
    'Installation_Date',    // 18
    'Operation_Start_Date', // 19
    'Legal_Lifespan',       // 20
    'Standard_Lifespan',    // 21
    'Manufacturer',         // 22
    'Contractor',           // 23
    'Asset_No',             // 24
    'Maintenance_Type',     // 25
    'QR_Code'               // 26
  ];
  var widths = [130, 120, 220, 100, 100, 100, 80, 100, 200, 120, 120, 120, 150, 150, 150, 150, 150, 130, 130, 100, 100, 180, 180, 150, 130, 150];
  
  var sheet = createSheet_(ss, 'M_Equipment', headers, MASTER_COLOR, widths);
  
  // データ検証: Type (マッピング用の簡易分類)
  setDropdown_(sheet, 4, ['機械', '電気', '計装', '管路']);
  
  // データ検証: Status [UPDATE] CSVに存在する '設置' を追加
  setDropdown_(sheet, 5, ['稼働中', '停止中', '故障中', '廃棄', '設置']);
  
  // データ検証: Maintenance_Type [NEW] CSVの保全区分
  setDropdown_(sheet, 25, ['事後保全', '時間監視', '状態監視']);
  
  // 日付形式: Installation_Date (列18)
  setDateFormat_(sheet, 18);
  
  Logger.log('✅ M_Equipment (HUB) 作成完了');
  return sheet;
}

/**
 * 2.2 M_Inspection_Groups (点検グループマスタ - 親) [NEW]
 */
function createMInspectionGroups(ss) {
  var headers = [
    'Group_ID',
    'Work_Group',
    'Route_Name',
    'Area_Name',
    'Equipment_ID', // M_Equipment との紐付け
    'Sort_Order'
  ];
  var widths = [120, 150, 150, 150, 130, 80];
  var sheet = createSheet_(ss, 'M_Inspection_Groups', headers, MASTER_COLOR, widths);
  Logger.log('✅ M_Inspection_Groups 作成完了');
  return sheet;
}

/**
 * 2.2 M_Inspection_Items (点検項目マスタ - 子) [NEW]
 */
function createMInspectionItems(ss) {
  var headers = [
    'Item_ID',
    'Group_ID', // M_Inspection_Groups との紐付け
    'Task_Name',
    'Description',
    'Type',
    'Unit',
    'Upper_Limit',
    'Lower_Limit',
    'Instructions',
    'Sort_Order'
  ];
  var widths = [120, 120, 200, 250, 100, 80, 100, 100, 250, 80];
  var sheet = createSheet_(ss, 'M_Inspection_Items', headers, MASTER_COLOR, widths);
  
  // データ検証: Type
  setDropdown_(sheet, 5, ['数値入力', 'OK/NG選択', '写真のみ', 'テキスト']);
  
  Logger.log('✅ M_Inspection_Items 作成完了');
  return sheet;
}

/**
 * 2.2 T_Inspection_Results (点検実績)
 */
function createTInspectionResults(ss) {
  var headers = [
    'Result_ID',
    'Equipment_ID',
    'Timestamp',
    'Status',
    'Value',
    'Photo',
    'Inspector_ID'
  ];
  var widths = [130, 130, 160, 100, 150, 200, 150];
  
  var sheet = createSheet_(ss, 'T_Inspection_Results', headers, TRANSACTION_COLOR, widths);
  
  // データ検証: Status
  setDropdown_(sheet, 4, ['正常', '異常']);
  
  // 日時形式: Timestamp
  setDateTimeFormat_(sheet, 3);
  
  Logger.log('✅ T_Inspection_Results 作成完了');
  return sheet;
}

/**
 * 2.3 T_Construction_History (工事・修繕履歴)
 */
function createTConstructionHistory(ss) {
  var headers = [
    'Construction_ID',
    'Equipment_ID',
    'Title',
    'Start_Date',
    'End_Date',
    'Contractor',
    'Cost',
    'Category'
  ];
  var widths = [140, 130, 250, 130, 130, 180, 130, 100];
  
  var sheet = createSheet_(ss, 'T_Construction_History', headers, TRANSACTION_COLOR, widths);
  
  // データ検証: Category
  setDropdown_(sheet, 8, ['点検', '修繕', '更新', '新設']);
  
  // 日付形式: Start_Date, End_Date
  setDateFormat_(sheet, 4);
  setDateFormat_(sheet, 5);
  
  // 通貨形式: Cost
  setCurrencyFormat_(sheet, 7);
  
  Logger.log('✅ T_Construction_History 作成完了');
  return sheet;
}

/**
 * 2.4 M_Items (物品マスタ)
 */
function createMItems(ss) {
  var headers = [
    'Item_ID',
    'Name',
    'Current_Stock',
    'Safety_Stock'
  ];
  var widths = [150, 250, 120, 120];
  
  var sheet = createSheet_(ss, 'M_Items', headers, MASTER_COLOR, widths);
  
  // Current_Stock, Safety_Stock は数値形式
  sheet.getRange(2, 3, sheet.getMaxRows() - 1, 2).setNumberFormat('#,##0');
  
  Logger.log('✅ M_Items 作成完了');
  return sheet;
}

/**
 * 2.4 T_Inventory_Logs (入出庫ログ)
 */
function createTInventoryLogs(ss) {
  var headers = [
    'Log_ID',
    'Item_ID',
    'Type',
    'Quantity',
    'Related_Construction_ID'
  ];
  var widths = [130, 150, 80, 100, 180];
  
  var sheet = createSheet_(ss, 'T_Inventory_Logs', headers, TRANSACTION_COLOR, widths);
  
  // データ検証: Type
  setDropdown_(sheet, 3, ['入庫', '出庫']);
  
  // 数量は数値形式
  sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1).setNumberFormat('#,##0');
  
  Logger.log('✅ T_Inventory_Logs 作成完了');
  return sheet;
}

/**
 * 2.5 M_Staff (職員マスタ)
 */
function createMStaff(ss) {
  var headers = [
    'Staff_ID',
    'Name',
    'Email',
    'Role',
    'Org_ID',
    'Kana_Sei',
    'Kana_Mei',
    'Birth_Date',
    'Blood_Type',
    'Address',
    'Phone',
    'Emergency_Contact',
    'Joined_Date',
    'Health_Check_Date',
    'Employment_Status',
    'Position',
    'Grade',
    'Responsibility'
  ];
  var widths = [120, 150, 250, 100, 120, 100, 100, 100, 80, 250, 120, 150, 100, 120, 100, 100, 80, 120];
  
  var sheet = createSheet_(ss, 'M_Staff', headers, MASTER_COLOR, widths);
  
  // データ検証: Role
  setDropdown_(sheet, 4, ['管理者', '作業員']);
  
  // 電話番号をテキスト形式に設定（先頭の0を保持）
  sheet.getRange(2, 11, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  sheet.getRange(2, 12, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  
  // データ検証: Position (役職)
  setDropdown_(sheet, 16, ['', '主任', '係長', '課長補佐', '課長', '所長', '部長']);
  
  // データ検証: Grade (等級)
  setDropdown_(sheet, 17, ['', '1', '2', '3', '4', '5', '6', '7', '8']);
  
  // データ検証: Responsibility (職責)
  setDropdown_(sheet, 18, ['', '技術員', '技術責任者', '統括責任者']);
  
  Logger.log('✅ M_Staff 作成完了');
  return sheet;
}

/**
 * T_Staff_Changes (人事異動・昇進・昇格・任命 履歴)
 */
function createTStaffChanges(ss) {
  var headers = [
    'Change_ID',
    'Staff_ID',
    'Change_Type',
    'Change_Date',
    'Field_Changed',
    'Old_Value',
    'New_Value',
    'Remarks'
  ];
  var widths = [120, 120, 100, 120, 120, 150, 150, 250];
  
  var sheet = createSheet_(ss, 'T_Staff_Changes', headers, TRANSACTION_COLOR, widths);
  
  // データ検証: Change_Type
  setDropdown_(sheet, 3, ['異動', '昇進', '昇格', '任命']);
  
  // 日付形式: Change_Date
  setDateFormat_(sheet, 4);
  
  Logger.log('✅ T_Staff_Changes 作成完了');
  return sheet;
}

/**
 * 2.6 M_Organizations (組織マスタ) [NEW]
 */
function createMOrganizations(ss) {
  var headers = ['Org_ID', 'Name', 'Type', 'Parent_Org_ID', 'Sort_Order', 'Is_Active', 'Org_Code'];
  var widths = [100, 200, 120, 100, 80, 80, 100];
  var sheet = createSheet_(ss, 'M_Organizations', headers, MASTER_COLOR, widths);
  setDropdown_(sheet, 3, ['部', '事業部', '事業所', '課', '係']);
  Logger.log('✅ M_Organizations 作成完了');
  return sheet;
}

/**
 * 2.7 M_Contracts (契約マスタ) [NEW]
 */
function createMContracts(ss) {
  var headers = ['Contract_ID', 'Title', 'Office_ID', 'Start_Date', 'End_Date', 'Status'];
  var widths = [120, 250, 120, 100, 100, 100];
  var sheet = createSheet_(ss, 'M_Contracts', headers, MASTER_COLOR, widths);
  setDateFormat_(sheet, 4);
  setDateFormat_(sheet, 5);
  setDropdown_(sheet, 6, ['有効', '終了']);
  Logger.log('✅ M_Contracts 作成完了');
  return sheet;
}

/**
 * 2.8 M_Qualifications (資格マスタ) [NEW]
 */
function createMQualifications(ss) {
  var headers = ['Qual_ID', 'Name', 'Type', 'Organizer', 'Renewal_Period_Years'];
  var widths = [100, 250, 120, 200, 100];
  var sheet = createSheet_(ss, 'M_Qualifications', headers, MASTER_COLOR, widths);
  setDropdown_(sheet, 3, ['国家資格', '技能講習', '特別教育', 'その他']);
  Logger.log('✅ M_Qualifications 作成完了');
  return sheet;
}

/**
 * 2.9 T_Qual_Applications (資格申込・保有管理) [NEW]
 */
function createTQualApplications(ss) {
  var headers = ['App_ID', 'Fiscal_Year', 'Staff_ID', 'Qual_ID', 'Status', 'Application_Date', 'Completion_Date', 'Expiration_Date', 'License_Number'];
  var widths = [120, 100, 120, 100, 120, 120, 120, 120, 150];
  var sheet = createSheet_(ss, 'T_Qual_Applications', headers, TRANSACTION_COLOR, widths);
  setDropdown_(sheet, 5, ['計画', '申込済', '受講済', '合格', '不合格']);
  setDateFormat_(sheet, 6);
  setDateFormat_(sheet, 7);
  Logger.log('✅ T_Qual_Applications 作成完了');
  return sheet;
}


// ============================================================
// サンプルデータ投入
// ============================================================

/**
 * 指定したシートにデータがない場合のみ、サンプルデータを投入する
 */
function upsertSampleData_(ss, sheetName, data) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  // 2行目にデータがあるか確認
  if (sheet.getLastRow() <= 1) {
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
    Logger.log(`   - ${sheetName}: サンプルデータを投入しました`);
  } else {
    Logger.log(`   - ${sheetName}: 既存データがあるためスキップします`);
  }
}

function insertSampleData(ss) {
  Logger.log('--- サンプルデータ投入チェック開始 ---');

  // ----- M_Organizations -----
  upsertSampleData_(ss, 'M_Organizations', [
    ['DIV-001', '水道施設事業部', '事業部', '', 10, '有効', 'DIV001'],
    ['OFF-001', '東部事業所', '事業所', 'DIV-001', 20, '有効', 'OFF001'],
    ['SEC-001', '維持管理課', '課', 'OFF-001', 30, '有効', 'SEC001'],
    ['SUB-001', '浄水係', '係', 'SEC-001', 40, '有効', 'SUB001']
  ]);

  // ----- M_Contracts -----
  upsertSampleData_(ss, 'M_Contracts', [
    ['CON-001', '東部エリア維持管理業務委託', 'OFF-001', new Date(2025, 3, 1), new Date(2028, 2, 31), '有効']
  ]);

  // ----- M_Facilities -----
  upsertSampleData_(ss, 'M_Facilities', [
    ['F-001', '中央浄水場', '東京都千代田区丸の内1-1-1', 'https://maps.google.com/?q=35.6812,139.7671', '', 'CON-001'],
    ['F-002', '南部下水処理場', '東京都品川区東品川2-3-4', 'https://maps.google.com/?q=35.6222,139.7488', '', 'CON-001'],
    ['F-003', '北部配水場', '東京都北区王子1-5-6', 'https://maps.google.com/?q=35.7527,139.7380', '', 'CON-001']
  ]);

  // ----- M_Equipment (HUB) -----
  upsertSampleData_(ss, 'M_Equipment', [
    ['E-001', 'F-001', '1号送水ポンプ',     '機械', '稼働中', new Date(2015, 3, 1),  'QR-E001'],
    ['E-002', 'F-001', '中央制御盤',         '電気', '稼働中', new Date(2018, 6, 15), 'QR-E002'],
    ['E-003', 'F-001', '残留塩素計',         '計装', '稼働中', new Date(2020, 0, 10), 'QR-E003'],
    ['E-004', 'F-002', '汚泥掻寄機',         '機械', '故障中', new Date(2012, 8, 20), 'QR-E004'],
    ['E-005', 'F-002', '送風機2号',          '機械', '稼働中', new Date(2019, 4, 5),  'QR-E005'],
    ['E-006', 'F-003', '配水管（北ルート）',   '管路', '稼働中', new Date(2005, 10, 1), 'QR-E006'],
    ['E-007', 'F-003', '加圧ポンプ',         '機械', '停止中', new Date(2017, 1, 28), 'QR-E007']
  ]);

  // ----- M_Inspection_Routes -----
  upsertSampleData_(ss, 'M_Inspection_Routes', [
    ['R-001', '月曜ポンプ巡回', 'E-001, E-005, E-007'],
    ['R-002', '水質計器点検', 'E-003'],
    ['R-003', '南部処理場全設備', 'E-004, E-005']
  ]);

  // ----- M_Qualifications -----
  upsertSampleData_(ss, 'M_Qualifications', [
    ['Q-001', '第一種電気工事士', '国家資格', '経済産業省', 5],
    ['Q-002', '危険物取扱者乙4', '国家資格', '消防試験研究センター', 10],
    ['Q-003', '下水道技術検定2種', '国家資格', '日本下水道事業団', 0]
  ]);

  // ----- M_Staff -----
  upsertSampleData_(ss, 'M_Staff', [
    ['S-001', '田中 太郎', 'tanaka@example.com',  '管理者', 'SEC-001'],
    ['S-002', '鈴木 花子', 'suzuki@example.com',  '作業員', 'SUB-001'],
    ['S-003', '山田 一郎', 'yamada@example.com',  '作業員', 'SUB-001']
  ]);

  // ----- T_Qual_Applications -----
  upsertSampleData_(ss, 'T_Qual_Applications', [
    ['A-001', 2025, 'S-001', 'Q-001', '合格', new Date(2015, 3, 1), new Date(2015, 6, 1)],
    ['A-002', 2025, 'S-001', 'Q-002', '合格', new Date(2018, 3, 1), new Date(2018, 5, 1)],
    ['A-003', 2026, 'S-002', 'Q-003', '申込済', new Date(2026, 10, 10), '']
  ]);

  // ----- T_Inspection_Results -----
  upsertSampleData_(ss, 'T_Inspection_Results', [
    ['IR-001', 'E-001', new Date(2026, 1, 10, 9, 30),  '正常', '圧力: 0.45MPa 正常範囲内', '', 'tanaka@example.com'],
    ['IR-002', 'E-003', new Date(2026, 1, 10, 10, 0),  '正常', '残留塩素: 0.5mg/L',         '', 'suzuki@example.com'],
    ['IR-003', 'E-004', new Date(2026, 1, 12, 14, 15), '異常', '異音発生、軸受確認要',         '', 'yamada@example.com'],
    ['IR-004', 'E-001', new Date(2026, 1, 14, 9, 0),   '正常', '圧力: 0.43MPa 正常範囲内', '', 'tanaka@example.com']
  ]);

  // ----- T_Construction_History -----
  upsertSampleData_(ss, 'T_Construction_History', [
    ['C-001', 'E-001', '1号送水ポンプ インペラ交換',    new Date(2024, 5, 1),  new Date(2024, 5, 15), '(株)水道メンテナンス',  1500000, '修繕'],
    ['C-002', 'E-004', '汚泥掻寄機 軸受交換工事',       new Date(2026, 2, 1),  new Date(2026, 2, 20), '(株)下水設備サービス',  2800000, '修繕'],
    ['C-003', 'E-006', '北ルート配水管 更新工事',        new Date(2025, 3, 10), new Date(2025, 8, 30), '(株)管路建設',        45000000, '更新']
  ]);

  // ----- M_Items -----
  upsertSampleData_(ss, 'M_Items', [
    ['ITM-001', '次亜塩素酸ナトリウム (20L)',  50,  20],
    ['ITM-002', 'Vベルト B-67',              8,   3],
    ['ITM-003', 'メカニカルシール φ50',       4,   2],
    ['ITM-004', 'PAC（ポリ塩化アルミニウム）',  30,  10]
  ]);

  // ----- T_Inventory_Logs -----
  upsertSampleData_(ss, 'T_Inventory_Logs', [
    ['LOG-001', 'ITM-001', '入庫', 100, ''],
    ['LOG-002', 'ITM-001', '出庫', 50,  ''],
    ['LOG-003', 'ITM-002', '出庫', 2,   'C-001'],
    ['LOG-004', 'ITM-003', '入庫', 5,   ''],
    ['LOG-005', 'ITM-003', '出庫', 1,   'C-002']
  ]);

  Logger.log('✅ サンプルデータ投入チェック完了');
}
