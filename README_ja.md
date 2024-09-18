<div align="center">

<a href="https://tryfastgpt.ai/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_ja.md">日语</a>
</p>

FastGPT は、LLM 上 に 構築 された 知識 ベースの Q&A システムで、すぐに 使 えるデータ 処理 とモデル 呼 び 出 し 機能 を 提供 し、Flow の 可視化 を 通 じてワークフローのオーケストレーションを 可能 にします！

</div>

<p align="center">
  <a href="https://tryfastgpt.ai/">
    <img height="21" src="https://img.shields.io/badge/在线使用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.tryfastgpt.ai/docs/intro">
    <img height="21" src="https://img.shields.io/badge/相关文档-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.tryfastgpt.ai/docs/development">
    <img height="21" src="https://img.shields.io/badge/本地开发-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="/#-%E7%9B%B8%E5%85%B3%E9%A1%B9%E7%9B%AE">
    <img height="21" src="https://img.shields.io/badge/相关项目-7d09f1?style=flat-square" alt="project">
  </a>
  <a href="https://github.com/labring/FastGPT/blob/main/LICENSE">
    <img height="21" src="https://img.shields.io/badge/License-Apache--2.0-ffffff?style=flat-square&labelColor=d4eaf7&color=7d09f1" alt="license">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## 🛸 クラウドサービスの 利用

[tryfastgpt.ai](https://tryfastgpt.ai/)

| | |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.png) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

## 💡 機能

1. パワフルなビジュアルワークフロー：AI アプリケーションを 簡単 に 作成

   - [x] デッキのシンプルモード - マニュアルアレンジ 不要
   - [x] ユーザ 対話事前 ガイダンス
   - [x] グローバル 変数
   - [x] ナレッジベース 検索
   - [x] 複数 の LLM モデルによる 対話
   - [x] テキストマジック - 構造化 データへの 変換
   - [x] HTTP による 拡張
   - [ ] on-the-fly HTTP モジュールのための 埋 め 込 みLaf
   - [x] 次 の 対話 ステップへの 指示
   - [x] ソースファイル 参照 の 追跡
   - [ ] カスタムファイルリーダー
   - [ ] モジュールをプラグインにパッケージして 再利用 する

2. 広範 なナレッジベースの 前処理

   - [x] 複数 のナレッジベースの 再利用 と 混合
   - [x] チャンクの 変更 と 削除 を 追跡
   - [x] 手動入力、直接分割、QA 分割 インポートをサポート
   - [x] URL フェッチとバッチ CSV インポートをサポート
   - [x] ナレッジベースにユニークなベクトルモデルを 設定可能
   - [x] オリジナルファイルの 保存
   - [ ] ファイル 学習 エージェント

3. 複数 の 効果測定 チャンネル

   - [x] シングルポイントナレッジベース 検索 テスト
   - [x] 対話中 のフィードバック 参照 と 修正 ・ 削除機能
   - [x] 完全 なコンテキストの 提示
   - [ ] 完全 なモジュール 中間値提示

4. OpenAPI

   - [x] 補完 インターフェイス (GPT インターフェイスに 合 わせる)
   - [ ] ナレッジベース CRUD

5. オペレーション 機能

   - [x] ログイン 不要 の 共有 ウィンドウ
   - [x] Iframe によるワンクリック 埋 め 込 み
   - [ ] 対話記録 への 統一 されたアクセス

## 👨‍💻 開発

プロジェクトの 技術 スタック：NextJs + TS + ChakraUI + Mongo + Postgres (Vector プラグイン)

- **⚡ デプロイ**

  [![](https://cdn.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

  デプロイ 後、データベースをセットアップするので、2～4分待 ってください。基本設定 を 使 っているので、最初 は 少 し 遅 いかもしれません。

- [ローカル 開発入門](https://doc.tryfastgpt.ai/docs/development)
- [FastGPT のデプロイ](https://doc.tryfastgpt.ai/docs/installation)
- [システム 設定 ガイド](https://doc.tryfastgpt.ai/docs/installation/reference)
- [複数 モデルの 設定](https://doc.tryfastgpt.ai/docs/installation/reference/models)
- [バージョン 更新 とアップグレード](https://doc.tryfastgpt.ai/docs/installation/upgrading)

<!-- ## :point_right: ロードマップ
- [FastGPT ロードマップ](https://kjqvjse66l.feishu.cn/docx/RVUxdqE2WolDYyxEKATcM0XXnte) -->

<!-- ## 🏘️ コミュニティ

| コミュニティグループ                                 | アシスタント                                     |
| ------------------------------------------------- | ---------------------------------------------- |
| ![](https://otnvvf-imgs.oss.laf.run/wxqun300.jpg) | ![](https://otnvvf-imgs.oss.laf.run/wx300.jpg) | -->

## 👀 その 他

- [FastGPT FAQ](https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh)
- [Docker 導入 チュートリアル 動画](https://www.bilibili.com/video/BV1jo4y147fT/)
- [公式 アカウント 統合 ビデオチュートリアル](https://www.bilibili.com/video/BV1xh4y1t7fy/)
- [FastGPT ナレッジベースデモ](https://www.bilibili.com/video/BV1Wo4y1p7i1/)

## 💪 関連 プロジェクト

- [Laf：サードパーティ 製 アプリケーションに 3 分 でクイックアクセス](https://github.com/labring/laf)
- [Sealos：クラスタアプリケーションの 迅速 な 展開](https://github.com/labring/sealos)
- [One API：マルチモデル 管理、Azure、Wenxin Yiyuan などをサポートします。](https://github.com/songquanpeng/one-api)
- [TuShan：5 分 でバックエンド 管理 システムを 構築](https://github.com/msgbyte/tushan)

## 🤝 サードパーティエコシステム

- [luolinAI：すぐに 使 える 企業向 け WeChat ボット](https://github.com/luolin-ai/FastGPT-Enterprise-WeChatbot)

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=labring/FastGPT&type=Date)](https://star-history.com/#labring/FastGPT&Date)
