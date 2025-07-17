---
title: "系统插件设计"
description: "FastGPT 系统插件设计方案"
icon: "extension"
draft: false
toc: true
weight: 962
---

## 背景

原先 FastGPT 的各项功能均在 FastGPT 的 Next.js 的框架内，通过 Monorepo 的方式进行组织。
系统插件也作为一个 sub-repo 存在于 FastGPT/packages/plugin 下。

然而随着用户的增加，这种组织模式的弊端凸显：

1. 虽然 FastGPT 以每周一次的频率进行发版，但同样，系统插件必须伴随 FastGPT 的发版而发版，极大限制了系统插件的迭代速率。
2. 如果社区希望为 FastGPT 提供插件，则需要将 FastGPT 整个应用运行起来，并且直接向主仓库发起 PR。
3. 如果社区希望使用自定义的插件，则需要维护一个 FastGPT 的 fork 版本，并且手动维护更新和代码的合并，增加了开发的难度。
4. 由于 Next.js/webpack 的限制，无法在运行时挂载新的插件，实现热插拔。

另外在服务商业版用户的过程中，有遇到需要定制化开发插件的需求。之前的模式也无法胜任（需要 fork 一个定制化的版本）进行开发。

## 设计方案

因而，我们决定将系统插件拆分出来，到一个独立的 repo 中。

[FastGPT-plugin](https://github.com/labring/fastgpt-plugin)

拆分出来，主要有如下的目的：
1. 解耦合，模块化：不只是 系统工具可以作为热加载的模块，也可以是其他的插件，例如知识库的插件，RAG 等等。
2. FastGPT-plugin 可以快速迭代，版本不依赖于 FastGPT：FastGPT-plugin 可以更高频率的发版，支持热插拔可以在不发版的情况下更新插件。
3. 降低开发复杂度（不需要运行 FastGPT 环境）：贡献插件时只需要独立运行 FastGPT-plugin 中提供的调试套件即可。
4. 插件市场：后续可以实现插件市场，用户可以通过插件市场发布、获取自己需要的插件。

## 技术选型

1. 使用 ts-rest 作为 RPC 框架进行交互，提供 sdk 供 FastGPT 主项目调用
2. 使用 zod 进行类型验证
3. 用 bun 进行编译，每个工具编译为单一的 `.js` 文件，支持热插拔。

## 项目结构

- **modules**
	- **tool** FastGPT 系统工具
		- **api** 接口实现逻辑
		- **packages** 系统工具目录（每一个都是一个 package）
			- getTime
			- dalle3
			- ...
		- **type** 类型定义
		- **utils** 工具
- **scripts** 脚本（编译、创建新工具）
- **sdk**: SDK 定义，供外部调用，发布到了 npm
- **src**: 运行时，express 服务
- **test**: 测试相关

系统工具的结构可以参考 [如何开发系统工具](/docs/guide/plugins/dev_system_tool)。

## 技术细节

### ts-rest 构建 contract，自动构建 openapi 对象，导出 client

[ts-rest](https://ts-rest.com/) 是一个 ts 的 restful api 框架。构建 contract 后，可以根据 contract 的定义
编写处理逻辑，自动生成 openapi 对象、通过 createClient 导出 client 进行请求。

类似的 `tRPC` 也是一个 ts 的 RPC 框架。
然而 tRPC 使用自己的一套请求格式，导致其他工具不方便接入。而使用 ts-rest 本质就是对 RESTful API 的简单封装，也能直接生成 openapi 对象。

### zod 类型校验

我们使用 zod 来实现类型校验。
zod 可以实现在运行时的类型校验，也可以提供更高级的功能，例如参数转换，对象合并等。

### 使用 worker 实现插件的并行运行以及环境隔离

为了保证插件之间不会相互干扰，同时提高并发处理能力，FastGPT-plugin 采用 Worker 线程来实现插件的执行。每个工具在被调用时都会在独立的 Worker 中运行，
这带来几个重要的优势：

1. 环境隔离：每个插件都是一个独立的 Worker 进程，插件之间不会影响。
2. 并行处理：每个插件可以并行处理，提高整体性能。

### 使用 bun 进行打包

将插件 bundle 为一个单一的 `.js` 文件是一个重要的设计。这样可以将插件发布出来直接通过网络挂载等的形式使用。

## 未来规划

1. 可视化开发工具：提供可视化的插件开发和调试工具，降低开发门槛。
2. 插件市场：建立插件市场，允许开发者发布和分享自己的插件。
3. 更多插件类型：除了系统工具外，扩展到知识库插件、模型插件、RAG 插件等更多类型。
4. 更优雅的 Secret 管理：后续将支持系统、团队、个人、临时四种类型的密钥配置。
5. 反向调用 FastGPT：后续将通过构建 FastGPT-sdk 来实现反向调用 FastGPT 的功能，例如调用 AI 对话、知识库搜索等模块。
6. AI 生成插件。由于插件纯代码的形式，便于 AI 生成内容，后续可以实现 AI 直接生成一个插件。
