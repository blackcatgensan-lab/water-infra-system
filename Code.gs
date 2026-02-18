/**
 * ============================================================
 * 上下水道施設維持管理システム - 管理用Webアプリ バックエンドAPI (v2.4)
 * ============================================================
 * 
 * Update History:
 * v2.4: 業務マスタ（物品・点検ルート）編集機能の実装
 * - 物品入出庫ログ記録機能の追加
 * - 点検ルート詳細の一括保存機能
 */

// ============================================================
// データベースID設定
// ============================================================

const V2_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const V2_CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';

// ============================================================
// シート名定数
// ============================================================

const SHEET_MASTER = {
  ORGANIZATIONS:       'M_Organizations',
  CONTRACTS:           'M_Contracts',
  FACILITIES:          'M_Facilities',
  STAFF:               'M_Staff',
  QUALIFICATIONS:      'M_Qualifications',
  QUAL_APPLICATIONS:   'T_Qual_Applications',
  STAFF_CHANGES:       'T_Staff_Changes',
  ITEMS_COMMON:        'M_Items_Common',
  IT_DEVICES:          'M_IT_Devices',
  IT_SOFTWARE:         'M_IT_Software',
  IT_INSTALLATIONS:    'T_IT_Installations'
};

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

const SHEET_DB_MAP = {};
Object.keys(SHEET_MASTER).forEach(key => SHEET_DB_MAP[SHEET_MASTER[key]] = 'MASTER');
Object.keys(SHEET_FACILITY).forEach(key => SHEET_DB_MAP[SHEET_FACILITY[key]] = 'FACILITY');

const SHEET = Object.assign({}, SHEET_MASTER, SHEET_FACILITY);

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
  'M_Staff':                { column: 'Staff_ID',         prefix: 'S',    digits: 4, db: 'MASTER' },
  'M_Qualifications':       { column: 'Qual_ID',          prefix: 'Q',    digits: 3, db: 'MASTER' },
  'T_Qual_Applications':    { column: 'App_ID',           prefix: 'A',    digits: 3, db: 'MASTER' },
  'T_Staff_Changes':        { column: 'Change_ID',        prefix: 'CHG',  digits: 3, db: 'MASTER' },
  'T_Inspection_Results':   { column: 'Result_ID',        prefix: 'IR',   digits: 5, db: 'FACILITY' },
  'T_Construction_History': { column: 'Construction_ID',  prefix: 'C',    digits: 3, db: 'FACILITY' },
  'T_Inventory_Logs':       { column: 'Log_ID',           prefix: 'LOG',  digits: 3, db: 'FACILITY' },
  'M_IT_Devices':           { column: 'Device_ID',        prefix: 'DEV',  digits: 3, db: 'MASTER' },
  'M_IT_Software':          { column: 'Soft_ID',          prefix: 'SOFT', digits: 3, db: 'MASTER' },
  'T_IT_Installations':     { column: 'Install_ID',       prefix: 'INST', digits: 5, db: 'MASTER' }
};

// ============================================================
// Web App エントリポイント
// ============================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('水インフラ管理システム v2.4')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================
// 公開API
// ============================================================

function getInitialData() {
  try {
    return {
      facilities: getFacilities() || [],
      organizations: getSheetDataCached_(SHEET_MASTER.ORGANIZATIONS, 'MASTER') || [],
      staff: getSheetDataCached_(SHEET_MASTER.STAFF, 'MASTER') || [],
      contracts: getSheetDataCached_(SHEET_MASTER.CONTRACTS, 'MASTER') || [],
      qualifications: getSheetDataCached_(SHEET_MASTER.QUALIFICATIONS, 'MASTER') || [],
      qualApplications: getSheetDataCached_(SHEET_MASTER.QUAL_APPLICATIONS, 'MASTER') || [],
      staffChanges: getSheetDataCached_(SHEET_MASTER.STAFF_CHANGES, 'MASTER') || [],
      itemsCommon: getSheetDataCached_(SHEET_MASTER.ITEMS_COMMON, 'MASTER') || [],
      itDevices: getSheetDataCached_(SHEET_MASTER.IT_DEVICES, 'MASTER') || [],
      itSoftware: getSheetDataCached_(SHEET_MASTER.IT_SOFTWARE, 'MASTER') || [],
      itInstallations: getSheetDataCached_(SHEET_MASTER.IT_INSTALLATIONS, 'MASTER') || []
    };
  } catch (e) {
    Logger.log('getInitialData Error: ' + e.message);
    throw new Error('初期データの読み込みに失敗しました: ' + e.message);
  }
}

