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

FastGPT 是一个 AI Agent 构建平台，提供开箱即用的数据处理、模型调用等能力，同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的应用场景！

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/在线使用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/相关文档-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction/development/intro">
    <img height="21" src="https://img.shields.io/badge/本地开发-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="/#-%E7%9B%B8%E5%85%B3%E9%A1%B9%E7%9B%AE">
    <img height="21" src="https://img.shields.io/badge/相关项目-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## 快速开始

可以通过 Docker 快速启动 FastGPT，在终端输入以下命令，根据引导完成输入即可拉取配置。

```bash
# 输入命令拉取配置文件
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# 启动
docker compose up -d
```

完全启动后，可通过`http://localhost:3000`访问 FastGPT，默认账号为`root`，密码为`1234`。

如果你遇到问题，可以[查看完整 Docker 部署教程](https://doc.fastgpt.io/docs/introduction/development/docker)

## 🛸 使用方式

- **云服务版本**  
  如果你不需要私有化部署，可以直接使用我们提供的云服务版本，地址为：[fastgpt.io](https://fastgpt.io/)

- **社区自托管版本**  
  可以使用[Docker](https://doc.fastgpt.io/docs/introduction/development/docker)快速部署，也可以使用[Sealos Cloud](https://doc.fastgpt.io/docs/introduction/development/sealos) 来一键部署FastGPT。

- **商业版**  
  如果你需要更完整的功能，或深度的服务支持，可以选择我们的[商业版](https://doc.fastgpt.io/docs/introduction/commercial)。我们除了提供完整的软件外，还提供相应的场景落地辅导，具体可提交[商业咨询](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc)

## 💡 核心功能

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` 应用编排能力
   - [x] 规划 Agent 模式。
   - [x] 对话工作流、插件工作流，包含基础的 RPA 节点。
   - [x] 用户交互
   - [x] 双向 MCP 
   - [ ] 辅助生成工作流

`2` 应用调试能力
   - [x] 知识库单点搜索测试
   - [x] 对话时反馈引用并可修改与删除
   - [x] 完整调用链路日志
   - [x] 应用评测
   - [ ] 高级编排 DeBug 调试模式
   - [ ] 应用节点日志

`3` 知识库能力
   - [x] 多库复用，混用
   - [x] chunk 记录修改和删除
   - [x] 支持手动输入，直接分段，QA 拆分导入
   - [x] 支持 txt，md，html，pdf，docx，pptx，csv，xlsx (有需要更多可 PR file loader)，支持 url 读取、CSV 批量导入
   - [x] 混合检索 & 重排
   - [x] API 知识库
   - [ ] RAG 模块热插拔
  
`4` OpenAPI 接口
   - [x] completions 接口 (chat 模式对齐 GPT 接口)
   - [x] 知识库 CRUD
   - [x] 对话 CRUD
   - [x] 自动化 OpenAPI 接口
  
`5` 运营能力
   - [x] 免登录分享窗口
   - [x] Iframe 一键嵌入
   - [x] 统一查阅对话记录，并对数据进行标注
   - [x] 应用运营日志
   
`6` 其他
   - [x] 可视化模型配置。
   - [x] 支持语音输入和输出 (可配置语音输入语音回答)
   - [x] 模糊输入提示
   - [x] 模板市场

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 💪 我们的项目 & 链接

- [快速开始本地开发](https://doc.fastgpt.io/docs/introduction/development/intro/)
- [OpenAPI 文档](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: 模型聚合负载均衡服务](https://github.com/labring/aiproxy)
- [Laf：3 分钟快速接入三方应用](https://github.com/labring/laf)
- [Sealos：快速部署集群应用](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 第三方生态

- [AI Proxy：大模型聚合服务](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud (硅基流动) —— 开源模型在线体验平台](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO 派欧云：一键调用高性价比的开源模型 API 和 GPU 容器](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)
  
<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ 社区交流群

扫码加入飞书话题群：

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 贡献者

我们非常欢迎各种形式的贡献。如果你对贡献代码感兴趣，可以查看我们的 GitHub [Issues](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc)，大展身手，向我们展示你的奇思妙想。

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
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 使用协议

本仓库遵循 [FastGPT Open Source License](./LICENSE) 开源协议。

1. 允许作为后台服务直接商用，但不允许提供 SaaS 服务。
2. 未经商业授权，任何形式的商用服务均需保留相关版权信息。
3. 完整请查看 [FastGPT Open Source License](./LICENSE)
4. 联系方式：Dennis@sealos.io，[点击查看商业版定价策略](https://doc.fastgpt.io/docs/introduction/commercial/)
