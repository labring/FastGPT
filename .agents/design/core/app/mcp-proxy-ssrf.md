# MCP 出站代理 SSRF 防护与 IP 固定设计

## 背景

在配置了环境代理（`HTTP_PROXY` / `HTTPS_PROXY`）的部署中，若直接使用 `undici.ProxyAgent`，代理隧道会以原始域名发起 `CONNECT <hostname>:<port>`（对 `http://` 目标在非隧道模式下甚至会发送 absolute-form `GET http://hostname/...`）。这会导致：

1. 代理服务端自行重新解析域名，跳过应用进程本地的 `resolveMcpConnectAddress` 与 `createPinnedLookup`；
2. 攻击者可利用 DNS rebinding 或 split-horizon DNS（应用侧返回公网 IP，代理侧解析到 `127.0.0.1`、内网 `10.x` 或云元数据地址）绕过 SSRF 防护。

## 方案

采用 **方案 A（代理隧道 CONNECT 固定已校验 IP，同时保留原始 `Host` 与 TLS SNI/证书校验）**，实现在 `packages/service/core/app/mcp.ts` 的 `createMcpSafeFetch` 中：

1. **逐跳判定代理与 `NO_PROXY`**：每一跳（含手动处理的重定向）调用 `assertMCPUrlNotInternal` 后，通过 `proxy-from-env` 的 `getProxyForUrl(url)` 判定是否命中环境代理；命中 `NO_PROXY` 返回空串，走直连固定 DNS `Agent`。
2. **每次新建代理隧道都现场解析并复检 IP**：`createPinnedProxyAgent` 在自定义 `Agent.connect` 回调内调用 `resolveMcpConnectAddress(connectOpts.hostname)`，禁止连接到 loopback、metadata 或（当开启 `security.checkInternalIp` 时）内网 IP。
3. **强制使用 `CONNECT <ip>:<port>`**：
   - IPv6 地址使用方括号格式 `[ip]:port`，无显式端口时按协议回落 `80` / `443`。
   - **明文 `http://` 目标同样走 `CONNECT <ip>:<port>` 隧道**，不退回 absolute-form HTTP 转发，杜绝代理重新解析域名的窗口。
4. **保留原始 `Host` 与 HTTPS TLS 语义**：
   - `fetch` 仍使用原始 URL，内层 HTTP 请求保持原始 `Host` 头与重定向语义。
   - 对 `https://` 目标通过 `undici.buildConnector` 在隧道 socket 上执行 TLS 握手：域名目标保留原始 `servername`（SNI）并保持默认 `rejectUnauthorized` 按域名校验证书；IP 字面量目标不写入 SNI（遵循 RFC 6066，避免 Node IP SNI 告警）。
5. **代理鉴权、错误分类与资源清理**：
   - 支持从代理 URL 解析并 URL-decode `username`/`password` 生成 `Proxy-Authorization: Basic ...`；不对代理自身做 SSRF 限制（允许本地或内网代理地址）。
   - 代理非 200 CONNECT 响应（含 `407`、`403` 等）与不支持的代理协议抛出 `McpProxyTunnelError`（`MCP_PROXY_TUNNEL_ERROR`），归类为 `UserConfigError`；来自 HTTPS 代理自身的 `ERR_TLS_CERT_ALTNAME_INVALID` 按 `undici.ProxyAgent` 惯例包装为 `SecureProxyConnectionError`（`UND_ERR_PRX_TLS`），避免 `undici` `Client` 在 `http://` 目标上无限重试。
   - 非 200 响应、超时、`AbortSignal` 取消及 `safeFetch.close()` 时立即销毁对应 socket 并关闭所有 `Agent` 与代理 `Pool`。

## 行为变更与部署注意事项

1. **本机 DNS 不可解析时默认 fail-closed（有意变更）**：
   即使配置了 `HTTP_PROXY` / `HTTPS_PROXY`，FastGPT 应用进程现在也必须通过本机 `dns.lookup` 解析并校验目标 IP。过去仅依赖代理端解析外部域名（应用容器无外部 DNS）的配置现在会以 fail-closed 失败，而非把未校验的域名透传给代理。这是为消除代理侧 DNS rebinding / split-horizon 绕过而有意采取的安全策略。
2. **明文 HTTP 目标对代理 `CONNECT` 端口的依赖**：
   由于 `http://` 目标也通过 `CONNECT <ip>:80`（或自定义端口）建立隧道，部分默认仅允许 `CONNECT *:443` 的企业代理可能会返回 `403`/`405`，对应请求会以 `McpProxyTunnelError` / `UserConfigError` 失败。需要直连的受控内网/特定主机可通过 `NO_PROXY` 显式旁路代理（仍保留直连固定 DNS 与 SSRF 校验）。
