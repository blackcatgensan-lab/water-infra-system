/**
 * ============================================================
 * 上下水道施設維持管理システム - 管理用Webアプリ バックエンドAPI
 * ============================================================
 * 
 * GAS HtmlService によるスタンドアロン Web App
 * setupDatabase.gs で作成した「水インフラ管理DB」に接続
 * 
 * ★ デプロイ方法:
 *   1. setupDatabase() を実行してスプレッドシートを作成
 *   2. 作成されたスプレッドシートを開き「拡張機能 > Apps Script」を開く
 *   3. このプロジェクトに Code.gs と index.html を作成して貼り付け
 *   4. デプロイ実行（ID設定は不要です）
 */

// ============================================================
// 設定
// ============================================================

/**
 * ★ スプレッドシートの ID (setupDatabase.gs にて定義されています)
 */
// var SPREADSHEET_ID は setupDatabase.gs で定義

// シート名定数
var SHEET = {
  FACILITIES:          'M_Facilities',
  EQUIPMENT:           'M_Equipment',
  INSPECTION_GROUPS:   'M_Inspection_Groups',
  INSPECTION_ITEMS:     'M_Inspection_Items',
  INSPECTION_RESULTS:  'T_Inspection_Results',
  CONSTRUCTION:        'T_Construction_History',
  ITEMS:               'M_Items',
  INVENTORY_LOGS:      'T_Inventory_Logs',
  STAFF:               'M_Staff',
  INSPECTION_ROUTES:   'M_Inspection_Routes',
  ROUTE_DETAILS:       'M_Route_Details', // [NEW] v2
  // [NEW] Phase 5
  ORGANIZATIONS:       'M_Organizations',
  CONTRACTS:           'M_Contracts',
  QUALIFICATIONS:      'M_Qualifications',
  QUAL_APPLICATIONS:   'T_Qual_Applications',
  STAFF_CHANGES:       'T_Staff_Changes'
};

// 自動採番用プレフィックスマッピング
var ID_PREFIX = {
  'M_Facilities':           { column: 'Facility_ID',      prefix: 'F',   digits: 3 },
  'M_Equipment':            { column: 'Equipment_ID',     prefix: 'E',   digits: 3 },
  'M_Inspection_Groups':    { column: 'Group_ID',         prefix: 'GRP', digits: 4 },
  'M_Inspection_Items':     { column: 'Item_ID',          prefix: 'ITM', digits: 5 },
  'M_Inspection_Routes':    { column: 'Route_ID',         prefix: 'R',   digits: 3 },
  'M_Route_Details':        { column: 'Route_Detail_ID',  prefix: 'RD',  digits: 5 },
  'M_Organizations':        { column: 'Org_ID',           prefix: 'ORG', digits: 3 },
  'M_Items':                { column: 'Item_ID',          prefix: 'ITEM', digits: 3 },
  'M_Qualifications':       { column: 'Qual_ID',          prefix: 'Q',   digits: 3 },
  'T_Qual_Applications':    { column: 'App_ID',           prefix: 'A',   digits: 3 },
  'T_Staff_Changes':        { column: 'Change_ID',        prefix: 'CHG', digits: 3 },
  'T_Inspection_Results':   { column: 'Result_ID',        prefix: 'IR',  digits: 3 },
  'T_Construction_History': { column: 'Construction_ID',  prefix: 'C',   digits: 3 },
  'T_Inventory_Logs':       { column: 'Log_ID',           prefix: 'LOG', digits: 3 }
};


// ============================================================
// Web App エントリポイント
// ============================================================

/**
 * GAS Web App のエントリポイント
 * index.html を返す
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('水インフラ管理システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ============================================================
// ヘルパー関数
// ============================================================

/**
 * スプレッドシートオブジェクトを取得
 */
