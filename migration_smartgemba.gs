/**
 * ============================================================
 * Phase 5 - Task 2: SmartGEMBA対応データ移行スクリプト (改訂版 v1.3)
 * ============================================================
 * 
 * DriveフォルダからCSVデータを読み込み、Master_DBと全施設のFacility_DBへ移行します。
 * 
 * 【ハイブリッド対応】
 * - F-007 (石津): Blitz GROW形式CSV(従来ロジック)
 * - それ以外 (F-001 川俣など): SmartGEMBA形式CSV(階層構造解析)
 * 
 * 【Time-Trigger対応】
 * - 処理済み施設を PropertiesService に記録し、次回そこから再開
 * - 施設ごとにループ処理し、TimeoutError を検知して自動中断・再開
 * 
 * 【修正履歴】
 * - 2026-02-16 v1.0: Step 1-4の抜本的修正（固定列インデックス、シート初期化、完全同期）
 * - 2026-02-16 v1.3: 開始行修正、シートクリーンアップ強化、Location_ID警告ログ追加
 * 
 * 実行手順:
 *   1. Task 1 (deploy_facilities.gs) を実行して全施設DBを作成
 *   2. このコードをGASプロジェクトに追加
 *   3. executeSmartGEMBAMigration() を実行
 *   4. タイムアウトした場合は再度実行（自動的に続きから再開）
 */

// ============================================================
// 設定
// ============================================================

const SG_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const SG_CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';

// PropertiesService キー
const SG_PROP_KEY_LAST_PROCESSED_FACILITY = 'SG_LAST_PROCESSED_FACILITY_INDEX';
const SG_PROP_KEY_MIGRATION_STATUS = 'SG_MIGRATION_STATUS';

// 石津水再生センターのID（従来ロジック使用）
const LEGACY_FACILITY_ID = 'F-007';

// ============================================================
// メイン実行関数
// ============================================================

/**
 * SmartGEMBA対応・全データ移行を実行（Time-Trigger対応）
 */
