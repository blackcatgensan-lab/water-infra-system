/**
 * ============================================================
 * Phase 5 - Task 2: SmartGEMBA対応データ移行スクリプト (改訂版 v1.3)
 * ============================================================
 */

const SG_MASTER_DB_ID = '1RKn18-VLaGz1W8aB6lBeOAfQWvSnvi2Oo4wDtFbiNrQ';
const SG_CSV_FOLDER_ID = '1LNSasnpyuKa05P7Nf5kDSds7T_1Gackj';
const SG_PROP_KEY_LAST_PROCESSED_FACILITY = 'SG_LAST_PROCESSED_FACILITY_INDEX';
const SG_PROP_KEY_MIGRATION_STATUS = 'SG_MIGRATION_STATUS';
const LEGACY_FACILITY_ID = 'F-007';

function executeSmartGEMBAMigration() {
    Logger.log('SmartGEMBA移行開始...');
    try {
        const props = PropertiesService.getScriptProperties();
        let lastProcessedIndex = parseInt(props.getProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY) || '-1');
        const csvData = loadAllCSVData_SG();

        if (lastProcessedIndex === -1) {
            migrateMasterData_SG(csvData);
            props.setProperty(SG_PROP_KEY_MIGRATION_STATUS, 'MASTER_COMPLETED');
        }

        const masterSS = SpreadsheetApp.openById(SG_MASTER_DB_ID);
        const facilitiesSheet = masterSS.getSheetByName('M_Facilities');
        const facilityData = facilitiesSheet.getDataRange().getValues();
        const headers = facilityData[0];
        const idIdx = headers.indexOf('Facility_ID');
        const nameIdx = headers.indexOf('Name');
        const dbIdx = headers.indexOf('DB_File_ID');

        for (let i = Math.max(lastProcessedIndex + 1, 1); i < facilityData.length; i++) {
            const fId = facilityData[i][idIdx];
            const fName = facilityData[i][nameIdx];
            const dbId = facilityData[i][dbIdx];
            if (!fId || !dbId) continue;

            Logger.log(`処理中: ${fId} ${fName}`);
            if (fId === LEGACY_FACILITY_ID) {
                migrateSingleFacility_Legacy(fId, fName, dbId, csvData);
            } else {
                migrateSingleFacility_SmartGEMBA(fId, fName, dbId, csvData);
            }
            props.setProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY, String(i));
        }
        props.deleteProperty(SG_PROP_KEY_LAST_PROCESSED_FACILITY);
        props.setProperty(SG_PROP_KEY_MIGRATION_STATUS, 'COMPLETED');
        Logger.log('移行完了');
    } catch (e) {
        Logger.log('エラー: ' + e.message);
        throw e;
    }
}

function loadAllCSVData_SG() {
    const folder = DriveApp.getFolderById(SG_CSV_FOLDER_ID);
    const files = folder.getFiles();
    const csvData = { smartgemba: [], legacy: {}, choices: null };
    while (files.hasNext()) {
        const file = files.next();
        const name = file.getName();
        if (name.endsWith('.csv')) {
            const parsed = parseCSV_SG(file.getBlob().getDataAsString('UTF-8'));
            if (name.indexOf('点検ツリー') !== -1) {
                csvData.smartgemba.push({ fileName: name, facilityName: extractFacilityNameFromFileName(name), data: parsed });
            } else if (name.indexOf('施設情報') !== -1) {
                csvData.legacy.facilities = parsed;
            } else if (name.indexOf('設備情報') !== -1) {
                csvData.legacy.equipment = parsed;
            }
        }
    }
    return csvData;
}

function extractFacilityNameFromFileName(fileName) {
    const match = fileName.match(/[（(](.+?)[）)]/);
    return match ? match[1].replace(/水処理|水再生|センター|下水道|浄化/g, '').trim() : '';
}

