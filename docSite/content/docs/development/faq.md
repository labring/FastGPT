---
weight: 749
title: "私有部署常见问题"
description: "FastGPT 私有部署常见问题"
icon: upgrade
draft: false
images: []
---

## 一、错误排查方式

遇到问题先按下面方式排查。

1. `docker ps -a` 查看所有容器运行状态，检查是否全部 running，如有异常，尝试`docker logs 容器名`查看对应日志。
2. 容器都运行正常的，`docker logs 容器名` 查看报错日志
3. 无法解决时，可以找找[Issue](https://github.com/labring/FastGPT/issues)，或新提 Issue，私有部署错误，务必提供详细的日志，否则很难排查。


## 二、通用问题

### 能否纯本地运行

可以。需要准备好向量模型和LLM模型。

### 页面中可以正常回复，API 报错

页面中是用 stream=true 模式，所以API也需要设置 stream=true 来进行测试。部分模型接口（国产居多）非 Stream 的兼容有点垃圾。

### 其他模型没法进行问题分类/内容提取

需要给其他模型配置`toolChoice=false`，就会默认走提示词模式。目前内置提示词仅针对了商业模型API进行测试。
问题分类基本可用，内容提取不太行。
   
### 页面崩溃

1. 关闭翻译
2. 检查配置文件是否正常加载，如果没有正常加载会导致缺失系统信息，在某些操作下会导致空指针。（95%情况是配置文件不对，可以F12打开控制台，看具体的空指针情况）
3. 某些api不兼容问题（较少）

### 开启内容补全后，响应速度变慢

1. 问题补全需要经过一轮AI生成。
2. 会进行3~5轮的查询，如果数据库性能不足，会有明显影响。

### 模型响应为空(core.chat.Chat API is error or undefined)

1. 检查 key 问题。
2. 如果是国内模型，可能是命中风控了。
3. 查看模型请求日志，检查出入参数是否异常。

### 知识库索引没有进度/索引很慢

先看日志报错信息。有以下几种情况：

1. 可以对话，但是索引没有进度：没有配置向量模型（vectorModels）
2. 不能对话，也不能索引：API调用失败。可能是没连上OneAPI或OpenAI
3. 有进度，但是非常慢：api key不行，OpenAI的免费号，一分钟只有3次还是60次。一天上限200次。

### Connection error

网络异常。国内服务器无法请求OpenAI，自行检查与AI模型的连接是否正常。

或者是FastGPT请求不到 OneAPI（没放同一个网络）

### 修改了 vectorModels 但是没有生效

1. 重启容器，确保模型配置已经加载（可以在日志或者新建知识库时候看到新模型）
2. 记得刷新一次浏览器。
3. 如果是已经创建的知识库，需要删除重建。向量模型是创建时候绑定的，不会动态更新。

## 三、常见的 OneAPI 错误

带有 requestId 的都是 OneAPI 的报错。

### insufficient_user_quota user quota is not enough 

OneAPI 账号的余额不足，默认 root 用户只有 200 刀，可以手动修改。

### xxx渠道找不到

FastGPT 模型配置文件中的 model 必须与 OneAPI 渠道中的模型对应上，否则就会提示这个错误。可检查下面内容：

1. OneAPI 中没有配置该模型渠道，或者被禁用了。
2. 修改了 FastGPT 配置文件中一部分的模型，但没有全部修改，仍有模型是 OneAPI 没配置的。
3. 使用旧的向量模型创建了知识库，后又更新了向量模型。这时候需要删除以前的知识库，重建。

如果OneAPI中，没有配置对应的模型，`config.json`中也不要配置，否则容易报错。

### Incorrect API key provided: sk-xxxx.You can find your api Key at xxx

OneAPI 的 API Key 配置错误，需要修改`OPENAI_API_KEY`环境变量，并重启容器（先 docker-compose down 然后再 docker-compose up -d 运行一次）。

可以`exec`进入容器，`env`查看环境变量是否生效。