function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } else {
    // コンテナバインド（スプレッドシート内のApps Script）として実行する場合
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * シートの全データをオブジェクト配列として取得
 * @param {string} sheetName - シート名
 * @returns {Object[]} ヘッダーをキーとしたオブジェクト配列
 */
function getSheetData_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // ヘッダーのみ
  
  var headers = data[0];
  var rows = [];
  
  // [NEW] 必要な列が欠落している場合のための補完定義
  var requiredFields = {
    'M_Staff': ['Kana_Sei', 'Kana_Mei', 'Birth_Date', 'Blood_Type', 'Address', 'Phone', 'Emergency_Contact', 'Joined_Date', 'Health_Check_Date', 'Employment_Status', 'Position', 'Grade', 'Responsibility'],
    'T_Qual_Applications': ['Expiration_Date', 'License_Number'],
    'M_Organizations': ['Sort_Order', 'Is_Active', 'Org_Code']
  };

  // [NEW] デフォルト値の定義
  var defaultValues = {
    'M_Organizations': {
      'Sort_Order': 999,
      'Is_Active': '有効',
      'Org_Code': ''
    }
  };
  
  // 電話番号など、文字列強制変換が必要なフィールド
  var forceStringFields = {
    'M_Staff': ['Phone', 'Emergency_Contact', 'Staff_ID']
  };
  
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Date型の場合は文字列に変換
      if (val instanceof Date) {
        row[headers[j]] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      } else {
        row[headers[j]] = val;
      }
    }
    
    // 文字列強制変換（電話番号等）
    if (forceStringFields[sheetName]) {
      forceStringFields[sheetName].forEach(function(field) {
        if (row[field] !== undefined && row[field] !== '') {
          row[field] = String(row[field]);
        }
      });
    }
    
    // 欠落している列を空文字で補完
    if (requiredFields[sheetName]) {
      requiredFields[sheetName].forEach(function(field) {
        if (row[field] === undefined) {
          var defaultVal = (defaultValues[sheetName] && defaultValues[sheetName][field] !== undefined)
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
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var newRow = headers.map(function(h) {
    return rowData[h] !== undefined ? rowData[h] : '';
  });
  
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
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyColIdx = headers.indexOf(keyColumn);
  
  if (keyColIdx === -1) throw new Error('Key column not found: ' + keyColumn);
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyColIdx]) === String(keyValue)) {
      for (var j = 0; j < headers.length; j++) {
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
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  var missing = requiredHeaders.filter(function(h) {
    return headers.indexOf(h) === -1;
  });
  
  if (missing.length > 0) {
    var startCol = headers.filter(Boolean).length + 1;
    var range = sheet.getRange(1, startCol, 1, missing.length);
    range.setValues([missing]);
    range.setBackground('#1565C0'); // Default header color
    range.setFontColor('#FFFFFF');
    range.setFontWeight('bold');
  }
}


// ============================================================
// フロントエンド向け公開API (google.script.run から呼び出し)
// ============================================================

/**
 * 初回ロード用: 全データを一括取得
 * ネットワーク呼び出し回数を最小化するため一括で返す
 */
const CACHE_PREFIX = 'SHEET_CACHE_';
const CACHE_EXPIRATION_SEC = 21600; // 6 hours

/**
 * シートデータを取得（キャッシュ優先）
 */
function getSheetDataCached_(sheetName) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_PREFIX + sheetName);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      console.warn('Cache parse failed for ' + sheetName);
    }
  }
  
  var data = getSheetData_(sheetName);
  try {
    // 1枚のシートデータが100KBを超えるとここでも失敗するが、全体100KBよりは余裕がある
    cache.put(CACHE_PREFIX + sheetName, JSON.stringify(data), CACHE_EXPIRATION_SEC);
  } catch (e) {
    console.warn('Cache put failed for ' + sheetName + ' (likely too large)');
  }
  return data;
}

/**
 * 初回ロード用: 全データを一括取得
 */
