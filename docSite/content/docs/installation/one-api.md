---
title: '部署 one-api，实现多模型支持'
description: '通过接入 one-api 来实现对各种大模型的支持'
icon: 'Api'
draft: false
toc: true
weight: 730
---

[one-api](https://github.com/songquanpeng/one-api) 是一个 OpenAI 接口管理 & 分发系统，可以通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。

FastGPT 可以通过接入 one-api 来实现对各种大模型的支持。部署方法也很简单。

## MySQL 版本

MySQL 版本支持多实例，高并发。

直接点击以下按钮即可一键部署 👇

[![](https://cdn.jsdelivr.us/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Done-api)

部署完后会跳转「应用管理」，数据库在另一个应用「数据库」中。需要等待 1~3 分钟数据库运行后才能访问成功。

## SqlLite 版本

SqlLite 版本不支持多实例，适合个人小流量使用，但是价格非常便宜。

**1. [点击打开 Sealos 公有云](https://cloud.sealos.io/)**

**2. 打开 AppLaunchpad(应用管理) 工具**

![step1](/imgs/oneapi/step1.png)

**3. 点击创建新应用**

**4. 填写对应参数**

镜像：ghcr.io/songquanpeng/one-api:latest

![step2](/imgs/oneapi/step2.png)
打开外网访问开关后，Sealos 会自动分配一个可访问的地址，不需要自己配置。

![step3](/imgs/oneapi/step3.png)
填写完参数后，点击右上角部署即可。

## 使用步骤

**1. 登录 one-api**

打开 【one-api 应用详情】，找到访问地址：
![step4](/imgs/oneapi/step4.png)

登录 one-api
![step5](/imgs/oneapi/step5.png)

**2. 创建渠道和令牌**

在 one-api 中添加对应渠道，直接点击 【添加基础模型】，不要遗漏了向量模型
![step6](/imgs/oneapi/step6.png)

创建一个令牌
![step7](/imgs/oneapi/step7.png)

**3. 修改 FastGPT 的环境变量**

有了 one-api 令牌后，FastGPT 可以通过修改 baseurl 和 key 去请求到 one-api，再由 one-api 去请求不同的模型。修改下面两个环境变量：

```bash
# 下面的地址是 Sealos 提供的，务必写上 v1， 两个项目都在 sealos 部署时候，https://xxxx.cloud.sealos.io 可以改用内网地址
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# 下面的 key 是由 one-api 提供的令牌
CHAT_API_KEY=sk-xxxxxx
```
