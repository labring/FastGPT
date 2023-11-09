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

## 修改配置文件和环境变量

在 Sealos 中，你可以打开`应用管理`（App Launchpad）看到部署的 FastGPT，可以打开`数据库`（Database）看到对应的数据库。

在`应用管理`中，选中 FastGPT，点击变更，可以看到对应的环境变量和配置文件。

![](/imgs/fastgptonsealos1.png)

{{% alert icon="🤖 " context="success" %}}
在 Sealos 上，FastGPT 一共运行了 1 个服务和 2 个数据库，如暂停和删除请注意数据库一同操作。（你可以白天启动，晚上暂停它们，省钱大法）
{{% /alert %}}

## 更新

点击重启会自动拉取最新镜像更新，请确保镜像`tag`正确。

## 部署架构图

![](/imgs/sealos-fastgpt.webp)