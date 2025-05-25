---
title: '飞书知识库'
description: 'FastGPT 飞书知识库功能介绍和使用方式'
icon: 'language'
draft: false
toc: true
weight: 405
---

| | |
| --- | --- |
| ![alt text](/imgs/feishuKnowledge-2.png) | ![alt text](/imgs/image-40.png) |

目前，FastGPT用户支持飞书知识库导入，用户可以通过配置飞书应用的 appId 和 appSecret，来导入飞书知识库。目前处于测试阶段，部分交互有待优化。

由于飞书限制，无法在一个知识库中同时支持获取飞书云空间个人文件，飞书云空间共享文件和飞书知识库。目前仅可以获取飞书知识库和共享空间下文件目录的内容[点击这里](./lark_share_dataset.md)，无法获取个人空间的内容。


## 1. 创建飞书应用

打开 [飞书开放平台](https://open.feishu.cn/?lang=zh-CN)，点击**创建应用**，选择**自建应用**，然后填写应用名称。

## 2. 配置应用权限

创建应用后，进入应用可以配置相关权限，这里需要增加**4个权限**：

1. 查看、编辑和管理知识库
2. 查看知识空间信息
3. 查看、评论、编辑和管理云空间中所有文件
4. 获取企业信息

![alt text](/imgs/image-41.png)

## 3. 获取 appId 和 appSecret

![alt text](/imgs/image-42.png)

## 4. 给 Folder 增加权限

可参考飞书教程： https://open.feishu.cn/document/server-docs/docs/drive-v1/faq#b02e5bfb

大致总结为：

1. 把刚刚创建的应用拉入一个群里
2. 给这个群增加目录权限

如果你的目录已经给全员组增加权限了，则可以跳过上面步骤。

![alt text](/imgs/image-43.png)

## 5. 设置知识库路径

考虑到部分用户的知识库文件层级过多，每次获取文件可能都要逐级打开。现在，知识库支持选择路径，填写好 appId 和 appSecret 后，用户可以点击选择，进入图形界面选择自己想要的路径。

![alt text](/imgs/feishuKnowledge-1.png)

例如，想这个知识库只获取 `/商业化部门/部门新人入职 `这里面的文件，那么可以选择到`部门新人入职`后，点击确认，这样创建好知识库后，就会只获取这个文件夹里的内容。

## 6. 创建知识库

根据 3 获取到的 2 个参数，创建知识库，选择**飞书知识库**类型，然后填入对应的参数，点击创建。

![alt text](/imgs/feishuKnowledge-2.png)