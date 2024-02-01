---
title: '接入微软、ChatGLM、本地模型等'
description: '部署和接入 OneAPI，实现对各种大模型的支持'
icon: 'Api'
draft: false
toc: true
weight: 708
---

* 默认情况下，FastGPT 只配置了 GPT 的模型，如果你需要接入其他模型，需要进行一些额外配置。
* [One API](https://github.com/songquanpeng/one-api) 是一个 OpenAI 接口管理 & 分发系统，可以通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。
* FastGPT 可以通过接入 OneAPI 来实现对不同大模型的支持。OneAPI 的部署方法也很简单。

## FastGPT 与 OneAPI 关系

![](/imgs/sealos-fastgpt.webp)

## MySQL 版本

MySQL 版本支持多实例，高并发。

直接点击以下按钮即可一键部署 👇

<a href="https://template.cloud.sealos.io/deploy?templateName=one-api" rel="external" target="_blank"><img src="https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg" alt="Deploy on Sealos"/></a>

部署完后会跳转「应用管理」，数据库在另一个应用「数据库」中。需要等待 1~3 分钟数据库运行后才能访问成功。

## SqlLite 版本

SqlLite 版本不支持多实例，适合个人小流量使用，但是价格非常便宜。

**1. [点击打开 Sealos 公有云](https://cloud.sealos.io/)**

**2. 打开 AppLaunchpad(应用管理) 工具**

![step1](/imgs/oneapi-step1.jpg)

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

## One API使用教程

### 概念

1. 渠道：
   1. OneApi 中一个渠道对应一个 `Api Key`，这个 `Api Key` 可以是GPT、微软、ChatGLM、文心一言的。一个`Api Key`通常可以调用同一个厂商的多个模型。
   2. OneAPI 会根据请求传入的`模型`来决定使用哪一个`Key`，如果一个模型对应了多个`Key`，则会随机调用。
2. 令牌：访问 OneAPI 所需的凭证，只需要这`1`个凭证即可访问`OneAPI`上配置的模型。因此`FastGPT`中，只需要配置`OneAPI`的`baseurl`和`令牌`即可。

### 1. 登录 One API

打开 【One API 应用详情】，找到访问地址：
![step4](/imgs/oneapi-step4.png)

登录 One API
![step5](/imgs/oneapi-step5.png)

### 2. 创建渠道和令牌

在 One API 中添加对应渠道，直接点击 【添加基础模型】，不要遗漏了向量模型
![step6](/imgs/oneapi-step6.png)

创建一个令牌
![step7](/imgs/oneapi-step7.png)

### 3. 修改账号余额

OneAPI 默认 root 用户只有 200刀，可以自行修改编辑。

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

可以在 `/projects/app/src/data/config.json` 里找到配置文件（本地开发需要复制成 config.local.json），配置文件中有一项是对话模型配置：

```json
"llmModels": [
    ...
    {
      "model": "ERNIE-Bot", // 这里的模型需要对应 One API 的模型
      "name": "文心一言", // 对外展示的名称
      "maxContext": 16000, // 最大上下文
      "maxResponse": 4000, // 最大回复
      "quoteMaxToken": 13000, // 最大引用内容
      "maxTemperature": 1.2, // 最大温度
      "inputPrice": 0, 
      "outputPrice": 0,
      "censor": false,
      "vision": false, // 是否支持图片输入
      "datasetProcess": false, // 是否设置为知识库处理模型
      "toolChoice": true, // 是否支持工具选择
      "functionCall": false, // 是否支持函数调用
      "customCQPrompt": "", // 自定义文本分类提示词（不支持工具和函数调用的模型
      "customExtractPrompt": "", // 自定义内容提取提示词
      "defaultSystemChatPrompt": "", // 对话默认携带的系统提示词
      "defaultConfig":{}  // 对话默认配置（比如 GLM4 的 top_p
    }
    ...
],
```

添加完后，重启 FastGPT 即可在选择文心一言模型进行对话。**添加向量模型也是类似操作，增加到 `vectorModels`里。**
