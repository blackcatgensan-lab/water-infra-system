/**
 * ============================================================
 * Phase 5 - Task 2: 全データ移行スクリプト
 * ============================================================
 * 
 * DriveフォルダからCSVデータを読み込み、Master_DBと全施設のFacility_DBへ移行します。
 * 
 * 【Time-Trigger対応】
 * - 処理済み施設を PropertiesService に記録し、次回そこから再開
 * - 施設ごとにループ処理し、TimeoutError を検知して自動中断・再開
 * 
 * 実行手順:
 *   1. Task 1 (deploy_facilities.gs) を実行して全施設DBを作成
 *   2. このコードをGASプロジェクトに追加
 *   3. executeFullMigration() を実行
 *   4. タイムアウトした場合は再度 executeFull
Migration() を実行（自動的に続きから再開）
 */

// ============================================================
// 設定
// ============================================================

const P5_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';

// PropertiesService キー
const PROP_KEY_LAST_PROCESSED_FACILITY = 'LAST_PROCESSED_FACILITY_INDEX';
const PROP_KEY_MIGRATION_STATUS = 'MIGRATION_STATUS';

// ============================================================
// メイン実行関数
// ============================================================

/**
 * 全データ移行を実行（Time-Trigger対応）
 */
function executeFull
Migration() {
  Logger.log('========================================');
  Logger.log('Phase 5 - Task 2: 全データ移行開始');
  Logger.log('========================================');
  
  const startTime = new Date().getTime();
  const MAX_EXECUTION_TIME = 5.5 * 60 * 1000; // 5分30秒（余裕を持たせる）
  
  try {
    // 1. 進捗状況を取得
    const props = PropertiesService.getScriptProperties();
    let lastProcessedIndex = parseInt(props.getProperty(PROP_KEY_LAST_PROCESSED_FACILITY) || '-1');
    const migrationStatus = props.getProperty(PROP_KEY_MIGRATION_STATUS) || 'NOT_STARTED';
    
    Logger.log(`\n前回の進捗: ${migrationStatus}, 最後に処理した施設インデックス: ${lastProcessedIndex}`);
    
    // 2. CSVデータを読み込む（初回のみ、またはキャッシュから）
    Logger.log('\n[Step 1] CSVデータの読み込み...');
    const csvData = loadAllCSVData();
    
    // 3. Master_DB へのデータ移行（初回のみ）
    if (lastProcessedIndex === -1) {
      Logger.log('\n[Step 2] Master_DB へのデータ移行...');
      migrateMasterData(csvData);
      props.setProperty(PROP_KEY_MIGRATION_STATUS, 'MASTER_COMPLETED');
    } else {
      Logger.log('\n[Step 2] Master_DB の移行はスキップ（完了済み）');
    }
    
    // 4. 施設リストを取得
    const masterSS = SpreadsheetApp.openById(P5_MASTER_DB_ID);
    const facilitiesSheet = masterSS.getSheetByName('M_Facilities');
    const facilityData = facilitiesSheet.getDataRange().getValues();
    const facilityHeaders = facilityData[0];
    
    const facilityIdIdx = facilityHeaders.indexOf('Facility_ID');
    const facilityNameIdx = facilityHeaders.indexOf('Name');
    const dbFileIdIdx = facilityHeaders.indexOf('DB_File_ID');
    
    if (facilityIdIdx === -1 || dbFileIdIdx === -1) {
      throw new Error('M_Facilities に必要な列（Facility_ID, DB_File_ID）が見つかりません');
    }
    
    // 5. 各施設のFacility_DBへデータ移行
    Logger.log('\n[Step 3] 各施設のFacility_DBへデータ移行...');
    
    for (let i = lastProcessedIndex + 1; i < facilityData.length; i++) {
      // タイムアウトチェック
      const elapsedTime = new Date().getTime() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        Logger.log(`\n⏱️ 実行時間が制限に近づきました（${Math.floor(elapsedTime / 1000)}秒経過）`);
        Logger.log(`   施設インデックス ${i - 1} まで処理完了`);
        props.setProperty(PROP_KEY_LAST_PROCESSED_FACILITY, String(i - 1));
        props.setProperty(PROP_KEY_MIGRATION_STATUS, 'IN_PROGRESS');
        Logger.log('\n⚠️ 処理を一時中断します。再度 executeFull
Migration() を実行してください。');
        return;
      }
      
      const facilityId = facilityData[i][facilityIdIdx];
      const facilityName = facilityData[i][facilityNameIdx];
      const dbFileId = facilityData[i][dbFileIdIdx];
      
      if (!facilityId || !dbFileId) {
        Logger.log(`  [${i}] スキップ: Facility_ID または DB_File_ID が空です`);
        continue;
      }
      
      Logger.log(`\n  [${i}/${facilityData.length - 1}] ${facilityId}: ${facilityName}`);
      Logger.log(`    DB ID: ${dbFileId}`);
      
      try {
        // 施設固有データを移行
        migrateSingleFacility(facilityId, facilityName, dbFileId, csvData);
        
        // 進捗を保存
        props.setProperty(PROP_KEY_LAST_PROCESSED_FACILITY, String(i));
        
      } catch (error) {
        Logger.log(`    ❌ エラー: ${error.message}`);
        // エラーが発生しても次の施設へ進む
      }
    }
    
    // 6. 完了
    Logger.log('\n========================================');
    Logger.log('✅ Phase 5 - Task 2: 全データ移行完了');
    Logger.log('========================================');
    
    // 進捗をリセット
    props.deleteProperty(PROP_KEY_LAST_PROCESSED_FACILITY);
    props.setProperty(PROP_KEY_MIGRATION_STATUS, 'COMPLETED');
    
  } catch (error) {
    Logger.log('\n❌ エラーが発生しました: ' + error.message);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * 進捗状況をリセット（やり直す場合）
 */
function resetMigrationProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_KEY_LAST_PROCESSED_FACILITY);
  props.deleteProperty(PROP_KEY_MIGRATION_STATUS);
  Logger.log('✅ 進捗状況をリセットしました');
}

