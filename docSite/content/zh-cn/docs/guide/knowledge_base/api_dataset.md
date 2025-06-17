---
title: 'API 文件库'
description: 'FastGPT API 文件库功能介绍和使用方式'
icon: 'language'
draft: false
toc: true
weight: 405
---

| | |
| --- | --- |
| ![](/imgs/image-18.png) | ![](/imgs/image-19.png) |

## 背景

目前 FastGPT 支持本地文件导入，但是很多时候，用户自身已经有了一套文档库，如果把文件重复导入一遍，会造成二次存储，并且不方便管理。因为 FastGPT 提供了一个 API 文件库的概念，可以通过简单的 API 接口，去拉取已有的文档库，并且可以灵活配置是否导入。

API 文件库能够让用户轻松对接已有的文档库，只需要按照 FastGPT 的 API 文件库规范，提供相应文件接口，然后将服务接口的 baseURL 和 token 填入知识库创建参数中，就能直接在页面上拿到文件库的内容，并选择性导入

## 如何使用 API 文件库

创建知识库时，选择 API 文件库类型，然后需要配置两个关键参数:文件服务接口的 baseURL 和用于身份验证的请求头信息。只要提供的接口规范符合 FastGPT 的要求，系统就能自动获取并展示完整的文件列表，可以根据需要选择性地将文件导入到知识库中。

你需要提供两个参数：
- baseURL: 文件服务接口的 baseURL
- authorization: 用于身份验证的请求头信息，实际请求格式为 `Authorization: Bearer <token>`

## 接口规范

接口响应格式：

```ts
type ResponseType = {
  success: boolean;
  message: string;
  data: any;
}
```

数据类型：

```ts
// 文件列表中，单项的文件类型
type FileListItem = {
  id: string;
  parentId: string  //也可能为 null 或者 undefined 类型;
  name: string;
  type: 'file' | 'folder';
  hasChild?: boolean; // 是否有子文档（folder 强制为 true）
  updateTime: Date;
  createTime: Date;
}
```


### 1. 获取文件树

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

{{% alert icon=" " context="success" %}}
- parentId - 父级 id，可选，或者 null | undefined。
- searchKey - 检索词，可选
{{% /alert %}}

```bash
curl --location --request POST '{{baseURL}}/v1/file/list' \
--header 'Authorization: Bearer {{authorization}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "parentId": "",
    "searchKey": ""
}'
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
    "data": [
        {
            "id": "xxxx",
            "parentId": "xxxx",
            "type": "file",  // file | folder
            "hasChild": true, // 是否有子文档（folder 会强制为 true）
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

### 2. 获取单个文件内容（文本内容或访问链接）

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
        "title": "文档标题",
        "content": "FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！\n",
        "previewUrl": "xxxx"
    }
}
```

{{% alert icon=" " context="success" %}}

- title - 文件标题。
- content - 文件内容，直接拿来用。
- previewUrl - 文件链接，系统会请求该地址获取文件内容。

`content`和`previewUrl`二选一返回，如果同时返回则 `content` 优先级更高，返回 `previewUrl`时，则会访问该链接进行文档内容读取。

{{% /alert %}}

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


### 3. 获取文件阅读链接（用于查看原文）

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

id 为文件的 id。

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

{{% alert icon=" " context="success" %}}
- url - 文件访问链接，拿到后会自动打开。
{{% /alert %}}

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


### 4. 获取文件详细信息（用于获取文件信息）

{{< tabs tabTotal="2" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

id 为文件的 id。

```bash
curl --location --request GET '{{baseURL}}/v1/file/detail?id=xx' \
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
        "id": "xxxx",
        "parentId": "xxxx",
        "type": "file",  // file | folder
        "hasChild": true, // 是否有子文档（folder 会强制为 true）
        "name":"test.json",
        "updateTime":"2024-11-26T03:05:24.759Z",
        "createTime":"2024-11-26T03:05:24.759Z"
    }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


