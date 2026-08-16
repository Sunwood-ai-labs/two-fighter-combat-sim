# TWO-FRAME // Three.js Aerial Combat Simulation

前回作成した2機、`NIGHT//VECTOR`（サイバーパンク戦闘機）と `AETHEL-01`（白銀のソーラー・インターセプター）を、同じThree.jsシーンで飛行・交戦させる空戦シミュレーションです。

## 実装内容

- 元プロジェクトのプロシージャル機体コードを再利用
- `@dimforge/rapier3d-compat` の動的剛体を2機に割り当て、120 Hz固定ステップで重力・推力・揚力・抗力・姿勢トルクを積分
- ルートは位置を直接書き換える軌道ではなく、ピッチ制限と高度保持を含む飛行制御の誘導目標として使用
- センサー状態（SEARCH → TRACK → PID/IDENTIFY）と、交戦状態（COMMIT → BVR SHOT → DEFENSIVE BREAK → MERGE → WVR DOGFIGHT → EXTEND/SEPARATE）を分離した1v1戦術ステートマシン
- センサー推定トラックを使ったリード誘導、PID成立後の射撃権、被射撃側のbreak/jink、ミサイル撃破後の視認マージ、エネルギー回復のための離脱を実装
- RapierのCCD付き動的剛体弾で、実際の機体位置・速度からリード射撃を生成し、シーカー視野・飛翔時間・回避機動を経た命中／回避（JINK MISS）を判定
- 命中時のロックパルス、ダメージ表示、ヘルスバー更新
- 10 m / world unit のスケール表示（距離・相対速度・平均速度）
- 明るい成層圏風の背景、遠景の速度ストリーク、戦闘HUD

## 検証済みのシナリオ

36秒の固定再生で、`SEARCH → TRACK → COMMIT → DEFENSIVE BREAK → MERGE → WVR DOGFIGHT → SEPARATE` の遷移、BVRミサイル1発の発射・回避、Rapierの120 Hz積分、機体の画面内追従を確認しています。キャプチャは `scripts/capture-landscape.mjs` から再生成できます。

この飛行モデルは、公開されている空戦ドクトリンの流れをThree.js上で再生するための近似モデルです。速度・加速度・G制限・センサー遅延・ミサイルのシーカー視野は設定値であり、CFD、実機の飛行認証、実戦用の戦術ソフトウェアを再現するものではありません。

## 起動

```powershell
npm install
npm run dev
```

`Space` / `P` で一時停止、`R` または RESET で初期化します。

## キャプチャ

開発サーバーを起動した状態で、別のターミナルから実行します。

```powershell
node scripts/capture-landscape.mjs
```

キャプチャ動画や QA 画像は再現用のローカル生成物として扱い、ソースリポジトリには含めません。
