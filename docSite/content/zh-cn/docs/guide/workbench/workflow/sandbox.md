---
title: "代码运行"
description: "FastGPT 代码运行节点介绍"
icon: "input"
draft: false
toc: true
weight: 258
---

![alt text](/imgs/image.png)

## 功能

可用于执行一段简单的 js 代码，用于进行一些复杂的数据处理。代码运行在沙盒中，无法进行网络请求、dom和异步操作。如需复杂操作，需外挂 HTTP 实现。

**注意事项**

- 私有化用户需要部署`fastgpt-sandbox` 镜像，并配置`SANDBOX_URL`环境变量。
- 沙盒最大运行 10s， 32M 内存限制。


## 变量输入 

可在自定义输入中添加代码运行需要的变量，在代码的 main 函数中，可解构出相同名字的变量。

如上图，自定义输入中有 data1 和 data2 两个变量，main 函数中可以解构出相同名字的变量。

## 结果输出

务必返回一个 object 对象

自定义输出中，可以添加变量名来获取 object 对应 key 下的值。例如上图中，返回了一个对象：

```json
{
  result: data1,
  data2
}
```

他有 2 个 key：result和 data2(js 缩写，key=data2，value=data2)。这时候自定义输出中就可以添加 2 个变量来获取对应 key 下的 value。

## 内置 JS 全局变量

### delay 延迟

延迟 1 秒后返回

```js
async function main({data1, data2}){
    await delay(1000)
    return {
        result: "111"
    }
}
```

### countToken 统计 token

```js
function main({input}){
    return {
        result: countToken(input)
    }
}
```

![alt text](/imgs/image-1.png)

### strToBase64 字符串转 base64(4.8.11 版本新增)

可用于将 SVG 图片转换为 base64 格式展示。

```js
function main({input}){
     
    return {
        /* 
            param1: input 需要转换的字符串
            param2: base64 prefix 前缀
        */
        result: strToBase64(input,'data:image/svg+xml;base64,')
    }
}
```

![alt text](/imgs/image-2.png)