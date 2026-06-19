# 应用发布安全

## 目标

统一管理 FastGPT 应用的分享链接、iframe、OpenAPI、第三方渠道发布，防止内部应用被无意公开或长期暴露。

## 发布渠道

| 渠道 | 风险 |
| --- | --- |
| 分享链接 | 被转发、长期有效 |
| iframe | 嵌入到未知站点 |
| OpenAPI | API Key 泄漏或滥用 |
| MCP | 工具能力被外部调用 |
| 第三方 IM | 企业微信、飞书、钉钉等渠道权限复杂 |

## 发布策略

1. 默认禁止公开分享。
2. 分享链接必须设置有效期。
3. 高敏感应用禁止 iframe。
4. API Key 必须设置负责人、用途、到期时间。
5. 外部渠道发布必须审批。

## 发布状态

| 状态 | 说明 |
| --- | --- |
| draft | 草稿 |
| pending_review | 待审批 |
| published | 已发布 |
| suspended | 暂停 |
| expired | 过期 |
| revoked | 已撤销 |

## 最小功能

1. 分享链接有效期。
2. 分享链接访问密码。
3. 分享链接 IP/CIDR 限制。
4. API Key 到期时间。
5. API Key 用途说明。
6. 发布清单。
7. 下线操作审计。

## 审计事件

1. `app.publish`
2. `app.unpublish`
3. `shareLink.create`
4. `shareLink.revoke`
5. `apikey.create`
6. `apikey.delete`
7. `mcp.publish`

## 验收

1. 所有发布入口都可被盘点。
2. 过期分享链接不能访问。
3. API Key 可追踪负责人和用途。
4. 高敏感知识库应用不能公开发布。
5. 发布、下线、删除均写入审计。