function parseCSV_SG(content) {
    return content.split(/\r?\n/).filter(line => line.trim()).map(line => line.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
}

function migrateMasterData_SG(csvData) {
    Logger.log('Master_DB移行中...');
}

function migrateSingleFacility_Legacy(fId, fName, dbId, csvData) {
    Logger.log(`Legacy移行: ${fId}`);
}

function migrateSingleFacility_SmartGEMBA(facilityId, facilityName, dbFileId, csvData) {
    const ss = SpreadsheetApp.openById(dbFileId);
    let targetCSV = null;
    for (let i = 0; i < csvData.smartgemba.length; i++) {
        const sg = csvData.smartgemba[i];
        if (facilityName.indexOf(sg.facilityName) !== -1 || sg.facilityName.indexOf(facilityName.substring(0, 2)) !== -1) {
            targetCSV = sg;
            break;
        }
    }

    if (!targetCSV) return;

    clearFacilitySheetData(ss, 'M_Locations');
    clearFacilitySheetData(ss, 'M_Equipment');
    clearFacilitySheetData(ss, 'M_Inspection_Items');

    const parsed = parseSmartGEMBAHierarchy(targetCSV.data, facilityId, facilityId.replace('-', ''));
    writeLocationsToSheet(ss, parsed.locations);
    writeEquipmentToSheet(ss, parsed.equipment);
    writeInspectionItemsToSheet(ss, parsed.inspectionItems);
}

function clearFacilitySheetData(ss, name) {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
}

function parseSmartGEMBAHierarchy(data, fId, fCode) {
    const locations = [], equipment = [], inspectionItems = [];
    let currentB = '', currentR = '', currentE = '';
    let lIdx = 1, eIdx = 1, iIdx = 1;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const type = (row[0] || '').trim();
        if (type.indexOf('01') === 0) {
            const name = (row[2] || '').trim();
            currentB = `${fCode}_L-${String(lIdx++).padStart(5, '0')}`;
            locations.push({ Location_ID: currentB, Facility_ID: fId, Building: name, Floor: '', Room: '' });
            currentR = '';
        } else if (type.indexOf('02') === 0) {
            const name = (row[3] || '').trim();
            currentR = `${fCode}_L-${String(lIdx++).padStart(5, '0')}`;
            locations.push({ Location_ID: currentR, Facility_ID: fId, Parent_Location_ID: currentB, Room: name });
        } else if (type.indexOf('03') === 0) {
            const name = (row[4] || '').trim();
            currentE = `${fCode}_E-${String(eIdx++).padStart(5, '0')}`;
            equipment.push({ Equipment_ID: currentE, Facility_ID: fId, Location_ID: currentR || currentB, Name: name });
        } else if (type.indexOf('04') === 0) {
            const name = (row[5] || '').trim();
            inspectionItems.push({ Item_ID: `${fCode}_II-${String(iIdx++).padStart(5, '0')}`, Equipment_ID: currentE, Item_Name: name });
        }
    }
    return { locations, equipment, inspectionItems };
}

function writeLocationsToSheet(ss, data) {
    const sheet = ss.getSheetByName('M_Locations');
    if (sheet && data.length) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = data.map(d => headers.map(h => d[h] || ''));
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }
}

function writeEquipmentToSheet(ss, data) {
    const sheet = ss.getSheetByName('M_Equipment');
    if (sheet && data.length) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const values = data.map(d => headers.map(h => d[h] || ''));
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }
}

function writeInspectionItemsToSheet(ss, data) {
    const sheet = ss.getSheetByName('M_Inspection_Items');
    if (sheet && data.length) {
        const values = data.map(d => [d.Item_ID, d.Equipment_ID, d.Item_Name, '', '', '', '']);
        sheet.getRange(2, 1, values.length, 7).setValues(values);
    }
}

function findHeaderIndex_SG(headers, candidates) {
    for (let i = 0; i < candidates.length; i++) {
        const idx = headers.indexOf(candidates[i]);
        if (idx !== -1) return idx;
    }
    return -1;
}
