/**
 * 設備情報CSVからユニークな値を抽出する調査スクリプト (Node.js版 - Shift-JIS対応)
 * 結果をUTF-8ファイルに出力する
 */

import { readFileSync, writeFileSync } from 'fs';

const CSV_PATH = String.raw`j:\マイドライブ\Antigravityテスト\水インフラ管理システム\raw_data\取り扱いデータ - 設備情報.csv`;
const OUTPUT_PATH = String.raw`j:\マイドライブ\Antigravityテスト\水インフラ管理システム\csv_analysis_result.txt`;

// 調査対象カラム
const TARGET_COLUMNS_BY_NAME = [
    { name: '大分類', desc: 'Category_Major / Type相当' },
    { name: '中分類', desc: 'Category_Middle相当' },
    { name: '小分類', desc: 'Category_Minor相当' },
    { name: '診断形式', desc: '診断の形式' },
    { name: '設備形式', desc: 'Model相当' },
    { name: '保全区分', desc: 'Maintenance_Type相当' },
    { name: '状態', desc: 'Status相当' },
    { name: '単位', desc: 'Unit' },
    { name: 'デフレータ区分', desc: 'デフレータの区分' },
    { name: '集約方法', desc: '集約方法' },
    { name: '機器種別', desc: '機器の種別(後半セクション)' },
    { name: '登録区分', desc: '登録の区分(後半セクション)' },
];

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
const headers = allRows[0];
const dataRows = allRows.slice(1);

const lines = [];
lines.push('=== 設備情報CSV 調査レポート ===');
lines.push(`エンコーディング: Shift-JIS (CP932)`);
lines.push(`総データ行数: ${dataRows.length}`);
lines.push(`総カラム数: ${headers.length}`);
lines.push('');

lines.push('='.repeat(60));
lines.push('=== 選択肢候補カラムのユニーク値 ===');
lines.push('='.repeat(60));

for (const { name: target, desc } of TARGET_COLUMNS_BY_NAME) {
    const indices = [];
    headers.forEach((h, i) => { if (h === target) indices.push(i); });

    if (indices.length === 0) {
        lines.push('');
        lines.push(`[!] 【${target}】(${desc}) <- カラムが見つかりません`);
        continue;
    }

    for (const idx of indices) {
        const uniqueValues = new Set();
        for (const row of dataRows) {
            if (idx < row.length) {
                const val = row[idx].trim();
                if (val) uniqueValues.add(val);
            }
        }

        const sorted = [...uniqueValues].sort();
        const halfPoint = Math.floor(headers.length / 2);
        const position = idx < halfPoint ? '前半(設備セクション)' : '後半(機器セクション)';
        lines.push('');
        lines.push(`>>> 【${target}】(${desc}) - 列[${idx}], ${position}`);
        lines.push(`  ユニーク値数: ${sorted.length}`);
        sorted.forEach(v => lines.push(`    - ${v}`));
    }
}

lines.push('');
lines.push('='.repeat(60));
lines.push('=== setupDatabase.gs のプルダウン定義（参考） ===');
lines.push('='.repeat(60));
lines.push('');
lines.push("M_Equipment.Type:             ['機械', '電気', '計装', '管路']");
lines.push("M_Equipment.Status:           ['稼働中', '停止中', '故障中', '廃棄']");
lines.push("M_Equipment.Maintenance_Type: (プルダウン未定義)");

const output = lines.join('\n');
writeFileSync(OUTPUT_PATH, output, 'utf-8');
console.log(`結果をファイルに出力しました: ${OUTPUT_PATH}`);
