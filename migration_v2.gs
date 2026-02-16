/**
 * ============================================================
 * データ移行スクリプト v2 (点検ルート構造の正規化)
 * ============================================================
 * 
 * 実行手順:
 * 1. このファイルをプロジェクトに追加
 * 2. applyRouteMigration() を実行
 */

/**
 * 点検ルート構造の正規化を行い、M_Inspection_Routes をヘッダーと明細に分離する
 */
function applyRouteMigration() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 新しいシート M_Route_Details を作成
  var detailSheetName = 'M_Route_Details';
  var detailSheet = ss.getSheetByName(detailSheetName);
  if (!detailSheet) {
    detailSheet = ss.insertSheet(detailSheetName);
    // ヘッダー行の設定
    var headers = ['Route_Detail_ID', 'Route_ID', 'Equipment_ID', 'Order', 'Instructions'];
    detailSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    detailSheet.getRange(1, 1, 1, headers.length).setBackground('#4285F4').setFontColor('#FFFFFF').setFontWeight('bold');
    Logger.log('Created sheet: ' + detailSheetName);
  } else {
    Logger.log('Sheet already exists: ' + detailSheetName);
    // 既存データがある場合は警告して停止する場合もあるが、今回は追記/上書きを許容するか、クリアするか
    // 安全のため、クリアはせずそのまま進む（重複チェックは ID で行う）
  }

  // 2. 既存の M_Inspection_Routes を読み込む
  var routeSheet = ss.getSheetByName('M_Inspection_Routes');
  if (!routeSheet) {
    throw new Error('M_Inspection_Routes sheet not found');
  }
  
  // ヘッダー行がない場合の対策: 1行目がデータっぽい（ID形式）ならヘッダーを挿入
  var firstRow = routeSheet.getRange(1, 1, 1, 3).getValues()[0];
  if (String(firstRow[0]).match(/^R-\d+/) || (firstRow[0] === "" && routeSheet.getLastRow() > 1)) {
    routeSheet.insertRowBefore(1);
    routeSheet.getRange(1, 1, 1, 3).setValues([['Route_ID', 'Route_Name', 'Equipment_IDs']]);
    Logger.log('Inserted missing headers into M_Inspection_Routes');
  }

  var data = routeSheet.getDataRange().getValues();
  var headers = data[0];
  
  // カラム名を探す (曖昧検索)
  var findIdx = function(names) {
    for (var i = 0; i < names.length; i++) {
      var idx = headers.indexOf(names[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  var routeIdIdx = findIdx(['Route_ID', 'ID', 'ルートID']);
  var equipIdsIdx = findIdx(['Equipment_IDs', '設備IDリスト', '対象設備']);

  // 見つからない場合のデフォルト (1列目=ID, 3列目=設備リスト と推測)
  if (routeIdIdx === -1) routeIdIdx = 0;
  if (equipIdsIdx === -1) equipIdsIdx = (headers.length >= 3) ? 2 : 1;

  Logger.log('Using columns: Route_ID at index ' + routeIdIdx + ', Equipment_IDs at index ' + equipIdsIdx);

  // 3. データ移行処理
  var newDetails = [];
  var existingDetailIds = getExistingDetailIds_(detailSheet); // 既存のIDを取得して重複防ぐ
  
  // M_Route_Details の最終ID番号を取得（単純な連番）
  var nextDetailIdNum = getNextDetailIdNum_(detailSheet);

  for (var i = 1; i < data.length; i++) {
    var routeId = data[i][routeIdIdx];
    var equipmentIdsStr = data[i][equipIdsIdx];

    if (!routeId || !equipmentIdsStr) continue;

    // カンマ区切りを分解
    var equipmentIds = String(equipmentIdsStr).split(',').map(function(s) { return s.trim(); });

    equipmentIds.forEach(function(eqId, index) {
      if (!eqId) return;

      // ID生成: RD-00001 形式
      var detailId = 'RD-' + ('00000' + nextDetailIdNum).slice(-5);
      
      // 重複チェック（念のため）
      while (existingDetailIds[detailId]) {
        nextDetailIdNum++;
        detailId = 'RD-' + ('00000' + nextDetailIdNum).slice(-5);
      }

      newDetails.push([
        detailId,
        routeId,
        eqId,
        index + 1, // Order (1-based)
        '' // Instructions (初期値空)
      ]);
      
      existingDetailIds[detailId] = true;
      nextDetailIdNum++;
    });
  }

  // 4. 明細シートへの書き込み
  if (newDetails.length > 0) {
    var lastRow = detailSheet.getLastRow();
    detailSheet.getRange(lastRow + 1, 1, newDetails.length, 5).setValues(newDetails);
    Logger.log('Migrated ' + newDetails.length + ' rows to M_Route_Details');
  } else {
    Logger.log('No data to migrate');
  }

  // 5. 完了後、元の Equipment_IDs 列は削除せず、カラム名を変更してバックアップ扱いにする（安全策）
  // ユーザーの要望は「作り変える」だが、データ消失を防ぐためリネーム推奨
  routeSheet.getRange(1, equipIdsIdx + 1).setValue('_Backup_Equipment_IDs');
  Logger.log('Renamed Equipment_IDs column to _Backup_Equipment_IDs');
}

/**
 * 既存の Route_Detail_ID を取得してMapにする
 */
function getExistingDetailIds_(sheet) {
  var ids = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ids;
  
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    ids[data[i][0]] = true;
  }
  return ids;
}

/**
 * 次の Detail ID 番号を取得
 */
function getNextDetailIdNum_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var maxNum = 0;
  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][0]);
    if (id.startsWith('RD-')) {
      var num = parseInt(id.substring(3), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return maxNum + 1;
}
