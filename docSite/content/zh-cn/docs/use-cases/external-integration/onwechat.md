---
title: "对接 chatgpt-on-wechat"
description: "FastGPT 对接 chatgpt-on-wechat"
icon: "chat"
draft: false
toc: true
weight: 509
---

# 1 分钟对接 chatgpt-on-wechat

[chatgpt-on-wechat GitHub 地址](https://github.com/zhayujie/chatgpt-on-wechat)

由于 FastGPT 的 API 接口和 OpenAI 的规范一致，可以无需变更原来的应用即可使用 FastGPT 上编排好的应用。API 使用可参考 [这篇文章](/docs/use-cases/external-integration/openapi/)。编排示例，可参考 [高级编排介绍](/docs/workflow/intro)

## 1. 获取 OpenAPI 密钥

依次选择应用 -> 「API访问」，然后点击「API 密钥」来创建密钥。

{{% alert context="warning" %}}
密钥需要自己保管好，一旦关闭就无法再复制密钥，只能创建新密钥再复制。
{{% /alert %}}

![](/imgs/fastgpt-api.jpg)


## 3. 创建 docker-compose.yml 文件

只需要修改 `OPEN_AI_API_KEY` 和 `OPEN_AI_API_BASE` 两个环境变量即可。其中 `OPEN_AI_API_KEY` 为第一步获取的密钥，`OPEN_AI_API_BASE` 为 FastGPT 的 OpenAPI 地址，例如：`https://api.fastgpt.in/api/v1`。

随便找一个目录，创建一个 docker-compose.yml 文件，将下面的代码复制进去。

```yml
version: '2.0'
services:
  chatgpt-on-wechat:
    image: zhayujie/chatgpt-on-wechat
    container_name: chatgpt-on-wechat
    security_opt:
      - seccomp:unconfined
    environment:
      OPEN_AI_API_KEY: 'fastgpt-z51pkjqm9nrk03a1rx2funoy'
      OPEN_AI_API_BASE: 'https://api.fastgpt.in/api/v1'
      MODEL: 'gpt-3.5-turbo'
      CHANNEL_TYPE: 'wx'
      PROXY: ''
      HOT_RELOAD: 'False'
      SINGLE_CHAT_PREFIX: '["bot", "@bot"]'
      SINGLE_CHAT_REPLY_PREFIX: '"[bot] "'
      GROUP_CHAT_PREFIX: '["@bot"]'
      GROUP_NAME_WHITE_LIST: '["ChatGPT测试群", "ChatGPT测试群2"]'
      IMAGE_CREATE_PREFIX: '["画", "看", "找"]'
      CONVERSATION_MAX_TOKENS: 1000
      SPEECH_RECOGNITION: 'False'
      CHARACTER_DESC: '你是ChatGPT, 一个由OpenAI训练的大型语言模型, 你旨在回答并解决人们的任何问题，并且可以使用多种语言与人交流。'
      SUBSCRIBE_MSG: '感谢您的关注！\n这里是ChatGPT，可以自由对话。\n支持语音对话。\n支持图片输入。\n支持图片输出，画字开头的消息将按要求创作图片。\n支持tool、角色扮演和文字冒险等丰富的插件。\n输入{trigger_prefix}#help 查看详细指令。'
      EXPIRES_IN_SECONDS: 3600
      USE_GLOBAL_PLUGIN_CONFIG: 'True'
      USE_LINKAI: 'False'
      LINKAI_API_KEY: ''
      LINKAI_APP_CODE: ''

```

## 4. 运行 chatgpt-on-wechat

```bash
docker-compose pull
docker-compose up -d
```

* 运行成功后会提示扫码登录
* 随便找个账号，私信发送: bot问题  会将 问题 传到 FastGPT 进行回答。