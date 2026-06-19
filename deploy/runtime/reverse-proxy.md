# FastGPT 企业反向代理与端口收敛

## 目标

生产环境只暴露 HTTPS 入口给用户访问，其余服务保留在 Docker 内部网络或运维专用网段。

## 推荐入口

| 入口 | 用途 | 是否对用户开放 |
| --- | --- | --- |
| `https://fastgpt.internal.example.com` | FastGPT Web/API | 是 |
| `https://fastgpt-files.internal.example.com` | 文件域名，可独立隔离 | 按需 |
| MinIO console `9001` | 对象存储管理 | 否 |
| MongoDB `27017` | 主数据库 | 否 |
| PostgreSQL `5432` | 向量库和 AIProxy 数据库 | 否 |
| Redis `6379` | 缓存与流式恢复 | 否 |
| plugin/code-sandbox/MCP/AIProxy/opensandbox | 内部服务 | 否 |

## 必要环境变量

```env
FE_DOMAIN=https://fastgpt.internal.example.com
FILE_DOMAIN=https://fastgpt-files.internal.example.com
ALLOWED_ORIGINS=https://fastgpt.internal.example.com
TRUSTED_PROXY_ENABLE=true
TRUSTED_PROXY_IPS=10.0.0.10/32
```

`TRUSTED_PROXY_IPS` 必须填写真实反向代理 IP 或 CIDR。不要填写用户网段，也不要为了省事填 `0.0.0.0/0`。

## Nginx 示例

```nginx
server {
    listen 443 ssl http2;
    server_name fastgpt.internal.example.com;

    ssl_certificate /etc/nginx/certs/fastgpt.crt;
    ssl_certificate_key /etc/nginx/certs/fastgpt.key;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

如果对象存储文件域名独立，建议单独配置 `fastgpt-files.internal.example.com`，并将下载、预览、缓存策略和主应用域名隔离。

## Traefik 示例

```yaml
http:
  routers:
    fastgpt:
      rule: Host(`fastgpt.internal.example.com`)
      entryPoints:
        - websecure
      service: fastgpt
      tls: {}
  services:
    fastgpt:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:3000
```

## 端口收敛检查

运行：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml config
```

确认 `ports` 只包含 FastGPT Web，例如：

```yaml
ports:
  - mode: ingress
    target: 3000
    published: "3000"
```

如果需要让运维人员访问 MinIO console 或数据库，请通过 VPN、堡垒机、临时端口转发或只读账号完成，不要直接开放给办公网全员。

## 安全注意事项

1. `ALLOWED_ORIGINS` 只填明确域名，不使用 `*`。
2. `CHECK_INTERNAL_IP=true`，防止普通 HTTP 工具访问内网和云元数据地址。
3. `SANDBOX_CHECK_INTERNAL_IP=true`，防止代码沙盒访问内网。
4. 反向代理必须传递 `X-Forwarded-For` 和 `X-Real-IP`，FastGPT 只信任 `TRUSTED_PROXY_IPS` 中的代理。
5. 不要将 Docker socket 暴露给非隔离环境。
