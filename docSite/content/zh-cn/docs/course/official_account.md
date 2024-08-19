---
title: '接入微信公众号教程'
description: 'FastGPT 接入微信公众号教程'
icon: 'description'
draft: false
toc: true
weight: 113
---

**注意⚠️: 目前只支持通过验证的公众号（服务号和订阅号都可以）**

## 1. 在 FastGPT 新建发布渠道

在 FastGPT 中选择想要接入的应用，在 *发布渠道* 页面，新建一个接入微信公众号的发布渠道，填写好基础信息。

![图片](/imgs/offiaccount-1.png)

## 2. 登陆微信公众平台，获取 AppID 、 Secret和Token

### 1. https://mp.weixin.qq.com 登陆微信公众平台，选择您的公众号。

**只支持通过验证的公众号，未通过验证的公众号暂不支持。**

开发者可以从这个链接申请微信公众号的测试号进行测试，测试号可以正常使用，但不能配置 AES Key

![图片](/imgs/offiaccount-2.png)

### 2. 把3个参数填入 FastGPT 配置弹窗中。
![图片](/imgs/offiaccount-3.png)

## 3. 在 IP 白名单中加入 FastGPT 的 IP

![图片](/imgs/offiaccount-4.png)

## 4. 获取AES Key，选择加密方式

![图片](/imgs/offiaccount-5.png)

![图片](/imgs/offiaccount-6.png)

1. 随机生成AESKey，填入 FastGPT 配置弹窗中。

2. 选择加密方式为安全模式。

## 5. 获取 URL

1. 在FastGPT确认创建，获取URL。

![图片](/imgs/offiaccount-7.png)

2. 填入微信公众平台的 URL 处，然后提交保存
![图片](/imgs/offiaccount-8.png)

## 6. 启用服务器配置（如已自动启用，请忽略）
![图片](/imgs/offiaccount-9.png)

## 7. 开始使用

现在用户向公众号发消息，消息则会被转发到 FastGPT，通过公众号返回对话结果。
