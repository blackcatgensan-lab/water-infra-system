/**
 * ============================================================
 * IT資産管理マスタデータ・セットアップスクリプト
 * ============================================================
 * 
 * 実行方法:
 * 1. このファイルを保存し、GASエディタで `setupITAssetsMaster` 関数を実行します。
 * 
 * 処理内容:
 * 1. Master DB (V2_MASTER_DB_ID) に以下のシートを作成します。
 *    - M_IT_Devices (IT機器マスタ)
 *    - M_IT_Software (ソフトウェアマスタ)
 *    - T_IT_Installations (インストール情報)
 * 2. 必要なヘッダー行を設定します。
 * 3. 初期サンプルデータを投入します。
 */

function setupITAssetsMaster() {
  const ss = SpreadsheetApp.openById(V2_MASTER_DB_ID);
  
  // 1. M_IT_Devices
  setupSheet_(ss, 'M_IT_Devices', [
    'Device_ID', 'Reg_No', 'Name', 'Type', 'OS', 
    'Admin_Name', 'User_Names', 'Upstream_Device_ID', 'Sort_Order', 'Org_ID', 'Is_Active'
  ], [
    ['DEV-001', 'REG-1001', '本社ルーター', 'ルーター', 'Firmware v2.0', 'システム管理者', '', '', 1, 'ORG-001', true],
    ['DEV-002', 'REG-1002', 'L2スイッチ_1F', 'ハブ', '-', 'システム管理者', '', 'DEV-001', 2, 'ORG-001', true],
    ['DEV-003', 'REG-1003', '総務PC_01', 'PC', 'Windows 11 Pro', '鈴木 一郎', '鈴木 一郎', 'DEV-002', 1, 'ORG-001', true],
    ['DEV-004', 'REG-1004', '営業タブレット_01', 'タブレット', 'iPadOS 17', '佐藤 花子', '佐藤 花子', 'DEV-002', 2, 'ORG-002', true],
    ['DEV-005', 'REG-1005', '共有プリンタ', 'プリンタ', '-', '総務部', '全社員', 'DEV-002', 3, 'ORG-001', true]
  ]);

  // 2. M_IT_Software
  setupSheet_(ss, 'M_IT_Software', [
    'Soft_ID', 'Name', 'Version', 'License_Key', 'Expiry_Date'
  ], [
    ['SOFT-001', 'Microsoft Office 2021', '2021', 'XXXX-YYYY-ZZZZ-0001', ''],
    ['SOFT-002', 'AutoCAD LT', '2024', 'AAAA-BBBB-CCCC-DDDD', '2025/12/31'],
    ['SOFT-003', 'ウイルスバスター Corp', '14.0', 'VVVV-WWWW-XXXX-YYYY', '2024/09/30']
  ]);

  // 3. T_IT_Installations
  setupSheet_(ss, 'T_IT_Installations', [
    'Install_ID', 'Device_ID', 'Soft_ID'
  ], [
    ['INST-00001', 'DEV-003', 'SOFT-001'],
    ['INST-00002', 'DEV-003', 'SOFT-003']
  ]);

  Logger.log('IT資産マスタのセットアップが完了しました。');
}

function setupSheet_(ss, sheetName, headers, sampleData) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    Logger.log(`Created sheet: ${sheetName}`);
  } else {
    Logger.log(`Sheet exists: ${sheetName}`);
  }
  
  // Clear and set headers
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#E3F2FD').setFontWeight('bold');
  
  // Insert sample data
  if (sampleData && sampleData.length > 0) {
    sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
  }
}
