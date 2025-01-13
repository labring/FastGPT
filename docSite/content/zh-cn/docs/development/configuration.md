---
title: '配置文件介绍'
description: 'FastGPT 配置参数介绍'
icon: 'settings'
draft: false
toc: true
weight: 707
---

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 `projects/app/data/config.json` 看到默认的配置文件。可以参考 [docker-compose 快速部署](/docs/development/docker/) 来挂载配置文件。

**开发环境下**，你需要将示例配置文件 `config.json` 复制成 `config.local.json` 文件才会生效。  

下面配置文件示例中包含了系统参数和各个模型配置：

## 4.6.8+ 版本新配置文件示例

```json
{
  "feConfigs": {
    "lafEnv": "https://laf.dev" // laf环境。 https://laf.run （杭州阿里云） ,或者私有化的laf环境。如果使用 Laf openapi 功能，需要最新版的 laf 。
  },
  "systemEnv": {
    "vectorMaxProcess": 15, // 向量处理线程数量
    "qaMaxProcess": 15, // 问答拆分线程数量
    "tokenWorkers": 50, // Token 计算线程保持数，会持续占用内存，不能设置太大。
    "pgHNSWEfSearch": 100 // 向量搜索参数。越大，搜索越精确，但是速度越慢。设置为100，有99%+精度。
  },
  "llmModels": [
    {
      "provider": "OpenAI", // 模型提供商，主要用于分类展示，目前已经内置提供商包括：https://github.com/labring/FastGPT/blob/main/packages/global/core/ai/provider.ts, 可 pr 提供新的提供商，或直接填写 Other
      "model": "gpt-4o-mini", // 模型名(对应OneAPI中渠道的模型名)
      "name": "gpt-4o-mini", // 模型别名
      "maxContext": 125000, // 最大上下文
      "maxResponse": 16000, // 最大回复
      "quoteMaxToken": 120000, // 最大引用内容
      "maxTemperature": 1.2, // 最大温度
      "charsPointsPrice": 0, // n积分/1k token（商业版）
      "censor": false, // 是否开启敏感校验（商业版）
      "vision": true, // 是否支持图片输入
      "datasetProcess": true, // 是否设置为文本理解模型（QA），务必保证至少有一个为true，否则知识库会报错
      "usedInClassify": true, // 是否用于问题分类（务必保证至少有一个为true）
      "usedInExtractFields": true, // 是否用于内容提取（务必保证至少有一个为true）
      "usedInToolCall": true, // 是否用于工具调用（务必保证至少有一个为true）
      "usedInQueryExtension": true, // 是否用于问题优化（务必保证至少有一个为true）
      "toolChoice": true, // 是否支持工具选择（分类，内容提取，工具调用会用到。）
      "functionCall": false, // 是否支持函数调用（分类，内容提取，工具调用会用到。会优先使用 toolChoice，如果为false，则使用 functionCall，如果仍为 false，则使用提示词模式）
      "customCQPrompt": "", // 自定义文本分类提示词（不支持工具和函数调用的模型
      "customExtractPrompt": "", // 自定义内容提取提示词
      "defaultSystemChatPrompt": "", // 对话默认携带的系统提示词
      "defaultConfig": {}, // 请求API时，挟带一些默认配置（比如 GLM4 的 top_p）
      "fieldMap": {} // 字段映射（o1 模型需要把 max_tokens 映射为 max_completion_tokens）
    },
    {
      "provider": "OpenAI",
      "model": "gpt-4o",
      "name": "gpt-4o",
      "maxContext": 125000,
      "maxResponse": 4000,
      "quoteMaxToken": 120000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": true,
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
      "defaultConfig": {},
      "fieldMap": {}
    },
    {
      "provider": "OpenAI",
      "model": "o1-mini",
      "name": "o1-mini",
      "maxContext": 125000,
      "maxResponse": 65000,
      "quoteMaxToken": 120000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": false,
      "datasetProcess": true,
      "usedInClassify": true,
      "usedInExtractFields": true,
      "usedInToolCall": true,
      "usedInQueryExtension": true,
      "toolChoice": false,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig": {
        "temperature": 1,
        "max_tokens": null,
        "stream": false
      }
    },
    {
      "provider": "OpenAI",
      "model": "o1-preview",
      "name": "o1-preview",
      "maxContext": 125000,
      "maxResponse": 32000,
      "quoteMaxToken": 120000,
      "maxTemperature": 1.2,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": false,
      "datasetProcess": true,
      "usedInClassify": true,
      "usedInExtractFields": true,
      "usedInToolCall": true,
      "usedInQueryExtension": true,
      "toolChoice": false,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig": {
         "temperature": 1,
        "max_tokens": null,
        "stream": false
      }
    }
  ],
  "vectorModels": [
    {
      "provider": "OpenAI",
      "model": "text-embedding-3-small",
      "name": "text-embedding-3-small",
      "charsPointsPrice": 0,
      "defaultToken": 512,
      "maxToken": 3000,
      "weight": 100
    },
    {
      "provider": "OpenAI",
      "model": "text-embedding-3-large",
      "name": "text-embedding-3-large",
      "charsPointsPrice": 0,
      "defaultToken": 512,
      "maxToken": 3000,
      "weight": 100,
      "defaultConfig": {
        "dimensions": 1024
      }
    },
    {
      "provider": "OpenAI",
      "model": "text-embedding-ada-002", // 模型名（与OneAPI对应）
      "name": "Embedding-2", // 模型展示名
      "charsPointsPrice": 0, // n积分/1k token
      "defaultToken": 700, // 默认文本分割时候的 token
      "maxToken": 3000, // 最大 token
      "weight": 100, // 优先训练权重
      "defaultConfig": {}, // 自定义额外参数。例如，如果希望使用 embedding3-large 的话，可以传入 dimensions:1024，来返回1024维度的向量。（目前必须小于1536维度）
      "dbConfig": {}, // 存储时的额外参数（非对称向量模型时候需要用到）
      "queryConfig": {} // 参训时的额外参数
    }
  ],
  "reRankModels": [],
  "audioSpeechModels": [
    {
      "provider": "OpenAI",
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
    "provider": "OpenAI",
    "model": "whisper-1",
    "name": "Whisper1",
    "charsPointsPrice": 0
  }
}
```

