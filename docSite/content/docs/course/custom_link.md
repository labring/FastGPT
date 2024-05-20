---
title: "自定义问题引导"
description: "FastGPT 自定义问题引导"
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



### GET
对于 GET 方法，用于获取词库数据，FastGPT 会给接口发送数据 query 为
```
{
  appId: 'xxxx'
}
```
返回数据格式应当为
```
{
  data: ['xxx', 'xxxx']
}
```

### POST
对于 POST 方法，用于更新词库数据，FastGPT 会给接口发送数据 body 为
```
  {
    appId: 'xxxx',
    text: ['xxx', 'xxxx']
  }
```
接口应当按照获取的数据格式存储相对应的词库数组

