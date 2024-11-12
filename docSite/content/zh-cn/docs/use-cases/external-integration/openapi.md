---
title: "通过 API 访问应用"
description: "通过 API 访问 FastGPT 应用"
icon: "model_training"
draft: false
toc: true
weight: 502
---

在 FastGPT 中，你可以为每一个应用创建多个 API 密钥，用于访问应用的 API 接口。每个密钥仅能访问一个应用。完整的接口可以[查看应用对话接口](/docs/development/openapi/chat)。

## 获取 API 密钥

依次选择应用 -> 「API访问」，然后点击「API 密钥」来创建密钥。

{{% alert context="warning" %}}
密钥需要自己保管好，一旦关闭就无法再复制密钥，只能创建新密钥再复制。
{{% /alert %}}

![](/imgs/fastgpt-api1.jpg)

{{% alert icon="🍅" context="success" %}}
Tips: 安全起见，你可以设置一个额度或者过期时间，放置 key 被滥用。
{{% /alert %}}


## 替换三方应用的变量

```bash
OPENAI_API_BASE_URL: https://api.fastgpt.in/api (改成自己部署的域名)
OPENAI_API_KEY = 上一步获取到的密钥
```

**[ChatGPT Next Web](https://github.com/Yidadaa/ChatGPT-Next-Web) 示例：**

![](/imgs/chatgptnext.png)

**[ChatGPT Web](https://github.com/Chanzhaoyu/chatgpt-web) 示例：**

![](/imgs/chatgptweb.png)