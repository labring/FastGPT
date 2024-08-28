---
title: "Cloudflare Worker 中转"
description: "使用 Cloudflare Worker 实现中转"
icon: "foggy"
draft: false
toc: true
weight: 953
---

[参考 "不做了睡觉" 的教程](https://gravel-twister-d32.notion.site/FastGPT-API-ba7bb261d5fd4fd9bbb2f0607dacdc9e)

**workers 配置文件**

```js
const TELEGRAPH_URL = 'https://api.openai.com';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 安全校验
  if (request.headers.get('auth') !== 'auth_code') {
    return new Response('UnAuthorization', { status: 403 });
  }

  const url = new URL(request.url);
  url.host = TELEGRAPH_URL.replace(/^https?:\/\//, '');

  const modifiedRequest = new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
    body: request.body,
    redirect: 'follow'
  });

  const response = await fetch(modifiedRequest);
  const modifiedResponse = new Response(response.body, response);

  // 添加允许跨域访问的响应头
  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');

  return modifiedResponse;
}
```

**修改 FastGPT 的环境变量**

> 务必别忘了填 v1！

```bash
OPENAI_BASE_URL=https://xxxxxx/v1
OPENAI_BASE_URL_AUTH=auth_code
```