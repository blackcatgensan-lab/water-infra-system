/**
 * ============================================================
 * 上下水道施設維持管理システム - データ移行用スクリプト
 * ============================================================
 * 
 * Google ドライブ上の CSV ファイルを読み込み、スプレッドシートへ展開します。
 * Shift-JIS 形式の CSV に対応。
 */

// CSVファイルが格納されている Google ドライブのフォルダIDを設定してください
const DATA_FOLDER_ID = 'ここにフォルダIDを入力してください';

// グローバル変数: 施設名 -> 施設ID のマッピングを保持
let GLOBAL_FACILITY_MAP = {};
// グローバル変数: 組織パス -> 組織ID のマッピングを保持 [NEW]
let GLOBAL_ORG_MAP = {};

/**
 * メイン移行関数
 */
function runDataMigration() {
  if (DATA_FOLDER_ID === 'ここにフォルダIDを入力してください') {
    throw new Error('DATA_FOLDER_ID を設定してください。');
  }

  const folder = DriveApp.getFolderById(DATA_FOLDER_ID);
  
  // 1. 組織情報の移行 (Org_ID: O-001...) 階層構造対応
  migrateOrganizationsHierarchy(folder, '取り扱いデータ - 組織.csv');
  
  // 2. 施設情報の移行 (Facility_ID: F-001...)
  // ※ここで GLOBAL_FACILITY_MAP を構築する
  migrateCSVToSheet(folder, '取り扱いデータ - 施設情報.csv', 'M_Facilities', mapFacilityData);
  
  // 3. 資格情報の移行 (Qual_ID: Q-001...)
  migrateCSVToSheet(folder, '取り扱いデータ - 資格一覧.csv', 'M_Qualifications', mapQualificationData);

  // 4. 設備情報の移行 (Equipment_ID: E-001...)
  // ※ GLOBAL_FACILITY_MAP を使用して Facility_ID を引き当てる
  migrateCSVToSheet(folder, '取り扱いデータ - 設備情報.csv', 'M_Equipment', mapEquipmentData);
  
  // 5. 点検情報の移行（階層構造）
  migrateInspectionData(folder, '取り扱いデータ - 点検情報.csv');
}

/**
 * CSVファイルを読み込み、スプレッドシートに一括書き込みする（汎用）
 * [UPDATE] マッピング関数に index (行番号) を渡すように変更
 */
function migrateCSVToSheet(folder, fileName, sheetName, mappingFunction) {
  const file = getFileByName_(folder, fileName);
  if (!file) {
    Logger.log(`Skipping: ${fileName} not found.`);
    return;
  }

  const csvData = readCsvAsTable_(file);
  if (csvData.length <= 1) return;

  const headers = csvData[0];
  const rows = csvData.slice(1);
  
  // [UPDATE] index を渡す (1-based index for IDs)
  const mappedData = rows.map((row, index) => mappingFunction(row, headers, index + 1));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`Error: Sheet ${sheetName} not found.`);
    return;
  }

  // 既存データをクリア（ヘッダー以外）
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  // データの書き込み
  if (mappedData.length > 0) {
    sheet.getRange(2, 1, mappedData.length, mappedData[0].length).setValues(mappedData);
  }
  Logger.log(`✅ ${fileName} -> ${sheetName} への移行が完了しました。(${mappedData.length}件)`);
}

/**
 * 点検情報の移行（特殊処理：グループと項目の分離）
 */
