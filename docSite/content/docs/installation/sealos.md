---
title: "Sealos 一键部署"
description: "使用 Sealos 一键部署 FastGPT"
icon: "cloud"
draft: false
toc: true
weight: 710
---

Sealos 的服务器在国外，不需要额外处理网络问题，无需服务器、无需魔法、无需域名，支持高并发 & 动态伸缩。点击以下按钮即可一键部署 👇

[![](https://fastly.jsdelivr.net/gh/labring-actions/templates@main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Dfastgpt)

由于需要部署数据库，部署完后需要等待 2~4 分钟才能正常访问。默认用了最低配置，首次访问时会有些慢。

![](/imgs/sealos1.png)

点击 Sealos 提供的外网地址即可打开 FastGPT 的可视化界面。

![](/imgs/sealos2.png)

> 用户名：`root`
> 
> 密码就是刚刚一键部署时设置的环境变量

## 部署架构图

![](/imgs/sealos-fastgpt.webp)