function getFacilityData(facilityId) {
  if (!facilityId) throw new Error('施設IDが指定されていません');
  setCurrentFacility(facilityId);
  return {
    facilityId: facilityId,
    locations: getLocations(facilityId),
    equipment: getEquipment(facilityId),
    inspectionGroups: getSheetDataCached_(SHEET_FACILITY.INSPECTION_GROUPS, 'FACILITY', facilityId),
    inspectionItems: getSheetDataCached_(SHEET_FACILITY.INSPECTION_ITEMS, 'FACILITY', facilityId),
    inspectionRoutes: getSheetDataCached_(SHEET_FACILITY.INSPECTION_ROUTES, 'FACILITY', facilityId),
    routeDetails: getSheetDataCached_(SHEET_FACILITY.ROUTE_DETAILS, 'FACILITY', facilityId),
    inspectionResults: getSheetDataCached_(SHEET_FACILITY.INSPECTION_RESULTS, 'FACILITY', facilityId),
    construction: getSheetDataCached_(SHEET_FACILITY.CONSTRUCTION, 'FACILITY', facilityId),
    items: getSheetDataCached_(SHEET_FACILITY.ITEMS_FACILITY, 'FACILITY', facilityId),
    inventoryLogs: getSheetDataCached_(SHEET_FACILITY.INVENTORY_LOGS, 'FACILITY', facilityId)
  };
}

function getFacilities() {
  return getSheetDataCached_(SHEET_MASTER.FACILITIES, 'MASTER');
}

// ============================================================
// データ取得ロジック
// ============================================================

function getEquipment(facilityId) {
  if (!facilityId) return [];
  const equipment = getSheetDataCached_(SHEET_FACILITY.EQUIPMENT, 'FACILITY', facilityId);
  const locations = getSheetDataCached_(SHEET_FACILITY.LOCATIONS, 'FACILITY', facilityId);
  const locationMap = {};
  locations.forEach(loc => { if (loc.Location_ID) locationMap[loc.Location_ID] = loc; });
  const facilities = getFacilities();
  const facility = facilities.find(f => f.Facility_ID === facilityId);
  const facilityName = facility ? facility.Name : facilityId;
  return equipment.map(eq => {
    const loc = locationMap[eq.Location_ID] || {};
    return {
      ...eq,
      Building: normalizeValue_(loc.Building || eq.Building),
      Floor: normalizeValue_(loc.Floor || eq.Floor),
      Room: normalizeValue_(loc.Room || eq.Room),
      Facility_Name: facilityName,
      Location_Name: loc.Name || '' 
    };
  });
}

function getLocations(facilityId) {
  return getSheetDataCached_(SHEET_FACILITY.LOCATIONS, 'FACILITY', facilityId);
}

// ============================================================
// セッション・DB接続管理
// ============================================================

function getCurrentFacilityId_() {
  return CacheService.getUserCache().get('CURRENT_FACILITY_ID');
}

function setCurrentFacility(facilityId) {
  CacheService.getUserCache().put('CURRENT_FACILITY_ID', facilityId, 21600);
  return { success: true };
}

function openMasterDB() { return SpreadsheetApp.openById(V2_MASTER_DB_ID); }

function openFacilityDB(facilityId) {
  if (!facilityId) facilityId = getCurrentFacilityId_();
  if (!facilityId) throw new Error('Facility ID required');
  const dbFileId = getFacilityDBFileId_(facilityId);
  if (!dbFileId) throw new Error(`Facility DB not found for ID: ${facilityId}`);
  return SpreadsheetApp.openById(dbFileId);
}

function getFacilityDBFileId_(facilityId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `V2_DB_FILE_ID_${facilityId}`;
  let dbFileId = cache.get(cacheKey);
  if (dbFileId) return dbFileId;
  const masterSS = openMasterDB();
  const sheet = masterSS.getSheetByName(SHEET_MASTER.FACILITIES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const fIdIdx = headers.indexOf('Facility_ID');
  const fileIdIdx = headers.indexOf('DB_File_ID');
  for (let i = 1; i < data.length; i++) {
    if (data[i][fIdIdx] === facilityId) {
      dbFileId = data[i][fileIdIdx];
      if (dbFileId) { cache.put(cacheKey, dbFileId, 3600); return dbFileId; }
    }
  }
  return null;
}

function getSpreadsheetBySheetName_(sheetName, facilityId) {
  const dbType = SHEET_DB_MAP[sheetName];
  if (dbType === 'MASTER') return openMasterDB();
  if (dbType === 'FACILITY') return openFacilityDB(facilityId);
  throw new Error('Unknown sheet: ' + sheetName);
}

// ============================================================
// ヘルパー関数（データ取得・キャッシュ）
// ============================================================

function getSheetDataCached_(sheetName, dbType, facilityId) {
  const cacheKey = (dbType === 'FACILITY' && facilityId)
    ? `V2_${sheetName}_${facilityId}` : `V2_${sheetName}_MASTER`;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) { } }
  const data = getSheetData_(sheetName, dbType, facilityId);
  try {
    const json = JSON.stringify(data);
    if (json.length < 100000) cache.put(cacheKey, json, 600);
  } catch(e) { Logger.log('Cache skip: ' + sheetName); }
  return data;
}

