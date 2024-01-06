---
title: '知识库接口'
description: 'FastGPT OpenAPI 知识库接口'
icon: 'dataset'
draft: false
toc: true
weight: 853
---

| 如何获取知识库ID（datasetId） | 如何获取文件集合ID（collection_id） |
| --------------------- | --------------------- |
| ![](/imgs/getDatasetId.jpg) | ![](/imgs/getfile_id.png) |



## 创建训练订单

**请求示例**

```bash
curl --location --request POST 'https://api.fastgpt.in/api/support/wallet/bill/createTrainingBill' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "name": "可选，自定义订单名称，例如：文档训练-fastgpt.docx"
}'
```

**响应结果**

data 为 billId，可用于添加知识库数据时进行账单聚合。

```json
{
  "code": 200,
  "statusText": "",
  "message": "",
  "data": "65112ab717c32018f4156361"
}
```

## 知识库添加数据

{{< tabs tabTotal="4" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'https://api.fastgpt.in/api/core/dataset/data/pushData' \
--header 'Authorization: Bearer apikey' \
--header 'Content-Type: application/json' \
--data-raw '{
    "collectionId": "64663f451ba1676dbdef0499",
    "mode": "chunk",
    "prompt": "可选。qa 拆分引导词，chunk 模式下忽略",
    "billId": "可选。如果有这个值，本次的数据会被聚合到一个订单中，这个值可以重复使用。可以参考 [创建训练订单] 获取该值。",
    "data": [
        {
            "q": "你是谁？",
            "a": "我是FastGPT助手"
        },
        {
            "q": "你会什么？",
            "a": "我什么都会",
            "indexes": [{
                "type":"custom",
                "text":"你好"
            }]
        }
    ]
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

需要先了解 FastGPT 的多路索引概念：

在 FastGPT 中，你可以为一组数据创建多个索引，如果不指定索引，则系统会自动取对应的 chunk 作为索引。例如前面的请求示例中：

`q：你是谁？a:我是FastGPT助手` 它的`indexes`属性为空，意味着不自定义索引，而是使用默认的索引（你是谁？\n我是FastGPT助手）。

在第二组数据中`q:你会什么？a:我什么都会`指定了一个`你好`的索引，因此这组数据的索引为`你好`。

```json
{
    "collectionId": "文件集合的ID，参考上面的第二张图",
    "mode": "chunk | qa ", //  chunk 模式: 可自定义索引。qa 模型：无法自定义索引，会自动取 data 中的 q 作为数据，让模型自动生成问答对和索引。
    "prompt": "QA 拆分提示词，需严格按照模板，建议不要传入。",
    "data": [
        {
            "q": "生成索引的内容，index 模式下最大 tokens 为3000，建议不超过 1000",
            "a": "预期回答/补充",
            "indexes": "自定义索引",
        },
        {
            "q": "xxx",
            "a": "xxxx"
        }
    ],
    
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应例子" >}}
{{< markdownify >}}

```json
{
    "code": 200,
    "statusText": "",
    "data": {
        "insertLen": 1, // 最终插入成功的数量
        "overToken": [], // 超出 token 的
       
        "repeat": [], // 重复的数量
        "error": [] // 其他错误
    }
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="QA Prompt 模板" >}}
{{< markdownify >}}

{{theme}} 里的内容可以换成数据的主题。默认为：它们可能包含多个主题内容

```
我会给你一段文本，{{theme}}，学习它们，并整理学习成果，要求为：
1. 提出最多 25 个问题。
2. 给出每个问题的答案。
3. 答案要详细完整，答案可以包含普通文字、链接、代码、表格、公示、媒体链接等 markdown 元素。
4. 按格式返回多个问题和答案:

Q1: 问题。
A1: 答案。
Q2:
A2:
……

我的文本："""{{text}}"""
```

{{< /markdownify >}}
{{< /tab >}}

{{< /tabs >}}


## 搜索测试

{{< tabs tabTotal="3" >}}
{{< tab tabName="请求示例" >}}
{{< markdownify >}}

```bash
curl --location --request POST 'https://api.fastgpt.in/api/core/dataset/searchTest' \
--header 'Authorization: Bearer fastgpt-xxxxx' \
--header 'Content-Type: application/json' \
--data-raw '{
    "datasetId": "知识库的ID",
    "text": "导演是谁",
    "limit": 5000,
    "similarity": 0,
    "searchMode": "embedding",
    "usingReRank": false
}'
```

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="参数说明" >}}
{{< markdownify >}}

- datasetId - 知识库ID
- text - 需要测试的文本
- limit - 最大 tokens 数量
- similarity - 最低相关度（0~1，可选）
- searchMode - 搜索模式：embedding | fullTextRecall | mixedRecall
- usingReRank - 使用重排

{{< /markdownify >}}
{{< /tab >}}

{{< tab tabName="响应示例" >}}
{{< markdownify >}}

返回 top k 结果， limit 为最大 Tokens 数量，最多 20000 tokens。

```bash
{
  "code": 200,
  "statusText": "",
  "data": [
    {
        "id": "65599c54a5c814fb803363cb",
        "q": "你是谁",
        "a": "我是FastGPT助手",
        "datasetId": "6554684f7f9ed18a39a4d15c",
        "collectionId": "6556cd795e4b663e770bb66d",
        "sourceName": "GBT 15104-2021 装饰单板贴面人造板.pdf",
        "sourceId": "6556cd775e4b663e770bb65c",
        "score": 0.8050316572189331
    },
    ......
  ]
}
```

{{< /markdownify >}}
{{< /tab >}}

{{< /tabs >}}
