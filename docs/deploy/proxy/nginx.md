# nginx 反向代理 openai 接口

如果你有国外的服务器，可以通过配置 nginx 反向代理，转发 openai 相关的请求，从而让国内的服务器可以通过访问该 nginx 去访问 openai 接口。

```conf
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
    client_header_buffer_size 32k;
    large_client_header_buffers 4 32k;
    client_max_body_size 50M;

    gzip  on;
    gzip_min_length   1k;
    gzip_buffers  4 8k;
    gzip_http_version 1.1;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_types  text/plain application/x-javascript text/css application/javascript application/json application/xml;
    gzip_disable "MSIE [1-6]\.";

    open_file_cache max=1000 inactive=1d;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 8;
    open_file_cache_errors off;

    server {
        listen 443 ssl;
        server_name your_host;
        ssl_certificate /ssl/your_host.pem;
        ssl_certificate_key /ssl/your_host.key;
        ssl_session_timeout 5m;

        location ~ /openai/(.*) {
            # auth check
            if ($auth != "xxxxxx") {
                return 403;
            }

            proxy_pass https://api.openai.com/$1$is_args$args;
            proxy_set_header Host api.openai.com;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            # 流式响应
            proxy_set_header Connection '';
            proxy_http_version 1.1;
            chunked_transfer_encoding off;
            proxy_buffering off;
            proxy_cache off;
            # 一般响应
            proxy_buffer_size 128k;
            proxy_buffers 4 256k;
            proxy_busy_buffers_size 256k;
        }
    }
    server {
        listen 80;
        server_name ai.fastgpt.run;
        rewrite ^(.*) https://$server_name$1 permanent;
    }
}
```