function executeSmartGEMBAMigration() {
  Logger.log('========================================');
  Logger.log('Phase 5 - Task 2: SmartGEMBA対応データ移行開始 (v1.3)');
  Logger.log('========================================');
  
  const startTime = new Date().getTime();
  const MAX_EXECUTION_TIME = 5.5 * 60 * 1000; // 5分30秒（余裕を持たせる）
  
  // 移行サマリー用
  const migrationSummary = [];
  
  try {
    // 1. 進捗状況を取得
    const props = PropertiesService.getScriptProperties();
    let lastProcessedIndex = parseInt(props.getProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY) || '-1');
    const migrationStatus = props.getProperty(SG_PROP_KEY_MIGRATION_STATUS) || 'NOT_STARTED';
    
    Logger.log(`\n前回の進捗: ${migrationStatus}, 最後に処理した施設インデックス: ${lastProcessedIndex}`);
    
    // 2. CSVデータを読み込む
    Logger.log('\n[Step 1] CSVデータの読み込み...');
    const csvData = loadAllCSVData_SG();
    
    // 3. Master_DB へのデータ移行（初回のみ）
    if (lastProcessedIndex === -1) {
      Logger.log('\n[Step 2] Master_DB へのデータ移行...');
      migrateMasterData_SG(csvData);
      props.setProperty(SG_PROP_KEY_MIGRATION_STATUS, 'MASTER_COMPLETED');
    } else {
      Logger.log('\n[Step 2] Master_DB の移行はスキップ（完了済み）');
    }
    
    // 4. 施設リストを取得
    const masterSS = SpreadsheetApp.openById(SG_MASTER_DB_ID);
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
    
    // 【Step 1修正】ヘッダー行をスキップするため、最低でも i = 1 から開始
    for (let i = Math.max(lastProcessedIndex + 1, 1); i < facilityData.length; i++) {
      // タイムアウトチェック
      const elapsedTime = new Date().getTime() - startTime;
      if (elapsedTime > MAX_EXECUTION_TIME) {
        Logger.log(`\n⏱️ 実行時間が制限に近づきました（${Math.floor(elapsedTime / 1000)}秒経過）`);
        Logger.log(`   施設インデックス ${i - 1} まで処理完了`);
        props.setProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY, String(i - 1));
        props.setProperty(SG_PROP_KEY_MIGRATION_STATUS, 'IN_PROGRESS');
        Logger.log('\n⚠️ 処理を一時中断します。再度 executeSmartGEMBAMigration() を実行してください。');
        
        // サマリー出力
        printMigrationSummary(migrationSummary);
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
        let summary = { facilityId, facilityName, success: false };
        
        // 施設固有データを移行（ハイブリッド対応）
        if (facilityId === LEGACY_FACILITY_ID) {
          Logger.log('    → 従来ロジック（Blitz GROW形式）で処理');
          summary = migrateSingleFacility_Legacy(facilityId, facilityName, dbFileId, csvData);
        } else {
          Logger.log('    → SmartGEMBA形式で処理');
          summary = migrateSingleFacility_SmartGEMBA(facilityId, facilityName, dbFileId, csvData);
        }
        
        migrationSummary.push(summary);
        
        // 進捗を保存
        props.setProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY, String(i));
        
      } catch (error) {
        Logger.log(`    ❌ エラー: ${error.message}`);
        Logger.log(error.stack);
        migrationSummary.push({ 
          facilityId, 
          facilityName, 
          success: false, 
          error: error.message 
        });
        // エラーが発生しても次の施設へ進む
      }
    }
    
    // 6. 完了
    Logger.log('\n========================================');
    Logger.log('✅ Phase 5 - Task 2: 全データ移行完了');
    Logger.log('========================================');
    
    // サマリー出力
    printMigrationSummary(migrationSummary);
    
    // 進捗をリセット
    props.deleteProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY);
    props.setProperty(SG_PROP_KEY_MIGRATION_STATUS, 'COMPLETED');
    
  } catch (error) {
    Logger.log('\n❌ エラーが発生しました: ' + error.message);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * 移行サマリーを出力
 */
function printMigrationSummary(summary) {
  if (summary.length === 0) return;
  
  Logger.log('\n========================================');
  Logger.log('📊 移行サマリー');
  Logger.log('========================================');
  
  let totalLocations = 0;
  let totalEquipment = 0;
  let totalInspectionItems = 0;
  let successCount = 0;
  
  summary.forEach(s => {
    if (s.success) {
      successCount++;
      Logger.log(`✅ ${s.facilityId} ${s.facilityName}`);
      if (s.locations) {
        Logger.log(`   - Locations: ${s.locations}`);
        totalLocations += s.locations;
      }
      if (s.equipment) {
        Logger.log(`   - Equipment: ${s.equipment}`);
        totalEquipment += s.equipment;
      }
      if (s.inspectionItems) {
        Logger.log(`   - Inspection Items: ${s.inspectionItems}`);
        totalInspectionItems += s.inspectionItems;
      }
    } else {
      Logger.log(`❌ ${s.facilityId} ${s.facilityName}: ${s.error || 'Unknown error'}`);
    }
  });
  
  Logger.log('\n---');
  Logger.log(`処理施設数: ${summary.length} (成功: ${successCount}, 失敗: ${summary.length - successCount})`);
  Logger.log(`合計 - Locations: ${totalLocations}, Equipment: ${totalEquipment}, Inspection Items: ${totalInspectionItems}`);
  Logger.log('========================================\n');
}

/**
 * 進捗状況をリセット（やり直す場合）
 */
function resetSmartGEMBAMigrationProgress() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY);
  props.deleteProperty(SG_PROP_KEY_MIGRATION_STATUS);
  Logger.log('✅ SmartGEMBA移行の進捗状況をリセットしました');
}

/**
 * 現在の進捗状況を表示
 */
function showSmartGEMBAMigrationProgress() {
  const props = PropertiesService.getScriptProperties();
  const lastProcessedIndex = props.getProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY) || '未実行';
  const migrationStatus = props.getProperty(SG_PROP_KEY_MIGRATION_STATUS) || 'NOT_STARTED';
  
  Logger.log('========== SmartGEMBA移行進捗状況 ==========');
  Logger.log(`ステータス: ${migrationStatus}`);
  Logger.log(`最後に処理した施設インデックス: ${lastProcessedIndex}`);
}

