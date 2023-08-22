---
title: "部署 one-api，实现多模型支持"
description: "通过接入 one-api 来实现对各种大模型的支持"
icon: "Api"
draft: false
toc: true
weight: 730
---

[one-api](https://github.com/songquanpeng/one-api) 是一个 OpenAI 接口管理 & 分发系统，可以通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。

FastGPT 可以通过接入 one-api 来实现对各种大模型的支持。部署方法也很简单，直接点击以下按钮即可一键部署 👇

[![](https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Done-api)

部署完后会跳转「应用管理」，数据库在另一个应用「数据库」中。需要等待 1~3 分钟数据库运行后才能访问成功。

配置好 one-api 的模型后，可以直接修改 FastGPT 的环境变量：

```bash
# 下面的地址是 Sealos 提供的，务必写上 v1
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# 下面的 key 由 one-api 提供
CHAT_API_KEY=sk-xxxxxx
```