##  内置的模型提供商ID

为了方便模型分类展示，FastGPT 内置了部分模型提供商的名字和 Logo。如果你期望补充提供商，可[提交 Issue](https://github.com/labring/FastGPT/issues)，并提供几个信息：

1. 厂商官网地址
2. 厂商 SVG logo，建议是正方形图片。

目前已支持的提供商, 复制 "-" 之前的字符串，作为 provider 的值。

- OpenAI
- Claude
- Gemini
- Meta
- MistralAI
- AliCloud - 阿里云
- Qwen - 通义千问
- Doubao - 豆包
- ChatGLM - 智谱
- DeepSeek - 深度求索
- Moonshot - 月之暗面
- MiniMax
- SparkDesk - 讯飞星火
- Hunyuan - 腾讯混元
- Baichuan - 百川
- Yi - 零一万物
- Ernie - 文心一言
- StepFun - 阶跃星辰
- Ollama
- BAAI - 智源研究院
- FishAudio
- Other - 其他


## ReRank 模型接入

由于 OneAPI 不支持 Rerank 模型，所以需要单独配置接入，这里


### 使用硅基流动的在线模型

有免费的 `bge-reranker-v2-m3` 模型可以使用。

1. [点击注册硅基流动账号](https://cloud.siliconflow.cn/i/TR9Ym0c4)
2. 进入控制台，获取 API key: https://cloud.siliconflow.cn/account/ak
3. 修改 FastGPT 配置文件

```json
{
    "reRankModels": [
        {
            "model": "BAAI/bge-reranker-v2-m3", // 这里的model需要对应 siliconflow 的模型名
            "name": "BAAI/bge-reranker-v2-m3",
            "requestUrl": "https://api.siliconflow.cn/v1/rerank",
            "requestAuth": "siliconflow 上申请的 key"
        }
    ]
}
```

### 私有部署模型

请使用 4.6.6-alpha 以上版本，配置文件中的 `reRankModels` 为重排模型，虽然是数组，不过目前仅有第1个生效。

1. [部署 ReRank 模型](/docs/development/custom-models/bge-rerank/)
1. 找到 FastGPT 的配置文件中的 `reRankModels`， 4.6.6 以前是 `ReRankModels`。
2. 修改对应的值：

```json
{
    "reRankModels": [
        {
            "model": "bge-reranker-base", // 随意
            "name": "检索重排-base", // 随意
            "charsPointsPrice": 0,
            "requestUrl": "{{host}}/v1/rerank",
            "requestAuth": "安全凭证，已自动补 Bearer"
        }
    ]
}
```