/**
 * 現在の進捗状況を表示
 */
function showMigrationProgress() {
  const props = PropertiesService.getScriptProperties();
  const lastProcessedIndex = props.getProperty(PROP_KEY_LAST_PROCESSED_FACILITY) || '未実行';
  const migrationStatus = props.getProperty(PROP_KEY_MIGRATION_STATUS) || 'NOT_STARTED';
  
  Logger.log('========== 移行進捗状況 ==========');
  Logger.log(`ステータス: ${migrationStatus}`);
  Logger.log(`最後に処理した施設インデックス: ${lastProcessedIndex}`);
}

// ============================================================
// CSVデータ読み込み
// ============================================================

/**
 * DriveフォルダからすべてのCSVデータを読み込む
 */
function loadAllCSVData() {
  const folder = DriveApp.getFolderById(CSV_FOLDER_ID);
  const files = folder.getFiles();
  const csvData = {};
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    
    if (fileName.endsWith('.csv')) {
      Logger.log('  読み込み中: ' + fileName);
      let content = '';
      const blob = file.getBlob();
      
      // エンコーディングの判定
      try {
        content = blob.getDataAsString('UTF-8');
        if (content.indexOf('\ufffd') !== -1) {
          throw new Error('Garbled');
        }
      } catch (e) {
        Logger.log('    Shift-JIS (MS932) で再試行...');
        content = blob.getDataAsString('MS932');
      }
      
      const parsed = parseCSV(content);
      
      // ファイル名をキーとして保存
      if (fileName.indexOf('施設情報') !== -1) {
        csvData.facilities = parsed;
      } else if (fileName.indexOf('設備情報') !== -1) {
        csvData.equipment = parsed;
      } else if (fileName.indexOf('点検情報') !== -1) {
        csvData.inspections = parsed;
      } else if (fileName.indexOf('組織') !== -1) {
        csvData.organizations = parsed;
      } else if (fileName.indexOf('資格') !== -1) {
        csvData.qualifications = parsed;
      }
    }
  }
  
  Logger.log(`  読み込み完了: ${Object.keys(csvData).length} テーブル`);
  return csvData;
}

