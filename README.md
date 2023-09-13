<div align="center">

<a href="https://fastgpt.run/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

</div>

<p align="center">
  <a href="https://fastgpt.run/">线上体验</a>
  ·
  <a href="https://doc.fastgpt.run/docs/intro">相关文档</a>
  ·
  <a href="https://doc.fastgpt.run/docs/development">本地开发</a>
  ·
  <a href="https://github.com/labring/FastGPT#-%E7%9B%B8%E5%85%B3%E9%A1%B9%E7%9B%AE">相关项目</a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## 🛸 在线体验

[fastgpt.run](https://fastgpt.run/)（服务器在新加坡，部分地区可能无法直连）

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.png) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

## 💡 功能

1. 强大的可视化编排，轻松构建 AI 应用
   - [x] 提供简易模式，无需操作编排
   - [x] 用户对话前引导, 全局字符串变量
   - [x] 知识库搜索
   - [x] 多 LLM 模型对话
   - [x] 文本内容提取成结构化数据
   - [x] HTTP 扩展
   - [ ] 嵌入 Laf，实现在线编写 HTTP 模块
   - [ ] 连续对话引导
   - [ ] 对话多路线选择
   - [x] 源文件引用追踪
   - [ ] 自定义文件阅读器
2. 丰富的知识库预处理
   - [x] 多库复用，混用
   - [x] chunk 记录修改和删除
   - [x] 支持 手动输入, 直接分段, QA 拆分导入
   - [x] 支持 url 读取、 CSV 批量导入
   - [x] 支持知识库单独设置向量模型
   - [x] 源文件存储
   - [ ] 文件学习 Agent
3. 多种效果测试渠道
   - [x] 知识库单点搜索测试
   - [x] 对话时反馈引用并可修改与删除
   - [x] 完整上下文呈现
   - [ ] 完整模块中间值呈现
4. OpenAPI
   - [x] completions 接口（对齐 GPT 接口）
   - [ ] 知识库 CRUD
5. 运营功能
   - [x] 免登录分享窗口
   - [x] Iframe 一键嵌入
   - [x] 统一查阅对话记录，并对数据进行标注

## 👨‍💻 开发

项目技术栈: NextJs + TS + ChakraUI + Mongo + Postgres（Vector 插件）

- **⚡ 快速部署**

  > Sealos 的服务器在国外，不需要额外处理网络问题，无需服务器、无需魔法、无需域名，支持高并发 & 动态伸缩。点击以下按钮即可一键部署 👇

  [![](https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

  由于需要部署数据库，部署完后需要等待 2~4 分钟才能正常访问。默认用了最低配置，首次访问时会有些慢。

* [快开始本地开发](https://doc.fastgpt.run/docs/development/intro/)
* [部署 FastGPT](https://doc.fastgpt.run/docs/installation)
* [系统配置文件说明](https://doc.fastgpt.run/docs/development/configuration/)
* [多模型配置](https://doc.fastgpt.run/docs/installation/one-api/)
* [版本升级](https://doc.fastgpt.run/docs/installation/upgrading)
* [API 文档](https://kjqvjse66l.feishu.cn/docx/DmLedTWtUoNGX8xui9ocdUEjnNh?pre_pathname=%2Fdrive%2Fhome%2F)

## 🏘️ 社区交流群

添加 wx 小助手加入：

![](https://otnvvf-imgs.oss.laf.run/wx300.jpg)

## 👀 其他

- [FastGPT 常见问题](https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh)
- [docker 部署教程视频](https://www.bilibili.com/video/BV1jo4y147fT/)
- [FastGPT 知识库演示](https://www.bilibili.com/video/BV1Wo4y1p7i1/)

## 💪 相关项目

- [Laf: 3 分钟快速接入三方应用](https://github.com/labring/laf)
- [Sealos: 快速部署集群应用](https://github.com/labring/sealos)
- [One API: 多模型管理，支持 Azure、文心一言等](https://github.com/songquanpeng/one-api)
- [TuShan: 5 分钟搭建后台管理系统](https://github.com/msgbyte/tushan)

## 🤝 第三方生态

- [OnWeChat 个人微信/企微机器人](https://doc.fastgpt.run/docs/use-cases/onwechat/)
- [luolinAI: 企微机器人，开箱即用](https://github.com/luolin-ai/FastGPT-Enterprise-WeChatbot)

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=labring/FastGPT&type=Date)](https://star-history.com/#labring/FastGPT&Date)

## 使用协议

本仓库遵循 [FastGPT Open Source License](./LICENSE) 开源协议。

1. 允许作为后台服务直接商用，但不允许直接使用 saas 服务商用。
2. 需保留相关版权信息。
3. 完整请查看 [FastGPT Open Source License](./LICENSE)
4. 联系方式：yujinlong@sealos.io, [点击查看定价策略](https://fael3z0zfze.feishu.cn/docx/F155dbirfo8vDDx2WgWc6extnwf)
