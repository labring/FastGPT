---
sidebar_position: 2
---

# Other Chat Model Configuration

By default, FastGPT is only configured with 3 models of GPT. If you need to integrate other models, you need to do some additional configuration.

## 1. Install OneAPI

First, you need to deploy a [OneAPI](/docs/develop/oneapi) and add the corresponding "channel".
![](./imgs/chatmodels1.png)

## 2. Add FastGPT Configuration

You can find the configuration file in /client/src/data/config.json (for local development, you need to copy it as config.local.json). In the configuration file, there is a section for chat model configuration:

```json
"ChatModels": [
{
    "model": "gpt-3.5-turbo", // The model here needs to correspond to the model in OneAPI
    "name": "FastAI-4k", // The name displayed externally
    "contextMaxToken": 4000, // Maximum context token, calculated according to GPT35 regardless of the model. Models other than GPT need to roughly calculate this value themselves. You can call the official API to compare the token ratio and then roughly calculate it here.
    // For example: the ratio of Chinese and English tokens in Wenxin Yiyuan is basically 1:1, while the ratio of Chinese tokens in GPT is 2:1. If the maximum token of Wenxin Yiyuan is 4000, then you can fill in 8000 here, or fill in 7000 for safety.
    "quoteMaxToken": 2000, // Maximum token for quoting knowledge base
    "maxTemperature": 1.2, // Maximum temperature
    "price": 1.5, // Price per token => 1.5 / 100000 * 1000 = 0.015 yuan/1k token
    "defaultSystem": "" // Default system prompt
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

### Add a New Model

Taking Wenxin Yiyuan as an example:

```json
"ChatModels": [
...
{
    "model": "ERNIE-Bot",
    "name": "Wenxin Yiyuan",
    "contextMaxToken": 4000,
    "quoteMaxToken": 2000,
    "maxTemperature": 1,
    "price": 1.2
}
...
]
```

After adding it, restart the application and you can choose the Wenxin Yiyuan model for conversation.