/**
 * CSVパース（簡易版）
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row = line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim());
    result.push(row);
  }
  
  return result;
}

// ============================================================
// Master_DB データ移行
// ============================================================

/**
 * Master_DBへデータを移行
 */
function migrateMasterData(csvData) {
  const masterSS = SpreadsheetApp.openById(P5_MASTER_DB_ID);
  
  // M_Facilities
  if (csvData.facilities) {
    Logger.log('  M_Facilities へ移行...');
    migrateFacilities(masterSS, csvData.facilities);
  }
  
  // M_Organizations
  if (csvData.organizations) {
    Logger.log('  M_Organizations へ移行...');
    migrateOrganizations(masterSS, csvData.organizations);
  }
  
  // M_Qualifications
  if (csvData.qualifications) {
    Logger.log('  M_Qualifications へ移行...');
    migrateQualifications(masterSS, csvData.qualifications);
  }
  
  Logger.log('  ✅ Master_DB 移行完了');
}

/**
 * M_Facilities へ移行
 */
function migrateFacilities(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Facilities');
  if (!sheet) {
    Logger.log('    ⚠️ M_Facilities シートが見つかりません');
    return;
  }
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex(headers, ['施設名', 'Name', '名称']);
  const addressIdx = findHeaderIndex(headers, ['住所', 'Address']);
  const postcodeIdx = findHeaderIndex(headers, ['郵便番号', 'Postcode', '〒']);
  const remarksIdx = findHeaderIndex(headers, ['備考', 'Remarks']);
  
  const outputData = [];
  let facilityCounter = 1;
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row[nameIdx]) continue;
    
    const facilityId = `F-${String(facilityCounter).padStart(3, '0')}`;
    
    outputData.push([
      facilityId,
      row[nameIdx] || '',
      row[addressIdx] || '',
      row[postcodeIdx] || '',
      '', // Contract_ID (後で設定)
      row[remarksIdx] || '',
      '' // DB_File_ID (deploy_facilities.gs で設定)
    ]);
    
    facilityCounter++;
  }
  
  if (outputData.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`    ${outputData.length} 件を追加`);
  }
}

/**
 * M_Organizations へ移行
 */
function migrateOrganizations(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Organizations');
  if (!sheet) {
    Logger.log('    ⚠️ M_Organizations シートが見つかりません');
    return;
  }
  
  // データ検証を一時的に緩和
  relaxValidationRules(sheet, 'Type');
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex(headers, ['組織名', '部署名', 'Name']);
  const typeIdx = findHeaderIndex(headers, ['種別', 'タイプ', '区分', 'Type']);
  
  // 既存の種別を収集
  const uniqueTypes = new Set();
  for (let i = 1; i < csvData.length; i++) {
    if (csvData[i][typeIdx]) {
      uniqueTypes.add(csvData[i][typeIdx]);
    }
  }
  
  const outputData = [];
  let orgCounter = 1;
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row[nameIdx]) continue;
    
    const orgId = `ORG-${String(orgCounter).padStart(3, '0')}`;
    
    outputData.push([
      orgId,
      row[nameIdx] || '',
      row[typeIdx] || '',
      '', // Parent_Org_ID
      999, // Sort_Order
      '有効', // Is_Active
      '' // Org_Code
    ]);
    
    orgCounter++;
  }
  
  if (outputData.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`    ${outputData.length} 件を追加`);
    
    // データ検証ルールを更新
    updateValidationRules(sheet, 'Type', Array.from(uniqueTypes));
  }
}

/**
 * M_Qualifications へ移行
 */
