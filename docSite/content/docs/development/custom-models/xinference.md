---
title: '接入 Xinference'
description: '将 Xinference 接入 FastGPT'
icon: 'model_training'
draft: false
toc: true
weight: 910
---

## Xinference简介

Xorbits inference 是一个功能强大且多功能的库，旨在服务于语言、语音识别和多模式模型，具体介绍可参阅 [Xorbits inference 项目主页](https://github.com/xorbitsai/inference)。

## 部署

请注意，您通常不需要手动查找 Docker 容器的 IP 地址来访问服务，因为 Docker 提供了端口映射功能。这允许您将容器端口映射到本地计算机端口，从而可以通过本地地址进行访问。例如，如果您`-p 80:80`在运行容器时使用了该参数，则可以通过访问`http://localhost:80`或来访问容器内的服务`http://127.0.0.1:80`。

如果您确实需要直接使用容器的IP地址，上述步骤将帮助您获取此信息。

## 本地部署

1. 首先，通过 PyPI 安装 Xinference：

```
$ pip install "xinference[all]"
```

2. 本地启动Xinference：

```
$ xinference-local
2024-04-16 06:46:39,265 xinference   10148 INFO     Xinference successfully started. Endpoint: http://127.0.0.1:9997
2024-04-16 06:46:39,266 xinference.core.supervisor 10148 INFO     Worker 127.0.0.1:37822 has been added successfully
2024-04-16 06:46:39,267 xinference.deploy.worker 10148 INFO     Xinference worker successfully started.
```

Xinference默认会在本地启动一个worker，端点为：`http://127.0.0.1:9997`，默认端口为`9997`。默认情况下，访问仅限于本地计算机，但可以配置为`-H 0.0.0.0`允许任何非本地客户端的访问。修改主机或端口可以参考xinference的帮助信息：`xinference-local --help`。

3. 创建并部署模型

访问`http://127.0.0.1:9997`，选择您需要部署的型号和规格，如下图：

![图片xinference-running-models](https://github.com/EthanD4869/xinference-pic/blob/main/xinference-running-models.png?raw=true)

由于不同的模型在不同的硬件平台上的兼容性不同，请参考[Xinference内置模型](https://inference.readthedocs.io/en/latest/models/builtin/index.html)，以确保创建的模型支持当前的硬件平台。

4. 获取模型UID

从页面复制模型 ID `Running Models`，例如：`qwen1.5-chat`


## 接入One API

为 qwen1.5-chat 添加一个渠道，参数如下：

![图片one-api](https://github.com/EthanD4869/xinference-pic/blob/main/one-api.png?raw=true)

这里我填入 qwen1.5-chat 作为语言模型

## 测试

curl 例子：

```
curl --location --request POST 'https://domain/v1/chat/completions' \
--header 'Authorization: Bearer sk-aaabbbcccdddeeefffggghhhiiijjjkkk' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "qwen1.5-chat",
  "messages": [{"role": "user", "content": "Hello!"}]
}'
```

Authorization 为 sk-aaabbbcccdddeeefffggghhhiiijjjkkk。model 为刚刚在 One API 填写的自定义模型。

## 接入 FastGPT

修改 config.json 配置文件，在 chatModels 中加入 qwen1.5-chat 模型：

```
"chatModels": [
  //已有模型
  {
    "model": "qwen1.5-chat",
    "name": "qwen1.5-chat",
    "maxContext": 2048,
    "maxResponse": 2048,
    "quoteMaxToken": 2000,
    "maxTemperature": 1,
    "vision": false,
    "defaultSystemChatPrompt": ""
  }
]
```

## 测试使用

qwen1.5-chat 模型的使用方法如下：

模型选择 qwen1.5-chat 即可
