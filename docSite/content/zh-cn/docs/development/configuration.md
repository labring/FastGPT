---
title: '配置文件介绍'
description: 'FastGPT 配置参数介绍'
icon: 'settings'
draft: false
toc: true
weight: 707
---

由于环境变量不利于配置复杂的内容，新版 FastGPT 采用了 ConfigMap 的形式挂载配置文件，你可以在 `projects/app/data/config.json` 看到默认的配置文件。可以参考 [docker-compose 快速部署](/docs/development/docker/) 来挂载配置文件。

**开发环境下**，你需要将示例配置文件 `config.json` 复制成 `config.local.json` 文件才会生效。  

下面配置文件示例中包含了系统参数和各个模型配置：

## 4.6.8+ 版本新配置文件示例

```json
{
  "feConfigs": {
    "lafEnv": "https://laf.dev" // laf环境。 https://laf.run （杭州阿里云） ,或者私有化的laf环境。如果使用 Laf openapi 功能，需要最新版的 laf 。
  },
  "systemEnv": {
    "vectorMaxProcess": 15, // 向量处理线程数量
    "qaMaxProcess": 15, // 问答拆分线程数量
    "tokenWorkers": 50, // Token 计算线程保持数，会持续占用内存，不能设置太大。
    "pgHNSWEfSearch": 100 // 向量搜索参数。越大，搜索越精确，但是速度越慢。设置为100，有99%+精度。
  }
}
```