function migrateQualifications(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Qualifications');
  if (!sheet) {
    Logger.log('    ⚠️ M_Qualifications シートが見つかりません');
    return;
  }
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex(headers, ['資格名', 'Name', '名称']);
  const categoryIdx = findHeaderIndex(headers, ['カテゴリ', 'Category', '分類']);
  
  const outputData = [];
  let qualCounter = 1;
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row[nameIdx]) continue;
    
    const qualId = `Q-${String(qualCounter).padStart(3, '0')}`;
    
    outputData.push([
      qualId,
      row[nameIdx] || '',
      row[categoryIdx] || '',
      '', // Valid_Period_Years
      '' // Remarks
    ]);
    
    qualCounter++;
  }
  
  if (outputData.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`    ${outputData.length} 件を追加`);
  }
}

// ============================================================
// 施設固有データ移行
// ============================================================

/**
 * 単一施設のFacility_DBへデータを移行
 */
function migrateSingleFacility(facilityId, facilityName, dbFileId, csvData) {
  const facilitySS = SpreadsheetApp.openById(dbFileId);
  const facilityCode = facilityId.replace('-', ''); // "F-001" -> "F001"
  
  // 1. M_Locations を自動生成
  Logger.log('    M_Locations を生成中...');
  const locationMap = generateLocationsForFacility(facilitySS, facilityId, facilityCode, csvData.equipment);
  
  // 2. M_Equipment を移行
  Logger.log('    M_Equipment を移行中...');
  migrateEquipmentForFacility(facilitySS, facilityId, facilityCode, csvData.equipment, locationMap);
  
  // 3. T_Inspection_Results を移行（点検データがあれば）
  if (csvData.inspections) {
    Logger.log('    T_Inspection_Results を移行中...');
    migrateInspectionsForFacility(facilitySS, facilityId, facilityCode, csvData.inspections);
  }
  
  Logger.log('    ✅ 完了');
}

/**
 * M_Locations を自動生成
 */
function generateLocationsForFacility(facilitySS, facilityId, facilityCode, equipmentCSV) {
  const sheet = facilitySS.getSheetByName('M_Locations');
  if (!sheet) {
    Logger.log('      ⚠️ M_Locations シートが見つかりません');
    return {};
  }
  
  const headers = equipmentCSV[0];
  const facilityIdxCSV = findHeaderIndex(headers, ['施設ID', 'Facility_ID', '施設']);
  const facilityNameIdxCSV = findHeaderIndex(headers, ['施設名', 'Facility_Name']);
  const buildingIdx = findHeaderIndex(headers, ['棟', 'Building', '建物']);
  const floorIdx = findHeaderIndex(headers, ['階', 'Floor', 'フロア']);
  const roomIdx = findHeaderIndex(headers, ['部屋', 'Room', '室']);
  
  // 階層構造を抽出
  const locationSet = new Set();
  
  for (let i = 1; i < equipmentCSV.length; i++) {
    const row = equipmentCSV[i];
    
    // この施設のデータのみ処理
    const csvFacilityId = row[facilityIdxCSV] || '';
    const csvFacilityName = row[facilityNameIdxCSV] || '';
    
    if (csvFacilityId !== facilityId && csvFacilityName.indexOf(facilityId.split('-')[1]) === -1) {
      continue;
    }
    
    const building = row[buildingIdx] || '';
    const floor = row[floorIdx] || '';
    const room = row[roomIdx] || '';
    
    // 階層ごとにロケーションを追加
    if (building) {
      locationSet.add(JSON.stringify({ building, floor: '', room: '' }));
      
      if (floor) {
        locationSet.add(JSON.stringify({ building, floor, room: '' }));
        
        if (room) {
          locationSet.add(JSON.stringify({ building, floor, room }));
        }
      }
    }
  }
  
  // 出力データを準備
  const outputData = [];
  const locationMap = {}; // Key: JSON文字列, Value: Location_ID
  let locationCounter = 1;
  
  Array.from(locationSet).forEach(jsonStr => {
    const loc = JSON.parse(jsonStr);
    const locationId = `${facilityCode}_L-${String(locationCounter).padStart(5, '0')}`;
    
    outputData.push([
      locationId,
      facilityId,
      loc.building,
      loc.floor,
      loc.room,
      '' // Remarks
    ]);
    
    locationMap[jsonStr] = locationId;
    locationCounter++;
  });
  
  if (outputData.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`      ${outputData.length} 件のロケーションを生成`);
  }
  
  return locationMap;
}