function getInitialData() {
  return {
    facilities:         getSheetDataCached_(SHEET.FACILITIES),
    equipment:          getSheetDataCached_(SHEET.EQUIPMENT),
    inspectionRoutes:   getSheetDataCached_(SHEET.INSPECTION_ROUTES),
    inspectionResults:  getSheetDataCached_(SHEET.INSPECTION_RESULTS),
    construction:       getSheetDataCached_(SHEET.CONSTRUCTION),
    items:              getSheetDataCached_(SHEET.ITEMS),
    inventoryLogs:      getSheetDataCached_(SHEET.INVENTORY_LOGS),
    staff:              getSheetDataCached_(SHEET.STAFF),
    organizations:      getSheetDataCached_(SHEET.ORGANIZATIONS),
    contracts:          getSheetDataCached_(SHEET.CONTRACTS),
    qualifications:     getSheetDataCached_(SHEET.QUALIFICATIONS),
    qualApplications:   getSheetDataCached_(SHEET.QUAL_APPLICATIONS),
    staffChanges:       getSheetDataCached_(SHEET.STAFF_CHANGES),
    routeDetails:       getSheetDataCached_(SHEET.ROUTE_DETAILS) // [NEW] v2
  };
}

/**
 * デバッグ用: 生成されたER図テキストをログに出力する
 */
function debugGetERText() {
  var text = getSchemaDiagram();
  Logger.log(text);
  return text;
}

function clearCache_(sheetName) {
  var cache = CacheService.getScriptCache();
  if (sheetName) {
    cache.remove(CACHE_PREFIX + sheetName);
  } else {
    // 全クリア（必要に応じて）
    Object.keys(SHEET).forEach(function(key) {
      cache.remove(CACHE_PREFIX + SHEET[key]);
    });
  }
}

/**
 * 施設一覧を取得
 */
function getFacilities() {
  return getSheetData_(SHEET.FACILITIES);
}

/**
 * 設備一覧を取得
 */
function getEquipment() {
  return getSheetData_(SHEET.EQUIPMENT);
}

/**
 * 特定設備のタイムライン（点検+工事履歴）を統合取得
 * @param {string} equipmentId - 設備ID
 * @returns {Object[]} 時系列ソートされたイベント配列
 */
