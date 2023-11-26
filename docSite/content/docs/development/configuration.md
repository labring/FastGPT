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
    "pluginBaseUrl": "", // 商业版接口地址
    "vectorMaxProcess": 15, // 向量生成最大进程，结合数据库性能和 key 来设置
    "qaMaxProcess": 15,  // QA 生成最大进程，结合数据库性能和 key 来设置
    "pgHNSWEfSearch": 100  // pg vector 索引参数，越大精度高但速度慢
  },
  "ChatModels": [ // 对话模型
    {
      "model": "gpt-3.5-turbo-1106",
      "name": "GPT35-1106",
      "price": 0, // 除以 100000 后等于1个token的价格
      "maxContext": 16000, // 最大上下文长度
      "maxResponse": 4000, // 最大回复长度
      "quoteMaxToken": 2000, // 最大引用内容长度
      "maxTemperature": 1.2, // 最大温度值
      "censor": false, // 是否开启敏感词过滤(商业版)
      "vision": false, // 支持图片输入
      "defaultSystemChatPrompt": ""
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxContext": 16000,
      "maxResponse": 16000,
      "price": 0,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "censor": false,
      "vision": false,
      "defaultSystemChatPrompt": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "maxContext": 8000,
      "maxResponse": 8000,
      "price": 0,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "censor": false,
      "vision": false,
      "defaultSystemChatPrompt": ""
    },
    {
      "model": "gpt-4-vision-preview",
      "name": "GPT4-Vision",
      "maxContext": 128000,
      "maxResponse": 4000,
      "price": 0,
      "quoteMaxToken": 100000,
      "maxTemperature": 1.2,
      "censor": false,
      "vision": true,
      "defaultSystemChatPrompt": ""
    }
  ],
  "QAModels": [ // QA 生成模型
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxContext": 16000,
      "maxResponse": 16000,
      "price": 0
    }
  ],
  "CQModels": [ // 问题分类模型
    {
      "model": "gpt-3.5-turbo-1106",
      "name": "GPT35-1106",
      "maxContext": 16000,
      "maxResponse": 4000,
      "price": 0,
      "functionCall": true, // 是否支持function call， 不支持的模型需要设置为 false，会走提示词生成
      "functionPrompt": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "maxContext": 8000,
      "maxResponse": 8000,
      "price": 0,
      "functionCall": true,
      "functionPrompt": ""
    }
  ],
  "ExtractModels": [ // 内容提取模型
    {
      "model": "gpt-3.5-turbo-1106",
      "name": "GPT35-1106",
      "maxContext": 16000,
      "maxResponse": 4000,
      "price": 0,
      "functionCall": true,
      "functionPrompt": ""
    }
  ],
  "QGModels": [ // 生成下一步指引
    {
      "model": "gpt-3.5-turbo-1106",
      "name": "GPT35-1106",
      "maxContext": 1600,
      "maxResponse": 4000,
      "price": 0
    }
  ],
  "VectorModels": [ // 向量模型
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "price": 0.2,
      "defaultToken": 700,
      "maxToken": 3000
    }
  ],
  "AudioSpeechModels": [
    {
      "model": "tts-1",
      "name": "OpenAI TTS1",
      "price": 0,
      "baseUrl": "",
      "key": "",
      "voices": [
        { "label": "Alloy", "value": "alloy", "bufferId": "openai-Alloy" },
        { "label": "Echo", "value": "echo", "bufferId": "openai-Echo" },
        { "label": "Fable", "value": "fable", "bufferId": "openai-Fable" },
        { "label": "Onyx", "value": "onyx", "bufferId": "openai-Onyx" },
        { "label": "Nova", "value": "nova", "bufferId": "openai-Nova" },
        { "label": "Shimmer", "value": "shimmer", "bufferId": "openai-Shimmer" }
      ]
    }
  ],
  "WhisperModel": {
    "model": "whisper-1",
    "name": "Whisper1",
    "price": 0
  }
}
```
