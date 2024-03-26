---
title: "判断器"
description: "FastGPT 判断器模块介绍"
icon: "input"
draft: false
toc: true
weight: 362
---

## 特点

- 可重复添加
- 有外部输入
- 触发执行

![](/imgs/judgement1.png)

## 功能

对任意输入内容进行 True False 输出，默认情况下，当传入的内容为 false, undefined, null,0,none 时，会输出 false。

也可以增加自定义规则来补充输出 false 的内容，每行代表一个匹配规则，支持正则表达式。

**例子1**

不填写任何自定义 False 规则。

| 输入 | 输出 |
| --- | --- |
| 123 | true |
| 这是一段文本 | true |
| false | false |
| 0 | false |
| null | false |

**例子2**

自定义 False 规则: 

```
123
你好
aa
/dd/
```

| 输入 | 输出 | 说明 |
| --- | --- | --- |
| 123 | false | 命中自定义 false 规则 |
| 这是一段文本 | true | 未命中 |
| false | false | 命中自定义 内置 规则 |
| 0 | false | 命中自定义 内置 规则 |
| null | false | 命中自定义 内置 规则 |
| aa | false | 命中自定义 false 规则 |
| aaa | true | 未命中 |
| bb | false | 命中自定义 false 规则 |
| bbb | false | 命中自定义 false 规则（正则匹配通过） |

## 作用

适用场景有：让大模型做判断后输出固定内容，根据大模型回复内容判断是否触发后续模块。

