---
title: 'API 文件库'
description: 'FastGPT API 文件库功能介绍和使用方式'
icon: 'language'
draft: false
toc: true
weight: 405
---

![](/imgs/api-dataset-1.png)

## 什么是 API 文件库
API 文件库能够让用户轻松对接已有的文档库，只需要按照 FastGPT 的 API 文件库规范，提供相应文件接口，然后将服务接口的 baseURL 和 token 填入知识库创建参数中，就能直接在页面上拿到文件库的内容，并选择性导入

## 如何使用 API 文件库
创建知识库时，选择 API 文件库类型，然后需要配置两个关键参数:文件服务接口的 baseURL 和用于身份验证的请求头信息。只要提供的接口规范符合 FastGPT 的要求，系统就能自动获取并展示完整的文件列表，可以根据需要选择性地将文件导入到知识库中

## 接口规范

### 1. 获取文件树

{{< tabs tabTotal="3" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST '{{baseURL}}/v1/file/list' \
--header 'Authorization: Bearer {{authorization}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "parentId": null,
    "searchKey": ""
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

{{% alert icon=" " context="success" %}}
- parentId - 可以不传，或者 null。字符串代表有值。
- searchKey - 可以不传
{{% /alert %}}

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

```json
{
    "code": 200,
    "success": true,
    "message": "",
    "data": [
            {
                "id": "xxxx",
                "parentId": "xxxx",
                "type": "file",  // or folder
                "name":"test.json",
                "updateTime":"2024-11-26T03:05:24.759Z",
                "createTime":"2024-11-26T03:05:24.759Z"
            }
   ]
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

### 2. 获取单个文件内容（文本内容或访问链接

{{< tabs tabTotal="3" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request GET '{{baseURL}}/v1/file/content?id=xx' \
--header 'Authorization: Bearer {{authorization}}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

```json
{
    "code": 200,
    "success": true,
    "message": "",
    "data": {
        "content": "FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！\n",
        "previewUrl": "xxxx"
    }
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

{{% alert icon=" " context="success" %}}
二选一返回，如果同时返回则 content 优先级更高
- content - 文件内容
- previewUrl - 文件链接
{{% /alert %}}

{{< /markdownify >}}
{{< /tab >}}

{{< /tabs >}}




### 3. 获取文件阅读链接（用于查看原文

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request GET '{{baseURL}}/v1/file/read?id=xx' \
--header 'Authorization: Bearer {{authorization}}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

```json
{
    "code": 200,
    "success": true,
    "message": "",
    "data": {
        "url": "xxxx"
    }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


