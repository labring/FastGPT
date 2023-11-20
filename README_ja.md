<div align="center">

<a href="https://fastgpt.run/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_ja.md">日本語</a>
</p>

FastGPT は、LLM 上に構築された知識ベースの Q&A システムで、すぐに使えるデータ処理とモデル呼び出し機能を提供し、Flow の可視化を通じてワークフローのオーケストレーションを可能にします！

</div>

<p align="center">
  <a href="https://fastgpt.run/">
    <img height="21" src="https://img.shields.io/badge/在线使用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.run/docs/intro">
    <img height="21" src="https://img.shields.io/badge/相关文档-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.run/docs/development">
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

## 🛸 クラウドサービスの利用

[fastgpt.run](https://fastgpt.run/)
| | |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.png) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

## 💡 機能

1. パワフルなビジュアルワークフロー: AI アプリケーションを簡単に作成

   - [x] デッキのシンプルモード - マニュアルアレンジ不要
   - [x] ユーザ対話事前ガイダンス
   - [x] グローバル変数
   - [x] ナレッジベース検索
   - [x] 複数の LLM モデルによる対話
   - [x] テキストマジック - 構造化データへの変換
   - [x] HTTP による拡張
   - [ ] on-the-fly HTTP モジュールのための埋め込みLaf
   - [x] 次の対話ステップへの指示
   - [x] ソースファイル参照の追跡
   - [ ] カスタムファイルリーダー
   - [ ] モジュールをプラグインにパッケージして再利用する

2. 広範なナレッジベースの前処理

   - [x] 複数のナレッジベースの再利用と混合
   - [x] チャンクの変更と削除を追跡
   - [x] 手動入力、直接分割、QA 分割インポートをサポート
   - [x] URL フェッチとバッチ CSV インポートをサポート
   - [x] ナレッジベースにユニークなベクトルモデルを設定可能
   - [x] オリジナルファイルの保存
   - [ ] ファイル学習エージェント

3. 複数の効果測定チャンネル

   - [x] シングルポイントナレッジベース検索テスト
   - [x] 対話中のフィードバック参照と修正・削除機能
   - [x] 完全なコンテキストの提示
   - [ ] 完全なモジュール中間値提示

4. OpenAPI

   - [x] 補完インターフェイス（GPT インターフェイスに合わせる）
   - [ ] ナレッジベース CRUD

5. オペレーション機能

   - [x] ログイン不要の共有ウィンドウ
   - [x] Iframe によるワンクリック埋め込み
   - [ ] 対話記録への統一されたアクセス

## 👨‍💻 開発

プロジェクトの技術スタック: NextJs + TS + ChakraUI + Mongo + Postgres (Vector プラグイン)

- **⚡ デプロイ**

  [![](https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

  デプロイ後、データベースをセットアップするので、2～4分待ってください。基本設定を使っているので、最初は少し遅いかもしれません。

- [ローカル開発入門](https://doc.fastgpt.run/docs/development)
- [FastGPT のデプロイ](https://doc.fastgpt.run/docs/installation)
- [システム設定ガイド](https://doc.fastgpt.run/docs/installation/reference)
- [複数モデルの設定](https://doc.fastgpt.run/docs/installation/reference/models)
- [バージョン更新とアップグレード](https://doc.fastgpt.run/docs/installation/upgrading)

<!-- ## :point_right: ロードマップ
- [FastGPT ロードマップ](https://kjqvjse66l.feishu.cn/docx/RVUxdqE2WolDYyxEKATcM0XXnte) -->

<!-- ## 🏘️ コミュニティ

| コミュニティグループ                                 | アシスタント                                     |
| ------------------------------------------------- | ---------------------------------------------- |
| ![](https://otnvvf-imgs.oss.laf.run/wxqun300.jpg) | ![](https://otnvvf-imgs.oss.laf.run/wx300.jpg) | -->

## 👀 その他

- [FastGPT FAQ](https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh)
- [Docker 導入チュートリアル動画](https://www.bilibili.com/video/BV1jo4y147fT/)
- [公式アカウント統合ビデオチュートリアル](https://www.bilibili.com/video/BV1xh4y1t7fy/)
- [FastGPT ナレッジベースデモ](https://www.bilibili.com/video/BV1Wo4y1p7i1/)

## 💪 関連プロジェクト

- [Laf: サードパーティ製アプリケーションに 3 分でクイックアクセス](https://github.com/labring/laf)
- [Sealos: クラスタアプリケーションの迅速な展開](https://github.com/labring/sealos)
- [One API: マルチモデル管理、Azure、Wenxin Yiyuan などをサポートします。](https://github.com/songquanpeng/one-api)
- [TuShan: 5 分でバックエンド管理システムを構築](https://github.com/msgbyte/tushan)

## 🤝 サードパーティエコシステム

- [luolinAI: すぐに使える企業向け WeChat ボット](https://github.com/luolin-ai/FastGPT-Enterprise-WeChatbot)

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=labring/FastGPT&type=Date)](https://star-history.com/#labring/FastGPT&Date)
