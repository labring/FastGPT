---
title: '快速了解 FastGPT'
description: 'FastGPT 的能力与优势'
icon: 'rocket_launch'
draft: false
toc: true
weight: -10
---

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

{{% alert icon="🤖 " context="success" %}}
FastGPT 在线使用：[https://tryfastgpt.ai](https://tryfastgpt.ai)
{{% /alert %}}

|                       |                       |
| --------------------- | --------------------- |
| ![](/imgs/intro1.webp) | ![](/imgs/intro2.png) |
| ![](/imgs/intro3.png) | ![](/imgs/intro4.png) |

## FastGPT 能力

### 1. 专属 AI 客服

通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。

![](/imgs/ability1.png)

### 2. 简单易用的可视化界面

FastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。

![](/imgs/ability5.png)

### 3. 自动数据预处理

提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。

![](/imgs/ability2.png)

### 4. 工作流编排

基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。

![](/imgs/ability3.png)

### 5. 强大的 API 集成

FastGPT 对外的 API 接口对齐了 OpenAI 官方接口，可以直接接入现有的 GPT 应用，也可以轻松集成到企业微信、公众号、飞书等平台。

![](/imgs/ability4.png)

## FastGPT 特点

1. **项目开源**

   FastGPT 遵循附加条件 Apache License 2.0 开源协议，你可以 [Fork](https://github.com/labring/FastGPT/fork) 之后进行二次开发和发布。FastGPT 社区版将保留核心功能，商业版仅在社区版基础上使用 API 的形式进行扩展，不影响学习使用。

2. **独特的 QA 结构**

   针对客服问答场景设计的 QA 结构，提高在大量数据场景中的问答准确性。

3. **可视化工作流**

   通过 Flow 模块展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。

4. **无限扩展**

   基于 API 进行扩展，无需修改 FastGPT 源码，也可快速接入现有的程序中。

5. **便于调试**

   提供搜索测试、引用修改、完整对话预览等多种调试途径。

6. **支持多种模型**

   支持 GPT、Claude、文心一言等多种 LLM 模型，未来也将支持自定义的向量模型。

## 知识库核心流程图

![](/imgs/functional-arch.webp)

