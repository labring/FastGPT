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

根据上方示例图的匹配规则，当我们输入`123` `hi` `你好` 和任意手机号码时（正则匹配）同样也会输出 False 。

## 作用

适用场景有：让大模型做判断后输出固定内容，根据大模型回复内容判断是否触发后续模块。

