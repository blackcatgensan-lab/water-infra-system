/**
 * ============================================================
 * Phase 3: データ移行スクリプト
 * ============================================================
 * 
 * DriveフォルダからCSVデータを読み込み、Master_DBとFacility_DBへ移行する
 * 
 * 実行手順:
 *   1. Google Apps Script エディタで新規プロジェクト作成
 *   2. このコードを貼り付け
 *   3. 以下の定数を確認・修正
 *   4. executeMigration() を実行
 */

// ============================================================
// 設定
// ============================================================

const MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const FACILITY_DB_TEMPLATE_ID = '1cvF2SCNBCSjfg3InQ1pQWjjoBpJ_01l0b1KwSLQek8Y';
const CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';

// パイロット版: F-001のみ処理
const TARGET_FACILITY_ID = 'F-001';
const TARGET_FACILITY_CODE = 'F001';
const TARGET_FACILITY_NAME = '川俣水みらいセンター';

// ============================================================
// メイン実行関数
// ============================================================

/**
 * データ移行を実行
 */
function executeMigration() {
  Logger.log('========================================');
  Logger.log('Phase 3: データ移行開始');
  Logger.log('========================================');
  
  try {
    // 1. CSVデータを読み込む
    Logger.log('\n[Step 1] CSVデータの読み込み...');
    const csvData = loadAllCSVData();
    
    // 2. Master_DB へのデータ移行
    Logger.log('\n[Step 2] Master_DB へのデータ移行...');
    migrateMasterData(csvData);
    
    // 3. Facility_DB へのデータ移行（F-001のみ）
    Logger.log('\n[Step 3] Facility_DB へのデータ移行（F-001のみ）...');
    migrateFacilityData(csvData);
    
    Logger.log('\n========================================');
    Logger.log('✅ Phase 3: データ移行完了');
    Logger.log('========================================');
    Logger.log('Master_DB: https://docs.google.com/spreadsheets/d/' + MASTER_DB_ID);
    Logger.log('Facility_DB (F-001): https://docs.google.com/spreadsheets/d/' + FACILITY_DB_TEMPLATE_ID);
    
  } catch (error) {
    Logger.log('\n❌ エラーが発生しました: ' + error.message);
    Logger.log(error.stack);
    throw error;
  }
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
      
      // エンコーディングの判定（簡易版: 文字化け記号が含まれるか確認）
      try {
        content = blob.getDataAsString('UTF-8');
        if (content.indexOf('\ufffd') !== -1) {
          throw new Error('Garbled');
        }
      } catch (e) {
        Logger.log('    UTF-8 での読み込みに失敗または文字化けの可能性があります。Shift-JIS (MS932) を試行します。');
        content = blob.getDataAsString('MS932');
      }
      
      const parsed = parseCSV(content);
      
      // ファイル名をキーとして保存
      if (fileName.includes('施設情報')) {
        csvData.facilities = parsed;
      } else if (fileName.includes('設備情報')) {
        csvData.equipment = parsed;
      } else if (fileName.includes('組織')) {
        csvData.organizations = parsed;
      } else if (fileName.includes('資格一覧')) {
        csvData.qualifications = parsed;
      } else if (fileName.includes('点検情報')) {
        csvData.inspections = parsed;
      }
    }
  }
  
  Logger.log('  読み込み完了: ' + Object.keys(csvData).length + 'ファイル');
  return csvData;
}

/**
 * CSV文字列をパースして配列に変換
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // シンプルなCSVパース（ダブルクォート内のカンマは未対応）
    const values = line.split(',').map(v => v.trim());
    result.push(values);
  }
  
  return result;
}

// ============================================================
// Master_DB へのデータ移行
// ============================================================

/**
 * Master_DB へマスターデータを移行
 */
