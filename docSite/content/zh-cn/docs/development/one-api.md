---
title: '使用 One API 接入 Azure、ChatGLM 和本地模型'
description: '部署和使用 One API，实现 Azure、ChatGLM 和本地模型的接入。'
icon: 'api'
draft: false
toc: true
weight: 708
---

* 默认情况下，FastGPT 只配置了 GPT 的模型，如果你需要接入其他模型，需要进行一些额外配置。
* [One API](https://github.com/songquanpeng/one-api) 是一个 OpenAI 接口管理 & 分发系统，可以通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。
* FastGPT 可以通过接入 One API 来实现对不同大模型的支持。One API 的部署方法也很简单。

## FastGPT 与 One API 关系

可以把 One API 当做一个网关。

![](/imgs/sealos-fastgpt.webp)

## 部署

### Docker 版本

已加入最新的 `docker-compose.yml` 文件中。

### Sealos - MySQL 版本

MySQL 版本支持多实例，高并发。

直接点击以下按钮即可一键部署 👇

<a href="https://template.cloud.sealos.io/deploy?templateName=one-api" rel="external" target="_blank"><img src="https://cdn.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg" alt="Deploy on Sealos"/></a>

部署完后会跳转「应用管理」，数据库在另一个应用「数据库」中。需要等待 1~3 分钟数据库运行后才能访问成功。

### Sealos - SqlLite 版本

SqlLite 版本不支持多实例，适合个人小流量使用，但是价格非常便宜。

**1. [点击打开 Sealos 公有云](https://cloud.sealos.io/)**

**2. 打开 AppLaunchpad(应用管理) 工具**

![step1](/imgs/oneapi-step1.webp)

**3. 点击创建新应用**

**4. 填写对应参数**

镜像：ghcr.io/songquanpeng/one-api:latest

![step2](/imgs/oneapi-step2.png)
打开外网访问开关后，Sealos 会自动分配一个可访问的地址，不需要自己配置。

![step3](/imgs/oneapi-step3.png)
填写完参数后，点击右上角部署即可。环境变量：

```
SESSION_SECRET=SESSION_SECRET
POLLING_INTERVAL=60
BATCH_UPDATE_ENABLED=true
BATCH_UPDATE_INTERVAL=60
```

## One API 使用教程

### 概念

1. 渠道：
   1. OneApi 中一个渠道对应一个 `Api Key`，这个 `Api Key` 可以是GPT、微软、ChatGLM、文心一言的。一个`Api Key`通常可以调用同一个厂商的多个模型。
   2. One API 会根据请求传入的`模型`来决定使用哪一个`Key`，如果一个模型对应了多个`Key`，则会随机调用。
2. 令牌：访问 One API 所需的凭证，只需要这`1`个凭证即可访问`One API`上配置的模型。因此`FastGPT`中，只需要配置`One API`的`baseurl`和`令牌`即可。

### 大致工作流程

1. 客户端请求 One API
2. 根据请求中的 `model` 参数，匹配对应的渠道（根据渠道里的模型进行匹配，必须完全一致）。如果匹配到多个渠道，则随机选择一个（同优先级）。
3. One API 向真正的地址发出请求。
4. One API 将结果返回给客户端。

### 1. 登录 One API

打开 【One API 应用详情】，找到访问地址：
![step4](/imgs/oneapi-step4.png)

登录 One API
![step5](/imgs/oneapi-step5.png)

### 2. 创建渠道和令牌

在 One API 中添加对应渠道，直接点击 【添加基础模型】，不要遗漏了向量模型（Embedding）
![step6](/imgs/oneapi-step6.png)

创建一个令牌
![step7](/imgs/oneapi-step7.png)

### 3. 修改账号余额

One API 默认 root 用户只有 200刀，可以自行修改编辑。

### 4. 修改 FastGPT 的环境变量

有了 One API 令牌后，FastGPT 可以通过修改 `baseurl` 和 `key` 去请求到 One API，再由 One API 去请求不同的模型。修改下面两个环境变量：

```bash
# 下面的地址是 Sealos 提供的，务必写上 v1， 两个项目都在 sealos 部署时候，https://xxxx.cloud.sealos.io 可以改用内网地址
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# 下面的 key 是由 One API 提供的令牌
CHAT_API_KEY=sk-xxxxxx
```

## 接入其他模型

**以添加文心一言为例:**

### 1. One API 添加对应模型渠道

![](/imgs/oneapi-demo1.png)

### 2. 修改 FastGPT 配置文件

可以在 `/projects/app/src/data/config.json` 里找到配置文件（本地开发需要复制成 config.local.json），配置文件中有一项是**对话模型配置**：

```json
"llmModels": [
    ...
    {
      "model": "ERNIE-Bot", // 这里的模型需要对应 One API 的模型
      "name": "文心一言", // 对外展示的名称
      "avatar": "/imgs/model/openai.svg", // 模型的logo
      "maxContext": 16000, // 最大上下文
      "maxResponse": 4000, // 最大回复
      "quoteMaxToken": 13000, // 最大引用内容
      "maxTemperature": 1.2, // 最大温度
      "charsPointsPrice": 0, 
      "censor": false,
      "vision": false, // 是否支持图片输入
      "datasetProcess": true, // 是否设置为知识库处理模型
      "usedInClassify": true, // 是否用于问题分类
      "usedInExtractFields": true, // 是否用于字段提取
      "usedInToolCall": true, // 是否用于工具调用
      "usedInQueryExtension": true, // 是否用于问题优化
      "toolChoice": true, // 是否支持工具选择
      "functionCall": false, // 是否支持函数调用
      "customCQPrompt": "", // 自定义文本分类提示词（不支持工具和函数调用的模型
      "customExtractPrompt": "", // 自定义内容提取提示词
      "defaultSystemChatPrompt": "", // 对话默认携带的系统提示词
      "defaultConfig":{}  // 请求API时，挟带一些默认配置（比如 GLM4 的 top_p）
    }
    ...
],
```

**添加向量模型:**

```json
"vectorModels": [
  ......
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "avatar": "/imgs/model/openai.svg",
      "charsPointsPrice": 0,
      "defaultToken": 700,
      "maxToken": 3000,
      "weight": 100
    },
  ......
]
```

### 3. 重启 FastGPT

```bash
docker-compose down
docker-compose up -d
```

重启 FastGPT 即可在选择文心一言模型进行对话。**添加向量模型也是类似操作，增加到 `vectorModels`里。**
