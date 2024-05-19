---
title: "自定义词库地址"
description: "FastGPT 自定义输入提示的接口地址"
icon: "code"
draft: false
toc: true
weight: 350
---

![](/imgs/questionGuide.png)

## 什么是输入提示
可自定义开启或关闭，当输入提示开启，并且词库中存在数据时，用户在输入问题时如果输入命中词库，那么会在输入框上方展示对应的智能推荐数据

用户可配置词库，选择存储在 FastGPT 数据库中，或者提供自定义接口获取词库

## 数据格式
词库的形式为一个字符串数组，定义的词库接口应该有两种方法 —— GET & POST

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

