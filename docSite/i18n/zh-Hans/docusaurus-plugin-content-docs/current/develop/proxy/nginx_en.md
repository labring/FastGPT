# Nginx Reverse Proxy for OpenAI API

If you have a foreign server, you can configure Nginx as a reverse proxy to forward OpenAI-related requests. This enables your domestic server to access the OpenAI API through this Nginx server.

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
        listen 3999;
        server_name Your_IP_Address;

        location ~ /openai/(.*) {
            proxy_pass https://api.openai.com/$1$is_args$args;
            proxy_set_header Host api.openai.com;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            # For streaming response
            proxy_set_header Connection '';
            proxy_http_version 1.1;
            chunked_transfer_encoding off;
            proxy_buffering off;
            proxy_cache off;
            # For regular response
            proxy_buffer_size 128k;
            proxy_buffers 4 256k;
            proxy_busy_buffers_size 256k;
        }
    }
}
```