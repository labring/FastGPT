# FastGPT 企业内部部署强化

这个目录提供企业内部私有化部署的安全基线。它不替代官方 Docker Compose 模板，而是帮助部署方在上线前检查关键安全配置。

## 使用流程

1. 复制样板：

```bash
cp deploy/enterprise/.env.example deploy/enterprise/.env.enterprise
```

2. 生成高强度随机值并替换所有 `<...>` 占位符：

```bash
openssl rand -base64 48
```

3. 运行部署前检查：

```bash
pnpm security:check-env deploy/enterprise/.env.enterprise
```

4. 在 CI 中加入同一个命令，避免弱口令或关闭安全开关的配置进入正式环境。

## 企业部署基线

1. 所有入口必须经过 HTTPS 反向代理。
2. 只暴露 FastGPT Web 入口；对象存储、MongoDB、PostgreSQL、Redis、插件服务、AIProxy、沙盒和 MCP 服务默认只允许内网访问。
3. `ALLOWED_ORIGINS` 必须配置为明确域名，不能使用通配。
4. `USE_IP_LIMIT=true`，启用接口 IP 限流。
5. `CHECK_INTERNAL_IP=true`，阻止普通 HTTP 工具访问内网、回环和云元数据地址。
6. `TRUSTED_PROXY_ENABLE=true`，并在 `TRUSTED_PROXY_IPS` 中只配置真实反向代理 IP/CIDR。
7. 沙盒必须启用 `SANDBOX_CHECK_INTERNAL_IP=true`，并限制请求次数、请求体/响应体大小、执行时间、内存和模块白名单。
8. root 密码只作为初始化和应急使用；正式用户应接入 SSO 或至少使用单团队模式和严格账号管理。
9. 日志默认使用 `info`，不要在生产长期开启 `debug`。
10. 生产密钥必须放在密钥管理系统或受控 CI/CD secret 中，不要提交真实 `.env.enterprise`。

## 后续强化方向

1. 增加 Docker Compose override，将官方模板中的弱默认值全部改为环境变量注入。
2. 接入 SSO/OAuth/SAML 与成员同步。
3. 增加审计日志留存策略和敏感字段脱敏。
4. 增加镜像、依赖、IaC 扫描和 SBOM 产物。
5. 建立升级演练与数据库备份恢复流程。
