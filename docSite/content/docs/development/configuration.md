---
title: '配置文件介绍'
description: 'FastGPT 配置参数介绍'
icon: 'settings'
draft: false
toc: true
weight: 520
---

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 `client/data/config.json` 看到默认的配置文件。可以参考 [docker-compose 快速部署](/docs/installation/docker/) 来挂载配置文件。

**开发环境下**，你需要将示例配置文件 `config.json` 复制成 `config.local.json` 文件才会生效。

这个配置文件中包含了前端页面定制、系统级参数、AI 对话的模型等……

{{% alert context="warning" %}}
注意：下面的配置介绍仅是局部介绍，你需要完整挂载整个 `config.json`，不能仅挂载一部分。你可以直接在默认的 config.json 基础上根据下面的介绍进行修改。挂载上去的配置文件不能包含注释。
{{% /alert %}}

## 基础字段粗略说明

这里介绍一些基础的配置字段：

```json
// 这个配置会控制前端的一些样式
"FeConfig": {
    "show_emptyChat": true, // 对话页面，空内容时，是否展示介绍页
    "show_register": false, // 是否展示注册按键（包括忘记密码，注册账号和三方登录）
    "show_appStore": false, // 是否展示应用市场（不过目前权限还没做好，放开也没用）
    "show_userDetail": false, // 是否展示用户详情（账号余额、OpenAI 绑定）
    "show_git": true, // 是否展示 Git
    "systemTitle": "FastGPT", // 系统的 title
    "authorText": "Made by FastGPT Team.", // 签名
},
...
...
// 这个配置文件是系统级参数
"SystemParams": {
    "vectorMaxProcess": 15, // 向量生成最大进程，结合数据库性能和 key 来设置
    "qaMaxProcess": 15,  // QA 生成最大进程，结合数据库性能和 key 来设置
    "pgIvfflatProbe": 20  // pg vector 搜索探针。没有设置索引前可忽略，通常 50w 组以上才需要设置。
},
...
```

## 完整配置参数

```json
{
  "FeConfig": {
    "show_emptyChat": true,
    "show_register": false,
    "show_appStore": false,
    "show_userDetail": false,
    "show_git": true,
    "systemTitle": "FastGPT",
    "authorText": "Made by FastGPT Team.",
    "scripts": []
  },
  "SystemParams": {
    "vectorMaxProcess": 15,
    "qaMaxProcess": 15,
    "pgIvfflatProbe": 20
  },
  "plugins": {},
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
  "QAModel": {
    "model": "gpt-3.5-turbo-16k",
    "name": "GPT35-16k",
    "maxToken": 16000,
    "price": 0
  },
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
