/**
 * ============================================================
 * 上下水道施設維持管理システム - 管理用Webアプリ バックエンドAPI (v2)
 * ============================================================
 * 
 * Phase 4: 2データベース構造対応版
 * - Master_DB: 本部マスタ（組織、職員、契約、資格、共通物品）
 * - Facility_DB: 施設固有DB（設備、場所、点検、工事、施設物品）
 * 
 * ★ デプロイ方法:
 *   1. このコードを GAS プロジェクトに配置
 *   2. index.html も同じプロジェクトに配置
 *   3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」として公開
 */

// ============================================================
// データベースID設定
// ============================================================

const V2_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const V2_FACILITY_DB_ID = '1cvF2SCNBCSjfg3InQ1pQWjjoBpJ_01l0b1KwSLQek8Y';
const V2_CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';

// ============================================================
// シート名定数（DB別に分離）
// ============================================================

// Master_DB のシート
const SHEET_MASTER = {
  ORGANIZATIONS:       'M_Organizations',
  CONTRACTS:           'M_Contracts',
  FACILITIES:          'M_Facilities',
  STAFF:               'M_Staff',
  QUALIFICATIONS:      'M_Qualifications',
  QUAL_APPLICATIONS:   'T_Qual_Applications',
  STAFF_CHANGES:       'T_Staff_Changes',
  ITEMS_COMMON:        'M_Items_Common'
};

// Facility_DB のシート
const SHEET_FACILITY = {
  LOCATIONS:           'M_Locations',
  EQUIPMENT:           'M_Equipment',
  INSPECTION_GROUPS:   'M_Inspection_Groups',
  INSPECTION_ITEMS:    'M_Inspection_Items',
  INSPECTION_RESULTS:  'T_Inspection_Results',
  CONSTRUCTION:        'T_Construction_History',
  ITEMS_FACILITY:      'M_Items_Facility',
  INVENTORY_LOGS:      'T_Inventory_Logs',
  INSPECTION_ROUTES:   'M_Inspection_Routes',
  ROUTE_DETAILS:       'M_Route_Details'
};

// 統合シート定数（後方互換用）
const SHEET = Object.assign({}, SHEET_MASTER, SHEET_FACILITY);

// ============================================================
// DB種別マッピング
// ============================================================

const SHEET_DB_MAP = {};
Object.keys(SHEET_MASTER).forEach(key => {
  SHEET_DB_MAP[SHEET_MASTER[key]] = 'MASTER';
});
Object.keys(SHEET_FACILITY).forEach(key => {
  SHEET_DB_MAP[SHEET_FACILITY[key]] = 'FACILITY';
});

// ============================================================
// 自動採番用プレフィックスマッピング
// ============================================================

const ID_PREFIX = {
  'M_Facilities':           { column: 'Facility_ID',      prefix: 'F',    digits: 3, db: 'MASTER' },
  'M_Equipment':            { column: 'Equipment_ID',     prefix: 'E',    digits: 5, db: 'FACILITY' },
  'M_Locations':            { column: 'Location_ID',      prefix: 'L',    digits: 5, db: 'FACILITY' },
  'M_Inspection_Groups':    { column: 'Group_ID',         prefix: 'GRP',  digits: 4, db: 'FACILITY' },
  'M_Inspection_Items':     { column: 'Item_ID',          prefix: 'ITM',  digits: 5, db: 'FACILITY' },
  'M_Inspection_Routes':    { column: 'Route_ID',         prefix: 'R',    digits: 3, db: 'FACILITY' },
  'M_Route_Details':        { column: 'Route_Detail_ID',  prefix: 'RD',   digits: 5, db: 'FACILITY' },
  'M_Organizations':        { column: 'Org_ID',           prefix: 'ORG',  digits: 3, db: 'MASTER' },
  'M_Items_Common':         { column: 'Item_ID',          prefix: 'ITEM', digits: 3, db: 'MASTER' },
  'M_Items_Facility':       { column: 'Item_ID',          prefix: 'ITEM', digits: 3, db: 'FACILITY' },
  'M_Qualifications':       { column: 'Qual_ID',          prefix: 'Q',    digits: 3, db: 'MASTER' },
  'T_Qual_Applications':    { column: 'App_ID',           prefix: 'A',    digits: 3, db: 'MASTER' },
  'T_Staff_Changes':        { column: 'Change_ID',        prefix: 'CHG',  digits: 3, db: 'MASTER' },
  'T_Inspection_Results':   { column: 'Result_ID',        prefix: 'IR',   digits: 5, db: 'FACILITY' },
  'T_Construction_History': { column: 'Construction_ID',  prefix: 'C',    digits: 3, db: 'FACILITY' },
  'T_Inventory_Logs':       { column: 'Log_ID',           prefix: 'LOG',  digits: 3, db: 'FACILITY' }
};

