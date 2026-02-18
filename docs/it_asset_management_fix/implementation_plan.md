# 実装計画：IT資産管理の表示不具合およびレイアウト修正

## 1. 概要
IT資産管理画面において、データが届いていない場合の状態を可視化すること、および全画面表示時にコンテンツが上下中央に寄ってしまう問題を解消する。

## 2. 修正方針
### A. データ視認性の向上
- `index.html` の IT資産管理ビュー内に、`itDevices` の配列長をチェックする `v-if` / `v-else` ブロックを追加。
- データが0件の場合は赤字で警告を表示し、Code.gs 側の問題を切り分けやすくする。

### B. レイアウトの強制上詰め
- 既存の `view-container` ではなく、IT資産管理専用の `it-assets-view-wrapper` を定義。
- `justify-content: flex-start !important` を適用し、他の上位スタイルの干渉を排除。
- `#networkMap svg` に対して `height: auto` を適用し、Mermaid が生成する不要な垂直余白を削除。

## 3. 影響範囲
- `index.html` 内の `<style>` ブロック
- `currentView === 'it_assets'` の親要素構成
- `renderNetworkMap` JavaScript 関数