// ============================================================
// CSVデータ読み込み
// ============================================================

/**
 * DriveフォルダからすべてのCSVデータを読み込む
 */
function loadAllCSVData_SG() {
  const folder = DriveApp.getFolderById(SG_CSV_FOLDER_ID);
  const files = folder.getFiles();
  const csvData = {
    smartgemba: [],  // SmartGEMBA形式のファイル一覧
    legacy: {},      // 従来形式のファイル
    choices: null    // 選択肢マスタ（将来的にM_Inspection_Choicesへ展開予定）
  };
  
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
      
      const parsed = parseCSV_SG(content);
      
      // ファイル名で分類
      if (fileName.indexOf('点検ツリー') !== -1 || fileName.indexOf('SmartGEMBA') !== -1) {
        // SmartGEMBA形式
        csvData.smartgemba.push({
          fileName: fileName,
          facilityName: extractFacilityNameFromFileName(fileName),
          data: parsed
        });
      } else if (fileName.indexOf('選択肢マスタ') !== -1) {
        // 【将来的な拡張】選択肢マスタ（M_Inspection_Choices への展開用）
        // 現在は読み込みのみ。Phase 6 で M_Inspection_Choices テーブルへの移行を実装予定
        csvData.choices = parsed;
        Logger.log('    📋 選択肢マスタを読み込みました（Phase 6で活用予定）');
      } else if (fileName.indexOf('施設情報') !== -1) {
        csvData.legacy.facilities = parsed;
      } else if (fileName.indexOf('設備情報') !== -1) {
        csvData.legacy.equipment = parsed;
      } else if (fileName.indexOf('点検情報') !== -1) {
        csvData.legacy.inspections = parsed;
      } else if (fileName.indexOf('組織') !== -1) {
        csvData.legacy.organizations = parsed;
      } else if (fileName.indexOf('資格') !== -1) {
        csvData.legacy.qualifications = parsed;
      }
    }
  }
  
  Logger.log(`  読み込み完了: SmartGEMBA=${csvData.smartgemba.length}件, Legacy=${Object.keys(csvData.legacy).length}テーブル, 選択肢=${csvData.choices ? 'あり' : 'なし'}`);
  return csvData;
}

/**
 * ファイル名から施設名を抽出
 */
function extractFacilityNameFromFileName(fileName) {
  // 例: "点検ツリー（川俣水処理）.csv" → "川俣"
  const match = fileName.match(/[（(](.+?)[）)]/);
  if (match && match[1]) {
    // "川俣水処理" から "川俣" を取得
    return match[1].replace(/水処理|水再生|センター|下水道|浄化/g, '').trim();
  }
  return '';
}

/**
 * CSVパース（簡易版）
 */