function migrateMasterData(csvData) {
  const masterSS = SpreadsheetApp.openById(MASTER_DB_ID);
  
  // M_Facilities の移行
  if (csvData.facilities) {
    Logger.log('  M_Facilities を移行中...');
    migrateFacilities(masterSS, csvData.facilities);
  }
  
  // M_Organizations の移行
  if (csvData.organizations) {
    Logger.log('  M_Organizations を移行中...');
    migrateOrganizations(masterSS, csvData.organizations);
  }
  
  // M_Qualifications の移行
  if (csvData.qualifications) {
    Logger.log('  M_Qualifications を移行中...');
    migrateQualifications(masterSS, csvData.qualifications);
  }
  
  Logger.log('  Master_DB への移行完了');
}

/**
 * M_Facilities へのデータ移行
 */
function migrateFacilities(ss, csvData) {
  const sheet = ss.getSheetByName('M_Facilities');
  if (!sheet) {
    Logger.log('    ⚠️  M_Facilities シートが見つかりません');
    return;
  }
  
  sheet.clearContents(); // ヘッダー含めて一旦クリア
  
  const headers = csvData[0];
  const facilityHeaders = ['Facility_ID', 'Name', 'Address', 'Map_Link', 'Image_URL', 'Contract_ID'];
  sheet.getRange(1, 1, 1, facilityHeaders.length).setValues([facilityHeaders]);

  const rows = [];
  
  // ヘッダーから必要な列のインデックスを取得
  const nameIdx = findHeaderIndex(headers, ['施設名称', '施設名', '事業所']);
  const addressIdx = findHeaderIndex(headers, ['住所', '所在地']);
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    const facilityId = 'F-' + String(i).padStart(3, '0');
    const name = nameIdx !== -1 ? row[nameIdx] : (row[0] || '');
    const address = addressIdx !== -1 ? row[addressIdx] : (row[1] || '');
    
    rows.push([
      facilityId,           // Facility_ID
      name,                 // Name
      address,              // Address
      '',                   // Map_Link
      '',                   // Image_URL
      ''                    // Contract_ID
    ]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
    Logger.log(`    ✅ ${rows.length}件のデータを移行`);
  }
}

/**
 * M_Organizations へのデータ移行
 */
function migrateOrganizations(ss, csvData) {
  const sheet = ss.getSheetByName('M_Organizations');
  if (!sheet) {
    Logger.log('    ⚠️  M_Organizations シートが見つかりません');
    return;
  }
  
  // データ検証を一時的に緩和（移行をブロックしないため）
  const typeCol = 3;
  const validation = sheet.getRange(2, typeCol, 998, 1).getDataValidation();
  if (validation) {
    const relaxedRule = validation.copy().setAllowInvalid(true).build();
    sheet.getRange(2, typeCol, 998, 1).setDataValidation(relaxedRule);
  }
  
  const rows = [];
  const headers = csvData[0];
  
  // ヘッダーから必要な列のインデックスを取得
  const nameIdx = findHeaderIndex(headers, ['組織名', '部署名']);
  const typeIdx = findHeaderIndex(headers, ['種別', 'タイプ', '区分']);
  
  const uniqueTypes = new Set();
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    const orgId = 'ORG-' + String(i).padStart(3, '0');
    const name = row[nameIdx] || '';
    const type = row[typeIdx] || '';
    
    if (type) uniqueTypes.add(type);
    
    rows.push([
      orgId,                // Org_ID
      name,                 // Name
      type,                 // Type
      '',                   // Parent_Org_ID
      i * 10,               // Sort_Order
      '有効',               // Is_Active
      ''                    // Org_Code
    ]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    Logger.log(`    ✅ ${rows.length}件のデータを移行`);
    
    // 検証ルールを実際のデータに合わせて更新
    if (uniqueTypes.size > 0) {
      const newValues = Array.from(uniqueTypes);
      const newRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(newValues, true)
        .setAllowInvalid(false) // 以降は厳格に
        .build();
      sheet.getRange(2, typeCol, 998, 1).setDataValidation(newRule);
      Logger.log(`    ℹ️  M_Organizations の検証ルールを更新しました: [${newValues.join(', ')}]`);
    }
  }
}

