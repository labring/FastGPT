---
title: '通过 PPIO LLM API 接入模型'
description: '通过 PPIO LLM API 接入模型'
icon: 'api'
draft: false
toc: true
weight: 747
---

FastGPT 还可以通过 PPIO LLM API 接入模型。
{{% alert context="warning" %}}
以下内容搬运自 [FastGPT 接入 PPIO LLM API](https://ppinfra.com/docs/third-party/fastgpt-use)，可能会有更新不及时的情况。
{{% /alert %}}

FastGPT 是一个将 AI 开发、部署和使用全流程简化为可视化操作的平台。它使开发者不需要深入研究算法，
用户也不需要掌握复杂技术，通过一站式服务将人工智能技术变成易于使用的工具。

PPIO 派欧云提供简单易用的 API 接口，让开发者能够轻松调用 DeepSeek 等模型。

- 对开发者：无需重构架构，3 个接口完成从文本生成到决策推理的全场景接入，像搭积木一样设计 AI 工作流；
- 对生态：自动适配从中小应用到企业级系统的资源需求，让智能随业务自然生长。

下方教程提供完整接入方案（含密钥配置），帮助您快速将 FastGPT 与 PPIO API 连接起来。

## 1. 配置前置条件

(1) 获取 API 接口地址

固定为: `https://api.ppinfra.com/v3/openai/chat/completions`。

(2) 获取 【API 密钥】

登录派欧云控制台 [API 秘钥管理](https://www.ppinfra.com/settings/key-management) 页面，点击创建按钮。
注册账号填写邀请码【VOJL20】得 50 代金券

![1](https://static.ppinfra.com/docs/image/llm/BKWqbzI5PoYG6qxwAPxcinQDnob.png)

(3) 生成并保存 【API 密钥】
{{% alert context="warning" %}}
秘钥在服务端是加密存储，请在生成时保存好秘钥；若遗失可以在控制台上删除并创建一个新的秘钥。
{{% /alert %}}

![2](https://static.ppinfra.com/docs/image/llm/OkUwbbWrcoCY2SxwVMIcM2aZnrs.png)
![3](https://static.ppinfra.com/docs/image/llm/GExfbvcosoJhVKxpzKVczlsdn3d.png)

(4) 获取需要使用的模型 ID

deepseek 系列：

- DeepSeek R1：deepseek/deepseek-r1/community

- DeepSeek V3：deepseek/deepseek-v3/community

其他模型 ID、最大上下文及价格可参考：[模型列表](https://ppinfra.com/model-api/pricing)

## 2. 部署最新版 FastGPT 到本地环境
{{% alert context="warning" %}}
请使用 v4.8.22 以上版本，部署参考: https://doc.fastgpt.io/docs/development/intro/
{{% /alert %}}

## 3. 模型配置（下面两种方式二选其一）

（1）通过 OneAPI 接入模型 PPIO 模型： 参考 OneAPI 使用文档，修改 FastGPT 的环境变量 在 One API 生成令牌后，FastGPT 可以通过修改 baseurl 和 key 去请求到 One API，再由 One API 去请求不同的模型。修改下面两个环境变量： 务必写上 v1。如果在同一个网络内，可改成内网地址。

OPENAI_BASE_URL= http://OneAPI-IP:OneAPI-PORT/v1

下面的 key 是由 One API 提供的令牌 CHAT_API_KEY=sk-UyVQcpQWMU7ChTVl74B562C28e3c46Fe8f16E6D8AeF8736e

- 修改后重启 FastGPT，按下图在模型提供商中选择派欧云

![](https://static.ppinfra.com/docs/image/llm/Fvqzb3kTroys5Uxkjlzco7kwnsb.png)

- 测试连通性
以 deepseek 为例，在模型中选择使用 deepseek/deepseek-r1/community，点击图中②的位置进行连通性测试，出现图中绿色的的成功显示证明连通成功，可以进行后续的配置对话了
![](https://static.ppinfra.com/docs/image/llm/FzKGbGsSPoX4Eexobj2cxcaTnib.png)

（2）不使用 OneAPI 接入 PPIO 模型

按照下图在模型提供商中选择派欧云
![](https://static.ppinfra.com/docs/image/llm/QbcdbPqRsoAmuyx2nlycQWFanrc.png)

- 配置模型 自定义请求地址中输入：`https://api.ppinfra.com/v3/openai/chat/completions`
![](https://static.ppinfra.com/docs/image/llm/ZVyAbDIaxo7ksAxLI3HcexYYnZf.png)
![](https://static.ppinfra.com/docs/image/llm/Ha9YbggkwoQsVdx1Z4Gc9zUSnle.png)

- 测试连通性
![](https://static.ppinfra.com/docs/image/llm/V1f0b89uloab9uxxj7IcKT0rn3e.png)

出现图中绿色的的成功显示证明连通成功，可以进行对话配置

## 4. 配置对话
（1）新建工作台
![](https://static.ppinfra.com/docs/image/llm/ZaGpbBH6QoVubIx2TsLcwYEInfe.png)
（2）开始聊天
![](https://static.ppinfra.com/docs/image/llm/HzcTb4gobokVRQxTlU7cD5OunMf.png)

## PPIO 全新福利重磅来袭 🔥
顺利完成教程配置步骤后，您将解锁两大权益：1. 畅享 PPIO 高速通道与 FastGPT 的效能组合；2.立即激活 **「新用户邀请奖励」** ————通过专属邀请码邀好友注册，您与好友可各领 50 元代金券，硬核福利助力 AI 工具效率倍增！

🎁 新手专享：立即使用邀请码【VOJL20】完成注册，50 元代金券奖励即刻到账！
