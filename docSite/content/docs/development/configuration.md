---
title: '配置文件介绍'
description: 'FastGPT 配置参数介绍'
icon: 'settings'
draft: false
toc: true
weight: 520
---

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 `projects/app/data/config.json` 看到默认的配置文件。可以参考 [docker-compose 快速部署](/docs/installation/docker/) 来挂载配置文件。

**开发环境下**，你需要将示例配置文件 `config.json` 复制成 `config.local.json` 文件才会生效。

这个配置文件中包含了系统级参数、AI 对话的模型、function 模型等……


## 完整配置参数

**使用时，请务必去除注释！**

```json
{
  "SystemParams": {
    "vectorMaxProcess": 15, // 向量生成最大进程，结合数据库性能和 key 来设置
    "qaMaxProcess": 15,  // QA 生成最大进程，结合数据库性能和 key 来设置
    "pgHNSWEfSearch": 40  // pg vector 索引参数，越大精度高但速度慢
  },
  "ChatModels": [
    {
      "model": "gpt-3.5-turbo", // 实际调用的模型
      "name": "GPT35-4k", // 展示的名字
      "maxToken": 4000, // 最大token，均按 gpt35 计算
      "quoteMaxToken": 2000, // 引用内容最大 token
      "maxTemperature": 1.2, // 最大温度
      "price": 0,
      "defaultSystemChatPrompt": ""
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystemChatPrompt": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "maxToken": 8000,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystemChatPrompt": ""
    }
  ],
  "QAModels": [ // QA 拆分模型
    { 
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000,
      "price": 0
    }
  ],
  "ExtractModels": [ // 内容提取模型
    { 
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000, 
      "price": 0,
      "functionCall": true, // 是否支持 function call
      "functionPrompt": "" // 自定义非 function call 提示词
    }
  ],
  "CQModels": [ // Classify Question: 问题分类模型
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000,
      "price": 0,
      "functionCall": true,
      "functionPrompt": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "maxToken": 8000,
      "price": 0,
      "functionCall": true,
      "functionPrompt": ""
    }
  ],
  "QGModels": [ // Question Generation: 生成下一步指引模型
    { 
      "model": "gpt-3.5-turbo",
      "name": "GPT35-4k",
      "maxToken": 4000,
      "price": 0
    }
  ],
  "VectorModels": [
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "price": 0,
      "defaultToken": 500,
      "maxToken": 3000
    }
  ]
}
```