/**
 * M_Qualifications へのデータ移行
 */
function migrateQualifications(ss, csvData) {
  const sheet = ss.getSheetByName('M_Qualifications');
  if (!sheet) {
    Logger.log('    ⚠️  M_Qualifications シートが見つかりません');
    return;
  }
  
  // データ検証を一時的に緩和
  const typeCol = 3;
  const validation = sheet.getRange(2, typeCol, 998, 1).getDataValidation();
  if (validation) {
    const relaxedRule = validation.copy().setAllowInvalid(true).build();
    sheet.getRange(2, typeCol, 998, 1).setDataValidation(relaxedRule);
  }

  const rows = [];
  const headers = csvData[0];
  
  // ヘッダーから必要な列のインデックスを取得
  const nameIdx = findHeaderIndex(headers, ['資格名称', '資格名']);
  const typeIdx = findHeaderIndex(headers, ['種別', '分類', 'タイプ']);
  
  const uniqueTypes = new Set();
  
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    const qualId = 'Q-' + String(i).padStart(3, '0');
    const name = nameIdx !== -1 ? row[nameIdx] : row[1];
    const type = typeIdx !== -1 ? row[typeIdx] : row[2];
    
    if (type) uniqueTypes.add(type);
    
    rows.push([
      qualId,               // Qual_ID
      name,                 // Name
      type,                 // Type
      '',                   // Organizer
      5                     // Renewal_Period_Years (デフォルト5年)
    ]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    Logger.log(`    ✅ ${rows.length}件のデータを移行`);
    
    // 検証ルールを更新
    if (uniqueTypes.size > 0) {
      const newValues = Array.from(uniqueTypes);
      const newRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(newValues, true)
        .setAllowInvalid(false)
        .build();
      sheet.getRange(2, typeCol, 998, 1).setDataValidation(newRule);
      Logger.log(`    ℹ️  M_Qualifications の検証ルールを更新しました: [${newValues.join(', ')}]`);
    }
  }
}

// ============================================================
// Facility_DB へのデータ移行
// ============================================================

/**
 * Facility_DB へ施設固有データを移行（F-001のみ）
 */
function migrateFacilityData(csvData) {
  const facilitySS = SpreadsheetApp.openById(FACILITY_DB_TEMPLATE_ID);
  
  // F-001のデータのみを抽出
  const f001Equipment = filterEquipmentByFacility(csvData.equipment, TARGET_FACILITY_NAME);
  
  if (f001Equipment.length === 0) {
    Logger.log('  ⚠️  F-001のデータが見つかりません');
    return;
  }
  
  Logger.log(`  F-001の設備データ: ${f001Equipment.length}件`);
  
  // M_Locations を自動生成
  Logger.log('  M_Locations を自動生成中...');
  const { locations, locationMap } = generateLocations(TARGET_FACILITY_ID, f001Equipment);
  
  // M_Locations シートへ書き込み
  writeMLocations(facilitySS, locations);
  
  // M_Equipment シートへ書き込み
  Logger.log('  M_Equipment へ移行中...');
  writeMEquipment(facilitySS, f001Equipment, locationMap);
  
  Logger.log('  Facility_DB (F-001) への移行完了');
}

/**
 * 施設名で設備データをフィルタリング
 */
function filterEquipmentByFacility(equipmentCSV, facilityName) {
  if (!equipmentCSV || equipmentCSV.length === 0) return [];
  
  const headers = equipmentCSV[0];
  const facilityIdx = findHeaderIndex(headers, ['施設', '施設名', '事業所']);
  
  if (facilityIdx === -1) {
    Logger.log('    ⚠️  施設名の列が見つかりません');
    return [];
  }
  
  const filtered = [];
  for (let i = 1; i < equipmentCSV.length; i++) {
    const row = equipmentCSV[i];
    if (row[facilityIdx] && row[facilityIdx].includes(facilityName)) {
      filtered.push({ rowIndex: i, data: row, headers: headers });
    }
  }
  
  return filtered;
}