function parseCSV_SG(content) {
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
function migrateMasterData_SG(csvData) {
  const masterSS = SpreadsheetApp.openById(SG_MASTER_DB_ID);
  
  // M_Facilities（従来データがあれば）
  if (csvData.legacy.facilities) {
    Logger.log('  M_Facilities へ移行...');
    migrateFacilities_SG(masterSS, csvData.legacy.facilities);
  }
  
  // M_Organizations
  if (csvData.legacy.organizations) {
    Logger.log('  M_Organizations へ移行...');
    migrateOrganizations_SG(masterSS, csvData.legacy.organizations);
  }
  
  // M_Qualifications
  if (csvData.legacy.qualifications) {
    Logger.log('  M_Qualifications へ移行...');
    migrateQualifications_SG(masterSS, csvData.legacy.qualifications);
  }
  
  Logger.log('  ✅ Master_DB 移行完了');
}

/**
 * M_Facilities へ移行
 */
function migrateFacilities_SG(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Facilities');
  if (!sheet) {
    Logger.log('    ⚠️ M_Facilities シートが見つかりません');
    return;
  }
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex_SG(headers, ['施設名', 'Name', '名称']);
  const addressIdx = findHeaderIndex_SG(headers, ['住所', 'Address']);
  const postcodeIdx = findHeaderIndex_SG(headers, ['郵便番号', 'Postcode', '〒']);
  const remarksIdx = findHeaderIndex_SG(headers, ['備考', 'Remarks']);
  
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
      '', // Contract_ID
      row[remarksIdx] || '',
      '' // DB_File_ID
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
function migrateOrganizations_SG(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Organizations');
  if (!sheet) {
    Logger.log('    ⚠️ M_Organizations シートが見つかりません');
    return;
  }
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex_SG(headers, ['組織名', '部署名', 'Name']);
  const typeIdx = findHeaderIndex_SG(headers, ['種別', 'タイプ', '区分', 'Type']);
  
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
  }
}

/**
 * M_Qualifications へ移行
 */
function migrateQualifications_SG(masterSS, csvData) {
  const sheet = masterSS.getSheetByName('M_Qualifications');
  if (!sheet) {
    Logger.log('    ⚠️ M_Qualifications シートが見つかりません');
    return;
  }
  
  const headers = csvData[0];
  const nameIdx = findHeaderIndex_SG(headers, ['資格名', 'Name', '名称']);
  const categoryIdx = findHeaderIndex_SG(headers, ['カテゴリ', 'Category', '分類']);
  
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
// 施設固有データ移行（従来ロジック: F-007用）
// ============================================================

/**
 * 単一施設のFacility_DBへデータを移行（従来形式）
 */
function migrateSingleFacility_Legacy(facilityId, facilityName, dbFileId, csvData) {
  const facilitySS = SpreadsheetApp.openById(dbFileId);
  const facilityCode = facilityId.replace('-', ''); // "F-007" -> "F007"
  
  if (!csvData.legacy.equipment) {
    Logger.log('    ⚠️ 従来形式の設備データがありません');
    return { facilityId, facilityName, success: false, error: '設備データなし' };
  }
  
  // シート初期化
  Logger.log('    既存データをクリア中...');
  clearFacilitySheetData(facilitySS, 'M_Locations');
  clearFacilitySheetData(facilitySS, 'M_Equipment');
  
  // 1. M_Locations を自動生成
  Logger.log('    M_Locations を生成中...');
  const locationMap = generateLocationsForFacility_Legacy(facilitySS, facilityId, facilityCode, csvData.legacy.equipment);
  
  // 2. M_Equipment を移行
  Logger.log('    M_Equipment を移行中...');
  const equipmentCount = migrateEquipmentForFacility_Legacy(facilitySS, facilityId, facilityCode, csvData.legacy.equipment, locationMap);
  
  Logger.log('    ✅ 完了');
  
  return {
    facilityId,
    facilityName,
    success: true,
    locations: Object.keys(locationMap).length,
    equipment: equipmentCount,
    inspectionItems: 0
  };
}

/**
 * M_Locations を自動生成（従来形式）
 */
function generateLocationsForFacility_Legacy(facilitySS, facilityId, facilityCode, equipmentCSV) {
  const sheet = facilitySS.getSheetByName('M_Locations');
  if (!sheet) {
    Logger.log('      ⚠️ M_Locations シートが見つかりません');
    return {};
  }
  
  const headers = equipmentCSV[0];
  const facilityIdxCSV = findHeaderIndex_SG(headers, ['施設ID', 'Facility_ID', '施設']);
  const facilityNameIdxCSV = findHeaderIndex_SG(headers, ['施設名', 'Facility_Name']);
  const buildingIdx = findHeaderIndex_SG(headers, ['棟', 'Building', '建物']);
  const floorIdx = findHeaderIndex_SG(headers, ['階', 'Floor', 'フロア']);
  const roomIdx = findHeaderIndex_SG(headers, ['部屋', 'Room', '室']);
  
  const locationSet = new Set();
  
  for (let i = 1; i < equipmentCSV.length; i++) {
    const row = equipmentCSV[i];
    
    const csvFacilityId = row[facilityIdxCSV] || '';
    const csvFacilityName = row[facilityNameIdxCSV] || '';
    
    if (csvFacilityId !== facilityId && csvFacilityName.indexOf(facilityId.split('-')[1]) === -1) {
      continue;
    }
    
    const building = row[buildingIdx] || '';
    const floor = row[floorIdx] || '';
    const room = row[roomIdx] || '';
    
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
  
  const outputData = [];
  const locationMap = {};
  let locationCounter = 1;
  
  Array.from(locationSet).forEach(jsonStr => {
    const loc = JSON.parse(jsonStr);
    const locationId = `${facilityCode}_L-${String(locationCounter).padStart(5, '0')}`;
    
    outputData.push([
      locationId,
      facilityId,
      '',  // Parent_Location_ID (従来形式では未使用)
      loc.building,
      loc.floor,
      loc.room,
      ''
    ]);
    
    locationMap[jsonStr] = locationId;
    locationCounter++;
  });
  
  if (outputData.length > 0) {
    // 【修正2】確実に2行目から書き込む
    sheet.getRange(2, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`      ${outputData.length} 件のロケーションを生成`);
  }
  
  return locationMap;
}

/**
 * M_Equipment を移行（従来形式）
 */
function migrateEquipmentForFacility_Legacy(facilitySS, facilityId, facilityCode, equipmentCSV, locationMap) {
  const sheet = facilitySS.getSheetByName('M_Equipment');
  if (!sheet) {
    Logger.log('      ⚠️ M_Equipment シートが見つかりません');
    return 0;
  }
  
  const headers = equipmentCSV[0];
  const facilityIdxCSV = findHeaderIndex_SG(headers, ['施設ID', 'Facility_ID']);
  const facilityNameIdxCSV = findHeaderIndex_SG(headers, ['施設名']);
  const nameIdx = findHeaderIndex_SG(headers, ['設備名', 'Name', '名称']);
  const typeIdx = findHeaderIndex_SG(headers, ['種別', 'Type', '分類']);
  const buildingIdx = findHeaderIndex_SG(headers, ['棟', 'Building']);
  const floorIdx = findHeaderIndex_SG(headers, ['階', 'Floor']);
  const roomIdx = findHeaderIndex_SG(headers, ['部屋', 'Room']);
  const statusIdx = findHeaderIndex_SG(headers, ['状態', 'Status', 'ステータス']);
  
  const outputData = [];
  let equipmentCounter = 1;
  
  for (let i = 1; i < equipmentCSV.length; i++) {
    const row = equipmentCSV[i];
    
    const csvFacilityId = row[facilityIdxCSV] || '';
    const csvFacilityName = row[facilityNameIdxCSV] || '';
    
    if (csvFacilityId !== facilityId && csvFacilityName.indexOf(facilityId.split('-')[1]) === -1) {
      continue;
    }
    
    if (!row[nameIdx]) continue;
    
    const equipmentId = `${facilityCode}_E-${String(equipmentCounter).padStart(5, '0')}`;
    
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
    // 【修正2】確実に2行目から書き込む
    sheet.getRange(2, 1, outputData.length, outputData[0].length).setValues(outputData);
    Logger.log(`      ${outputData.length} 件の設備を移行`);
  }
  
  return outputData.length;
}

// ============================================================
// 施設固有データ移行（SmartGEMBA形式）
// ============================================================

/**
 * 単一施設のFacility_DBへデータを移行（SmartGEMBA形式）
 */
function migrateSingleFacility_SmartGEMBA(facilityId, facilityName, dbFileId, csvData) {
  const facilitySS = SpreadsheetApp.openById(dbFileId);
  const facilityCode = facilityId.replace('-', ''); // "F-001" -> "F001"
  
  // この施設に対応するSmartGEMBA CSVを探す
  let targetCSV = null;
  for (let i = 0; i < csvData.smartgemba.length; i++) {
    const sgFile = csvData.smartgemba[i];
    // 施設名の部分一致で判定（例: "川俣" が含まれるか）
    if (facilityName.indexOf(sgFile.facilityName) !== -1 || sgFile.facilityName.indexOf(facilityName.substring(0, 2)) !== -1) {
      targetCSV = sgFile;
      Logger.log(`    → 対応CSVファイル: ${sgFile.fileName}`);
      break;
    }
  }
  
  // 【ガード強化】targetCSVが確実に存在することを再確認
  if (!targetCSV) {
    Logger.log('    ⚠️ 対応するSmartGEMBA CSVが見つかりません');
    return { facilityId, facilityName, success: false, error: 'CSVが見つかりません' };
  }
  
  // ========================================
  // 【Step 3】シート初期化（対応CSVがある場合のみ）
  // ========================================
  Logger.log('    既存データをクリア中...');
  clearFacilitySheetData(facilitySS, 'M_Locations');
  clearFacilitySheetData(facilitySS, 'M_Equipment');
  clearFacilitySheetData(facilitySS, 'M_Inspection_Items');
  
  // SmartGEMBA階層構造を解析
  Logger.log('    SmartGEMBA階層構造を解析中...');
  const parsed = parseSmartGEMBAHierarchy(targetCSV.data, facilityId, facilityCode);
  
  // 1. M_Locations を生成
  Logger.log('    M_Locations を生成中...');
  writeLocationsToSheet(facilitySS, parsed.locations);
  
  // 2. M_Equipment を生成
  Logger.log('    M_Equipment を生成中...');
  writeEquipmentToSheet(facilitySS, parsed.equipment);
  
  // 3. M_Inspection_Items を生成
  Logger.log('    M_Inspection_Items を生成中...');
  writeInspectionItemsToSheet(facilitySS, parsed.inspectionItems);
  
  Logger.log('    ✅ 完了');
  
  return {
    facilityId,
    facilityName,
    success: true,
    locations: parsed.locations.length,
    equipment: parsed.equipment.length,
    inspectionItems: parsed.inspectionItems.length
  };
}

/**
 * 【修正2】Facility_DBのシートデータをクリア（ヘッダー行は保持、確実に値のみ削除）
 * 【緊急修正】CSVデータが存在する場合のみクリアを実行（マスタ復旧への配慮）
 */
function clearFacilitySheetData(facilitySS, sheetName) {
  const sheet = facilitySS.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`      ⚠️ ${sheetName} シートが見つかりません`);
    return;
  }
  
  const lastRow = sheet.getLastRow();
  
  // 【重要】2行目以降にデータが存在する場合のみクリア
  // この関数は、migrateSingleFacility_Legacy または migrateSingleFacility_SmartGEMBA から
  // 対応CSVが確認された後にのみ呼び出されるべき
  if (lastRow >= 2) {
    // データ範囲: 2行目1列目 ～ 最終行・最終列
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    Logger.log(`      ${sheetName}: ${lastRow - 1}行のデータをクリアしました`);
  } else {
    Logger.log(`      ${sheetName}: データがないためスキップ`);
  }
}

/**
 * 【修正1】SmartGEMBA階層構造を解析（開始行修正版）
 */
function parseSmartGEMBAHierarchy(csvData, facilityId, facilityCode) {
  const locations = [];
  const equipment = [];
  const inspectionItems = [];
  
  const locationMap = {}; // Key: "building|room", Value: { Location_ID, parentId }
  let locationCounter = 1;
  let equipmentCounter = 1;
  let inspectionItemCounter = 1;
  
  // 現在のコンテキスト
  let currentBuildingId = '';      // 01の Location_ID
  let currentBuildingName = '';    // 01の名称
  let currentRoomId = '';          // 02の Location_ID
  let currentEquipmentId = '';     // 03の Equipment_ID
  
  Logger.log(`      CSV行数: ${csvData.length}`);
  
  // ヘッダー行を探す
  let startRowIndex = 0;
  for (let i = 0; i < Math.min(csvData.length, 20); i++) {
    const row = csvData[i];
    if (row[0] && (row[0].indexOf('01') === 0 || row[0].indexOf('作業場所') !== -1)) {
      // 【修正1】'01'が見つかった行そのものから開始
      startRowIndex = i;
      break;
    }
  }
  
  Logger.log(`      データ開始行: ${startRowIndex}`);
  
  // データ行を解析（固定列インデックスを使用）
  for (let i = startRowIndex; i < csvData.length; i++) {
    const row = csvData[i];
    const typeCell = (row[0] || '').trim(); // 01, 02, 03, 04
    
    if (!typeCell) continue; // 空行スキップ
    
    // ========================================
    // "01作業場所" → Building (棟)
    // ========================================
    if (typeCell.indexOf('01') === 0) {
      const buildingName = (row[2] || '').trim(); // 【固定列】CSV[2]
      if (!buildingName) continue;
      
      const locationKey = `${buildingName}|`;
      
      if (!locationMap[locationKey]) {
        const locationId = `${facilityCode}_L-${String(locationCounter).padStart(5, '0')}`;
        
        locations.push({
          Location_ID: locationId,
          Facility_ID: facilityId,
          Parent_Location_ID: '',  // Buildingは親なし
          Building: buildingName,
          Floor: '',
          Room: '',
          Remarks: ''
        });
        
        locationMap[locationKey] = { Location_ID: locationId, parentId: '' };
        locationCounter++;
        
        Logger.log(`      [01] Building追加: ${buildingName} -> ${locationId}`);
      }
      
      currentBuildingId = locationMap[locationKey].Location_ID;
      currentBuildingName = buildingName;
      currentRoomId = ''; // Roomをリセット
    }
    
    // ========================================
    // "02対象グループ" → Room (部屋)
    // ========================================
    else if (typeCell.indexOf('02') === 0) {
      const roomName = (row[3] || '').trim(); // 【固定列】CSV[3]
      if (!roomName || !currentBuildingId) continue;
      
      const locationKey = `${currentBuildingName}|${roomName}`;
      
      if (!locationMap[locationKey]) {
        const locationId = `${facilityCode}_L-${String(locationCounter).padStart(5, '0')}`;
        
        locations.push({
          Location_ID: locationId,
          Facility_ID: facilityId,
          Parent_Location_ID: currentBuildingId, // 親はBuilding
          Building: currentBuildingName,
          Floor: '',
          Room: roomName,
          Remarks: ''
        });
        
        locationMap[locationKey] = { Location_ID: locationId, parentId: currentBuildingId };
        locationCounter++;
        
        Logger.log(`      [02] Room追加: ${currentBuildingName} > ${roomName} -> ${locationId} (親: ${currentBuildingId})`);
      }
      
      currentRoomId = locationMap[locationKey].Location_ID;
    }
    
    // ========================================
    // "03点検対象" → Equipment (設備)
    // ========================================
    else if (typeCell.indexOf('03') === 0) {
      const equipmentName = (row[4] || '').trim(); // 【固定列】CSV[4]
      if (!equipmentName) continue;
      
      currentEquipmentId = `${facilityCode}_E-${String(equipmentCounter).padStart(5, '0')}`;
      
      // Location_IDは、Roomがあればそれ、なければBuildingを使用
      const locationId = currentRoomId || currentBuildingId || '';
      
      equipment.push({
        Equipment_ID: currentEquipmentId,
        Facility_ID: facilityId,
        Location_ID: locationId,
        Name: equipmentName,
        Type: '機械',
        Manufacturer: '',
        Model: '',
        Serial_Number: '',
        Install_Date: '',
        Status: '稼働中',
        Remarks: ''
        // 【Step 4対応】残りの列は writeEquipmentToSheet で動的補完
      });
      
      equipmentCounter++;
      Logger.log(`      [03] Equipment追加: ${equipmentName} -> ${currentEquipmentId} (Location: ${locationId || '未設定'})`);
      
      // 【修正3】Location_IDが空の場合に警告
      if (!locationId) {
        Logger.log(`      ⚠️ WARNING: ${currentEquipmentId} の Location_ID が空です（Building/Roomが設定されていない可能性）`);
      }
    }
    
    // ========================================
    // "04点検項目" → Inspection Item
    // ========================================
    else if (typeCell.indexOf('04') === 0) {
      const itemName = (row[5] || '').trim(); // 【固定列】CSV[5]
      if (!itemName || !currentEquipmentId) continue;
      
      const itemId = `${facilityCode}_II-${String(inspectionItemCounter).padStart(5, '0')}`;
      
      inspectionItems.push({
        Item_ID: itemId,
        Equipment_ID: currentEquipmentId,
        Item_Name: itemName,
        Check_Method: '',
        Normal_Range: '',
        Unit: '',
        Remarks: ''
      });
      
      inspectionItemCounter++;
      Logger.log(`      [04] Inspection Item追加: ${itemName} -> ${itemId}`);
    }
  }
  
  Logger.log(`      生成完了 - Location: ${locations.length}, Equipment: ${equipment.length}, Inspection Item: ${inspectionItems.length}`);
  
  return { locations, equipment, inspectionItems };
}

/**
 * 【修正2】M_Locations シートへ書き込み（確実に2行目から）
 */
function writeLocationsToSheet(facilitySS, locations) {
  const sheet = facilitySS.getSheetByName('M_Locations');
  if (!sheet || locations.length === 0) {
    Logger.log('      ⚠️ M_Locations シートが見つかりません、またはデータがありません');
    return;
  }
  
  // ヘッダー構造を確認
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log(`      M_Locations ヘッダー（${headers.length}列）: ${headers.join(', ')}`);
  
  // ヘッダーに基づいて動的に配列を構築
  const outputData = locations.map(loc => {
    const row = [];
    headers.forEach(header => {
      // locationsオブジェクトに該当キーがあればその値、なければ空文字
      row.push(loc[header] !== undefined ? loc[header] : '');
    });
    return row;
  });
  
  // 【修正2】確実に2行目から書き込む
  sheet.getRange(2, 1, outputData.length, headers.length).setValues(outputData);
  Logger.log(`      ${outputData.length} 件のロケーションを追加（${headers.length}列）`);
}

/**
 * 【修正2+3】M_Equipment シートへ書き込み（確実に2行目から、Location_ID警告付き）
 */
function writeEquipmentToSheet(facilitySS, equipment) {
  const sheet = facilitySS.getSheetByName('M_Equipment');
  if (!sheet || equipment.length === 0) {
    Logger.log('      ⚠️ M_Equipment シートが見つかりません、またはデータがありません');
    return;
  }
  
  // ヘッダー構造を確認
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log(`      M_Equipment ヘッダー（${headers.length}列）: ${headers.join(', ')}`);
  
  // 【修正3】Location_IDが空の設備をカウント
  let emptyLocationCount = 0;
  
  // ヘッダーに基づいて動的に配列を構築
  const outputData = equipment.map(eq => {
    const row = [];
    headers.forEach(header => {
      // equipmentオブジェクトに該当キーがあればその値、なければ空文字
      row.push(eq[header] !== undefined ? eq[header] : '');
    });
    
    // Location_IDが空の場合にカウント
    if (!eq.Location_ID) {
      emptyLocationCount++;
    }
    
    return row;
  });
  
  // 【修正2】確実に2行目から書き込む
  sheet.getRange(2, 1, outputData.length, headers.length).setValues(outputData);
  Logger.log(`      ${outputData.length} 件の設備を追加（${headers.length}列）`);
  
  // 【修正3】Location_IDが空の設備がある場合に警告
  if (emptyLocationCount > 0) {
    Logger.log(`      ⚠️ WARNING: ${emptyLocationCount} 件の設備で Location_ID が空です`);
  }
}

/**
 * M_Inspection_Items シートへ書き込み
 */
function writeInspectionItemsToSheet(facilitySS, inspectionItems) {
  const sheet = facilitySS.getSheetByName('M_Inspection_Items');
  if (!sheet) {
    Logger.log('      ⚠️ M_Inspection_Items シートが見つかりません');
    return;
  }
  
  if (inspectionItems.length === 0) {
    Logger.log('      （点検項目データなし）');
    return;
  }
  
  const outputData = inspectionItems.map(item => [
    item.Item_ID,
    item.Equipment_ID,
    item.Item_Name,
    item.Check_Method,
    item.Normal_Range,
    item.Unit,
    item.Remarks
  ]);
  
  // 【修正2】確実に2行目から書き込む
  sheet.getRange(2, 1, outputData.length, outputData[0].length).setValues(outputData);
  Logger.log(`      ${outputData.length} 件の点検項目を追加`);
}

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * ヘッダーインデックスを柔軟に検索
 */
function findHeaderIndex_SG(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}