function getEquipmentTimeline(equipmentId) {
  var timeline = [];
  
  // 点検実績
  var inspections = getSheetData_(SHEET.INSPECTION_RESULTS);
  inspections.forEach(function(r) {
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
  var constructions = getSheetData_(SHEET.CONSTRUCTION);
  constructions.forEach(function(c) {
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
  timeline.sort(function(a, b) {
    return new Date(b.date) - new Date(a.date);
  });
  
  return timeline;
}

/**
 * 職員一覧を取得
 */
function getStaff() {
  return getSheetData_(SHEET.STAFF);
}

/**
 * 物品・在庫一覧を取得（Current_Stock を入出庫ログから計算）
 */
function getInventory() {
  var items = getSheetData_(SHEET.ITEMS);
  var logs = getSheetData_(SHEET.INVENTORY_LOGS);
  
  // 各物品の実在庫を入出庫ログから計算
  items.forEach(function(item) {
    var stock = 0;
    logs.forEach(function(log) {
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
  var equipment = getSheetData_(SHEET.EQUIPMENT);
  var inspections = getSheetData_(SHEET.INSPECTION_RESULTS);
  var constructions = getSheetData_(SHEET.CONSTRUCTION);
  var inventory = getInventory();
  
  // 設備ステータス集計
  var statusCounts = { '稼働中': 0, '停止中': 0, '故障中': 0, '廃棄': 0 };
  equipment.forEach(function(e) {
    if (statusCounts[e.Status] !== undefined) {
      statusCounts[e.Status]++;
    }
  });
  
  // 直近異常件数（30日以内）
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  var recentAlerts = inspections.filter(function(r) {
    return r.Status === '異常' && new Date(r.Timestamp) >= thirtyDaysAgo;
  }).length;
  
  // 在庫アラート
  var lowStockItems = inventory.filter(function(i) { return i.Is_Below_Safety; });
  
  return {
    totalFacilities: getSheetData_(SHEET.FACILITIES).length,
    totalEquipment: equipment.length,
    statusCounts: statusCounts,
    recentAlerts: recentAlerts,
    totalInspections: inspections.length,
    activeConstructions: constructions.filter(function(c) {
      var end = new Date(c.End_Date);
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
  return updateRow_(SHEET.EQUIPMENT, 'Equipment_ID', data.Equipment_ID, data);
}

/**
 * 職員データを更新
 */
function updateStaff(data) {
  return updateRow_(SHEET.STAFF, 'Email', data.Email, data);
}

/**
 * 汎用保存API: 追加または更新を行う
 * @param {string} sheetName - シート名
 * @param {Object} rowData - 保存するデータ
 * @param {string} idColumn - ID列名 (nullの場合は追加)
 * @param {string} idValue - IDの値 (nullの場合は追加)
 */
function saveData(sheetName, rowData, idColumn, idValue) {
  try {
    var result;
    // 必要なヘッダーの確保
    if (sheetName === SHEET.ORGANIZATIONS) {
      ensureHeaders_(sheetName, ['Sort_Order', 'Is_Active', 'Org_Code']);
    }
    
    // idValue が 0 や空文字列の場合でも判定できるように明示的な比較を行う
    if (idColumn && idValue !== undefined && idValue !== null && idValue !== '') {
      // 更新 (Update)
      var success = updateRow_(sheetName, idColumn, idValue, rowData);
      if (!success) throw new Error('Update failed: Record not found');
      result = { success: true, mode: 'update' };
    } else {
      // 追加 (Append)
      appendRow_(sheetName, rowData);
      result = { success: true, mode: 'append' };
    }
    clearCache_(sheetName); // 該当シートのキャッシュをクリア
    return result;
  } catch (e) {
    console.error('saveData error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 汎用削除API
 * @param {string} sheetName - シート名
 * @param {string} idColumn - ID列名
 * @param {string} idValue - IDの値
 */
function deleteRow(sheetName, idColumn, idValue) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyColIdx = headers.indexOf(idColumn);
  
  if (keyColIdx === -1) return { success: false, error: 'Column not found' };
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyColIdx]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      clearCache_(sheetName); // 該当シートのキャッシュをクリア
      return { success: true };
    }
  }
  return { success: false, error: 'Record not found' };
}

// ============================================================
// 自動採番API
// ============================================================

/**
 * 次のIDを自動生成する内部関数
 * @param {string} sheetName - シート名
 * @returns {string} 次のID
 */
function generateNextId_(sheetName) {
  var config = ID_PREFIX[sheetName];
  if (!config) throw new Error('No ID config for sheet: ' + sheetName);
  
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idColIdx = headers.indexOf(config.column);
  if (idColIdx === -1) throw new Error('ID column not found: ' + config.column);
  
  var maxNum = 0;
  var prefix = config.prefix + '-';
  
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][idColIdx]);
    if (id.indexOf(prefix) === 0) {
      var numPart = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }
  
  var nextNum = maxNum + 1;
  var padded = ('000' + nextNum).slice(-config.digits);
  return prefix + padded;
}

/**
 * フロントエンド向け: 次のIDを取得
 * @param {string} sheetName - シート名
 * @returns {string} 次のID
 */
function getNextId(sheetName) {
  return generateNextId_(sheetName);
}

// ============================================================
// 人事異動・昇進・applyStaffChange API
// ============================================================

/**
 * 人事異動・昇進・昇格・任命を適用する
 * @param {Object} changeData - { staffId, changeType, changeDate, fieldChanged, oldValue, newValue, remarks }
 * @returns {Object} 結果
 */
function applyStaffChange(changeData) {
  try {
    var changeId = generateNextId_(SHEET.STAFF_CHANGES);
    
    // 1. 履歴レコードを追加
    var record = {
      Change_ID: changeId,
      Staff_ID: changeData.staffId,
      Change_Type: changeData.changeType,
      Change_Date: changeData.changeDate,
      Field_Changed: changeData.fieldChanged,
      Old_Value: changeData.oldValue,
      New_Value: changeData.newValue,
      Remarks: changeData.remarks || ''
    };
    appendRow_(SHEET.STAFF_CHANGES, record);
    
    // 2. M_Staff の該当フィールドを更新
    var updateData = { Email: changeData.staffEmail };
    updateData[changeData.fieldChanged] = changeData.newValue;
    updateRow_(SHEET.STAFF, 'Email', changeData.staffEmail, updateData);
    
    // 3. キャッシュクリア
    clearCache_(SHEET.STAFF);
    clearCache_(SHEET.STAFF_CHANGES);
    
    return { success: true, changeId: changeId };
  } catch (e) {
    console.error('applyStaffChange error:', e);
    return { success: false, error: e.toString() };
  }
}
// ============================================================
// システム可視化・ER図生成 API
// ============================================================

/**
 * 全シートのヘッダー情報を読み込み、Mermaid形式のER図テキストを生成する
 */
/**
 * 全シートのヘッダー情報を読み込み、Mermaid形式のER図テキストを生成する (v3: 堅牢版)
 */
function getSchemaDiagram() {
  var ss = getSpreadsheet_();
  if (!ss) return 'erDiagram\n  ERROR_NO_SS';
  
  var sheets = ss.getSheets();
  var erText = 'erDiagram\n';
  var schemaMap = {};
  var tablePKs = {};
  
  // 1. 各シート定義 & カラム収集
  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    if (!name.match(/^[MT]_/)) return;
    
    // 英数字とアンダースコアのみに制限
    var safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeName) return;

    var lastCol = sheet.getLastColumn();
    var headers = [];
    if (sheet.getLastRow() > 0 && lastCol > 0) {
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
    
    // 重複除去と空文字排除
    var cleanHeaders = [];
    var seenH = {};
    headers.forEach(function(h) {
      if (h === "" || h === null || h === undefined) return;
      var hStr = String(h).trim();
      if (!seenH[hStr]) {
        cleanHeaders.push(hStr);
        seenH[hStr] = true;
      }
    });

    schemaMap[safeName] = cleanHeaders;
    
    // テーブル定義出力
    erText += '  ' + safeName + ' {\n';
    cleanHeaders.forEach(function(h) {
      var isPK = false;
      var isFK = false;
      
      // PK推論
      if (h.match(/_ID$/i)) {
        var base = safeName.replace(/^[MT]_/, '').replace(/s$/, '').toLowerCase();
        var hLower = h.toLowerCase();
        if (hLower.indexOf(base) !== -1 || hLower === 'id') {
          isPK = true;
          tablePKs[safeName] = h; // このテーブルのPKとして記録
        } else {
          isFK = true;
        }
      }
      
      var type = 'string';
      if (h.match(/Date|Time|Timestamp/i)) type = 'date';
      if (h.match(/Count|Amount|Cost|Stock|Order|Quantity/i)) type = 'number';
      
      var keyMark = isPK ? ' PK' : (isFK ? ' FK' : '');
      // カラム名に英数字以外が含まれる場合は引用符が必要だが、
      // Mermaid erDiagramでは型定義内での引用符の扱いに癖があるため、極力記号を外す
      var saferH = h.replace(/[^a-zA-Z0-9_]/g, '');
      if (!saerH) saferH = 'col';
      
      erText += '    ' + type + ' ' + saferH + keyMark + '\n';
    });
    erText += '  }\n';
  });
  
  // 2. リレーション推論
  var drawnRels = {};
  Object.keys(schemaMap).forEach(function(src) {
    schemaMap[src].forEach(function(col) {
      if (!col.match(/_ID$/i)) return;
      
      Object.keys(tablePKs).forEach(function(tgt) {
        if (src === tgt) return;
        if (col.toLowerCase() === tablePKs[tgt].toLowerCase()) {
          var relKey = [src, tgt].sort().join('-');
          if (!drawnRels[relKey]) {
            // 線を引く ( src は FK を持つ側 -> 子 )
            // tgt(親) ||--o{ src(子)
            erText += '  ' + tgt + ' ||--o{ ' + src + ' : "via_' + col.replace(/[^a-zA-Z0-9_]/g, '') + '"\n';
            drawnRels[relKey] = true;
          }
        }
      });
    });
  });

  return erText;
}