/**
 * ヘッダーから列インデックスを検索
 */
function findHeaderIndex(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * M_Locations を自動生成（migration_plan_v2.md のアルゴリズムを実装）
 */
function generateLocations(facilityId, equipmentData) {
  const facilityCode = facilityId.replace('F-', 'F'); // "F-001" → "F001"
  const locationMap = new Map();
  const locations = [];
  let locationIdCounter = 1;
  
  // Step 1: 施設ルートを作成
  const rootLocationId = `${facilityCode}_L-00000`;
  locations.push({
    Location_ID: rootLocationId,
    Facility_ID: facilityId,
    Building: '',
    Floor: '',
    Room: '',
    Parent_Location_ID: '',
    Sort_Order: 0
  });
  locationMap.set('ROOT', rootLocationId);
  
  // 各設備データから Building, Floor, Room を抽出
  const buildingIdx = findHeaderIndex(equipmentData[0].headers, ['棟', '建屋', '棟屋']);
  const floorIdx = findHeaderIndex(equipmentData[0].headers, ['階', 'フロア', 'FL']);
  const roomIdx = findHeaderIndex(equipmentData[0].headers, ['部屋', '室', '場所']);
  
  // Step 2: 棟 (Building) レベルを生成
  const buildings = new Set();
  equipmentData.forEach(eq => {
    const building = eq.data[buildingIdx];
    if (building && building.trim()) {
      buildings.add(building.trim());
    }
  });
  
  const buildingsArray = Array.from(buildings).sort();
  buildingsArray.forEach((building, idx) => {
    const buildingId = `${facilityCode}_L-${String(locationIdCounter).padStart(5, '0')}`;
    locations.push({
      Location_ID: buildingId,
      Facility_ID: facilityId,
      Building: building,
      Floor: '',
      Room: '',
      Parent_Location_ID: rootLocationId,
      Sort_Order: (idx + 1) * 10
    });
    locationMap.set(`B:${building}`, buildingId);
    locationIdCounter++;
  });
  
  // Step 3: 階 (Floor) レベルを生成
  const floors = new Set();
  equipmentData.forEach(eq => {
    const building = eq.data[buildingIdx];
    const floor = eq.data[floorIdx];
    if (building && floor && building.trim() && floor.trim()) {
      floors.add(`${building.trim()}|${floor.trim()}`);
    }
  });
  
  const floorsArray = Array.from(floors).sort();
  floorsArray.forEach((floorKey, idx) => {
    const [building, floor] = floorKey.split('|');
    const parentId = locationMap.get(`B:${building}`);
    if (!parentId) return;
    
    const floorId = `${facilityCode}_L-${String(locationIdCounter).padStart(5, '0')}`;
    locations.push({
      Location_ID: floorId,
      Facility_ID: facilityId,
      Building: building,
      Floor: floor,
      Room: '',
      Parent_Location_ID: parentId,
      Sort_Order: (idx + 1) * 10
    });
    locationMap.set(`F:${building}|${floor}`, floorId);
    locationIdCounter++;
  });
  
  // Step 4: 部屋 (Room) レベルを生成
  const rooms = new Set();
  equipmentData.forEach(eq => {
    const building = eq.data[buildingIdx];
    const floor = eq.data[floorIdx];
    const room = eq.data[roomIdx];
    if (building && floor && room && building.trim() && floor.trim() && room.trim()) {
      rooms.add(`${building.trim()}|${floor.trim()}|${room.trim()}`);
    }
  });
  
  const roomsArray = Array.from(rooms).sort();
  roomsArray.forEach((roomKey, idx) => {
    const [building, floor, room] = roomKey.split('|');
    const parentId = locationMap.get(`F:${building}|${floor}`);
    if (!parentId) return;
    
    const roomId = `${facilityCode}_L-${String(locationIdCounter).padStart(5, '0')}`;
    locations.push({
      Location_ID: roomId,
      Facility_ID: facilityId,
      Building: building,
      Floor: floor,
      Room: room,
      Parent_Location_ID: parentId,
      Sort_Order: (idx + 1) * 10
    });
    locationMap.set(`R:${building}|${floor}|${room}`, roomId);
    locationIdCounter++;
  });
  
  Logger.log(`    生成された場所: ${locations.length}件`);
  return { locations, locationMap };
}

/**
 * M_Locations シートへ書き込み
 */
function writeMLocations(ss, locations) {
  const sheet = ss.getSheetByName('M_Locations');
  if (!sheet) {
    Logger.log('    ⚠️  M_Locations シートが見つかりません');
    return;
  }
  
  const rows = locations.map(loc => [
    loc.Location_ID,
    loc.Facility_ID,
    loc.Building,
    loc.Floor,
    loc.Room,
    loc.Parent_Location_ID,
    loc.Sort_Order
  ]);
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    Logger.log(`    ✅ M_Locations に${rows.length}件のデータを移行`);
  }
}

