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

## One API使用步骤

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

### 3. 修改 FastGPT 的环境变量

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
"ChatModels": [
    ...
    {
      "model": "ERNIE-Bot", // 这里的模型需要对应 One API 的模型
      "name": "文心一言", // 对外展示的名称
      "maxContext": 8000, // 最大长下文 token，无论什么模型都按 GPT35 的计算。GPT 外的模型需要自行大致计算下这个值。可以调用官方接口去比对 Token 的倍率，然后在这里粗略计算。
      "maxResponse": 4000, // 最大回复 token
      // 例如：文心一言的中英文 token 基本是 1:1，而 GPT 的中文 Token 是 2:1，如果文心一言官方最大 Token 是 4000，那么这里就可以填 8000，保险点就填 7000.
      "quoteMaxToken": 2000, // 引用知识库的最大 Token
      "maxTemperature": 1, // 最大温度
      "vision": false, // 是否开启图片识别
      "defaultSystemChatPrompt": "" // 默认的系统提示词
    }
    ...
],
```

添加完后，重启 FastGPT 即可在选择文心一言模型进行对话。
