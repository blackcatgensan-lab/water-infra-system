/**
 * 点検情報CSVからユニークな値を抽出する調査スクリプト (Node.js版 - Shift-JIS対応)
 * 特に「点検タイプ」列の値を調査する
 */

import { readFileSync } from 'fs';

const CSV_PATH = String.raw`j:\マイドライブ\Antigravityテスト\水インフラ管理システム\raw_data\取り扱いデータ - 点検情報.csv`;

// Shift-JIS (CP932) でCSV読み込み
const rawBuffer = readFileSync(CSV_PATH);
const decoder = new TextDecoder('shift_jis');
let content = decoder.decode(rawBuffer);
content = content.replace(/^\uFEFF/, '');

// CSVパーサー
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

// 調査対象: migrateInspectionData で row[11] を Type として使用している
// CSV構造:
// row[0]: type (03点検対象, 04点検, etc)
// ...
// row[11]: 点検タイプ

const targetIndex = 11;
const uniqueValues = new Set();
const typeColIndex = 0;

console.log(`総行数: ${allRows.length}`);

// ヘッダー行かもしれない1行目を確認
// console.log("Header row candidate:", allRows[0]);

for (let r = 0; r < allRows.length; r++) {
    const row = allRows[r];

    // migrateInspectionData のロジックにならい、'04点検' または '04点検項目' の行のみを対象とする
    const rowType = row[typeColIndex];
    if (rowType === '04点検' || rowType === '04点検項目') {
        if (targetIndex < row.length) {
            const val = row[targetIndex].trim();
            if (val) {
                uniqueValues.add(val);
            } else {
                uniqueValues.add('(空文字)');
            }
        }
    }
}

console.log('=== 点検情報CSV "点検タイプ" (列11) ユニーク値 ===');
[...uniqueValues].sort().forEach(v => {
    console.log(`- ${v}`);
});

console.log('===================================================');
console.log('現在の setupDatabase.gs の定義: [数値入力, OK/NG選択, 写真のみ, テキスト]');
