# FastGPT Projects 潜在 Bug 分析

本文档由主线程结合多轮子 agent 只读代码审查结果整理而成，覆盖仓库内五个 project，并补充后续多轮扩展审计中的共享服务与部署配置风险：

- `projects/app`
- `projects/code-sandbox`
- `projects/mcp_server`
- `projects/marketplace`
- `projects/volume-manager`
- `packages/service` 共享服务链路
- `deploy` / `document/public/deploy` 部署模板

本轮只记录能定位到具体代码位置、触发场景和影响的高把握问题；没有把纯风格问题、泛泛的测试建议、复核后不成立的误报或无法验证的猜测写入 findings。

## 文档目录

- [projects/app 潜在 Bug 分析](./projects-app.md)
- [projects/code-sandbox 潜在 Bug 分析](./projects-code-sandbox.md)
- [projects/mcp_server 潜在 Bug 分析](./projects-mcp-server.md)
- [projects/marketplace 潜在 Bug 分析](./projects-marketplace.md)
- [projects/volume-manager 潜在 Bug 分析](./projects-volume-manager.md)
- [packages/service 共享服务潜在 Bug 分析](./shared-service.md)
- [部署配置潜在 Bug 分析](./deployment-config.md)
- [按严重等级整理的问题清单](./severity-index.md)

## 总体结论

本轮共记录 102 个问题：

- 严重：10 个
- 高：48 个
- 中：44 个

优先级最高的是沙箱隔离、权限校验和出站请求边界问题：

1. `projects/code-sandbox` Python 文件系统隔离可被标准库间接绕过。
2. `projects/code-sandbox` Python 长驻 worker 的 builtins 状态可跨请求污染。
3. `projects/app` MCP key 对应应用权限过滤失效，且 MCP Server 创建/更新只要求应用读权限，可能导致只读应用被对外发布、列出和调用。
4. `projects/app` 发布链接微信渠道管理接口只按公开 shareId 校验，可被外部触发登录态修改或退出。
5. `projects/app` HTTP ToolSet 创建、全局 API Key 调用应用、API Key 续聊、历史写删、单条消息删除和反馈管理存在权限边界扩大。
6. `projects/app` workflow debug/chatTest、AgentSkill debugChat、MCP Tool 调试、会话沙箱文件和语音 TTS/STT 接口允许低权限或登录态触发服务端工作流、MCP 出站执行、沙箱文件操作或音频额度消耗，v2 chat stop 也可被 readChatLog 权限成员用于中断他人运行中会话。
7. `projects/app` outLink/team-space chat 绑定缺少 `shareId/source`，历史列表/状态和运行身份归属仍有串读或误归属风险。
8. `projects/app` AgentSkill 版本接口、编辑调试沙箱自定义镜像、旧版/新版问题引导和目录树 parentId 校验存在权限/运行边界缺口。
9. `projects/app` 文件归属、训练队列接口和 app/dataset/collection/AgentSkill 资源树创建/移动 parentId 校验存在跨资源/环形树问题。
10. `projects/app` HTTP Tool runTool、MCP Tool runTool、outLink hookUrl、lafApi、API 知识库预览、营销 workflow 抓取、OpenAPI Schema 解析和 HTTP 工具重定向 SSRF 暴露服务端出站能力。
11. `projects/app` 插件访问 JWT 存在公开默认密钥和任意 payload 信任，invoke 用户信息接口存在身份伪造风险。
12. `projects/app` preLogin 验证码过期只依赖 Mongo TTL，登录校验未判断 `expiredTime`，有效窗口可能大于代码声明；系统默认模型更新也可能因缺字段或无效模型静默重置默认配置。
13. `projects/code-sandbox` Python worker 仍有日志/超时状态残留，volume-manager 和 MCP server 也存在运行健康和配置加载问题。
14. `packages/service` 共享 S3 代签、SSRF 跳转、Plus 请求 helper、模型/Rerank 日志和代理日志存在横向风险。
15. `deploy` 生产/Helm 模板内置多组弱密钥、默认暴露 MinIO/OpenSandbox 控制面，部署后风险高。
