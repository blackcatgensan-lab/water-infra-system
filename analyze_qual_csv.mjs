/**
 * 資格一覧CSVからユニークな値を抽出する調査スクリプト (Node.js版 - Shift-JIS対応)
 * 特に「資格種類」列の値を調査する
 */

import { readFileSync } from 'fs';

const CSV_PATH = String.raw`j:\マイドライブ\Antigravityテスト\水インフラ管理システム\raw_data\取り扱いデータ - 資格一覧.csv`;

// Shift-JIS (CP932) でCSV読み込み
const rawBuffer = readFileSync(CSV_PATH);
const decoder = new TextDecoder('shift_jis');
let content = decoder.decode(rawBuffer);
content = content.replace(/^\uFEFF/, '');

// CSVパーサー (簡易版)
function parseCSV(text) {
    const rows = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
        const row = [];
        while (i < len) {
            if (text[i] === '"') {
                i++;
                let field = '';
                while (i < len) {
                    if (text[i] === '"') {
                        if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; }
                        else { i++; break; }
                    } else { field += text[i]; i++; }
                }
                row.push(field);
            } else {
                let field = '';
                while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { field += text[i]; i++; }
                row.push(field);
            }
            if (i < len && text[i] === ',') { i++; } else { break; }
        }
        while (i < len && (text[i] === '\r' || text[i] === '\n')) { i++; }
        if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) { rows.push(row); }
    }
    return rows;
}

const allRows = parseCSV(content);

// 調査対象: mapQualificationData で row[1] を Type として使用していると想定 (実際には row[?] を確認)
// CSV構造を推定するため、先頭数行を表示
console.log("Header row:", allRows[0]);
console.log("First data row:", allRows[1]);

// mapQualificationData では:
// Input: [0]資格名称, [1]正式名称, [2]有効期限(年), [3]備考
// と定義されているが、実際のCSVに「資格種別」が含まれているか確認が必要。

// もし含まれていない場合、自動的に 'その他' にするなどの対応が必要。
// もし含まれているなら、その列のユニーク値を出す。

console.log(`総行数: ${allRows.length}`);