function getSheetData_(sheetName, dbType, facilityId) {
  let ss = getSpreadsheetBySheetName_(sheetName, facilityId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    let isEmpty = true;
    for (let j = 0; j < headers.length; j++) {
      let val = data[i][j];
      if (val instanceof Date) {
        row[headers[j]] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      } else {
        row[headers[j]] = val;
      }
      if (val !== '') isEmpty = false;
    }
    if (!isEmpty) rows.push(row);
  }
  return rows;
}

function normalizeValue_(value) {
  if (value === null || value === undefined) return '(未設定)';
  const s = String(value).trim();
  if (s === '' || s === '-' || s === '---') return '(未設定)';
  return s;
}

// ============================================================
// データ更新系（CRUD）
// ============================================================

function saveData(sheetName, data, idColumn, idValue, facilityId) {
  try {
    if (idColumn && data[idColumn] === undefined && idValue) {
      data[idColumn] = idValue;
    } else if (!data[idColumn]) {
      data[idColumn] = getNextId(sheetName, facilityId);
    }
    const ss = getSpreadsheetBySheetName_(sheetName, facilityId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
    ensureHeaders_(sheet, sheetName); 
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = lastRow > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    if (headers.length === 0) throw new Error(`No headers in ${sheetName}`);
    let targetRow = -1;
    const idIdx = headers.indexOf(idColumn);
    if (idIdx !== -1 && idValue) {
      const allData = sheet.getDataRange().getValues();
      for (let i = 1; i < allData.length; i++) {
        if (String(allData[i][idIdx]) === String(idValue)) { targetRow = i + 1; break; }
      }
    }
    if (targetRow !== -1) {
      const currentVals = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
      const newVals = headers.map((h, idx) => data[h] !== undefined ? data[h] : currentVals[idx]);
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([newVals]);
    } else {
      const rowData = headers.map(h => data[h] !== undefined ? data[h] : '');
      sheet.appendRow(rowData);
    }
    try { clearAllCache(); } catch(ce) { }
    return { success: true, id: data[idColumn] };
  } catch (e) {
    Logger.log('saveData Error: ' + e.message);
    throw new Error('保存エラー: ' + e.message);
  }
}

/**
 * 点検ルートの詳細（M_Route_Details）を一括保存する
 */
function saveRouteDetails(routeId, details, facilityId) {
  if (!routeId || !facilityId) throw new Error('Route_ID and Facility_ID required');
  const ss = openFacilityDB(facilityId);
  const sheet = ss.getSheetByName(SHEET_FACILITY.ROUTE_DETAILS);
  if (!sheet) throw new Error('M_Route_Details sheet not found');
  
  // 1. 既存の該当ルート詳細を削除
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const routeIdIdx = headers.indexOf('Route_ID');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][routeIdIdx]) === String(routeId)) {
      sheet.deleteRow(i + 1);
    }
  }
  
  // 2. 新しい詳細を追加
  details.forEach((d, index) => {
    const detailId = getNextId(SHEET_FACILITY.ROUTE_DETAILS, facilityId);
    const row = headers.map(h => {
      if (h === 'Route_Detail_ID') return detailId;
      if (h === 'Route_ID') return routeId;
      if (h === 'Sort_Order') return index + 1;
      return d[h] || '';
    });
    sheet.appendRow(row);
  });
  
  clearAllCache();
  return { success: true };
}

/**
 * 物品の入出庫ログを記録し、在庫を更新する
 */
