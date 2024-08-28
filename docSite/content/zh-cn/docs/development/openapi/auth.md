---
title: 'Api Key 使用与鉴权'
description: 'FastGPT Api Key 使用与鉴权'
icon: 'key'
draft: false
toc: true
weight: 851
---

## 使用说明

FasGPT OpenAPI 接口允许你使用 Api Key 进行鉴权，从而操作 FastGPT 上的相关服务和资源，例如：调用应用对话接口、上传知识库数据、搜索测试等等。出于兼容性和安全考虑，并不是所有的接口都允许通过 Api Key 访问。

## 如何查看 BaseURL

**注意：BaseURL 不是接口地址，而是所有接口的根地址，直接请求 BaseURL 是没有用的。**

![](/imgs/fastgpt-api-baseurl.png)

## 如何获取 Api Key

FastGPT 的 API Key **有 2 类**，一类是全局通用的 key (无法直接调用应用对话)；一类是携带了 AppId 也就是有应用标记的 key (可直接调用应用对话)。

我们建议，仅操作应用或者对话的相关接口使用 `应用特定key`，其他接口使用 `通用key`。

|        通用key               |           应用特定 key            |
| --------------------- | --------------------- |
| ![](/imgs/fastgpt-api2.jpg) | ![](/imgs/fastgpt-api.jpg) |

## 基本配置

OpenAPI 中，所有的接口都通过 Header.Authorization 进行鉴权。

```
baseUrl: "https://api.fastgpt.in/api"
headers: {
    Authorization: "Bearer {{apikey}}"
}
```

**发起应用对话示例**

```sh
curl --location --request POST 'https://api.fastgpt.in/api/v1/chat/completions' \
--header 'Authorization: Bearer fastgpt-xxxxxx' \
--header 'Content-Type: application/json' \
--data-raw '{
    "chatId": "111",
    "stream": false,
    "detail": false,
    "messages": [
        {
            "content": "导演是谁",
            "role": "user"
        }
    ]
}'
```