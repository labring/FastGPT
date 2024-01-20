<div align="center">

<a href="https://fastgpt.in/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_ja.md">日语</a>
</p>

FastGPT is a knowledge-based Q&A system built on the LLM, offers out-of-the-box data processing and model invocation capabilities, allows for workflow orchestration through Flow visualization!

</div>

<p align="center">
  <a href="https://fastgpt.in/">
    <img height="21" src="https://img.shields.io/badge/在线使用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.in/docs/intro">
    <img height="21" src="https://img.shields.io/badge/相关文档-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.in/docs/development">
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

## 🛸 Use Cloud Services

Cloud: [fastgpt.in](https://fastgpt.in/)

| | |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.png) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 💡 Features

`1` Apply orchestration capabilities
    - [x] Provides a simple mode without the need for orchestration
    - [x] Indicates the next step of the dialog
    - [x] Workflow orchestration
    - [x] Trace source file references
    - [x] module encapsulation, multi-level multiplexing
    - [x] Hybrid search & rearrangement
    - [] Tool module
    Embedded [fans] - [] (https://github.com/labring/laf), realize the online writing HTTP module
    - [] The plug-in encapsulates functions

`2` Knowledge base capability
    - [x] Multi-library multiplexing, mixed use
    - [x] chunk records are modified or deleted
    - [x] Supports the vector model of the knowledge base
    - [x] Source file storage
    - [x] Supports manual input, direct segmentation, and QA split import
    - [x] Supports pdf, docx, txt, html, md, csv
    - [x] Supports url reading and CSV batch import
    - [] Supports PPT and Excel import
    - [] Supports file readers
    - [] More data preprocessing schemes

`3` Application debugging capability
    - [x] Knowledge base single point search test
    - [x] Feedback references during the session and modify or delete them
    - [x] Full context rendering
    - [x] The complete module intermediate value is displayed
    - [] Advanced debugging mode

`4` OpenAPI interface
    - [x] completions interface (chat mode aligned with GPT interface)
    - [x] Knowledge base CRUD
    - [] Dialog CRUD

`5` Operation capability
    - [x] Do not log in to the share window
    - [x] Iframe One-click embedding
    - [x] Chat window embed support custom Icon, default open, drag and drop functions
    - [x] View session records in a unified manner and annotate data

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👨‍💻 Development

Project tech stack: NextJs + TS + ChakraUI + Mongo + Postgres (Vector plugin)

- **⚡ Deployment**

  [![](https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

  Give it a 2-4 minute wait after deployment as it sets up the database. Initially, it might be a tad slow since we're using the basic settings.

- [Getting Started with Local Development](https://doc.fastgpt.in/docs/development)
- [Deploying FastGPT](https://doc.fastgpt.in/docs/installation)
- [Guide on System Configs](https://doc.fastgpt.in/docs/installation/reference)
- [Configuring Multiple Models](https://doc.fastgpt.in/docs/installation/reference/models)
- [Version Updates & Upgrades](https://doc.fastgpt.in/docs/installation/upgrading)

<!-- ## :point_right: RoadMap
- [FastGPT RoadMap](https://kjqvjse66l.feishu.cn/docx/RVUxdqE2WolDYyxEKATcM0XXnte) -->

<!-- ## 🏘️ Community

| Community Group                                   | Assistant                                      |
| ------------------------------------------------- | ---------------------------------------------- |
| ![](https://otnvvf-imgs.oss.laf.run/wxqun300.jpg) | ![](https://otnvvf-imgs.oss.laf.run/wx300.jpg) | -->

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 👀 Others

- [FastGPT FAQ](https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh)
- [Docker Deployment Tutorial Video](https://www.bilibili.com/video/BV1jo4y147fT/)
- [Official Account Integration Video Tutorial](https://www.bilibili.com/video/BV1xh4y1t7fy/)
- [FastGPT Knowledge Base Demo](https://www.bilibili.com/video/BV1Wo4y1p7i1/)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 💪 Related Projects

- [Laf: 3-minute quick access to third-party applications](https://github.com/labring/laf)
- [Sealos: Rapid deployment of cluster applications](https://github.com/labring/sealos)
- [One API: Multi-model management, supports Azure, Wenxin Yiyuan, etc.](https://github.com/songquanpeng/one-api)
- [TuShan: Build a backend management system in 5 minutes](https://github.com/msgbyte/tushan)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 Third-party Ecosystem

- [luolinAI: Enterprise WeChat bot, ready to use](https://github.com/luolin-ai/FastGPT-Enterprise-WeChatbot)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Back_to_Top-7d09f1.svg" alt="#" align="right">
</a>

## 🌟 Star History

<a href="https://github.com/labring/FastGPT/stargazers" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
  </picture>
</a>
