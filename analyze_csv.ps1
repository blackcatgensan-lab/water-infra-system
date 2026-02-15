# 設備情報CSVからユニークな値を抽出する調査スクリプト (PowerShell版)
# Shift-JIS (CP932) エンコーディング対応

# 出力エンコーディングをUTF-8に設定
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$csvPath = "j:\マイドライブ\Antigravityテスト\水インフラ管理システム\raw_data\取り扱いデータ - 設備情報.csv"

# Shift-JIS (CP932) で読み込み
$encoding = [System.Text.Encoding]::GetEncoding(932)
$content = [System.IO.File]::ReadAllText($csvPath, $encoding)

# BOM除去
$content = $content.TrimStart([char]0xFEFF)

# CSV行に分割（改行で分割）
$lines = $content -split "`r?`n" | Where-Object { $_.Trim() -ne '' }

Write-Host "=== 設備情報CSV 調査レポート ==="
Write-Host "エンコーディング: Shift-JIS (CP932)"
Write-Host "総行数 (ヘッダー含む): $($lines.Count)"

# ヘッダー行をパース
$headerLine = $lines[0]
# 簡易CSVパーサー（カンマ区切り、ダブルクォート対応）
function Parse-CsvLine {
    param([string]$line)
    $fields = @()
    $i = 0
    $len = $line.Length
    while ($i -lt $len) {
        if ($line[$i] -eq '"') {
            $i++
            $field = ''
            while ($i -lt $len) {
                if ($line[$i] -eq '"') {
                    if ($i + 1 -lt $len -and $line[$i + 1] -eq '"') {
                        $field += '"'
                        $i += 2
                    } else {
                        $i++
                        break
                    }
                } else {
                    $field += $line[$i]
                    $i++
                }
            }
            $fields += $field
        } else {
            $field = ''
            while ($i -lt $len -and $line[$i] -ne ',') {
                $field += $line[$i]
                $i++
            }
            $fields += $field
        }
        if ($i -lt $len -and $line[$i] -eq ',') { $i++ }
    }
    return ,$fields
}

$headers = Parse-CsvLine $headerLine
Write-Host "総カラム数: $($headers.Count)"
Write-Host ""

# 全カラム一覧
Write-Host "--- 全カラム一覧 ---"
for ($i = 0; $i -lt $headers.Count; $i++) {
    Write-Host "  [$i] $($headers[$i])"
}
Write-Host ""

# 調査対象カラム
$targetColumns = @(
    '大分類', '中分類', '小分類',
    '診断形式', '設備形式',
    '保全区分', '状態', '単位',
    'デフレータ区分', '集約方法',
    '機器種別', '登録区分'
)

# データ行をパース
Write-Host "データ行をパース中..."
$dataRows = @()
for ($r = 1; $r -lt $lines.Count; $r++) {
    $dataRows += ,(Parse-CsvLine $lines[$r])
}
Write-Host "パース完了: $($dataRows.Count) 行"
Write-Host ""

Write-Host ("=" * 60)
Write-Host "=== 選択肢候補カラムのユニーク値 ==="
Write-Host ("=" * 60)

foreach ($target in $targetColumns) {
    # 該当カラムのインデックスを検索（同名カラムが複数ある場合あり）
    $indices = @()
    for ($i = 0; $i -lt $headers.Count; $i++) {
        if ($headers[$i] -eq $target) {
            $indices += $i
        }
    }

    if ($indices.Count -eq 0) {
        Write-Host ""
        Write-Host "[!] 【$target】 <- カラムが見つかりません"
        continue
    }

    foreach ($idx in $indices) {
        $uniqueValues = [System.Collections.Generic.HashSet[string]]::new()
        foreach ($row in $dataRows) {
            if ($idx -lt $row.Count) {
                $val = $row[$idx].Trim()
                if ($val -ne '') {
                    [void]$uniqueValues.Add($val)
                }
            }
        }

        $sorted = $uniqueValues | Sort-Object
        $halfPoint = [Math]::Floor($headers.Count / 2)
        $position = if ($idx -lt $halfPoint) { "前半(設備)" } else { "後半(機器)" }
        Write-Host ""
        Write-Host ">>> 【$target】 (列[$idx], $position)"
        Write-Host "  ユニーク値数: $($uniqueValues.Count)"
        foreach ($v in $sorted) {
            Write-Host "    - $v"
        }
    }
}

Write-Host ""
Write-Host ("=" * 60)
Write-Host "=== setupDatabase.gs のプルダウン定義（参考） ==="
Write-Host ("=" * 60)
Write-Host ""
Write-Host "M_Equipment.Type:             ['機械', '電気', '計装', '管路']"
Write-Host "M_Equipment.Status:           ['稼働中', '停止中', '故障中', '廃棄']"
Write-Host "M_Equipment.Maintenance_Type: (プルダウン未定義)"
