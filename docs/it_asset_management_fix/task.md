# タスク：IT資産管理の表示不具合修正（最終決定版）

## 1. 目的
ユーザーがデータの受信状態を即座に把握できるようにし、かつネットワーク図や機器リストが画面中央に浮いてしまうレイアウト不具合を「強制上詰め」で解決する。

## 2. 変更内容
- **デバッグ表示の追加**: `itDevices.length` を監視し、0件の場合の警告と受信件数の表示を追加。
- **レイアウト修正**: 
  - `it-assets-view-wrapper` クラスの新設と `!important` を用いた `justify-content: flex-start` の強制。
  - `network-map-container` の `flex` 配置調整。
  - `mermaid.js` が生成する `svg` に対する `height: auto !important` の適用。
- **IDの整理**: `mermaid-container` を `#networkMap` に統一。

## 3. ステータス
- [x] index.html へのCSS追加・修正
- [x] HTML構造のクラス名変更
- [x] Mermaid描画ロジックの参照ID修正
- [x] GitHubへのプッシュ
