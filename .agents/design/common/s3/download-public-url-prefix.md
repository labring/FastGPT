# S3 下载短链公开前缀设计

## 背景

当前短链下载 URL 默认形态是：

```text
https://{file-domain}{base-url}/api/system/file/d/{aliasId}.{expMinute36}.{sig}
```

这个长度已经比 JWT 方案短很多，但如果业务希望把文件链接暴露给模型或第三方服务，仍然会带上固定 API 路径。用户计划在网关层增加 nginx rewrite，希望最终对外链接变成：

```text
https://files.example.com/{aliasId}.{expMinute36}.{sig}
```

nginx 再把这个短路径转发到 FastGPT app：

```text
http://fastgpt-app-hostname/api/system/file/d/{aliasId}.{expMinute36}.{sig}
```

## 目标

1. App 生成下载短链时支持可选公开前缀。
2. 未配置时保持旧行为，兼容现有 `FILE_DOMAIN` / `FE_DOMAIN` / `NEXT_PUBLIC_BASE_URL`。
3. 第一版只处理下载链接，不改变上传链接。
4. 不在 Next.js app 增加根路径 catch-all，由 nginx 承接短路径 rewrite。

## 配置设计

新增环境变量：

```env
FILE_DOWNLOAD_PUBLIC_URL_PREFIX=https://files.example.com
```

含义：下载短链对外公开 URL 前缀。生成下载 URL 时直接拼接：

```text
{FILE_DOWNLOAD_PUBLIC_URL_PREFIX}/{signedAlias}
```

如果需要在文件域名下保留一层路径，也可以配置：

```env
FILE_DOWNLOAD_PUBLIC_URL_PREFIX=https://files.example.com/f
```

生成：

```text
https://files.example.com/f/{signedAlias}
```

## URL 行为

| 场景 | 下载 URL | 上传 URL |
| --- | --- | --- |
| 未配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` | `{FILE_DOMAIN || FE_DOMAIN || ''}{NEXT_PUBLIC_BASE_URL}/api/system/file/d/{signedAlias}` | `{FILE_DOMAIN || FE_DOMAIN || ''}{NEXT_PUBLIC_BASE_URL}/api/system/file/u/{token}` |
| 配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX=https://files.example.com` | `https://files.example.com/{signedAlias}` | 不变 |
| 配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX=https://files.example.com/f` | `https://files.example.com/f/{signedAlias}` | 不变 |

`FILE_DOMAIN` 继续表示 FastGPT 文件 API 的完整入口域名。新变量只表示下载短链公开入口，不替代上传入口。

## nginx 示例

根路径只承接合法 signed alias，其他路径直接 404，避免文件域名变成另一个完整应用入口。

```nginx
server {
  server_name files.example.com;

  location ~ ^/([A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64})$ {
    proxy_pass http://fastgpt-app-hostname/api/system/file/d/$1$is_args$args;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_request_buffering off;
  }

  location / {
    return 404;
  }
}
```

如果使用带路径前缀的公开地址，例如 `https://files.example.com/f/{sign}`：

```nginx
location ~ ^/f/([A-Za-z0-9_-]{12,32}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{16,64})$ {
  proxy_pass http://fastgpt-app-hostname/api/system/file/d/$1$is_args$args;
}
```

## 传输链路

`FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 只改变用户看到的入口 URL，不改变 FastGPT app 内部下载模式：

1. `STORAGE_DOWNLOAD_URL_MODE=short-proxy`：nginx 转到 app，app 代理读取对象存储并返回文件。
2. `STORAGE_DOWNLOAD_URL_MODE=short-redirect`：nginx 转到 app，app 校验短链后 302 到短 TTL S3 预签名链接。
3. `STORAGE_DOWNLOAD_URL_MODE=presigned`：上游本身直接返回 S3 预签名链接，不会使用短链公开前缀。

## 非目标

1. 不把上传 URL 改成 `https://files.example.com/{token}`。上传请求有 method、body、大小限制、内容校验和 abort 语义，第一版继续保留完整 API 路径。
2. 不新增插件服务或 pro 服务的公开下载 API。下载仍由主 app 的 `/api/system/file/d/{signedAlias}` 承接。
3. 不改变 signed alias 协议、HMAC 长度、Mongo alias 存储和清理策略。
4. 不自动生成 nginx 配置，只在文档中给出推荐 rewrite。

## 风险与处理

1. nginx 配置缺失或未生效：链接会返回 404 或无法访问；App 侧无法自动兜底，因为公开链接已经指向独立域名根路径。
2. 文件域名暴露面扩大：建议 nginx 只匹配 signed alias 正则，其余路径返回 404。
3. 上传链路域名混淆：新变量只用于下载，上传仍依赖 `FILE_DOMAIN || FE_DOMAIN || NEXT_PUBLIC_BASE_URL`。
4. 多服务复用：pro/admin 等服务如果只消费 app 返回的文件链接，不需要再配置自己的文件域名；只需主 app 配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 并保证 nginx 转发到主 app。

## Tasks

- [x] T1 新增 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` env schema 与说明。
- [x] T2 抽取 S3 access link URL builder，避免下载/上传 URL 拼接重复。
- [x] T3 下载 URL builder 优先使用 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX`，未配置时保持旧行为。
- [x] T4 上传 URL builder 保持旧行为。
- [x] T5 补充短链 URL 单测：默认行为、根路径公开前缀、带路径公开前缀、上传不受影响。
- [x] T6 补充 env 单测：公开前缀尾部 `/` 会被归一化。
- [x] T7 运行局部测试并提交推送。