// ============================================================
// Web App エントリポイント
// ============================================================

/**
 * GAS Web App のエントリポイント
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('水インフラ管理システム v2')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================
// データベース接続関数
// ============================================================

/**
 * Master_DB を開く
 */
function openMasterDB() {
  return SpreadsheetApp.openById(V2_MASTER_DB_ID);
}

/**
 * Facility_DB を開く
 */
function openFacilityDB() {
  return SpreadsheetApp.openById(V2_FACILITY_DB_ID);
}

/**
 * シート名から適切なDBを開く
 * @param {string} sheetName - シート名
 * @returns {Spreadsheet} スプレッドシートオブジェクト
 */
function getSpreadsheetBySheetName_(sheetName) {
  const dbType = SHEET_DB_MAP[sheetName];
  if (dbType === 'MASTER') {
    return openMasterDB();
  } else if (dbType === 'FACILITY') {
    return openFacilityDB();
  } else {
    throw new Error('Unknown sheet: ' + sheetName);
  }
}

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * シートの全データをオブジェクト配列として取得
 * @param {string} sheetName - シート名
 * @param {string} dbType - 'MASTER' または 'FACILITY' (省略時は自動判別)
 * @returns {Object[]} ヘッダーをキーとしたオブジェクト配列
 */
function getSheetData_(sheetName, dbType) {
  let ss;
  if (dbType) {
    ss = dbType === 'MASTER' ? openMasterDB() : openFacilityDB();
  } else {
    ss = getSpreadsheetBySheetName_(sheetName);
  }
  
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('Warning: Sheet not found: ' + sheetName);
    return [];
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // ヘッダーのみ
  
  const headers = data[0];
  const rows = [];
  
  // 必要な列が欠落している場合のための補完定義
  const requiredFields = {
    'M_Staff': ['Kana_Sei', 'Kana_Mei', 'Birth_Date', 'Blood_Type', 'Address', 'Phone', 'Emergency_Contact', 'Joined_Date', 'Health_Check_Date', 'Employment_Status', 'Position', 'Grade', 'Responsibility'],
    'T_Qual_Applications': ['Expiration_Date', 'License_Number'],
    'M_Organizations': ['Sort_Order', 'Is_Active', 'Org_Code']
  };

  const defaultValues = {
    'M_Organizations': {
      'Sort_Order': 999,
      'Is_Active': '有効',
      'Org_Code': ''
    }
  };
  
  // 電話番号など、文字列強制変換が必要なフィールド
  const forceStringFields = {
    'M_Staff': ['Phone', 'Emergency_Contact', 'Staff_ID']
  };
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      let val = data[i][j];
      // Date型の場合は文字列に変換
      if (val instanceof Date) {
        row[headers[j]] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      } else {
        row[headers[j]] = val;
      }
    }
    
    // 文字列強制変換（電話番号等）
    if (forceStringFields[sheetName]) {
      forceStringFields[sheetName].forEach(field => {
        if (row[field] !== undefined && row[field] !== '') {
          row[field] = String(row[field]);
        }
      });
    }
    
    // 欠落している列を空文字で補完
    if (requiredFields[sheetName]) {
      requiredFields[sheetName].forEach(field => {
        if (row[field] === undefined) {
          const defaultVal = (defaultValues[sheetName] && defaultValues[sheetName][field] !== undefined)
            ? defaultValues[sheetName][field]
            : '';
          row[field] = defaultVal;
        }
      });
    }
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * シートにデータを追記
 * @param {string} sheetName - シート名
 * @param {Object} rowData - ヘッダー名をキーとしたデータオブジェクト
 */
