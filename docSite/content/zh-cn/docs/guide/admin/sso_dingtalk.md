---
weight: 490
title: '钉钉 SSO 配置'
description: '钉钉 SSO 登录'
icon: 'chat_bubble'
draft: false
images: []
---

## 1. 注册钉钉应用

登录 [钉钉开放平台](https://open-dev.dingtalk.com/fe/app?hash=%23%2Fcorp%2Fapp#/corp/app)，创建一个应用。

![alt text](/imgs/image-25.png)

## 2. 配置钉钉应用安全设置

点击进入创建好的应用后，点开`安全设置`，配置出口 IP（服务器 IP），和重定向 URL。重定向 URL 填写逻辑：

`{{fastgpt 域名}}/login/provider`

![alt text](/imgs/image-26.png)

## 3. 设置钉钉应用权限

点击进入创建好的应用后，点开`权限设置`，开放两个权限： `个人手机号信息`和`通讯录个人信息读权限`

![alt text](/imgs/image-27.png)

## 4. 发布应用

点击进入创建好的应用后，点开`版本管理与发布`，随便创建一个新版本即可。

## 5. 在 FastGPT Admin 配置钉钉应用 id

名字都是对应上，直接填写即可。

| | |
| --- | --- |
| ![alt text](/imgs/image-28.png)| ![alt text](/imgs/image-29.png) |

## 6. 测试

![alt text](/imgs/image-30.png)