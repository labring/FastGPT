---
title: "Nginx 中转"
description: "使用 Sealos 部署 Nginx 实现中转"
icon: "cloud_sync"
draft: false
toc: true
weight: 951
---

## 登录 Sealos

[Sealos](https://cloud.sealos.io/)

## 创建应用

打开 「应用管理」，点击「新建应用」：

![](/imgs/sealos3.webp)  
![](/imgs/sealos4.png)

### 填写基本配置

务必开启外网访问，复制外网访问提供的地址。

![](/imgs/sealos5.png)

### 添加配置文件

1. 复制下面这段配置文件，注意 `server_name` 后面的内容替换成第二步的外网访问地址。

   ```nginx
   user nginx;
   worker_processes auto;
   worker_rlimit_nofile 51200;
   
   events {
       worker_connections 1024;
   }
   
   http {
       resolver 8.8.8.8;
       proxy_ssl_server_name on;
   
       access_log off;
       server_names_hash_bucket_size 512;
       client_header_buffer_size 64k;
       large_client_header_buffers 4 64k;
       client_max_body_size 50M;
   
       proxy_connect_timeout       240s;
       proxy_read_timeout          240s;
       proxy_buffer_size 128k;
       proxy_buffers 4 256k;
   
       server {
           listen 80;
           server_name tgohwtdlrmer.cloud.sealos.io; # 这个地方替换成 Sealos 提供的外网地址
   
           location ~ /openai/(.*) {
               proxy_pass https://api.openai.com/$1$is_args$args;
               proxy_set_header Host api.openai.com;
               proxy_set_header X-Real-IP $remote_addr;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
               # 如果响应是流式的
               proxy_set_header Connection '';
               proxy_http_version 1.1;
               chunked_transfer_encoding off;
               proxy_buffering off;
               proxy_cache off;
               # 如果响应是一般的
               proxy_buffer_size 128k;
               proxy_buffers 4 256k;
               proxy_busy_buffers_size 256k;
           }
       }
   }
   ```

2. 点开高级配置。
3. 点击「新增配置文件」。
4. 文件名写: `/etc/nginx/nginx.conf`。
5. 文件值为刚刚复制的那段代码。
6. 点击确认。

   ![](/imgs/sealos6.png)

### 部署应用

填写完毕后，点击右上角的「部署」，即可完成部署。

## 修改 FastGPT 环境变量

1. 进入刚刚部署应用的详情，复制外网地址

   > 注意：这是个 API 地址，点击打开是无效的。如需验证，可以访问: `*.cloud.sealos.io/openai/api`，如果提示 `Invalid URL (GET /api)` 则代表成功。
   
   ![](/imgs/sealos7.png)

2. 修改环境变量（是 FastGPT 的环境变量，不是 Sealos 的）：

   ```bash
   OPENAI_BASE_URL=https://tgohwtdlrmer.cloud.sealos.io/openai/v1
   ```
   
**Done!**