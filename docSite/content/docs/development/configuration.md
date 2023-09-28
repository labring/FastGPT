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
    "pgIvfflatProbe": 20  // pg vector 搜索探针。没有设置索引前可忽略，通常 50w 组以上才需要设置。
  },
  "ChatModels": [
    {
      "model": "gpt-3.5-turbo",
      "name": "GPT35-4k",
      "contextMaxToken": 4000, // 最大token，均按 gpt35 计算
      "quoteMaxToken": 2000, // 引用内容最大 token
      "maxTemperature": 1.2, // 最大温度
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "contextMaxToken": 16000,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "contextMaxToken": 8000,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
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
  ],
  "QAModel": { // QA 拆分模型
    "model": "gpt-3.5-turbo-16k",
    "name": "GPT35-16k",
    "maxToken": 16000,
    "price": 0
  },
  "ExtractModel": { // 内容提取模型
    "model": "gpt-3.5-turbo-16k",
    "functionCall": true, // 是否使用 functionCall
    "name": "GPT35-16k",
    "maxToken": 16000,
    "price": 0,
    "prompt": ""
  },
  "CQModel": { // 问题分类模型
    "model": "gpt-3.5-turbo-16k",
    "functionCall": true,
    "name": "GPT35-16k",
    "maxToken": 16000,
    "price": 0,
    "prompt": ""
  }
}
```
