---
title: "教程 - 接入飞书机器人"
description: "FastGPT 接入飞书机器人"
icon: "chat"
draft: false
toc: true
weight: 507
---
## 1. 申请飞书应用

开一个免费的测试企业更方便进行调试。

1. 在飞书开放平台的开发者后台申请企业自建应用。
![图片](/imgs/feishu-bot-1.png)

## 2. 在 FastGPT 新建发布渠道

1. 在fastgpt中选择想要接入的应用，在 发布渠道 页面，新建一个接入飞书机器人的发布渠道，填写好基础信息。
![图片](/imgs/feishu-bot-2.png)

2. 在飞书开放平台开发者后台，刚刚创建的企业自建应用中，获取应用的 App ID, App Secret 两个凭证
![图片](/imgs/feishu-bot-3.png)

填入飞书机器人接入的对话框里面。
![图片](/imgs/feishu-bot-4.png)
3. （可选）在飞书开放平台开发者后台，点击事件与回调 -> 加密策略 获取 Encrypt Key，并填入飞书机器人接入的对话框里面

![图片](/imgs/feishu-bot-5.png)
Encrypt Key 用于加密飞书服务器与 FastGPT 之间通信。
建议如果使用 Https 协议，则不需要 Encrypt Key。如果使用 Http 协议通信，则建议使用 Encrypt Key
Verification Token 默认生成的这个 Token 用于校验来源。但我们使用飞书官方推荐的另一种更为安全的校验方式，因此可以忽略这个配置项。
## 3. 获取请求地址
1. 确认新建发布渠道，将链接复制到飞书开放平台开发者后台的“事件配置”中的“配置订阅方式”中的”请求地址“中
![图片](/imgs/feishu-bot-6.png)

## 4. 配置机器人事件
在飞书开放平台开发者后台，给这个机器人配置权限

1. 添加“接收消息” 事件
![图片](/imgs/feishu-bot-7.png)
或者直接复制 im.message.receive_v1 填入以添加事件 “接收消息”

2. 权限设置
![图片](/imgs/feishu-bot-8.png)

不推荐启用上图中的两个“历史版本”，而是使用新版本的权限。
- 若开启 “读取用户发给机器人的单聊消息”， 则单聊发送给机器人的消息将被送到 FastGPT
- 若开启 “接收群聊中@机器人消息事件”， 则群聊中@机器人的消息将被送到 FastGPT
- 若开启（不推荐开启）“获取群组中所有消息”，则群聊中所有消息都将被送到 FastGPT
## 5. 配置完成
然后就可以在工作台里找到你的机器人啦
![图片](/imgs/feishu-bot-9.png)