function appendRow_(sheetName, rowData) {
  const ss = getSpreadsheetBySheetName_(sheetName);
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const newRow = headers.map(h => rowData[h] !== undefined ? rowData[h] : '');
  sheet.appendRow(newRow);
}

/**
 * シートの特定行を更新
 * @param {string} sheetName - シート名
 * @param {string} keyColumn - 主キー列名
 * @param {string} keyValue - 主キー値
 * @param {Object} rowData - 更新データ
 */
function updateRow_(sheetName, keyColumn, keyValue, rowData) {
  const ss = getSpreadsheetBySheetName_(sheetName);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyColIdx = headers.indexOf(keyColumn);
  
  if (keyColIdx === -1) throw new Error('Key column not found: ' + keyColumn);
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyColIdx]) === String(keyValue)) {
      for (let j = 0; j < headers.length; j++) {
        if (rowData[headers[j]] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(rowData[headers[j]]);
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * シートに不足しているヘッダーを追加する
 * @param {string} sheetName - シート名
 * @param {string[]} requiredHeaders - 必要なヘッダー名
 */
function ensureHeaders_(sheetName, requiredHeaders) {
  const ss = getSpreadsheetBySheetName_(sheetName);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  const missing = requiredHeaders.filter(h => headers.indexOf(h) === -1);
  
  if (missing.length > 0) {
    const startCol = headers.filter(Boolean).length + 1;
    const range = sheet.getRange(1, startCol, 1, missing.length);
    range.setValues([missing]);
    range.setBackground('#1565C0');
    range.setFontColor('#FFFFFF');
    range.setFontWeight('bold');
  }
}

// ============================================================
// キャッシュ管理
// ============================================================

const CACHE_PREFIX = 'V2_';
const CACHE_EXPIRATION_SEC = 21600; // 6時間

/**
 * シートデータを取得（キャッシュ優先）
 */
function getSheetDataCached_(sheetName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_PREFIX + sheetName;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log('Cache parse failed for ' + sheetName);
    }
  }
  
  const data = getSheetData_(sheetName);
  try {
    cache.put(cacheKey, JSON.stringify(data), CACHE_EXPIRATION_SEC);
  } catch (e) {
    Logger.log('Cache put failed for ' + sheetName + ' (likely too large)');
  }
  return data;
}

/**
 * キャッシュをクリア
 */
function clearCache_(sheetName) {
  const cache = CacheService.getScriptCache();
  if (sheetName) {
    cache.remove(CACHE_PREFIX + sheetName);
  } else {
    // 全クリア
    Object.values(SHEET).forEach(name => {
      cache.remove(CACHE_PREFIX + name);
    });
  }
}

// ============================================================
// フロントエンド向け公開API
// ============================================================

/**
 * 初回ロード用: 全データを一括取得（Master + Facility 統合）
 */
function getInitialData() {
  return {
    // Master_DB から取得
    facilities:         getSheetDataCached_(SHEET_MASTER.FACILITIES),
    staff:              getSheetDataCached_(SHEET_MASTER.STAFF),
    organizations:      getSheetDataCached_(SHEET_MASTER.ORGANIZATIONS),
    contracts:          getSheetDataCached_(SHEET_MASTER.CONTRACTS),
    qualifications:     getSheetDataCached_(SHEET_MASTER.QUALIFICATIONS),
    qualApplications:   getSheetDataCached_(SHEET_MASTER.QUAL_APPLICATIONS),
    staffChanges:       getSheetDataCached_(SHEET_MASTER.STAFF_CHANGES),
    itemsCommon:        getSheetDataCached_(SHEET_MASTER.ITEMS_COMMON),
    
    // Facility_DB から取得
    locations:          getSheetDataCached_(SHEET_FACILITY.LOCATIONS),
    equipment:          getSheetDataCached_(SHEET_FACILITY.EQUIPMENT),
    inspectionGroups:   getSheetDataCached_(SHEET_FACILITY.INSPECTION_GROUPS),
    inspectionItems:    getSheetDataCached_(SHEET_FACILITY.INSPECTION_ITEMS),
    inspectionRoutes:   getSheetDataCached_(SHEET_FACILITY.INSPECTION_ROUTES),
    routeDetails:       getSheetDataCached_(SHEET_FACILITY.ROUTE_DETAILS),
    inspectionResults:  getSheetDataCached_(SHEET_FACILITY.INSPECTION_RESULTS),
    construction:       getSheetDataCached_(SHEET_FACILITY.CONSTRUCTION),
    itemsFacility:      getSheetDataCached_(SHEET_FACILITY.ITEMS_FACILITY),
    inventoryLogs:      getSheetDataCached_(SHEET_FACILITY.INVENTORY_LOGS)
  };
}

/**
 * 施設一覧を取得
 */
function getFacilities() {
  return getSheetData_(SHEET_MASTER.FACILITIES);
}

/**
 * 設備一覧を取得
 */
function getEquipment() {
  return getSheetData_(SHEET_FACILITY.EQUIPMENT);
}

/**
 * 場所一覧を取得（新機能）
 */
function getLocations() {
  return getSheetData_(SHEET_FACILITY.LOCATIONS);
}

/**
 * 特定設備のタイムライン（点検+工事履歴）を統合取得
 * @param {string} equipmentId - 設備ID
 * @returns {Object[]} 時系列ソートされたイベント配列
 */
function getEquipmentTimeline(equipmentId) {
  const timeline = [];
  
  // 点検実績
  const inspections = getSheetData_(SHEET_FACILITY.INSPECTION_RESULTS);
  inspections.forEach(r => {
    if (r.Equipment_ID === equipmentId) {
      timeline.push({
        type: 'inspection',
        date: r.Timestamp,
        title: '定期点検',
        detail: r.Value,
        status: r.Status,
        inspector: r.Inspector_ID
      });
    }
  });
  
  // 工事履歴
  const constructions = getSheetData_(SHEET_FACILITY.CONSTRUCTION);
  constructions.forEach(c => {
    if (c.Equipment_ID === equipmentId) {
      timeline.push({
        type: 'construction',
        date: c.Start_Date,
        endDate: c.End_Date,
        title: c.Title,
        detail: c.Contractor + ' / ' + c.Category,
        cost: c.Cost,
        category: c.Category
      });
    }
  });
  
  // 日付降順ソート
  timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return timeline;
}

/**
 * 職員一覧を取得
 */
function getStaff() {
  return getSheetData_(SHEET_MASTER.STAFF);
}

/**
 * 物品・在庫一覧を取得（Facility物品のみ、Current_Stock を計算）
 */
function getInventory() {
  const items = getSheetData_(SHEET_FACILITY.ITEMS_FACILITY);
  const logs = getSheetData_(SHEET_FACILITY.INVENTORY_LOGS);
  
  // 各物品の実在庫を入出庫ログから計算
  items.forEach(item => {
    let stock = 0;
    logs.forEach(log => {
      if (log.Item_ID === item.Item_ID) {
        if (log.Type === '入庫') {
          stock += Number(log.Quantity);
        } else if (log.Type === '出庫') {
          stock -= Number(log.Quantity);
        }
      }
    });
    item.Calculated_Stock = stock;
    item.Is_Below_Safety = stock < item.Safety_Stock;
  });
  
  return items;
}

/**
 * ダッシュボード用: 統計サマリを取得
 */
function getDashboardSummary() {
  const equipment = getSheetData_(SHEET_FACILITY.EQUIPMENT);
  const inspections = getSheetData_(SHEET_FACILITY.INSPECTION_RESULTS);
  const constructions = getSheetData_(SHEET_FACILITY.CONSTRUCTION);
  const inventory = getInventory();
  
  // 設備ステータス集計
  const statusCounts = { '稼働中': 0, '停止中': 0, '故障中': 0, '廃棄': 0 };
  equipment.forEach(e => {
    if (statusCounts[e.Status] !== undefined) {
      statusCounts[e.Status]++;
    }
  });
  
  // 直近異常件数（30日以内）
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentAlerts = inspections.filter(r => {
    return r.Status === '異常' && new Date(r.Timestamp) >= thirtyDaysAgo;
  }).length;
  
  // 在庫アラート
  const lowStockItems = inventory.filter(i => i.Is_Below_Safety);
  
  return {
    totalFacilities: getSheetData_(SHEET_MASTER.FACILITIES).length,
    totalEquipment: equipment.length,
    statusCounts: statusCounts,
    recentAlerts: recentAlerts,
    totalInspections: inspections.length,
    activeConstructions: constructions.filter(c => {
      const end = new Date(c.End_Date);
      return end >= now;
    }).length,
    lowStockItems: lowStockItems.length,
    lowStockList: lowStockItems
  };
}

/**
 * 設備データを更新
 */
function updateEquipment(data) {
  return updateRow_(SHEET_FACILITY.EQUIPMENT, 'Equipment_ID', data.Equipment_ID, data);
}

/**
 * 職員データを更新
 */
function updateStaff(data) {
  return updateRow_(SHEET_MASTER.STAFF, 'Email', data.Email, data);
}

/**
 * 汎用保存API: 追加または更新を行う
 * @param {string} sheetName - シート名
 * @param {Object} rowData - 保存するデータ
 * @param {string} idColumn - ID列名
 * @param {string} idValue - IDの値
 */
function saveData(sheetName, rowData, idColumn, idValue) {
  try {
    let result;
    
    // 必要なヘッダーの確保
    if (sheetName === SHEET_MASTER.ORGANIZATIONS) {
      ensureHeaders_(sheetName, ['Sort_Order', 'Is_Active', 'Org_Code']);
    }
    
    if (idColumn && idValue !== undefined && idValue !== null && idValue !== '') {
      // 更新
      const success = updateRow_(sheetName, idColumn, idValue, rowData);
      if (!success) throw new Error('Update failed: Record not found');
      result = { success: true, mode: 'update' };
    } else {
      // 追加
      appendRow_(sheetName, rowData);
      result = { success: true, mode: 'append' };
    }
    
    clearCache_(sheetName);
    return result;
  } catch (e) {
    Logger.log('saveData error: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 汎用削除API
 */
function deleteRow(sheetName, idColumn, idValue) {
  const ss = getSpreadsheetBySheetName_(sheetName);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keyColIdx = headers.indexOf(idColumn);
  
  if (keyColIdx === -1) return { success: false, error: 'Column not found' };
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyColIdx]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      clearCache_(sheetName);
      return { success: true };
    }
  }
  return { success: false, error: 'Record not found' };
}

// ============================================================
// 自動採番API
// ============================================================

/**
 * 次のIDを自動生成（DB対応版）
 */
function generateNextId_(sheetName) {
  const config = ID_PREFIX[sheetName];
  if (!config) throw new Error('No ID config for sheet: ' + sheetName);
  
  const ss = config.db === 'MASTER' ? openMasterDB() : openFacilityDB();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idColIdx = headers.indexOf(config.column);
  if (idColIdx === -1) throw new Error('ID column not found: ' + config.column);
  
  let maxNum = 0;
  const prefix = config.prefix + '-';
  
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idColIdx]);
    if (id.indexOf(prefix) === 0) {
      const numPart = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  
  const nextNum = maxNum + 1;
  const padded = ('000' + nextNum).slice(-config.digits);
  return prefix + padded;
}