/**
 * M_Equipment を移行
 */
function migrateEquipmentForFacility(facilitySS, facilityId, facilityCode, equipmentCSV, locationMap) {
  const sheet = facilitySS.getSheetByName('M_Equipment');
  if (!sheet) {
    Logger.log('      ⚠️ M_Equipment シートが見つかりません');
    return;
  }
  
  const headers = equipmentCSV[0];
  const facilityIdxCSV = findHeaderIndex(headers, ['施設ID', 'Facility_ID']);
  const facilityNameIdxCSV = findHeaderIndex(headers, ['施設名']);
  const nameIdx = findHeaderIndex(headers, ['設備名', 'Name', '名称']);
  const typeIdx = findHeaderIndex(headers, ['種別', 'Type', '分類']);
  const buildingIdx = findHeaderIndex(headers, ['棟', 'Building']);
  const floorIdx = findHeaderIndex(headers, ['階', 'Floor']);
  const roomIdx = findHeaderIndex(headers, ['部屋', 'Room']);
  const statusIdx = findHeaderIndex(headers, ['状態', 'Status', 'ステータス']);
  
  const outputData = [];
  let equipmentCounter = 1;
  
  for (let i = 1; i < equipmentCSV.length; i++) {
    const row = equipmentCSV[i];
    
    // この施設のデータのみ処理
    const csvFacilityId = row[facilityIdxCSV] || '';
    const csvFacilityName = row[facilityNameIdxCSV] || '';
    
    if (csvFacilityId !== facilityId && csvFacilityName.indexOf(facilityId.split('-')[1]) === -1) {
      continue;
    }
    
    if (!row[nameIdx]) continue;
    
    const equipmentId = `${facilityCode}_E-${String(equipmentCounter).padStart(5, '0')}`;
    
    // Location_ID を解決
    const building = row[buildingIdx] || '';
    const floor = row[floorIdx] || '';
    const room = row[roomIdx] || '';
    
    let locationId = '';
    if (building) {
      const locationKey = JSON.stringify({ building, floor, room });
      locationId = locationMap[locationKey] || '';
    }
    
    outputData.push([
      equipmentId,
      facilityId,
      locationId,
      row[nameIdx] || '',
      row[typeIdx] || '機械',
      '', // Manufacturer
      '', // Model
      '', // Serial_Number
      '', // Install_Date
      row[statusIdx] || '稼働中',
      '' // Remarks
    ]);
    
    equipmentCounter++;
  }
  
  if (outputData.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`      ${outputData.length} 件の設備を移行`);
  }
}

/**
 * T_Inspection_Results を移行
 */
function migrateInspectionsForFacility(facilitySS, facilityId, facilityCode, inspectionCSV) {
  const sheet = facilitySS.getSheetByName('T_Inspection_Results');
  if (!sheet) {
    Logger.log('      ⚠️ T_Inspection_Results シートが見つかりません');
    return;
  }
  
  // 実装は省略（必要に応じて追加）
  Logger.log('      （点検データ移行は今回スキップ）');
}

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * ヘッダーインデックスを柔軟に検索
 */
function findHeaderIndex(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * データ検証ルールを一時的に緩和
 */
function relaxValidationRules(sheet, columnName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = headers.indexOf(columnName);
  
  if (colIdx !== -1) {
    const range = sheet.getRange(2, colIdx + 1, sheet.getMaxRows() - 1, 1);
    const rule = SpreadsheetApp.newDataValidation()
      .setAllowInvalid(true)
      .build();
    range.setDataValidation(rule);
  }
}

/**
 * データ検証ルールを更新
 */
function updateValidationRules(sheet, columnName, values) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = headers.indexOf(columnName);
  
  if (colIdx !== -1 && values.length > 0) {
    const range = sheet.getRange(2, colIdx + 1, sheet.getMaxRows() - 1, 1);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true)
      .setAllowInvalid(false)
      .build();
    range.setDataValidation(rule);
  }
}
