---
title: '配置文件介绍'
description: 'FastGPT 配置参数介绍'
icon: 'settings'
draft: false
toc: true
weight: 708
---

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 `projects/app/data/config.json` 看到默认的配置文件。可以参考 [docker-compose 快速部署](/docs/development/docker/) 来挂载配置文件。

**开发环境下**，你需要将示例配置文件 `config.json` 复制成 `config.local.json` 文件才会生效。

这个配置文件中包含了系统参数和各个模型配置，使用时务必去掉注释。

## 4.6.8+ 版本新配置文件

llm模型全部合并

```json
{
  "systemEnv": {
    "vectorMaxProcess": 15,
    "qaMaxProcess": 15,
    "pgHNSWEfSearch": 100 // 向量搜索参数。越大，搜索越精确，但是速度越慢。设置为100，有99%+精度。
  },
  "llmModels": [
    {
      "model": "gpt-3.5-turbo", // 模型名
      "name": "gpt-3.5-turbo", // 别名
      "maxContext": 16000, // 最大上下文
      "maxResponse": 4000, // 最大回复
      "quoteMaxToken": 13000, // 最大引用内容
      "maxTemperature": 1.2, // 最大温度
      "charsPointsPrice": 0, 
      "censor": false,
      "vision": false, // 是否支持图片输入
      "datasetProcess": false, // 是否设置为知识库处理模型（QA），务必保证至少有一个为true，否则知识库会报错
      "usedInClassify": true, // 是否用于问题分类（务必保证至少有一个为true）
      "usedInExtractFields": true, // 是否用于内容提取（务必保证至少有一个为true）
      "usedInToolCall": true, // 是否用于工具调用（务必保证至少有一个为true）
      "usedInQueryExtension": true, // 是否用于问题优化（务必保证至少有一个为true）
      "toolChoice": true, // 是否支持工具选择（分类，内容提取，工具调用会用到。目前只有gpt支持）
      "functionCall": false, // 是否支持函数调用（分类，内容提取，工具调用会用到。会优先使用 toolChoice，如果为false，则使用 functionCall，如果仍为 false，则使用提示词模式）
      "customCQPrompt": "", // 自定义文本分类提示词（不支持工具和函数调用的模型
      "customExtractPrompt": "", // 自定义内容提取提示词
      "defaultSystemChatPrompt": "", // 对话默认携带的系统提示词
      "defaultConfig":{}  // LLM默认配置，可以针对不同模型设置特殊值（比如 GLM4 的 top_p
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "gpt-3.5-turbo-16k",
      "maxContext": 16000,
      "maxResponse": 16000,
      "quoteMaxToken": 13000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": false,
      "datasetProcess": true,
      "usedInClassify": true,
      "usedInExtractFields": true,
      "usedInToolCall": true,
      "usedInQueryExtension": true,
      "toolChoice": true,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig":{} 
    },
    {
      "model": "gpt-4-0125-preview",
      "name": "gpt-4-turbo",
      "maxContext": 125000,
      "maxResponse": 4000,
      "quoteMaxToken": 100000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": false,
      "datasetProcess": false,
      "usedInClassify": true,
      "usedInExtractFields": true,
      "usedInToolCall": true,
      "usedInQueryExtension": true,
      "toolChoice": true,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig":{} 
    },
    {
      "model": "gpt-4-vision-preview",
      "name": "gpt-4-vision",
      "maxContext": 128000,
      "maxResponse": 4000,
      "quoteMaxToken": 100000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": true,
      "datasetProcess": false,
      "usedInClassify": false,
      "usedInExtractFields": false,
      "usedInToolCall": false,
      "usedInQueryExtension": false,
      "toolChoice": true,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig":{} 
    }
  ],
  "vectorModels": [
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "charsPointsPrice": 0,
      "defaultToken": 700,
      "maxToken": 3000,
      "weight": 100,
      "defaultConfig":{}  // 默认配置。例如，如果希望使用 embedding3-large 的话，可以传入 dimensions:1024，来返回1024维度的向量。（目前必须小于1536维度）
    }
  ],
  "reRankModels": [],
  "audioSpeechModels": [
    {
      "model": "tts-1",
      "name": "OpenAI TTS1",
      "charsPointsPrice": 0,
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
  "whisperModel": {
    "model": "whisper-1",
    "name": "Whisper1",
    "charsPointsPrice": 0
  }
}
```

## 特殊模型

### ReRank 接入

请使用 4.6.6-alpha 以上版本，配置文件中的 `reRankModels` 为重排模型，虽然是数组，不过目前仅有第1个生效。

1. [部署 ReRank 模型](/docs/development/custom-models/reranker/)
1. 找到 FastGPT 的配置文件中的 `reRankModels`， 4.6.6 以前是 `ReRankModels`。
2. 修改对应的值：（记得去掉注释）

```json
{
    "reRankModels": [
        {
            "model": "bge-reranker-base", // 随意
            "name": "检索重排-base", // 随意
            "charsPointsPrice": 0,
            "requestUrl": "{{host}}/api/v1/rerank",
            "requestAuth": "安全凭证，已自动补 Bearer"
        }
    ]
}
```