/**
 * フロントエンド向け: 次のIDを取得
 */
function getNextId(sheetName) {
  return generateNextId_(sheetName);
}

// ============================================================
// 人事異動・昇進API
// ============================================================

/**
 * 人事異動・昇進・昇格・任命を適用する
 */
function applyStaffChange(changeData) {
  try {
    const changeId = generateNextId_(SHEET_MASTER.STAFF_CHANGES);
    
    // 1. 履歴レコードを追加
    const record = {
      Change_ID: changeId,
      Staff_ID: changeData.staffId,
      Change_Type: changeData.changeType,
      Change_Date: changeData.changeDate,
      Field_Changed: changeData.fieldChanged,
      Old_Value: changeData.oldValue,
      New_Value: changeData.newValue,
      Remarks: changeData.remarks || ''
    };
    appendRow_(SHEET_MASTER.STAFF_CHANGES, record);
    
    // 2. M_Staff の該当フィールドを更新
    const updateData = { Email: changeData.staffEmail };
    updateData[changeData.fieldChanged] = changeData.newValue;
    updateRow_(SHEET_MASTER.STAFF, 'Email', changeData.staffEmail, updateData);
    
    // 3. キャッシュクリア
    clearCache_(SHEET_MASTER.STAFF);
    clearCache_(SHEET_MASTER.STAFF_CHANGES);
    
    return { success: true, changeId: changeId };
  } catch (e) {
    Logger.log('applyStaffChange error: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ============================================================
// システム可視化・ER図生成API
// ============================================================

/**
 * 全シートのヘッダー情報を読み込み、Mermaid形式のER図テキストを生成（2DB対応版）
 */
function getSchemaDiagram() {
  const masterSS = openMasterDB();
  const facilitySS = openFacilityDB();
  
  let erText = 'erDiagram\n';
  const schemaMap = {};
  const tablePKs = {};
  
  // Helper: シートを処理
  function processSheets(ss, dbLabel) {
    const sheets = ss.getSheets();
    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (!name.match(/^[MT]_/)) return;
      
      const safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
      if (!safeName) return;

      const lastCol = sheet.getLastColumn();
      let headers = [];
      if (sheet.getLastRow() > 0 && lastCol > 0) {
        headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      }
      
      // 重複除去と空文字排除
      const cleanHeaders = [];
      const seenH = {};
      headers.forEach(h => {
        if (h === "" || h === null || h === undefined) return;
        const hStr = String(h).trim();
        if (!seenH[hStr]) {
          cleanHeaders.push(hStr);
          seenH[hStr] = true;
        }
      });

      schemaMap[safeName] = cleanHeaders;
      
      // テーブル定義出力
      erText += '  ' + safeName + ' {\n';
      cleanHeaders.forEach(h => {
        let isPK = false;
        let isFK = false;
        
        if (h.match(/_ID$/i)) {
          const base = safeName.replace(/^[MT]_/, '').replace(/s$/, '').toLowerCase();
          const hLower = h.toLowerCase();
          if (hLower.indexOf(base) !== -1 || hLower === 'id') {
            isPK = true;
            tablePKs[safeName] = h;
          } else {
            isFK = true;
          }
        }
        
        let type = 'string';
        if (h.match(/Date|Time|Timestamp/i)) type = 'date';
        if (h.match(/Count|Amount|Cost|Stock|Order|Quantity/i)) type = 'number';
        
        const keyMark = isPK ? ' PK' : (isFK ? ' FK' : '');
        const saferH = h.replace(/[^a-zA-Z0-9_]/g, '');
        
        erText += '    ' + type + ' ' + (saferH || 'col') + keyMark + '\n';
      });
      erText += '  }\n';
    });
  }
  
  processSheets(masterSS, 'Master');
  processSheets(facilitySS, 'Facility');
  
  // リレーション推論
  const drawnRels = {};
  Object.keys(schemaMap).forEach(src => {
    schemaMap[src].forEach(col => {
      if (!col.match(/_ID$/i)) return;
      
      Object.keys(tablePKs).forEach(tgt => {
        if (src === tgt) return;
        if (col.toLowerCase() === tablePKs[tgt].toLowerCase()) {
          const relKey = [src, tgt].sort().join('-');
          if (!drawnRels[relKey]) {
            erText += '  ' + tgt + ' ||--o{ ' + src + ' : "via_' + col.replace(/[^a-zA-Z0-9_]/g, '') + '"\n';
            drawnRels[relKey] = true;
          }
        }
      });
    });
  });

  return erText;
}

/**
 * デバッグ用: ER図テキストをログ出力
 */
function debugGetERText() {
  const text = getSchemaDiagram();
  Logger.log(text);
  return text;
}
