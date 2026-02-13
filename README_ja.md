<div align="center">

<a href="https://fastgpt.io/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_id.md">Bahasa Indonesia</a> |
  <a href="./README_th.md">ไทย</a> |
  <a href="./README_vi.md">Tiếng Việt</a> |
  <a href="./README_ja.md">日本語</a>
</p>

FastGPT は AI Agent 構築プラットフォームであり、すぐに使えるデータ処理やモデル呼び出し機能を提供します。また、Flow の可視化によるワークフローオーケストレーションにより、複雑なアプリケーションシナリオを実現できます！

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/オンライン利用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/ドキュメント-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction/development/intro">
    <img height="21" src="https://img.shields.io/badge/ローカル開発-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="#-プロジェクトとリンク">
    <img height="21" src="https://img.shields.io/badge/関連プロジェクト-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## クイックスタート

Docker を使って FastGPT をすぐに起動できます。ターミナルで以下のコマンドを実行し、ガイドに従って設定を取得してください。

```bash
# コマンドを実行して設定ファイルを取得
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# サービスを起動
docker compose up -d
```

完全に起動した後、`http://localhost:3000` で FastGPT にアクセスできます。デフォルトのアカウントは `root`、パスワードは `1234` です。

問題が発生した場合は、[Docker デプロイの完全チュートリアル](https://doc.fastgpt.io/docs/introduction/development/docker)をご覧ください。

## 🛸 利用方法

- **クラウド版**  
  プライベートデプロイが不要な場合は、クラウドサービスを直接ご利用いただけます：[fastgpt.io](https://fastgpt.io/)

- **コミュニティセルフホスト版**  
  [Docker](https://doc.fastgpt.io/docs/introduction/development/docker) で素早くデプロイするか、[Sealos Cloud](https://doc.fastgpt.io/docs/introduction/development/sealos) でワンクリックデプロイが可能です。

- **商用版**  
  より完全な機能や深いサービスサポートが必要な場合は、[商用版](https://doc.fastgpt.io/docs/introduction/commercial)をお選びいただけます。完全なソフトウェアの提供に加え、シナリオに応じた導入ガイダンスも提供しています。[商用相談](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc)からお問い合わせください。

## 💡 コア機能

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` アプリケーションオーケストレーション
   - [x] プランニング Agent モード
   - [x] 対話ワークフロー、プラグインワークフロー、基本的な RPA ノードを含む
   - [x] ユーザーインタラクション
   - [x] 双方向 MCP
   - [ ] ワークフロー自動生成

`2` アプリケーションデバッグ
   - [x] ナレッジベース単点検索テスト
   - [x] 対話中の参照フィードバック（編集・削除可能）
   - [x] 完全なコールチェーンログ
   - [x] アプリケーション評価
   - [ ] 高度なオーケストレーション DeBug モード
   - [ ] アプリケーションノードログ

`3` ナレッジベース
   - [x] マルチデータベースの再利用と混合
   - [x] チャンクレコードの修正と削除
   - [x] 手動入力、直接分割、QA 分割インポートに対応
   - [x] txt, md, html, pdf, docx, pptx, csv, xlsx に対応（PR で追加可能）、URL 読み取りと CSV 一括インポートに対応
   - [x] ハイブリッド検索 & リランキング
   - [x] API ナレッジベース
   - [ ] RAG モジュールのホットスワップ

`4` OpenAPI インターフェース
   - [x] completions インターフェース（GPT チャットモードに準拠）
   - [x] ナレッジベース CRUD
   - [x] 対話 CRUD
   - [x] 自動化 OpenAPI インターフェース

`5` 運用機能
   - [x] ログイン不要の共有ウィンドウ
   - [x] Iframe ワンクリック埋め込み
   - [x] 統一された対話記録の閲覧とデータアノテーション
   - [x] アプリケーション運用ログ

`6` その他
   - [x] ビジュアルモデル設定
   - [x] 音声入出力対応（設定可能）
   - [x] あいまい入力ヒント
   - [x] テンプレートマーケット

<a href="#readme">
    <img src="https://img.shields.io/badge/-トップに戻る-7d09f1.svg" alt="#" align="right">
</a>

## 💪 プロジェクトとリンク

- [クイックスタート ローカル開発](https://doc.fastgpt.io/docs/introduction/development/intro/)
- [OpenAPI ドキュメント](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: モデル集約ロードバランシングサービス](https://github.com/labring/aiproxy)
- [Laf: 3分でサードパーティアプリケーションに接続](https://github.com/labring/laf)
- [Sealos: クラスタアプリケーションの迅速なデプロイ](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-トップに戻る-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 サードパーティエコシステム

- [AI Proxy: 大規模モデル集約サービス](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - オープンソースモデルオンライン体験プラットフォーム](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO: コスパの高いオープンソースモデル API と GPU コンテナをワンクリックで利用](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)

<a href="#readme">
    <img src="https://img.shields.io/badge/-トップに戻る-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ コミュニティ

Feishu グループに参加：

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="https://img.shields.io/badge/-トップに戻る-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 コントリビューター

さまざまな形での貢献を歓迎します。コードの貢献に興味がある方は、GitHub の [Issues](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) をご覧いただき、あなたの素晴らしいアイデアをお聞かせください！

<a href="https://github.com/labring/FastGPT/graphs/contributors" target="_blank">
  <table>
    <tr>
      <th colspan="2">
        <br><img src="https://contrib.rocks/image?repo=labring/FastGPT"><br><br>
      </th>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=dark">
          <img alt="Active participants of labring - past 28 days" src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=light">
        </picture>
      </td>
      <td rowspan="2">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=4x7&color_scheme=dark">
            <img alt="New trends of labring" src="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=4x7&color_scheme=light">
        </picture>
      </td>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=dark">
            <img alt="New participants of labring - past 28 days" src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=light">
        </picture>
      </td>
    </tr>
  </table>
</a>

## 🌟 Star History

<a href="https://github.com/labring/FastGPT/stargazers" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
  </picture>
</a>

<a href="#readme">
    <img src="https://img.shields.io/badge/-トップに戻る-7d09f1.svg" alt="#" align="right">
</a>

## ライセンス

本リポジトリは [FastGPT Open Source License](./LICENSE) に準拠しています。

1. バックエンドサービスとしての商用利用は許可されていますが、SaaS サービスの提供は許可されていません。
2. 商用ライセンスなしの商用サービスは、関連する著作権情報を保持する必要があります。
3. 詳細は [FastGPT Open Source License](./LICENSE) をご覧ください。
4. お問い合わせ：Dennis@sealos.io、[商用版の価格を見る](https://doc.fastgpt.io/docs/introduction/commercial/)
