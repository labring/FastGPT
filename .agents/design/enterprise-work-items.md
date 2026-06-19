# FastGPT 企业内部强化工作清单

## 阶段 0：部署闭环 P0

### W0-01 企业 runtime compose

- 状态：已完成
- 目标：新增可用于企业内网部署的 `deploy/runtime/docker-compose.enterprise.yml`
- 交付物：
  - `deploy/runtime/docker-compose.enterprise.yml`
  - `deploy/runtime/README.md`
- 工作项：
  - 从 `document/public/deploy/docker/v4.14/global/docker-compose.pg.yml` 拆出企业版 compose
  - 将 root 密码、token、数据库密码、对象存储密码全部改为 `${ENV}` 注入
  - 默认只暴露 FastGPT Web 入口
  - 移除或注释 MinIO console、MongoDB、PostgreSQL、Redis、插件、沙盒、MCP、AIProxy 的公网端口映射
  - 保留 healthcheck 和内部网络
- 验收：
  - `docker compose config` 能通过
  - 不再包含 `1234`、`token`、`mypassword`、`minioadmin`、`fastgptsecret` 等弱默认值
  - `.env.enterprise` 可驱动 compose

### W0-02 env 与 compose 闭环

- 状态：已完成
- 目标：让 `deploy/enterprise/.env.example` 与 runtime compose 字段完全对齐
- 交付物：
  - 更新 `deploy/enterprise/.env.example`
  - 更新 `deploy/enterprise/check-env.mjs`
- 工作项：
  - 补齐 compose 需要的所有变量
  - 检查脚本新增 compose 变量一致性校验
  - 增加 URL、密码、布尔开关、端口暴露规则检查
- 验收：
  - 复制 `.env.example` 后，替换占位符即可通过检查
  - 缺少任何 compose 必填变量都会失败

### W0-03 CI 安全检查

- 状态：已完成
- 目标：在 GitHub Actions 中强制检查企业部署配置
- 交付物：
  - `.github/workflows/enterprise-security.yml`
- 工作项：
  - 增加 `node --check deploy/enterprise/check-env.mjs`
  - 增加示例 env 负向测试，确认占位符会被拦截
  - 增加 package.json JSON 校验
- 验收：
  - PR 上能自动跑检查
  - 弱默认值测试会失败

### W0-04 反向代理与端口收敛文档

- 状态：已完成
- 目标：说明企业内网应该如何暴露 FastGPT
- 交付物：
  - `deploy/runtime/reverse-proxy.md`
- 工作项：
  - 写 Nginx 或 Traefik 示例
  - 明确 `FE_DOMAIN`、`FILE_DOMAIN`、`ALLOWED_ORIGINS`
  - 明确哪些服务不得对用户网段暴露
  - 说明 `TRUSTED_PROXY_IPS` 配置方法
- 验收：
  - 部署人员能照文档完成 HTTPS 入口和可信代理配置

### W0-05 备份恢复初稿

- 状态：已完成
- 目标：形成最小可用备份恢复 runbook
- 交付物：
  - `deploy/runtime/backup-restore.md`
- 工作项：
  - MongoDB 备份与恢复
  - PgVector/PostgreSQL 备份与恢复
  - Redis 持久化说明
  - MinIO bucket 备份与恢复
  - 恢复演练步骤
- 验收：
  - 可在 staging 完成一次备份和恢复演练

## 阶段 1：身份与权限决策 P0/P1

### W1-01 SSO/权限方案评估

- 状态：已完成
- 目标：决定商业版还是社区版二开
- 交付物：
  - `.agents/design/enterprise-auth-decision.md`
- 工作项：
  - 列出公司 IdP 类型：OIDC、SAML、LDAP、飞书、企业微信、钉钉
  - 对照商业版 SSO、成员同步、团队权限能力
  - 估算社区版二开成本和维护成本
  - 给出推荐路线
- 验收：
  - 有明确选型结论
  - 有成本、风险、周期对比

### W1-02 最小账号治理

- 状态：已完成
- 目标：在正式 SSO 前降低账号风险
- 交付物：
  - 配置文档或代码改动，视选型而定
- 工作项：
  - 禁用或限制自注册
  - root 只用于初始化和应急
  - 配置密码锁定、密码过期、最大登录会话
  - 明确管理员账号发放流程
- 验收：
  - 普通用户不能绕过企业流程注册
  - 管理员账号有记录和回收流程

### W1-03 权限模型落地方案

- 状态：已完成
- 目标：定义应用、知识库、API Key、对话日志的权限边界
- 交付物：
  - `.agents/design/enterprise-permission-model.md`
