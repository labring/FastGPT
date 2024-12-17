---
title: "SearXNG 搜索插件配置与使用说明"
description: "FastGPT SearXNG 搜索插件配置指南"
icon: "search"
draft: false
toc: true
weight: 303
---

1. # 创建应用

https://hzh.sealos.run/

在 Sealos 上部署 SearXNG 实例：

![](/imgs/searxng_plugin_guide1.png)

### 基础配置

在应用管理中部署镜像实例

配置 CPU 和内存（可按需调整）

确保开启公网访问

![](/imgs/searxng_plugin_guide2.png)

![](/imgs/searxng_plugin_guide3.png)

### 环境变量设置

```Bash
BASE_URL=https://pnesddlhqgog.sealoshzh.site
INSTANCE_NAME=searxng
AUTOCOMPLETE=google
```

### 配置文件注意事项

注意事项：

1. instance_name 设置实例名称
2. base_url 设置为 Sealos 分配的公网地址
3. secret_key 需要 SHA-256 哈希值，可通过以下命令生成：

```Bash
openssl rand -hex 32
```

1. 为了配置的调整，如用更多的引擎，可以参考https://github.com/searxng/searxng/blob/master/searx/settings.yml

![](/imgs/searxng_plugin_guide4.png)

```Bash
general:
  debug: false
  instance_name: "名称"
  privacypolicy_url: false
  donation_url: false
  contact_url: false
  enable_metrics: true
  open_metrics: ''

brand:
  new_issue_url: https://github.com/searxng/searxng/issues/new
  docs_url: https://docs.searxng.org/
  public_instances: https://searx.space
  wiki_url: https://github.com/searxng/searxng/wiki
  issue_url: https://github.com/searxng/searxng/issues

search:
  safe_search: 0
  autocomplete: ""
  autocomplete_min: 4
  default_lang: "auto"
  ban_time_on_fail: 5
  max_ban_time_on_fail: 120
  formats:
    - html

server:
  port: 8080
  bind_address: "0.0.0.0"
  base_url: "https://example.site/"
  limiter: false
  public_instance: false
  secret_key: "example"
  image_proxy: false
  http_protocol_version: "1.0"
  method: "POST"
  default_http_headers:
    X-Content-Type-Options: nosniff
    X-Download-Options: noopen
    X-Robots-Tag: noindex, nofollow
    Referrer-Policy: no-referrer

redis:
  url: false

ui:
  static_path: ""
  static_use_hash: false
  templates_path: ""
  default_theme: simple
  default_locale: ""
  query_in_title: false
  infinite_scroll: false
  center_alignment: false
  theme_args:
    simple_style: auto

outgoing:
  request_timeout: 30.0
  max_request_timeout: 40.0
  pool_connections: 200
  pool_maxsize: 50
  enable_http2: false
  retries: 5

engines:

  - name: bing
    engine: bing
    shortcut: bi
    timeout: 10.0
    
  - name: mojeek
    engine: mojeek
    shortcut: mj
    timeout: 10.0

doi_resolvers:
  oadoi.org: 'https://oadoi.org/'
  doi.org: 'https://doi.org/'
  doai.io: 'https://dissem.in/'
  sci-hub.se: 'https://sci-hub.se/'
  sci-hub.st: 'https://sci-hub.st/'
  sci-hub.ru: 'https://sci-hub.ru/'

default_doi_resolver: 'oadoi.org'
```

1. # 设置调用

进入自己sealos部署的实例：

![](/imgs/searxng_plugin_guide5.png)

设置配置：

![](/imgs/searxng_plugin_guide6.png)

1. # 插件使用

### 参数说明

query: 搜索关键词（必填）

url: SearXNG 实例地址（必填，填入 Sealos 部署后得到的 URL）

![](/imgs/searxng_plugin_guide7.png)

### 返回格式

1. 成功时返回搜索结果数组：

```Bash
{
  "result": "[{\"title\":\"标题1\",\"link\":\"链接1\",\"snippet\":\"摘要1\"}, ...]"
}
```

1. 失败时通过 Promise.reject 返回错误信息：

```Bash
// 可能的错误信息：
- "缺少查询参数"
- "缺少url"
- "Failed to fetch data from Search XNG"
```

一般问题来源于参数缺失与服务部署，如有更多问题可在用户群提问。