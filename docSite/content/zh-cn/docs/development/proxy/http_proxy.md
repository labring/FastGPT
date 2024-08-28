---
title: "HTTP 代理中转"
description: "使用 HTTP 代理实现中转"
icon: "http"
draft: false
toc: true
weight: 952
---

如果你有代理工具（例如 [Clash](https://github.com/Dreamacro/clash) 或者 [sing-box](https://github.com/SagerNet/sing-box)），也可以使用 HTTP 代理来访问 OpenAI。只需要添加以下两个环境变量即可：

```bash
AXIOS_PROXY_HOST=
AXIOS_PROXY_PORT=
```

以 Clash 为例，建议指定 `api.openai.com` 走代理，其他请求都直连。示例配置如下：

```yaml
mixed-port: 7890
allow-lan: false
bind-address: '*'
mode: rule
log-level: warning
dns:  
  enable: true  
  ipv6: false  
  nameserver:  
    - 8.8.8.8
    - 8.8.4.4 
  cache-size: 400
proxies:
    - 
proxy-groups:
  - { name: '♻️ 自动选择', type: url-test,  proxies: [香港V01×1.5], url: 'https://api.openai.com', interval: 3600}
rules:
  - 'DOMAIN-SUFFIX,api.openai.com,♻️ 自动选择'
  - 'MATCH,DIRECT'
```

然后给 FastGPT 添加两个环境变量：

```bash
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
```

