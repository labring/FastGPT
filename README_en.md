<div align="center">

<a href="https://fastgpt.io/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

![Qoute](./.github/imgs/image.png)

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_ja.md">日语</a>
</p>

FastGPT is an AI Agent building platform that provides out-of-the-box capabilities for data processing and model invocation. It also enables workflow orchestration through Flow visualization, allowing you to achieve complex application scenarios!

[![GitHub Repo stars](https://img.shields.io/github/stars/labring/FastGPT?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/stargazers)
[![GitHub pull request](https://img.shields.io/badge/PRs-welcome-fffff?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/labring/FastGPT?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/pulls)
[![License](https://img.shields.io/badge/License-Apache--2.0-ffffff?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/blob/main/LICENSE)
[![Documentation](https://img.shields.io/badge/Documentation-7d09f1?style=flat-square)](https://doc.fastgpt.io/docs/introduction)
[![Local Development](https://img.shields.io/badge/Local_Development-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1)](https://doc.fastgpt.io/docs/introduction/development/intro)
[![Explore our platform](https://img.shields.io/badge/Explore_our_platform-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1)](https://fastgpt.io/)

[![discord](https://theme.zdassets.com/theme_assets/678183/cc59daa07820943e943c2fc283b9079d7003ff76.svg)](https://discord.gg/mp68xkZn2Q)&nbsp;&nbsp;&nbsp;&nbsp; 
[![Wechat](https://upload.wikimedia.org/wikipedia/en/thumb/a/af/WeChat_logo.svg/100px-WeChat_logo.svg.png?20231125073656)](https://oss.laf.run/otnvvf-imgs/feishu3.png)

</div>
  
## 🎥 Comprehensive Feature Demonstration

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

## 💡 Core Features

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` Application Orchestration
   - [x] Planning Agent mode
   - [x] Dialogue workflow and plugin workflow, including basic RPA nodes
   - [x] User interaction
   - [x] Bidirectional MCP
   - [ ] Assisted workflow generation

`2` Application Debugging
   - [x] Knowledge base single-point search testing
   - [x] Feedback references during dialogue with edit and delete capabilities
   - [x] Complete call chain logs
   - [x] Application evaluation
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
   - [x] Automated OpenAPI interface
  
`5` Operations Features
   - [x] Login-free sharing window
   - [x] One-click Iframe embedding
   - [x] Unified dialogue record review with data annotation
   - [x] Application operation logs
   
`6` Others
   - [x] Visual model configuration
   - [x] Voice input and output support (configurable)
   - [x] Fuzzy input hints
   - [x] Template marketplace

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 💪 Our Projects & Links

- [Local Development Quick Start](https://doc.fastgpt.io/docs/introduction/development/intro/)
- [OpenAPI Documentation](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: Model Aggregation Load Balancing Service](https://github.com/labring/aiproxy)
- [Laf: 3-minute Quick Access to Third-party Applications](https://github.com/labring/laf)
- [Sealos: Rapid Deployment of Cluster Applications](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 Third-party Ecosystem

- [AI Proxy: Large Model Aggregation Service](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - Open Source Model Online Experience Platform](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO: One-click Call to Cost-effective Open Source Model API and GPU Containers](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)
  
<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ Community

Join our Feishu community group:

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

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
        </picture>****
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
