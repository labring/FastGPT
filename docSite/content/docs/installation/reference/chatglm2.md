---
title: "接入 ChatGLM2-6B"
description: " 将 FastGPT 接入私有化模型 ChatGLM2-6B"
icon: "model_training"
draft: false
toc: true
weight: 753
---

## 前言

FastGPT 允许你使用自己的 OpenAI API KEY 来快速调用 OpenAI 接口，目前集成了 GPT-3.5, GPT-4 和 embedding，可构建自己的知识库。但考虑到数据安全的问题，我们并不能将所有的数据都交付给云端大模型。

那么如何在 FastGPT 上接入私有化模型呢？本文就以清华的 ChatGLM2 为例，为各位讲解如何在 FastGPT 中接入私有化模型。

## ChatGLM2-6B 简介

ChatGLM2-6B 是开源中英双语对话模型 ChatGLM-6B 的第二代版本，具体介绍可参阅 [ChatGLM2-6B 项目主页](https://github.com/THUDM/ChatGLM2-6B)。

{{% alert context="warning" %}}
注意，ChatGLM2-6B 权重对学术研究完全开放，在获得官方的书面许可后，亦允许商业使用。本教程只是介绍了一种用法，无权给予任何授权！
{{% /alert %}}

## 推荐配置

依据官方数据，同样是生成 8192 长度，量化等级为 FP16 要占用 12.8GB  显存、int8 为 8.1GB 显存、int4 为 5.1GB 显存，量化后会稍微影响性能，但不多。

因此推荐配置如下：

{{< table "table-hover table-striped" >}}
| 类型 | 内存    | 显存    | 硬盘空间 | 启动命令                  |
|------|---------|---------|----------|--------------------------|
| fp16 | >=16GB  | >=16GB  | >=25GB   | python openai_api.py 16  |
| int8 | >=16GB  | >=9GB   | >=25GB   | python openai_api.py 8   |
| int4 | >=16GB  | >=6GB   | >=25GB   | python openai_api.py 4   |
{{< /table >}}

## 环境配置

+ Python 3.8.10
+ CUDA 11.8
+ 科学上网环境

## 部署步骤

1. 根据上面的环境配置配置好环境，具体教程自行 GPT；
2. 在命令行输入命令 `pip install -r requirments.txt`；
3. 打开你需要启动的 py 文件，在代码的第 76 行配置 token，这里的 token 只是加一层验证，防止接口被人盗用；
4. 执行命令 `python openai_api.py 16`。这里的数字根据上面的配置进行选择。

然后等待模型下载，直到模型加载完毕为止。如果出现报错先问 GPT。

启动成功后应该会显示如下地址：

![](/imgs/chatglm2.png)

> 这里的 `http://0.0.0.0:6006` 就是连接地址。

然后现在回到 .env.local 文件，依照以下方式配置地址：

```bash
OPENAI_BASE_URL=http://127.0.0.1:6006/v1
OPENAIKEY=sk-aaabbbcccdddeeefffggghhhiiijjjkkk # 这里是你在代码中配置的 token，这里的 OPENAIKEY 可以任意填写
```

这样就成功接入 ChatGLM2-6B 了。
