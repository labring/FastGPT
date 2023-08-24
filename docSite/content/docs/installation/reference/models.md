---
title: '多模型支持'
description: '快速接入除了 GPT 以外的其他大模型'
icon: 'model_training'
draft: false
toc: true
weight: 752
---

默认情况下，FastGPT 只配置了 GPT 的 3 个模型，如果你需要接入其他模型，需要进行一些额外配置。

## 部署 one-api

首先你需要部署一个 [one-api](/docs/installation/one-api/)，并添加对应的【渠道】和【令牌】，并修改 FastGPT 环境变量，具体可参考 [快速部署 one-api](/docs/installation/one-api)

## 添加 FastGPT 配置文件

可以在 `/client/src/data/config.json` 里找到配置文件（本地开发需要复制成 config.local.json），配置文件中有一项是对话模型配置：

```json
"ChatModels": [
    {
      "model": "gpt-3.5-turbo", // 这里的模型需要对应 OneAPI 的模型
      "name": "FastAI-4k", // 对外展示的名称
      "contextMaxToken": 4000, // 最大长下文 token，无论什么模型都按 GPT35 的计算。GPT 外的模型需要自行大致计算下这个值。可以调用官方接口去比对 Token 的倍率，然后在这里粗略计算。
      // 例如：文心一言的中英文 token 基本是 1:1，而 GPT 的中文 Token 是 2:1，如果文心一言官方最大 Token 是 4000，那么这里就可以填 8000，保险点就填 7000.
      "quoteMaxToken": 2000, // 引用知识库的最大 Token
      "maxTemperature": 1.2, // 最大温度
      "price": 1.5, // 1个token 价格 => 1.5 / 100000 * 1000 = 0.015元/1k token
      "defaultSystem": "" // 默认的系统提示词
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "FastAI-16k",
      "contextMaxToken": 16000,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "price": 3,
      "defaultSystem": ""
    },
    {
      "model": "gpt-4",
      "name": "FastAI-Plus",
      "contextMaxToken": 8000,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "price": 45,
      "defaultSystem": ""
    }
],
```

### 添加新的对话模型

以添加文心一言为例:

```json
"ChatModels": [
...
{
  "model": "ERNIE-Bot",
  "name": "文心一言",
  "contextMaxToken": 4000,
  "quoteMaxToken": 2000,
  "maxTemperature": 1,
  "price": 1.2
}
...
]
```

添加完后，重启 FastGPT 即可在选择文心一言模型进行对话。
