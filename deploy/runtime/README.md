# FastGPT 企业 runtime 部署

本目录提供企业内网部署入口。它基于官方 v4.14 PgVector compose，但移除了弱默认值，并将敏感配置改为 `.env.enterprise` 注入。

## 文件

| 文件 | 用途 |
| --- | --- |
| `docker-compose.enterprise.yml` | 企业内网 runtime compose |
| `README.md` | 本说明 |
| `reverse-proxy.md` | HTTPS 反向代理与端口收敛 |
| `backup-restore.md` | 备份恢复 runbook |

## 使用方式

从仓库根目录准备配置：

```bash
cp deploy/enterprise/.env.example deploy/enterprise/.env.enterprise
```

替换 `deploy/enterprise/.env.enterprise` 中所有 `<...>` 占位符后，运行安全检查：

```bash
pnpm security:check-env deploy/enterprise/.env.enterprise
```

准备 FastGPT 配置文件。compose 会挂载当前目录的 `config.json`：

```bash
cp document/public/deploy/config/config.json deploy/runtime/config.json
```

进入 runtime 目录并检查 compose：

```bash
cd deploy/runtime
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml config
```

启动：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml up -d
```

查看服务：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml ps
```

停止：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml down
```

## 入口与端口

默认只映射 FastGPT Web：

```text
${FASTGPT_PORT:-3000}:3000
```

MongoDB、PostgreSQL、Redis、MinIO、插件服务、MCP、AIProxy、沙盒控制服务都只在 Docker 内部网络中通信。

生产建议通过 Nginx、Traefik 或企业网关暴露 HTTPS 入口，并将 `TRUSTED_PROXY_IPS` 配置为真实反向代理 IP 或 CIDR。

## 沙盒注意事项

`opensandbox-server` 和 `fastgpt-volume-manager` 需要挂载 Docker socket。该能力适合隔离环境，不建议与企业核心业务服务共用宿主机。

如果当前阶段只做普通 RAG 问答，可以先评估是否禁用 Agent sandbox 相关能力，降低攻击面。

## 升级

升级镜像版本时优先改 `.env.enterprise` 中的 tag，例如：

```env
FASTGPT_TAG=v4.14.24
FASTGPT_CODE_SANDBOX_TAG=v4.14.24
FASTGPT_MCP_SERVER_TAG=v4.14.24
```

升级前先执行备份，并在 staging 中完成恢复和回归测试。