/**
 * M_Equipment シートへ書き込み
 */
function writeMEquipment(ss, equipmentData, locationMap) {
  const sheet = ss.getSheetByName('M_Equipment');
  if (!sheet) {
    Logger.log('    ⚠️  M_Equipment シートが見つかりません');
    return;
  }
  
  const headers = equipmentData[0].headers;
  const buildingIdx = findHeaderIndex(headers, ['棟', '建屋', '棟屋']);
  const floorIdx = findHeaderIndex(headers, ['階', 'フロア', 'FL']);
  const roomIdx = findHeaderIndex(headers, ['部屋', '室', '場所']);
  const nameIdx = findHeaderIndex(headers, ['設備名称', '設備名', '名称']);
  const typeIdx = findHeaderIndex(headers, ['種別', '分類', 'タイプ']);
  
  const rows = [];
  let equipmentIdCounter = 1;
  
  equipmentData.forEach(eq => {
    const data = eq.data;
    
    // Location_ID を解決
    let locationId = '';
    const building = data[buildingIdx] ? data[buildingIdx].trim() : '';
    const floor = data[floorIdx] ? data[floorIdx].trim() : '';
    const room = data[roomIdx] ? data[roomIdx].trim() : '';
    
    if (room && floor && building) {
      locationId = locationMap.get(`R:${building}|${floor}|${room}`) || '';
    } else if (floor && building) {
      locationId = locationMap.get(`F:${building}|${floor}`) || '';
    } else if (building) {
      locationId = locationMap.get(`B:${building}`) || '';
    } else {
      locationId = locationMap.get('ROOT') || '';
    }
    
    // 設備IDにプレフィックスを付与
    const equipmentId = `${TARGET_FACILITY_CODE}_E-${String(equipmentIdCounter).padStart(5, '0')}`;
    equipmentIdCounter++;
    
    rows.push([
      equipmentId,                              // Equipment_ID
      TARGET_FACILITY_ID,                       // Facility_ID
      locationId,                               // Location_ID
      data[nameIdx] || '',                      // Name
      data[typeIdx] || '',                      // Type
      '稼働中',                                 // Status
      '',                                       // System_Category
      '',                                       // Category_Major
      '',                                       // Category_Middle
      '',                                       // Category_Minor
      '',                                       // Model_Number
      '',                                       // Serial_Number
      '',                                       // Spec_1
      '',                                       // Spec_2
      '',                                       // Spec_3
      '',                                       // Installation_Date
      '',                                       // Operation_Start_Date
      '',                                       // Legal_Lifespan
      '',                                       // Standard_Lifespan
      '',                                       // Manufacturer
      '',                                       // Contractor
      '',                                       // Asset_No
      '',                                       // Maintenance_Type
      ''                                        // QR_Code
    ]);
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 24).setValues(rows);
    Logger.log(`    ✅ M_Equipment に${rows.length}件のデータを移行`);
  }
}
