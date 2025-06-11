---
title: '使用 Xinference 接入本地模型'
description: '一站式本地 LLM 私有化部署'
icon: 'api'
draft: false
toc: true
weight: 910
---

[Xinference](https://github.com/xorbitsai/inference) 是一款开源模型推理平台，除了支持 LLM，它还可以部署 Embedding 和 ReRank 模型，这在企业级 RAG 构建中非常关键。同时，Xinference 还提供 Function Calling 等高级功能。还支持分布式部署，也就是说，随着未来应用调用量的增长，它可以进行水平扩展。

## 安装 Xinference

Xinference 支持多种推理引擎作为后端，以满足不同场景下部署大模型的需要，下面会分使用场景来介绍一下这三种推理后端，以及他们的使用方法。

### 1. 服务器

如果你的目标是在一台 Linux 或者 Window 服务器上部署大模型，可以选择 Transformers 或 vLLM 作为 Xinference 的推理后端：

+ [Transformers](https://huggingface.co/docs/transformers/index)：通过集成 Huggingface 的 Transformers 库作为后端，Xinference 可以最快地 集成当今自然语言处理（NLP）领域的最前沿模型（自然也包括 LLM）。
+ [vLLM](https://vllm.ai/): vLLM 是由加州大学伯克利分校开发的一个开源库，专为高效服务大型语言模型（LLM）而设计。它引入了 PagedAttention 算法， 通过有效管理注意力键和值来改善内存管理，吞吐量能够达到 Transformers 的 24 倍，因此 vLLM 适合在生产环境中使用，应对高并发的用户访问。

假设你服务器配备 NVIDIA 显卡，可以参考[这篇文章中的指令来安装 CUDA](https://xorbits.cn/blogs/langchain-streamlit-doc-chat)，从而让 Xinference 最大限度地利用显卡的加速功能。

#### Docker 部署

你可以使用 Xinference 官方的 Docker 镜像来一键安装和启动 Xinference 服务（确保你的机器上已经安装了 Docker），命令如下：

```bash
docker run  -p 9997:9997 --gpus all xprobe/xinference:latest xinference-local -H 0.0.0.0
```

#### 直接部署

首先我们需要准备一个 3.9 以上的 Python 环境运行来 Xinference，建议先根据 conda 官网文档安装 conda。 然后使用以下命令来创建 3.11 的 Python 环境：

```bash
conda create --name py311 python=3.11
conda activate py311
```

以下两条命令在安装 Xinference 时，将安装 Transformers 和 vLLM 作为 Xinference 的推理引擎后端：

```bash
pip install "xinference[transformers]"
pip install "xinference[vllm]"
pip install "xinference[transformers,vllm]" # 同时安装
```

PyPi 在 安装 Transformers 和 vLLM 时会自动安装 PyTorch，但自动安装的 CUDA 版本可能与你的环境不匹配，此时你可以根据 PyTorch 官网中的[安装指南](https://pytorch.org/get-started/locally/)来手动安装。

只需要输入如下命令，就可以在服务上启动 Xinference 服务：

```bash
xinference-local -H 0.0.0.0
```

Xinference 默认会在本地启动服务，端口默认为 9997。因为这里配置了-H 0.0.0.0参数，非本地客户端也可以通过机器的 IP 地址来访问 Xinference 服务。

### 2. 个人设备

如果你想在自己的 Macbook 或者个人电脑上部署大模型，推荐安装 CTransformers 作为 Xinference 的推理后端。CTransformers 是用 GGML 实现的 C++ 版本 Transformers。

[GGML](https://ggml.ai/) 是一个能让大语言模型在[消费级硬件上运行](https://github.com/ggerganov/llama.cpp/discussions/205)的 C++ 库。 GGML 最大的特色在于模型量化。量化一个大语言模型其实就是降低权重表示精度的过程，从而减少使用模型所需的资源。 例如，表示一个高精度浮点数（例如 0.0001）比表示一个低精度浮点数（例如 0.1）需要更多空间。由于 LLM 在推理时需要加载到内存中的，因此你需要花费硬盘空间来存储它们，并且在执行期间有足够大的 RAM 来加载它们，GGML 支持许多不同的量化策略，每种策略在效率和性能之间提供不同的权衡。

通过以下命令来安装 CTransformers 作为 Xinference 的推理后端：

```bash
pip install xinference
pip install ctransformers
```

因为 GGML 是一个 C++ 库，Xinference 通过 `llama-cpp-python` 这个库来实现语言绑定。对于不同的硬件平台，我们需要使用不同的编译参数来安装：

- Apple Metal（MPS）：`CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python`
- Nvidia GPU：`CMAKE_ARGS="-DLLAMA_CUBLAS=on" pip install llama-cpp-python`
- AMD GPU：`CMAKE_ARGS="-DLLAMA_HIPBLAS=on" pip install llama-cpp-python`

安装后只需要输入 `xinference-local`，就可以在你的 Mac 上启动 Xinference 服务。

## 创建并部署模型（以 Qwen-14B 模型为例）

### 1. WebUI 方式启动模型

Xinference 启动之后，在浏览器中输入: `http://127.0.0.1:9997`，我们可以访问到本地 Xinference 的 Web UI。

打开“Launch Model”标签，搜索到 qwen-chat，选择模型启动的相关参数，然后点击模型卡片左下方的小火箭🚀按钮，就可以部署该模型到 Xinference。 默认 Model UID 是 qwen-chat（后续通过将通过这个 ID 来访问模型）。

![](/imgs/xinference-launch-model.png)

当你第一次启动 Qwen 模型时，Xinference 会从 HuggingFace 下载模型参数，大概需要几分钟的时间。Xinference 将模型文件缓存在本地，这样之后启动时就不需要重新下载了。 Xinference 还支持从其他模型站点下载模型文件，例如 [modelscope](https://inference.readthedocs.io/en/latest/models/sources/sources.html)。

### 2. 命令行方式启动模型

我们也可以使用 Xinference 的命令行工具来启动模型，默认 Model UID 是 qwen-chat（后续通过将通过这个 ID 来访问模型）。

```bash
xinference launch -n qwen-chat -s 14 -f pytorch
```

除了 WebUI 和命令行工具， Xinference 还提供了 Python SDK 和 RESTful API 等多种交互方式， 更多用法可以参考 [Xinference 官方文档](https://inference.readthedocs.io/en/latest/getting_started/index.html)。

## 将本地模型接入 One API

One API 的部署和接入请参考[这里](/docs/development/modelconfig/one-api/)。

为 qwen1.5-chat 添加一个渠道，这里的 Base URL 需要填 Xinference 服务的端点，并且注册 qwen-chat (模型的 UID) 。

![](/imgs/one-api-add-xinference-models.jpg)

可以使用以下命令进行测试：

```bash
curl --location --request POST 'https://<oneapi_url>/v1/chat/completions' \
--header 'Authorization: Bearer <oneapi_token>' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "qwen-chat",
  "messages": [{"role": "user", "content": "Hello!"}]
}'
```

将 <oneapi_url> 替换为你的 One API 地址，<oneapi_token> 替换为你的 One API 令牌。model 为刚刚在 One API 填写的自定义模型。

## 将本地模型接入 FastGPT

修改 FastGPT 的 `config.json` 配置文件的 llmModels 部分加入 qwen-chat 模型：

```json
...
  "llmModels": [
    {
      "model": "qwen-chat", // 模型名(对应OneAPI中渠道的模型名)
      "name": "Qwen", // 模型别名
      "avatar": "/imgs/model/Qwen.svg", // 模型的logo
      "maxContext": 125000, // 最大上下文
      "maxResponse": 4000, // 最大回复
      "quoteMaxToken": 120000, // 最大引用内容
      "maxTemperature": 1.2, // 最大温度
      "charsPointsPrice": 0, // n积分/1k token（商业版）
      "censor": false, // 是否开启敏感校验（商业版）
      "vision": true, // 是否支持图片输入
      "datasetProcess": true, // 是否设置为知识库处理模型（QA），务必保证至少有一个为true，否则知识库会报错
      "usedInClassify": true, // 是否用于问题分类（务必保证至少有一个为true）
      "usedInExtractFields": true, // 是否用于内容提取（务必保证至少有一个为true）
      "usedInToolCall": true, // 是否用于工具调用（务必保证至少有一个为true）
      "toolChoice": true, // 是否支持工具选择（分类，内容提取，工具调用会用到。）
      "functionCall": false, // 是否支持函数调用（分类，内容提取，工具调用会用到。会优先使用 toolChoice，如果为false，则使用 functionCall，如果仍为 false，则使用提示词模式）
      "defaultSystemChatPrompt": "", // 对话默认携带的系统提示词
      "defaultConfig": {} // 请求API时，挟带一些默认配置（比如 GLM4 的 top_p）
    }
  ],
...
```

然后重启 FastGPT 就可以在应用配置中选择 Qwen 模型进行对话：

![](/imgs/fastgpt-list-models.png)

---

+ 参考：[FastGPT + Xinference：一站式本地 LLM 私有化部署和应用开发](https://xorbits.cn/blogs/fastgpt-weather-chat)


