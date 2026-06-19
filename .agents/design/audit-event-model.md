# 企业审计事件模型

## 目标

建立统一审计事件模型，用于追踪企业内部 FastGPT 中的登录、权限、应用、知识库、API Key、模型配置和管理员操作。

## 事件字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `timestamp` | 是 | 事件发生时间 |
| `action` | 是 | 动作，例如 `user.login.success` |
| `result` | 是 | `success` 或 `failure` |
| `actor` | 是 | 操作者信息 |
| `resource` | 否 | 被操作资源 |
| `requestId` | 否 | 请求 ID |
| `clientIp` | 否 | 客户端 IP |
| `userAgent` | 否 | User-Agent |
| `metadata` | 否 | 额外上下文，必须脱敏 |

## actor

```ts
type AuditActor = {
  type: 'user' | 'root' | 'apikey' | 'system' | 'anonymous';
  userId?: string;
  teamId?: string;
  tmbId?: string;
  apiKeyId?: string;
  name?: string;
};
```

## resource

```ts
type AuditResource = {
  type:
    | 'user'
    | 'team'
    | 'app'
    | 'dataset'
    | 'collection'
    | 'apikey'
    | 'shareLink'
    | 'modelConfig'
    | 'systemConfig'
    | 'auditLog';
  id?: string;
  name?: string;
};
```

## 动作命名

采用 `domain.resource.action` 或 `domain.action.result`。

| 动作 | 说明 |
| --- | --- |
| `user.login.success` | 登录成功 |
| `user.login.failure` | 登录失败 |
| `user.logout` | 登出 |
| `user.password.change` | 修改密码 |
| `team.member.add` | 添加成员 |
| `team.member.disable` | 禁用成员 |
| `permission.assign` | 授权 |
| `permission.revoke` | 回收权限 |
| `app.create` | 创建应用 |
| `app.update` | 更新应用 |
| `app.delete` | 删除应用 |
| `app.publish` | 发布应用 |
| `dataset.create` | 创建知识库 |
| `dataset.update` | 更新知识库 |
| `dataset.delete` | 删除知识库 |
| `dataset.collection.import` | 导入知识库文件 |
| `dataset.collection.delete` | 删除知识库文件 |
| `apikey.create` | 创建 API Key |
| `apikey.delete` | 删除 API Key |
| `model.config.update` | 修改模型配置 |
| `system.config.update` | 修改系统配置 |
| `audit.export` | 导出审计日志 |

## 脱敏规则

不得记录：

1. 明文密码。
2. API Key 全量值。
3. token、secret、cookie、authorization header。
4. 模型供应商密钥。
5. 文件完整内容。

允许记录：

1. API Key 后 4 位。
2. 资源 ID。
3. 资源名称。
4. 错误码。
5. 请求来源 IP。

## 存储

第一阶段写入 MongoDB log connection，集合名：

```text
enterpriseAuditLogs
```

建议索引：

1. `{ timestamp: -1 }`
2. `{ action: 1, timestamp: -1 }`
3. `{ "actor.teamId": 1, timestamp: -1 }`
4. `{ "actor.userId": 1, timestamp: -1 }`
5. `{ "resource.type": 1, "resource.id": 1, timestamp: -1 }`

## 保留周期

默认保留 365 天。若公司有合规要求，以公司要求为准。

## 第一批接入点

1. 登录成功。
2. 登录失败。
3. API Key 创建、删除。
4. 应用创建、更新、删除、发布。
5. 知识库创建、更新、删除、导入文件。
6. 模型配置更新。

## 验收

1. 登录成功和失败会写入审计集合。
2. 写审计失败不影响主流程。
3. 审计日志不包含明文密码和 token。
4. 可按用户、团队、资源、时间查询。
