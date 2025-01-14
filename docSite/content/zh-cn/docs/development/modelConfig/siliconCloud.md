---
title: '通过 SiliconCloud 体验开源模型'
description: '通过 SiliconCloud 体验开源模型'
icon: 'api'
draft: false
toc: true
weight: 746
---

[SiliconCloud(硅基流动)](https://cloud.siliconflow.cn/i/TR9Ym0c4) 是一个以提供开源模型调用为主的平台，并拥有自己的加速引擎。帮助用户低成本、快速的进行开源模型的测试和使用。实际体验下来，他们家模型的速度和稳定性都非常不错，并且种类丰富，覆盖语言、向量、重排、TTS、STT、绘图、视频生成模型，可以满足 FastGPT 中所有模型需求。

如果你想部分模型使用 SiliconCloud 的模型，可额外参考[OneAPI接入硅基流动](/docs/development/modelconfig/one-api/#硅基流动--开源模型大合集)。

本文会介绍完全使用 SiliconCloud 模型来部署 FastGPT 的方案。


## 1. 注册 SiliconCloud 账号

1. [点击注册硅基流动账号](https://cloud.siliconflow.cn/i/TR9Ym0c4)
2. 进入控制台，获取 API key: https://cloud.siliconflow.cn/account/ak

## 2. 修改 FastGPT 环境变量

```bash
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
# 填写 SiliconCloud 控制台提供的 Api Key
CHAT_API_KEY=sk-xxxxxx
```

## 3. 修改 FastGPT 配置文件

我们选取 SiliconCloud 中的模型作为 FastGPT 配置。这里配置了 `Qwen2.5 72b` 的纯语言和视觉模型；选择 `bge-m3` 作为向量模型；选择 `bge-reranker-v2-m3` 作为重排模型。选择 `fish-speech-1.5` 作为语音模型；选择 `SenseVoiceSmall` 作为语音输入模型。

注意：ReRank 模型仍需配置一次 Api Key

```json
{
    "llmModels": [
    {
      "provider": "Other", // 模型提供商，主要用于分类展示，目前已经内置提供商包括：https://github.com/labring/FastGPT/blob/main/packages/global/core/ai/provider.ts, 可 pr 提供新的提供商，或直接填写 Other
      "model": "Qwen/Qwen2.5-72B-Instruct", // 模型名(对应OneAPI中渠道的模型名)
      "name": "Qwen2.5-72B-Instruct", // 模型别名
      "maxContext": 32000, // 最大上下文
      "maxResponse": 4000, // 最大回复
      "quoteMaxToken": 30000, // 最大引用内容
      "maxTemperature": 1, // 最大温度
      "charsPointsPrice": 0, // n积分/1k token（商业版）
      "censor": false, // 是否开启敏感校验（商业版）
      "vision": false, // 是否支持图片输入
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
      "provider": "Other",
      "model": "Qwen/Qwen2-VL-72B-Instruct",
      "name": "Qwen2-VL-72B-Instruct",
      "maxContext": 32000,
      "maxResponse": 4000,
      "quoteMaxToken": 30000,
      "maxTemperature": 1,
      "charsPointsPrice": 0,
      "censor": false,
      "vision": true,
      "datasetProcess": false,
      "usedInClassify": false,
      "usedInExtractFields": false,
      "usedInToolCall": false,
      "usedInQueryExtension": false,
      "toolChoice": false,
      "functionCall": false,
      "customCQPrompt": "",
      "customExtractPrompt": "",
      "defaultSystemChatPrompt": "",
      "defaultConfig": {}
    }
  ],
  "vectorModels": [
    {
      "provider": "Other",
      "model": "Pro/BAAI/bge-m3",
      "name": "Pro/BAAI/bge-m3",
      "charsPointsPrice": 0,
      "defaultToken": 512,
      "maxToken": 5000,
      "weight": 100
    }
  ],
  "reRankModels": [
    {
        "model": "BAAI/bge-reranker-v2-m3", // 这里的model需要对应 siliconflow 的模型名
        "name": "BAAI/bge-reranker-v2-m3",
        "requestUrl": "https://api.siliconflow.cn/v1/rerank",
        "requestAuth": "siliconflow 上申请的 key"
    }
  ],
  "audioSpeechModels": [
    {
        "model": "fishaudio/fish-speech-1.5",
        "name": "fish-speech-1.5",
        "voices": [
            {
                "label": "fish-alex",
                "value": "fishaudio/fish-speech-1.5:alex",
                "bufferId": "fish-alex"
            },
            {
                "label": "fish-anna",
                "value": "fishaudio/fish-speech-1.5:anna",
                "bufferId": "fish-anna"
            },
            {
                "label": "fish-bella",
                "value": "fishaudio/fish-speech-1.5:bella",
                "bufferId": "fish-bella"
            },
            {
                "label": "fish-benjamin",
                "value": "fishaudio/fish-speech-1.5:benjamin",
                "bufferId": "fish-benjamin"
            },
            {
                "label": "fish-charles",
                "value": "fishaudio/fish-speech-1.5:charles",
                "bufferId": "fish-charles"
            },
            {
                "label": "fish-claire",
                "value": "fishaudio/fish-speech-1.5:claire",
                "bufferId": "fish-claire"
            },
            {
                "label": "fish-david",
                "value": "fishaudio/fish-speech-1.5:david",
                "bufferId": "fish-david"
            },
            {
                "label": "fish-diana",
                "value": "fishaudio/fish-speech-1.5:diana",
                "bufferId": "fish-diana"
            }
        ]
    }
  ],
  "whisperModel": {
    "model": "FunAudioLLM/SenseVoiceSmall",
    "name": "SenseVoiceSmall",
    "charsPointsPrice": 0
  }
}
```

## 4. 重启 FastGPT

## 5. 体验测试

### 测试对话和图片识别

随便新建一个简易应用，选择对应模型，并开启图片上传后进行测试：

| | |
| --- | --- |
| ![alt text](/imgs/image-68.png) | ![alt text](/imgs/image-70.png) |

可以看到，72B 的模型，性能还是非常快的，这要是本地没几个 4090，不说配置环境，输出怕都要 30s 了。

### 测试知识库导入和知识库问答

新建一个知识库（由于只配置了一个向量模型，页面上不会展示向量模型选择）

| | |
| --- | --- |
| ![alt text](/imgs/image-72.png) | ![alt text](/imgs/image-71.png) |

导入本地文件，直接选择文件，然后一路下一步即可。79 个索引，大概花了 20s 的时间就完成了。现在我们去测试一下知识库问答。

首先回到我们刚创建的应用，选择知识库，调整一下参数后即可开始对话：

| | | | 
| --- | --- | --- |
| ![alt text](/imgs/image-73.png) | ![alt text](/imgs/image-75.png) | ![alt text](/imgs/image-76.png) |

对话完成后，点击底部的引用，可以查看引用详情，同时可以看到具体的检索和重排得分：

| | |
| --- | --- |
| ![alt text](/imgs/image-77.png) | ![alt text](/imgs/image-78.png) |

### 测试语音播放

继续在刚刚的应用中，左侧配置中找到语音播放，点击后可以从弹窗中选择语音模型，并进行试听：

![alt text](/imgs/image-79.png)

### 测试语言输入

继续在刚刚的应用中，左侧配置中找到语音输入，点击后可以从弹窗中开启语言输入

![alt text](/imgs/image-80.png)

开启后，对话输入框中，会增加一个话筒的图标，点击可进行语音输入：

| | |
| --- | --- |
| ![alt text](/imgs/image-81.png) | ![alt text](/imgs/image-82.png) |

## 总结

如果你想快速的体验开源模型或者快速的使用 FastGPT，不想在不同服务商申请各类 Api Key，那么可以选择 SiliconCloud 的模型先进行快速体验。

如果你决定未来私有化部署模型和 FastGPT，前期可通过 SiliconCloud 进行测试验证，后期再进行硬件采购，减少 POC 时间和成本。