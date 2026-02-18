/**
 * ============================================================
 * Phase 5 - Task 1: 施設別DBの量産スクリプト
 * ============================================================
 * 
 * Master_DBの施設リストに基づき、Facility_DB_Templateをコピーして
 * 全施設分のスプレッドシートを作成します。
 * 
 * 実行手順:
 *   1. このコードをGASプロジェクトに追加
 *   2. deployAllFacilityDatabases() を実行
 *   3. 作成されたファイルIDが M_Facilities.DB_File_ID に記録されます
 */

// ============================================================
// 設定
// ============================================================

const P5_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const P5_FACILITY_DB_TEMPLATE_ID = '1cvF2SCNBCSjfg3InQ1pQWjjoBpJ_01l0b1KwSLQek8Y';
const P5_TARGET_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj'; // 施設DBを作成する先のフォルダ

// ============================================================
// メイン実行関数
// ============================================================

/**
 * 全施設のデータベースを作成
 */
function deployAllFacilityDatabases() {
  Logger.log('========================================');
  Logger.log('Phase 5 - Task 1: 施設別DB量産開始');
  Logger.log('========================================');
  
  try {
    // 1. Master_DBから施設リストを取得
    Logger.log('\n[Step 1] Master_DBから施設リストを取得...');
    const masterSS = SpreadsheetApp.openById(P5_MASTER_DB_ID);
    const facilitiesSheet = masterSS.getSheetByName('M_Facilities');
    
    if (!facilitiesSheet) {
      throw new Error('M_Facilities シートが見つかりません');
    }
    
    const data = facilitiesSheet.getDataRange().getValues();
    const headers = data[0];
    
    // 必要な列のインデックスを取得
    const facilityIdIdx = headers.indexOf('Facility_ID');
    const nameIdx = headers.indexOf('Name');
    let dbFileIdIdx = headers.indexOf('DB_File_ID');
    
    if (facilityIdIdx === -1 || nameIdx === -1) {
      throw new Error('必要な列（Facility_ID, Name）が見つかりません');
    }
    
    // DB_File_ID列がなければ追加
    if (dbFileIdIdx === -1) {
      Logger.log('  DB_File_ID 列を追加します...');
      dbFileIdIdx = headers.length;
      facilitiesSheet.getRange(1, dbFileIdIdx + 1).setValue('DB_File_ID');
      facilitiesSheet.getRange(1, dbFileIdIdx + 1).setBackground('#1565C0').setFontColor('#FFFFFF').setFontWeight('bold');
    }
    
    // 2. テンプレートを取得
    const templateFile = DriveApp.getFileById(P5_FACILITY_DB_TEMPLATE_ID);
    const targetFolder = DriveApp.getFolderById(P5_TARGET_FOLDER_ID);
    
    // 3. 各施設のDBを作成
    Logger.log('\n[Step 2] 施設DBの作成...');
    let created = 0;
    let skipped = 0;
    
    for (let i = 1; i < data.length; i++) {
      const facilityId = data[i][facilityIdIdx];
      const facilityName = data[i][nameIdx];
      let existingDbFileId = data[i][dbFileIdIdx];
      
      if (!facilityId) continue; // 空行スキップ
      
      // 既にDB_File_IDが設定されている場合はスキップ
      if (existingDbFileId) {
        Logger.log(`  [${facilityId}] ${facilityName} - スキップ（既に作成済み: ${existingDbFileId}）`);
        skipped++;
        continue;
      }
      
      // テンプレートをコピー
      const newFileName = `Facility_DB_${facilityId}_${facilityName}`;
      Logger.log(`  [${facilityId}] ${facilityName} - 作成中...`);
      
      const newFile = templateFile.makeCopy(newFileName, targetFolder);
      const newFileId = newFile.getId();
      
      // DB_File_IDを書き込み
      facilitiesSheet.getRange(i + 1, dbFileIdIdx + 1).setValue(newFileId);
      
      Logger.log(`    ✅ 作成完了: ${newFileId}`);
      Logger.log(`    URL: https://docs.google.com/spreadsheets/d/${newFileId}`);
      created++;
      
      // APIレート制限対策（1秒待機）
      Utilities.sleep(1000);
    }
    
    Logger.log('\n========================================');
    Logger.log('✅ Phase 5 - Task 1: 完了');
    Logger.log(`   作成: ${created} 件`);
    Logger.log(`   スキップ: ${skipped} 件`);
    Logger.log('========================================');
    
  } catch (error) {
    Logger.log('\n❌ エラーが発生しました: ' + error.message);
    Logger.log(error.stack);
    throw error;
  }
}

/**
 * デバッグ用: 特定の施設のDBのみ作成
 */
function deploySpecificFacility(facilityId) {
  Logger.log(`========== ${facilityId} のDB作成 ==========`);
  
  const masterSS = SpreadsheetApp.openById(P5_MASTER_DB_ID);
  const facilitiesSheet = masterSS.getSheetByName('M_Facilities');
  const data = facilitiesSheet.getDataRange().getValues();
  const headers = data[0];
  
  const facilityIdIdx = headers.indexOf('Facility_ID');
  const nameIdx = headers.indexOf('Name');
  const dbFileIdIdx = headers.indexOf('DB_File_ID');
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][facilityIdIdx] === facilityId) {
      const facilityName = data[i][nameIdx];
      const templateFile = DriveApp.getFileById(P5_FACILITY_DB_TEMPLATE_ID);
      const targetFolder = DriveApp.getFolderById(P5_TARGET_FOLDER_ID);
      
      const newFileName = `Facility_DB_${facilityId}_${facilityName}`;
      const newFile = templateFile.makeCopy(newFileName, targetFolder);
      const newFileId = newFile.getId();
      
      facilitiesSheet.getRange(i + 1, dbFileIdIdx + 1).setValue(newFileId);
      
      Logger.log(`✅ 作成完了: ${newFileId}`);
      Logger.log(`URL: https://docs.google.com/spreadsheets/d/${newFileId}`);
      return;
    }
  }
  
  Logger.log(`❌ ${facilityId} が見つかりませんでした`);
}

/**
 * 作成されたDBのリストを表示
 */
function listFacilityDatabases() {
  const masterSS = SpreadsheetApp.openById(P5_MASTER_DB_ID);
  const facilitiesSheet = masterSS.getSheetByName('M_Facilities');
  const data = facilitiesSheet.getDataRange().getValues();
  const headers = data[0];
  
  const facilityIdIdx = headers.indexOf('Facility_ID');
  const nameIdx = headers.indexOf('Name');
  const dbFileIdIdx = headers.indexOf('DB_File_ID');
  
  Logger.log('========== 施設DB一覧 ==========');
  for (let i = 1; i < data.length; i++) {
    const facilityId = data[i][facilityIdIdx];
    const facilityName = data[i][nameIdx];
    const dbFileId = data[i][dbFileIdIdx];
    
    if (facilityId) {
      const status = dbFileId ? '✅ 作成済み' : '❌ 未作成';
      Logger.log(`[${facilityId}] ${facilityName} - ${status}`);
      if (dbFileId) {
        Logger.log(`  URL: https://docs.google.com/spreadsheets/d/${dbFileId}`);
      }
    }
  }
}
