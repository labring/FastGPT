---
weight: 961
title: "数据集"
description: "FastGPT 数据集中文件与数据的设计方案"
icon: dataset
draft: false
images: []
---

## 文件与数据的关系

在 FastGPT 中，文件会通过 MongoDB 的 FS 存储，而具体的数据会通过 PostgreSQL 存储，PG 中的数据会有一列 file_id，关联对应的文件。考虑到旧版本的兼容，以及手动输入、标注数据等，我们给 file_id 增加了一些特殊的值，如下：

- manual: 手动输入
- mark: 手动标注的数据

注意，file_id 仅在插入数据时会写入，变更时无法修改。

## 文件导入流程

1. 上传文件到 MongoDB 的 FS 中，获取 file_id，此时文件标记为 `unused` 状态
2. 浏览器解析文件，获取对应的文本和 chunk
3. 给每个 chunk 打上 file_id
4. 点击上传数据：将文件的状态改为 `used`，并将数据推送到 mongo `training` 表中等待训练
5. 由训练线程从 mongo 中取数据，并在获取向量后插入到 pg。