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

FastGPT is an AI Agent building platform that provides out-of-the-box capabilities for data processing and model invocation. It also enables workflow orchestration through Flow visualization, allowing you to achieve complex application scenarios!

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/Online_Usage-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/Documentation-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction/development/intro">
    <img height="21" src="https://img.shields.io/badge/Local_Development-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="/#-%E7%9B%B8%E5%85%B3%E9%A1%B9%E7%9B%AE">
    <img height="21" src="https://img.shields.io/badge/Related_Projects-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## Quick Start

You can quickly start FastGPT using Docker. Run the following command in your terminal and follow the prompts to pull the configuration:

```bash
# Run the command to pull the configuration file
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# Start the services
docker compose up -d
```

Once fully started, you can access FastGPT at `http://localhost:3000`. The default account is `root` and the password is `1234`.

If you encounter any issues, you can [view the complete Docker deployment tutorial](https://doc.fastgpt.io/docs/introduction/development/docker)

## 🛸 Usage

- **Cloud Version**  
  If you don't need private deployment, you can directly use our cloud service at: [fastgpt.io](https://fastgpt.io/)

- **Community Self-Hosted Version**  
  You can quickly deploy using [Docker](https://doc.fastgpt.io/docs/introduction/development/docker) or use [Sealos Cloud](https://doc.fastgpt.io/docs/introduction/development/sealos) for one-click deployment of FastGPT.

- **Commercial Version**  
  If you need more complete features or in-depth service support, you can choose our [Commercial Version](https://doc.fastgpt.io/docs/introduction/commercial). In addition to providing complete software, we also offer implementation guidance for specific scenarios. You can submit a [commercial consultation](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc).

## 💡 Roadmap

`1` Application Orchestration
   - [x] Dialogue workflow, plugin workflow, including basic RPA nodes.
   - [x] User interaction
   - [x] Bidirectional MCP
   - [ ] Agent mode
   - [ ] AI generated workflow

`2` Application Debugging
   - [x] Knowledge base single-point search testing
   - [x] Feedback references during dialogue with edit and delete capabilities
   - [x] Complete call chain logs
   - [ ] Application evaluation
   - [ ] Advanced orchestration DeBug debugging mode
   - [ ] Application node logs

`3` Knowledge Base Features
   - [x] Multi-database reuse and mixing
   - [x] Chunk record modification and deletion
   - [x] Support manual input, direct segmentation, QA split import
   - [x] Support txt, md, html, pdf, docx, pptx, csv, xlsx (more can be PR'd), support URL reading and CSV batch import
   - [x] Hybrid retrieval & reranking
   - [x] API knowledge base
   - [ ] RAG module hot-swapping

`4` OpenAPI Interface
   - [x] Completions interface (aligned with GPT chat mode)
   - [x] Knowledge base CRUD
   - [x] Dialogue CRUD
   - [ ] Automated OpenAPI interface

`5` Operations Features
   - [x] Login-free sharing window
   - [x] One-click Iframe embedding
   - [x] Unified dialogue record review with data annotation
   - [x] Application operation logs

`6` Others
   - [x] Visual model configuration.
   - [x] Voice input and output support (configurable)
   - [x] Fuzzy input hints
   - [x] Template marketplace

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👨💻 Development

Project tech stack: NextJs + TS + ChakraUI + MongoDB + PostgreSQL (PG Vector plugin)/Milvus

- **⚡ Fast Deployment**

  > Using [Sealos](https://sealos.io) services, no need to purchase servers or domains, supports high concurrency & dynamic scaling, and uses kubeblocks database which far exceeds simple Docker container deployment in IO performance.

  [Click to view Sealos one-click deployment tutorial](https://doc.fastgpt.io/docs/introduction/development/sealos/)

* [Quick Start - Local Development](https://doc.fastgpt.io/docs/introduction/development/intro/)
* [Deploy FastGPT](https://doc.fastgpt.io/docs/introduction/development/sealos/)
* [System Configuration Guide](https://doc.fastgpt.io/docs/introduction/development/configuration/)
* [Multi-Model Configuration](https://doc.fastgpt.io/docs/introduction/development/modelConfig/one-api/)
* [Version Update/Upgrade Guide](https://doc.fastgpt.io/docs/upgrading)
* [OpenAPI Documentation](https://doc.fastgpt.io/docs/introduction/development/openapi/)
* [Knowledge Base Structure](https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/RAG/)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ Join Us

We are looking for like-minded partners to accelerate the development of FastGPT. You can view FastGPT job postings through [FastGPT 2025 Recruitment](https://fael3z0zfze.feishu.cn/wiki/P7FOwEmPziVcaYkvVaacnVX1nvg).

## 💪 Related Projects

- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [Laf: 3-minute Quick Access to Third-party Applications](https://github.com/labring/laf)
- [Sealos: Rapid Deployment of Cluster Applications](https://github.com/labring/sealos)
- [One API: Multi-model Management, supports Azure, Wenxin YiYuan, etc.](https://github.com/songquanpeng/one-api)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 Third-party Ecosystem

- [PPIO: One-click Call to Cost-effective Open Source Model API and GPU Containers](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)
- [AI Proxy: Domestic Model Aggregation Service](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - Open Source Model Online Experience Platform](https://cloud.siliconflow.cn/i/TR9Ym0c4)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ Community

Join our Feishu community group:

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👀 Others

- [Comprehensive FastGPT Tutorial](https://www.bilibili.com/video/BV1n34y1A7Bo/?spm_id_from=333.999.0.0)
- [Feishu Integration](https://www.bilibili.com/video/BV1Su4y1r7R3/?spm_id_from=333.999.0.0)
- [WeCom Integration](https://www.bilibili.com/video/BV1Tp4y1n72T/?spm_id_from=333.999.0.0)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 Contributors

We warmly welcome contributions in various forms. If you're interested in contributing code, check out our GitHub [Issues](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) and show us your brilliant ideas!

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
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## License

This repository follows the [FastGPT Open Source License](./LICENSE).

1. Commercial use as backend services is allowed, but SaaS services are not permitted.
2. Any commercial services without commercial authorization must retain the relevant copyright information.
3. Please see [FastGPT Open Source License](./LICENSE) for the complete terms.
4. Contact: Dennis@sealos.io, [View Commercial Pricing](https://doc.fastgpt.io/docs/introduction/commercial/)
