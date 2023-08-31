---
title: '接入 M3E 向量模型'
description: ' 将 FastGPT 接入私有化模型 M3E'
icon: 'model_training'
draft: false
toc: true
weight: 100
---

## 前言

FastGPT 默认使用了 openai 的 embedding 向量模型，如果你想私有部署的话，可以使用 M3E 向量模型进行替换。M3E 向量模型属于小模型，资源使用不高，CPU 也可以运行。下面教程是基于 “睡大觉” 同学提供的一个的镜像。

## 部署镜像

镜像名: `stawky/m3e-large-api:latest`  
国内镜像： `registry.cn-guangzhou.aliyuncs.com/kbgpt/m3e-large-api:latest`
端口号: 6008

## 接入 OneAPI

添加一个渠道，参数如下：

![](/imgs/model-m3e1.png)

## 测试

curl 例子：

```bash
curl --location --request POST 'https://domain/v1/embeddings' \
--header 'Authorization: Bearer sk-key' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "m3e",
  "input": ["laf是什么"]
}'
```

Authorization 为 sk-key。model 为刚刚在 OneAPI 填写的自定义模型。

## 接入 FastGPT

修改 config.json 配置文件，在 VectorModels 中加入 M3E 模型：

```json
"VectorModels": [
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "price": 0.2,
      "defaultToken": 500,
      "maxToken": 3000
    },
    {
      "model": "m3e",
      "name": "M3E（测试使用）",
      "price": 0.1,
      "defaultToken": 500,
      "maxToken": 1800
    }
],
```

## 测试使用

1. 创建知识库时候选择 M3E 模型。

注意，一旦选择后，知识库将无法修改向量模型。

![](/imgs/model-m3e2.png)

2. 导入数据
3. 搜索测试

![](/imgs/model-m3e3.png)

4. 应用绑定知识库

注意，应用只能绑定同一个向量模型的知识库，不能跨模型绑定。并且，需要注意调整相似度，不同向量模型的相似度（距离）会有所区别，需要自行测试实验。

![](/imgs/model-m3e4.png)
