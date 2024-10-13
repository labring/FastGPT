<div align="center">

<a href="https://tryfastgpt.ai/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

![Qoute](./.github/imgs/image.png)

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_ja.md">日语</a>
</p>

FastGPT is a knowledge-based platform built on the LLMs, offers a comprehensive suite of out-of-the-box capabilities such as data processing, RAG retrieval, and visual AI workflow orchestration, letting you easily develop and deploy complex question-answering systems without the need for extensive setup or configuration. 

[![GitHub Repo stars](https://img.shields.io/github/stars/labring/FastGPT?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/stargazers)
[![GitHub pull request](https://img.shields.io/badge/PRs-welcome-fffff?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/labring/FastGPT?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/pulls)
[![License](https://img.shields.io/badge/License-Apache--2.0-ffffff?style=flat-square&labelColor=d4eaf7&color=7d09f1)](https://github.com/labring/FastGPT/blob/main/LICENSE)
[![Documentation](https://img.shields.io/badge/Documentation-7d09f1?style=flat-square)](https://doc.tryfastgpt.ai/docs/intro)
[![Local Development](https://img.shields.io/badge/Local_Development-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1)](https://doc.tryfastgpt.ai/docs/intro)
[![Explore our platform](https://img.shields.io/badge/Explore_our_platform-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1)](https://tryfastgpt.ai/)

[![discord](https://theme.zdassets.com/theme_assets/678183/cc59daa07820943e943c2fc283b9079d7003ff76.svg)](https://discord.gg/mp68xkZn2Q)&nbsp;&nbsp;&nbsp;&nbsp; 
[![Wechat](https://upload.wikimedia.org/wikipedia/en/thumb/a/af/WeChat_logo.svg/100px-WeChat_logo.svg.png?20231125073656)](https://oss.laf.run/otnvvf-imgs/feishu3.png)
  
## 🎥 Comprehensive Feature Demonstration

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## 🛸 Online Use

International Version: [tryfastgpt.ai](https://tryfastgpt.ai/)

| | |
| ---------------------------------- | ---------------------------------- |
|       conversational AI setup      |        Workflow Automation         |                             
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.png) |
|       Knowledge Base Setup         |        Integration process         |                             
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 💡 Features

|                Features                       |                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
|                                               | ✅ Offers a straightforward mode, eliminating the need for complex orchestration      |
|                                               | ✅ Provides clear next-step instructions in dialogues                                 |
|                                               | ✅ Facilitates workflow orchestration                                                 |
|                                               | ✅ Tracks references in source files                                                  |
|       Application Orchestration Features      | ✅ Encapsulates modules for enhanced reuse at multiple levels                         |
|                                               | ✅ Combines search and reordering functions                                           |
|                                               | 🔜 Includes a tool module                                                             |    
|                                               | 🔜 Integrates [Laf](https://github.com/labring/laf) for online HTTP module creation   |
|                                               | 🔜 Plugin encapsulation capabilities                                                  |
------------------------------------------------|------------------------------------------------------------------------------------------|                       
|                                               | ✅ Allows for the mixed use of multiple databases                                     |
|                                               | ✅ Keeps track of modifications and deletions in data chunks                          |
|                                               | ✅ Enables specific vector models for each knowledge base                             |
|                                               | ✅ Stores original source files                                                       |
|        Knowledge Base Features                | ✅ Supports direct input and segment-based QA import                                  |
|                                               | ✅ Compatible with a variety of file formats: pdf, docx, txt, html, md, csv           |
|                                               | ✅ Facilitates URL reading and bulk CSV importing                                     |
|                                               | 🔜 Supports PPT and Excel file import                                                 |
|                                               | 🔜 Features a file reader                                                             |
|                                               | 🔜 Offers diverse data preprocessing options                                          |
| ----------------------------------------------|------------------------------------------------------------------------------------------|
|                                               | ✅ Enables targeted search testing within the knowledge base                          |
|                                               | ✅ Allows feedback, editing, and deletion during conversations                        |
|        Application Debugging Features         | ✅ Presents the full context of interactions                                          |
|                                               | ✅ Displays all intermediate values within modules                                    |
|                                               | 🔜 Advanced DeBug mode for orchestration                                              |
| ----------------------------------------------|------------------------------------------------------------------------------------------|
|                                               | ✅ The completions interface (aligned with GPT's chat mode interface)                 |
|                                               | ✅ CRUD operations for the knowledge base                                             |
|           OpenAPI Interface                   | ✅ CRUD operations for the knowledge base                                             |     
|                                               | 🔜 CRUD operations for conversation                                                   |
| ----------------------------------------------|------------------------------------------------------------------------------------------|
|                                               | ✅ Share without requiring login                                                      |
|                                               | ✅ Easy embedding with Iframe                                                         | 
|          Operational Features                 | ✅ Customizable chat window embedding with features like default open, drag-and-drop  |
|                                               | ✅ Centralizes conversation records for review and annotation                         |
| ----------------------------------------------|------------------------------------------------------------------------------------------|

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👨‍💻 Development

Project tech stack: NextJs + TS + ChakraUI + MongoDB + PostgreSQL (PG Vector plug-in)/Milvus

- **⚡ Fast Deployment**

  > When using [Sealos](https://sealos.io) services, there is no need to purchase servers or domain names. It supports high concurrency and dynamic scaling, and the database application uses the kubeblocks database, which far exceeds the simple Docker container deployment in terms of IO performance.

  [sealos one click deployment tutorial](https://doc.tryfastgpt.ai/docs/development/sealos/)

  [![](https://cdn.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

  Give it a 2-4 minute wait after deployment as it sets up the database. Initially, it might be a too slow since we're using the basic settings.

- [Getting Started with Local Development](https://doc.tryfastgpt.ai/docs/development)
- [Deploying FastGPT](https://doc.tryfastgpt.ai/docs/installation)
- [Guide on System Configs](https://doc.tryfastgpt.ai/docs/installation/reference)
- [Configuring Multiple Models](https://doc.tryfastgpt.ai/docs/installation/reference/models)
- [Version Updates & Upgrades](https://doc.tryfastgpt.ai/docs/installation/upgrading)

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 💪 Related Projects

- [Laf: 3-minute quick access to third-party applications](https://github.com/labring/laf)
- [Sealos: Rapid deployment of cluster applications](https://github.com/labring/sealos)
- [One API: Multi-model management, supports Azure, Wenxin Yiyuan, etc.](https://github.com/songquanpeng/one-api)
- [TuShan: Build a backend management system in 5 minutes](https://github.com/msgbyte/tushan)

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 Third-party Ecosystem

- [luolinAI: Enterprise WeChat bot, ready to use](https://github.com/luolin-ai/FastGPT-Enterprise-WeChatbot)

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>


## 🏘️ Community & Support

+ 🌐 Visit the [FastGPT website](https://tryfastgpt.ai/) for full documentation and useful links.
+ 💬 Join our [Discord server](https://discord.gg/mp68xkZn2Q) is to chat with FastGPT developers and other FastGPT users. This is a good place to learn about FastGPT, ask questions, and share your experiences.
+ 🐞 Create [GitHub Issues](https://github.com/labring/FastGPT/issues/new/choose) for bug reports and feature requests.

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👀 Others

- [FastGPT FAQ](https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh)
- [Docker Deployment Tutorial Video](https://www.bilibili.com/video/BV1jo4y147fT/)
- [Official Account Integration Video Tutorial](https://www.bilibili.com/video/BV1xh4y1t7fy/)
- [FastGPT Knowledge Base Demo](https://www.bilibili.com/video/BV1Wo4y1p7i1/)

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## Contributors

We welcome all forms of contributions. If you are interested in contributing code, you can check out our GitHub [Issues](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) to show us your ideas.

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

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 📄 Usage Agreement

This repository complies with the [FastGPT Open Source License](./LICENSE) open source agreement.

1. Direct commercial use as a backend service is allowed, but provision of SaaS services is not allowed.
2. Without commercial authorization, any form of commercial service must retain relevant copyright information.
3. For full details, please see [FastGPT Open Source License](./LICENSE)
4. Contact: Dennis@sealos.io , [click to view commercial version pricing strategy](https://doc.tryfastgpt.ai/docs/commercial)

<a href="#FastGPT">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>