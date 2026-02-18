# 修正内容の確認 (Walkthrough)

## 1. サーバーサイド (Code.gs)
- `getInitialData` を呼び出し。
- **検証**: `M_Equipment` や `T_Inspection_Results` を取得していないこと。返されるデータは施設単位（Location/Facility）に依存しないマスタのみであること。
- `getFacilityData` を実装。
- **検証**:
  - `facilityId` が必須であること。
  - `getEquipment(facilityId)` が呼ばれ、ハイブリッドロジック（`loc.Building || eq.Building`）が適用されていること。
  - 返り値に `inspectionGroups`, `inspectionItems`, `inspectionRoutes`, `routeDetails` 等が含まれていること。

## 2. クライアントサイド (index.html)
- `createApp` を修正。
- **検証**:
  - `onMounted` で `loading: true` となり、初期化完了後 `loading: false` に戻ること。
  - 施設データ（`equipment` 等）が空の状態で UI がエラーにならないこと。
  - 施設プルダウンが正しく動作し、変更時に `loadFacilityData` が呼ばれること。
  - ローディングスピナーが表示されること。
  - `treeData` や `statusCounts` が正しく更新されること。

## 3. 動作確認
- 施設選択前に「設備管理」「点検ルート」画面を開き、エンプティステートを確認。
- 施設を選択し、設備ツリーや点検ルート一覧が表示されることを確認。
- 再度別の施設を選択し、データが切り替わることを確認。