- 工作项：
  - 定义资源类型
  - 定义角色：Owner、Admin、Editor、User、Viewer
  - 定义默认权限模板
  - 定义离职/转岗权限回收规则
- 验收：
  - 能回答谁可以看、改、删、发布、调用每类资源

## 阶段 2：审计、知识库、运维 P1

### W2-01 审计事件模型

- 状态：已完成
- 目标：定义企业审计日志的事件边界
- 交付物：
  - `.agents/design/audit-event-model.md`
- 工作项：
  - 登录、登出、登录失败
  - 用户、团队、权限变更
  - 应用创建、修改、删除、发布、下线
  - 知识库导入、删除、重建索引
  - API Key 创建、删除、调用异常
  - 模型配置变更
  - 管理员操作
- 验收：
  - 每个事件都有 actor、action、resource、timestamp、requestId、result

### W2-02 审计日志最小实现

- 状态：已完成
- 目标：实现第一版审计写入
- 交付物：
  - 审计 schema
  - 审计写入 service
  - 关键 API 调用点接入
- 工作项：
  - 新建 MongoDB collection
  - 封装 `writeAuditEvent`
  - 接入登录、API Key、知识库、应用基础操作
  - 增加字段脱敏
- 验收：
  - 关键操作能在审计集合查询到
  - 不记录明文 token、密码、密钥

### W2-03 可观测性 runbook

- 状态：已完成
- 目标：明确生产监控与告警
- 交付物：
  - `deploy/runtime/observability.md`
- 工作项：
  - 指标清单
  - 日志清单
  - OTEL collector 建议
  - 告警阈值建议
- 验收：
  - 运维能配置基础 dashboard 和告警

### W2-04 第一个知识库同步源方案

- 状态：已完成
- 目标：选择并设计第一个企业知识源同步
- 交付物：
  - `.agents/design/knowledge-sync-source-1.md`
- 工作项：
  - 选择飞书文档、SharePoint、Confluence 或内部 CMS
  - 设计认证方式
  - 设计增量同步
  - 设计删除同步
  - 设计失败重试和任务日志
- 验收：
  - 能进入实现阶段
  - 权限映射和数据生命周期已定义

### W2-05 RAG POC 评估集

- 状态：已完成
- 目标：用真实部门资料建立评估标准
- 交付物：
  - `.agents/design/rag-poc-evaluation.md`
- 工作项：
  - 选择 30 到 50 个真实问题
  - 标注标准答案和来源文档
  - 记录召回、引用、回答质量
  - 定义通过门槛
- 验收：
  - 每次调整知识库参数后可重复评估

## 阶段 3：治理与发布安全 P2

### W3-01 内容安全策略

- 状态：已完成
- 目标：定义输入输出审核和敏感资料策略
- 交付物：
  - `.agents/design/content-safety-policy.md`
- 工作项：
  - 定义高风险输入
  - 定义高风险输出
  - 定义敏感资料检测规则
  - 设计拦截、告警、人工复核流程
- 验收：
  - 高风险场景有明确处理方式

### W3-02 模型与成本治理

- 状态：已完成
- 目标：控制模型使用范围和成本
- 交付物：
  - `.agents/design/model-cost-governance.md`
- 工作项：
  - 应用级模型白名单
  - 用户/部门/应用级额度
  - token 用量统计
  - 超额处理策略
- 验收：
  - 能追踪谁用了多少、用在哪个应用、调用了哪个模型

### W3-03 应用发布安全

- 状态：已完成
- 目标：统一管理分享链接、iframe、API 发布
- 交付物：
  - `.agents/design/app-publish-security.md`
- 工作项：
  - 分享链接有效期
  - 分享链接访问密码
  - IP/CIDR 限制
  - API Key 到期时间和用途说明
  - 发布审批状态
- 验收：
  - 已发布应用可被盘点、下线、过期和追踪

### W3-04 管理后台/运营看板

- 状态：已完成
- 目标：建立第一版管理可视化
- 交付物：
  - `.agents/design/admin-dashboard.md`
- 工作项：
  - 用户数、团队数、应用数、知识库数
  - 调用量、错误率、模型成本
  - 高风险分享链接和 API Key
  - 最近管理员操作
- 验收：
  - 管理员不用查数据库也能看见关键运行状态

## 当前建议执行顺序

1. W0-01 企业 runtime compose
2. W0-02 env 与 compose 闭环
3. W0-03 CI 安全检查
4. W0-05 备份恢复初稿
5. W1-01 SSO/权限方案评估
6. W2-05 RAG POC 评估集
7. W2-01 审计事件模型
8. W2-03 可观测性 runbook
9. W2-04 第一个知识库同步源方案
10. W3-01 内容安全策略
