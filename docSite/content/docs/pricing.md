---
title: '线上版定价'
description: 'FastGPT 线上版定价'
icon: 'currency_yen'
draft: false
toc: true
weight: 11
---

## Tokens 说明
[OpenAI 的 API 官方计费模式](https://openai.com/pricing#language-models)为：按每次 API 请求内容和返回内容 tokens 长度来定价。每个模型具有不同的计价方式，以每 1,000 个 tokens 消耗为单位定价。其中 1,000 个 tokens 约为 900 个英文，约 600 个中文（不是很准确，与上下长度有关，相同的词出现越多，词:Tokens 的比例越大）。平台的 tokens 数量计算算法与 OpenAI 一致，您可以随时通过「使用记录」来查看余额消耗明细的说明，来对比计算是否一致。

![](/imgs/fastgpt-price.png)


## FastGPT 线上计费

使用: [https://fastgpt.run](https://fastgpt.run) 或  [https://ai.fastgpt.in](https://ai.fastgpt.in) 只需仅按 Tokens 使用数量扣费即可。可在 账号-使用记录 中查看具体使用情况，以下是详细的计费表（最新定价以线上表格为准，可在点击充值后实时获取）：

{{< table "table-hover table-striped-columns" >}}
| 计费项                 | 价格: 元/ 1K tokens（包含上下文） |
| ---------------------- | --------------------------------- |
| 知识库 - 索引          | 0.002                             |
| 文件 QA 拆分           | 0.03                              |
| FastAI-4k - 对话       | 0.015                             |
| FastAI-16k - 对话      | 0.03                              |
| FastAI-Plus-8k - 对话  | 0.45                              |
| FastAI-Plus-32k - 对话 | 0.85                              |
| 文心一言 - 对话        | 0.012                             |
| 星火2.0 - 对话         | 0.01                              |
| chatglm_pro - 对话     | 0.01                              |
| 通义千问 - 对话         | 0.01                              |
| 问题分类         | 0.03                             |
| 内容提取         | 0.03                             |
| 下一步指引         | 0.015                              |

{{< /table >}}

{{% alert context="warning" %}}
FastAI-Plus（也就是 GPT-4，你懂得） 系列模型 OpenAI 的定价高于 3.5 **几十倍**。如果您使用模型的场景字数较多，使用 FastAI-Plus 模型将产生非常大的消耗，FastAI-Plus 模型分为两个版本，8K token 内容上限和 32K token 内容上限，这两个版本请求响应的价格均不同。
{{% /alert %}}