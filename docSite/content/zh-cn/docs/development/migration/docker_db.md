---
weight: 762
title: "Docker 数据库迁移(无脑操作)"
description: "FastGPT Docker 数据库备份和迁移"
icon: database
draft: false
images: []
---

## Copy文件

Docker 部署数据库都会通过 volume 挂载本地的目录进入容器，如果要迁移，直接复制这些目录即可。

`PG 数据`: pg/data
`Mongo 数据`: mongo/data