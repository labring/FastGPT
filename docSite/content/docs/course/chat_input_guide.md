---
title: "对话问题引导"
description: "FastGPT 对话问题引导"
icon: "code"
draft: false
toc: true
weight: 350
---

![](/imgs/questionGuide.png)

## 什么是自定义问题引导

你可以为你的应用提前预设一些问题，用户在输入时，会根据输入的内容，动态搜索这些问题作为提示，从而引导用户更快的进行提问。

你可以直接在 FastGPT 中配置词库，或者提供自定义词库接口。

## 自定义词库接口

**请求：**

```bash
curl --location --request GET 'http://localhost:3000/api/core/chat/inputGuide/query?appId=663c75302caf8315b1c00194&searchKey=你'
```

**响应**

```json
{
  "code": 200,
  "statusText": "",
  "message": "",
  "data": [
    "是你",
    "你是谁呀",
    "你好好呀",
    "你好呀",
    "你是谁！",
    "你好"
  ]
}
```


**参数说明：**

- appId - 应用ID
- searchKey - 搜索关键字