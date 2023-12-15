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

对任意输入内容进行 false 匹配，每行代表一个匹配规则，支持正则表达式。

根据上方示例图的匹配规则，当我们输入`123` `hi` `你好` 和任意手机号码时（正则匹配）会输出 False ，输入其他任意内容则输出 True。

## 作用

适用场景有：让大模型做判断后输出固定内容，根据大模型回复内容判断是否触发后续模块。