function recordInventoryMove(itemType, item, changeType, quantity, staffId, facilityId) {
  if (!item || !quantity) throw new Error('Item and Quantity required');
  
  // 1. ログを記録
  const logData = {
    Log_ID: getNextId(SHEET_FACILITY.INVENTORY_LOGS, facilityId),
    Item_ID: item.Item_ID,
    Type: changeType, // 入庫, 出庫, 棚卸
    Quantity: quantity,
    Staff_ID: staffId || '',
    Log_Date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  };
  saveData(SHEET_FACILITY.INVENTORY_LOGS, logData, 'Log_ID', null, facilityId);
  
  // 2. 在庫を更新（M_Itemsに在庫列がある場合）
  const sheetName = itemType === 'COMMON' ? SHEET_MASTER.ITEMS_COMMON : SHEET_FACILITY.ITEMS_FACILITY;
  const dbType = itemType === 'COMMON' ? 'MASTER' : 'FACILITY';
  const fId = itemType === 'COMMON' ? null : facilityId;
  
  const currentItems = getSheetDataCached_(sheetName, dbType, fId);
  const targetItem = currentItems.find(i => i.Item_ID === item.Item_ID);
  
  if (targetItem && targetItem.Stock !== undefined) {
    let newStock = Number(targetItem.Stock || 0);
    if (changeType === '入庫') newStock += Number(quantity);
    else if (changeType === '出庫') newStock -= Number(quantity);
    else if (changeType === '棚卸') newStock = Number(quantity);
    
    saveData(sheetName, { Stock: newStock }, 'Item_ID', item.Item_ID, fId);
  }
  
  return { success: true };
}

function clearAllCache() {
  const cache = CacheService.getScriptCache();
  const keys = [
    `V2_${SHEET_MASTER.ORGANIZATIONS}_MASTER`,
    `V2_${SHEET_MASTER.STAFF}_MASTER`,
    `V2_${SHEET_MASTER.QUALIFICATIONS}_MASTER`,
    `V2_${SHEET_MASTER.CONTRACTS}_MASTER`,
    `V2_${SHEET_MASTER.ITEMS_COMMON}_MASTER`
  ];
  const currentFac = CacheService.getUserCache().get('CURRENT_FACILITY_ID');
  if (currentFac) {
    keys.push(`V2_${SHEET_FACILITY.EQUIPMENT}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.LOCATIONS}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.INSPECTION_ROUTES}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.ROUTE_DETAILS}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.ITEMS_FACILITY}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.INVENTORY_LOGS}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.IT_DEVICES}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.IT_SOFTWARE}_${currentFac}`);
    keys.push(`V2_${SHEET_FACILITY.IT_INSTALLATIONS}_${currentFac}`);
  }
  cache.removeAll(keys);
}

function saveITDeviceAndInstallations(device, softwareIds, facilityId) {
  if (!device || !facilityId) throw new Error('Invalid arguments');

  // 1. Save Device
  const res = saveData(SHEET_FACILITY.IT_DEVICES, device, 'Device_ID', device.Device_ID, facilityId);
  const deviceId = res.id;

  // 2. Update Installations (Delete old -> Insert new)
  const ss = openFacilityDB(facilityId);
  const sheet = ss.getSheetByName(SHEET_FACILITY.IT_INSTALLATIONS);
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const headers = data.length > 0 ? data[0] : [];
    
    // ヘッダーがある場合のみ処理
    if (headers.length > 0) {
      // Delete existing
      const devIdIdx = headers.indexOf('Device_ID');
      if (devIdIdx !== -1) {
        // data.length - 1 down to 1 (skip header)
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][devIdIdx]) === String(deviceId)) {
            sheet.deleteRow(i + 1);
          }
        }
      }
      
      // Insert new
      if (softwareIds && softwareIds.length > 0) {
        softwareIds.forEach(softId => {
          const installId = getNextId(SHEET_FACILITY.IT_INSTALLATIONS, facilityId);
          const row = headers.map(h => {
             if (h === 'Install_ID') return installId;
             if (h === 'Device_ID') return deviceId;
             if (h === 'Soft_ID') return softId;
             return '';
          });
          sheet.appendRow(row);
        });
      }
    }
  }
  
  clearAllCache();
  return { success: true, id: deviceId };
}

function getNextId(sheetName, facilityId) {
  try {
    const config = ID_PREFIX[sheetName];
    if (!config) throw new Error('Auto-ID not configured for ' + sheetName);
    const ss = getSpreadsheetBySheetName_(sheetName, facilityId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return config.prefix + '-' + String(1).padStart(config.digits, '0');
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return config.prefix + '-' + String(1).padStart(config.digits, '0');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIdx = headers.indexOf(config.column);
    if (colIdx === -1) return config.prefix + '-' + String(1).padStart(config.digits, '0');
    let maxNum = 0;
    for (let i = 1; i < data.length; i++) {
      const val = String(data[i][colIdx]);
      if (val.startsWith(config.prefix + '-')) {
        const parts = val.split('-');
        if (parts.length > 1) {
          const num = parseInt(parts[1]);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    }
    return config.prefix + '-' + String(maxNum + 1).padStart(config.digits, '0');
  } catch (e) { throw new Error('採番エラー: ' + e.message); }
}

function ensureHeaders_(sheet, sheetName) {}
