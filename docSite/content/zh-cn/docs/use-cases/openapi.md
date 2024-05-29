---
title: "对接第三方 GPT 应用"
description: "通过与 OpenAI 兼容的 API 对接第三方应用"
icon: "model_training"
draft: false
toc: true
weight: 505
---

## 获取 API 秘钥

依次选择应用 -> 「API访问」，然后点击「API 密钥」来创建密钥。

{{% alert context="warning" %}}
密钥需要自己保管好，一旦关闭就无法再复制密钥，只能创建新密钥再复制。
{{% /alert %}}

![](/imgs/fastgpt-api.jpg)

{{% alert icon="🍅" context="success" %}}
Tips: 安全起见，你可以设置一个额度或者过期时间，放置 key 被滥用。
{{% /alert %}}


## 替换三方应用的变量

```bash
OPENAI_API_BASE_URL: https://api.fastgpt.in/api (改成自己部署的域名)
OPENAI_API_KEY = 上一步获取到的秘钥
```

**[ChatGPT Next Web](https://github.com/Yidadaa/ChatGPT-Next-Web) 示例：**

![](/imgs/chatgptnext.png)

**[ChatGPT Web](https://github.com/Chanzhaoyu/chatgpt-web) 示例：**

![](/imgs/chatgptweb.png)