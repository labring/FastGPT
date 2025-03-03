---
title: '通过 AI Proxy 接入模型'
description: '通过 AI Proxy 接入模型'
icon: 'api'
draft: false
toc: true
weight: 744
---

从 FastGPT 4.8.23 版本开始，引入 AI Proxy 来进一步方便模型的配置。

AI Proxy 与 One API 类似，也是作为一个 OpenAI 接口管理 & 分发系统，可以通过标准的 OpenAI API 格式访问所有的大模型，开箱即用。

## 部署

### Docker 版本

`docker-compose.yml` 文件已加入了 AI Proxy 配置，可直接使用。

## 基础使用

### 1. 创建渠道

如果 FastGPT 的环境变量中，设置了 AIPROXY_API_ENDPOINT 的值，那么在“模型提供商”的配置页面，会多出两个 tab，可以直接在 FastGPT 平台上配置模型渠道，以及查看模型实际调用日志。

![aiproxy1](/imgs/aiproxy-1.png)

点击右上角的“新增渠道”，即可进入渠道配置页面

![aiproxy2](/imgs/aiproxy-2.png)

以阿里云的模型为例，进行如下配置

![aiproxy3](/imgs/aiproxy-3.png)

1. 渠道名：展示在外部的渠道名称，仅作标识;
2. 厂商：模型对应的厂商，不同厂商对应不同的默认地址和 API 密钥格式;
3. 模型：当前渠道具体可以使用的模型，系统内置了主流的一些模型，如果下拉框中没有想要的选项，可以点击“新增模型”，[增加自定义模型](/docs/development/modelconfig/intro/#新增自定义模型);
4. 模型映射：将 FastGPT 请求的模型，映射到具体提供的模型上；
5. 代理地址：具体请求的地址，系统给每个主流渠道配置了默认的地址，如果无需改动则不用填
6. API 密钥：从模型厂商处获取的 API 凭证

最后点击“新增”，就能在“模型渠道”下看到刚刚配置的渠道

![aiproxy4](/imgs/aiproxy-4.png)

### 2. 渠道测试

然后可以对渠道进行测试，确保配置的模型有效

![aiproxy5](/imgs/aiproxy-5.png)

点击“模型测试”，可以看到配置的模型列表，点击“开始测试”

![aiproxy6](/imgs/aiproxy-6.png)

等待模型测试完成后，会输出每个模型的测试结果以及请求时长

![aiproxy7](/imgs/aiproxy-7.png)

### 3. 启用模型

最后在“模型配置”中，可以选择启用对应的模型，这样就能在平台中使用了

![aiproxy8](/imgs/aiproxy-8.png)


## 渠道设置

### 优先级

在 FastGPT 中，可以给渠道设置优先级，对于同样的模型，优先级越高的渠道会越优先请求

![aiproxy9](/imgs/aiproxy-9.png)

### 启用/禁用

在渠道右侧的控制菜单中，还可以控制渠道的启用或禁用，被禁用的渠道将无法再提供模型服务

![aiproxy10](/imgs/aiproxy-10.png)

### 调用日志

在 “调用日志” 页面，会展示发送到模型处的请求记录，包括具体的输入输出 tokens、请求时间、请求耗时、请求地址等等

![aiproxy11](/imgs/aiproxy-11.png)

## 如何从 OneAPI 迁移到 AI Proxy

可以从任意终端，发起 1 个 HTTP 请求。其中 {{host}} 替换成 AI Proxy 地址，{{admin_key}} 替换成 AI Proxy 中 ADMIN_KEY 的值，参数 dsn 为 OneAPI 的 mysql 连接串

```bash
curl --location --request POST '{{host}}/api/channels/import/oneapi' \
--header 'Authorization: Bearer {{admin_key}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "dsn": "mysql://root:s5mfkwst@tcp(dbconn.sealoshzh.site:33123)/mydb"
}'
```

执行成功的情况下会返回 "success": true

脚本目前不是完全准，可能会有部分渠道遗漏，还需要手动再检查下