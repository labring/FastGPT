---
title: "对接第三方 GPT 应用"
description: "通过与 OpenAI 兼容的 API 对接第三方应用"
icon: "model_training"
draft: false
toc: true
weight: 330
---

## 获取 API 秘钥

依次选择应用 -> 「API访问」，然后点击「API 密钥」来创建密钥。

{{% alert context="warning" %}}
密钥需要自己保管好，一旦关闭就无法再复制密钥，只能创建新密钥再复制。
{{% /alert %}}

![](/imgs/fastgpt-api.png)

## 组合秘钥

利用刚复制的 API 秘钥加上 AppId 组合成一个新的秘钥，格式为：`API 秘钥-AppId`，例如：`fastgpt-z51pkjqm9nrk03a1rx2funoy-642adec15f04d67d4613efdb`。

## 替换三方应用的变量

```bash
OPENAI_API_BASE_URL: https://fastgpt.run/api/openapi (改成自己部署的域名)
OPENAI_API_KEY = 组合秘钥
```

**[ChatGPT Next Web](https://github.com/Yidadaa/ChatGPT-Next-Web) 示例：**

![](/imgs/chatgptnext.png)

**[ChatGPT Web](https://github.com/Chanzhaoyu/chatgpt-web) 示例：**

![](/imgs/chatgptweb.png)