function migrateInspectionData(folder, fileName) {
  const file = getFileByName_(folder, fileName);
  if (!file) return;

  const csvData = readCsvAsTable_(file);
  const rows = csvData.slice(1);

  const groups = [];
  const items = [];
  
  let currentGroupId = "";
  let groupCounter = 1;
  let itemCounter = 1;

  // CSVの階層構造をパース
  rows.forEach((row) => {
    const type = row[0]; // 点検ツリーオブジェクト種別
    const workGroup = row[1];
    const location = row[2];
    const area = row[3];
    const target = row[4];
    const task = row[5];

    if (type === '03点検対象') {
       currentGroupId = "GRP-" + ("000" + groupCounter++).slice(-4);
       groups.push([
         currentGroupId,
         workGroup,
         location,
         area,
         target, // Equipment_ID との紐付け
         groupCounter
       ]);
    } else if (type === '04点検' || type === '04点検項目') {
       // 点検タイプのマッピング (CSV値 -> システム定義値)
       const csvType = row[11];
       let systemType = 'テキスト'; // Default
       if (csvType === '数値') systemType = '数値入力';
       else if (csvType === '選択肢') systemType = 'OK/NG選択';
       else if (csvType === '写真') systemType = '写真のみ';
       else if (csvType === 'テキスト') systemType = 'テキスト';

       const itemId = "ITM-" + ("000" + itemCounter++).slice(-5);
       items.push([
         itemId,
         currentGroupId,
         task,
         row[7], // 詳細説明
         systemType, // マッピング後の値
         row[13], // 単位
         row[14], // 上限
         row[15], // 下限
         row[10], // 異常時指示
         itemCounter
       ]);
    }
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  updateSheetData_(ss, 'M_Inspection_Groups', groups);
  updateSheetData_(ss, 'M_Inspection_Items', items);
  
  Logger.log(`✅ ${fileName} の階層化移行が完了しました。 (Group: ${groups.length}, Item: ${items.length})`);
}

/**
 * 組織情報の階層的移行 (部 -> 事業所 -> 課)
 * 引数なしで直接実行しても動作するように調整しました。
 */
function migrateOrganizationsHierarchy(folder, fileName) {
  // 直接実行された場合（引数が未定義の場合）のフォールバック
  if (!folder) {
    if (DATA_FOLDER_ID === 'ここにフォルダIDを入力してください') {
      throw new Error('DATA_FOLDER_ID を設定してください（migration.gs の11行目）。');
    }
    folder = DriveApp.getFolderById(DATA_FOLDER_ID);
  }
  if (!fileName) fileName = '取り扱いデータ - 組織.csv';

  const file = getFileByName_(folder, fileName);
  if (!file) {
    Logger.log(`エラー: ${fileName} が見つかりませんでした。`);
    return;
  }

  const csvData = readCsvAsTable_(file);
  if (csvData.length <= 1) return;

  const rows = csvData.slice(1);
  const orgs = [];
  // GLOBAL_ORG_MAP を使用
  let idCounter = 1;

  function getNextId() {
    return 'O-' + ('000' + idCounter++).slice(-3);
  }

  rows.forEach(row => {
    const bu = row[0] ? row[0].trim() : '';
    const sho = row[1] ? row[1].trim() : '';
    const ka = row[2] ? row[2].trim() : '';

    // Level 1: 部
    if (bu && !GLOBAL_ORG_MAP[bu]) {
      const id = getNextId();
      GLOBAL_ORG_MAP[bu] = id;
      orgs.push([id, bu, '部', '', idCounter * 10, '有効', '']);
    }

    // Level 2: 事業所
    if (sho) {
      const buId = GLOBAL_ORG_MAP[bu];
      const shoPath = bu + '>' + sho;
      if (!GLOBAL_ORG_MAP[shoPath]) {
        const id = getNextId();
        GLOBAL_ORG_MAP[shoPath] = id;
        orgs.push([id, sho, '事業所', buId, idCounter * 10, '有効', '']);
      }
    }

    // Level 3: 課
    if (ka) {
      const buId = GLOBAL_ORG_MAP[bu];
      const shoPath = bu + '>' + sho;
      const shoId = GLOBAL_ORG_MAP[shoPath];
      const kaPath = bu + '>' + sho + '>' + ka;
      if (!GLOBAL_ORG_MAP[kaPath]) {
        const id = getNextId();
        GLOBAL_ORG_MAP[kaPath] = id;
        orgs.push([id, ka, '課', shoId, idCounter * 10, '有効', '']);
      }
    }
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('M_Organizations');
  if (sheet) {
    // [FIX] 入力規則を更新（「部」を追加）
    setDropdown_(sheet, 3, ['部', '事業部', '事業所', '課', '係']);
  }

  updateSheetData_(ss, 'M_Organizations', orgs);
  Logger.log(`✅ ${fileName} の階層化移行が完了しました。 (Total Orgs: ${orgs.length})`);
}

/**
 * 施設データのマッピング
 * Output: [0]Facility_ID, [1]Name, [2]Address, ...
 */
function mapFacilityData(row, headers, index) {
  // Facility_ID: F-001, F-002...
  const facilityId = 'F-' + ('000' + index).slice(-3);
  const facilityName = row[0];
  
  // [IMPORTANT] キャッシュに登録
  if (facilityName) {
    GLOBAL_FACILITY_MAP[facilityName] = facilityId;
  }
  
  return [
    facilityId,          // Facility_ID
    facilityName,        // Name
    row[2],              // Address
    "",                  // Map_Link
    "",                  // Image_URL
    row[3]               // Contract_ID
  ];
}

/**
 * 資格情報のマッピング
 * Input: [0]資格名, [1]資格種別, [2]資格区分, [3]更新、講習の有無, [4]更新期間
 * Output: [0]Qual_ID, [1]Name, [2]Type, [3]Organizer, [4]Renewal_Period_Years
 */
function mapQualificationData(row, headers, index) {
  // Qual_ID: Q-001, Q-002...
  const qualId = 'Q-' + ('000' + index).slice(-3);
  
  // 更新期間のパース: "5年" -> 5, "" -> 0 or null
  // row[4] が空文字や "無" の場合は 0 にする
  let renewalYears = 0;
  if (row[4] && row[4] !== '無') {
    const match = row[4].match(/\d+/);
    if (match) {
      renewalYears = parseInt(match[0], 10);
    }
  }
  
  return [
    qualId,              // Qual_ID
    row[0],              // Name
    row[1],              // Type ([国家資格, 技能講習, 特別教育, その他])
    "",                  // Organizer (CSVに該当列なし)
    renewalYears         // Renewal_Period_Years
  ];
}

/**
 * 設備データのマッピング
 */
function mapEquipmentData(row, headers, index) {
  // Equipment_ID: CSVにあるIDを優先するが、もし無ければ連番生成も検討
  // 今回はCSVの[0]Equipment_IDを使用する方針だが、形式を統一したい場合はここも E-001 形式にする
  // ユーザー要件: ID視認性向上 -> CSVのIDが既にわかりやすいならそのままだが、
  // ここでは要望に合わせて E-001... 形式に強制変換するか、CSV IDを活かすか。
  // CSVのIDも "EQ-1001" 等であればそのままでよい。
  // いったん「UUID廃止」が主眼なので、CSVのID (row[0]) をそのまま使う（CSV IDが十分に短ければ）。
  // もしCSV IDがUUID並みに長いなら変換が必要。通常は管理番号なのでそのままでよいはず。
  
  // 施設IDの引き当て
  const facilityName = row[3]; // CSVの施設名列
  const facilityId = GLOBAL_FACILITY_MAP[facilityName] || ""; // マップからID取得、なければ空
  
  const sysCat = row[7];
  const midCat = row[8];

  return [
    row[0],               // Equipment_ID (CSVの値を維持)
    facilityId,           // Facility_ID [UPDATE] 名称からIDへ変換済み
    row[1],               // Name
    deriveType_(sysCat, midCat), // Type
    row[30] || '不明',     // Status
    row[4],               // Building
    row[5],               // Floor
    row[6],               // Room
    sysCat,               // System_Category
    "",                   // Category_Major
    midCat,               // Category_Middle
    row[9],               // Category_Minor
    row[11],              // Model_Number
    "",                   // Serial_Number
    row[14],              // Spec_1
    row[15],              // Spec_2
    row[16],              // Spec_3
    row[17],              // Installation_Date
    row[18],              // Operation_Start_Date
    row[21],              // Legal_Lifespan
    row[22],              // Standard_Lifespan
    row[28],              // Manufacturer
    row[29],              // Contractor
    row[32],              // Asset_No
    row[26],              // Maintenance_Type
    "QR-" + row[0]        // QR_Code
  ];
}

/**
 * 大分類・中分類から Type (機械/電気/計装/管路) を判別するヘルパー
 */
function deriveType_(sysCat, midCat) {
  if (!sysCat) return '機械'; // Default
  
  // 管路系
  if (sysCat.includes('管路') || sysCat.includes('管きょ')) {
    return '管路';
  }
  
  // 電気・計装系
  if (sysCat.includes('電気') || sysCat.includes('計装')) {
    // 中分類でさらに細分化
    if (midCat && (midCat.includes('計測') || midCat.includes('監視') || midCat.includes('計装'))) {
      return '計装';
    }
    return '電気';
  }
  
  // 上記以外は機械とみなす（建築設備なども含む）
  return '機械';
}

/**
 * 共通ヘルパー: CSVをテーブル形式で読み込む（Shift-JIS対応）
 */
function readCsvAsTable_(file) {
  const blob = file.getBlob();
  // Shift-JIS (MS932) から UTF-8 への変換
  const csvString = blob.getDataAsString('Shift-JIS');
  return Utilities.parseCsv(csvString);
}

/**
 * 共通ヘルパー: 名前でファイルを取得
 */
function getFileByName_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

/**
 * 共通ヘルパー: シートデータの更新
 */
function updateSheetData_(ss, sheetName, data) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  // ヘッダー行(1行目)を残して、データ行(2行目以降)をクリア
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getMaxColumns()).clearContent();
  }
  
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  }
}

/**
 * 共通ヘルパー: 指定した列にドロップダウン（入力規則）を設定
 */
function setDropdown_(sheet, colIndex, values) {
  var range = sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false) // 違反データの入力を拒否
    .build();
  range.setDataValidation(rule);
}
