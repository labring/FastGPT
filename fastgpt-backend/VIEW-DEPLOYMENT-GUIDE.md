# FastGPT 视图安全方案部署指南

## 一、概述

使用数据库视图（VIEW）替代直接表查询，提供以下安全优势：
- ✅ **隐藏敏感字段**：视图自动排除密码等敏感信息
- ✅ **简化查询**：预定义 JOIN 和过滤条件
- ✅ **权限隔离**：可授权应用只访问视图，不访问原表
- ✅ **向后兼容**：修改表结构时视图作为适配层
- ✅ **保留写操作**：升降级等写操作仍直接操作原表

## 二、数据库部署

### 1. 创建视图

连接到 PostgreSQL 数据库并执行：

```bash
psql -h localhost -U your_username -d fastgpt -f create-views.sql
```

或手动执行 `create-views.sql` 中的 SQL 语句。

### 2. 验证视图创建

```sql
-- 查看所有视图
SELECT table_name FROM information_schema.views WHERE table_schema = 'public';

-- 测试用户视图
SELECT * FROM v_users_safe LIMIT 5;

-- 测试对话记录视图
SELECT * FROM v_chat_logs_with_user LIMIT 5;

-- 测试统计视图
SELECT * FROM v_chat_stats_by_category;
```

### 3. 授权配置（可选，推荐生产环境）

```sql
-- 创建只读应用用户
CREATE USER fastgpt_app_readonly WITH PASSWORD 'your_secure_password';

-- 授权视图访问
GRANT SELECT ON v_users_safe TO fastgpt_app_readonly;
GRANT SELECT ON v_chat_logs_with_user TO fastgpt_app_readonly;
GRANT SELECT ON v_admins TO fastgpt_app_readonly;
GRANT SELECT ON v_chat_stats_by_category TO fastgpt_app_readonly;

-- 授权表的写操作（仅限必要的表）
GRANT INSERT, UPDATE, DELETE ON users TO fastgpt_app_readonly;
GRANT INSERT, UPDATE, DELETE ON chat_logs TO fastgpt_app_readonly;
```

## 三、后端代码部署

### 1. 新增文件列表

已创建以下文件：
- `fastgpt-backend/create-views.sql` - 视图创建脚本
- `fastgpt-backend/src/main/java/com/example/fastgptproject/mapper/UserViewMapper.java` - 用户视图 Mapper
- `fastgpt-backend/src/main/java/com/example/fastgptproject/mapper/ChatLogViewMapper.java` - 对话记录视图 Mapper
- `fastgpt-backend/src/main/java/com/example/fastgptproject/controller/AdminViewController.java` - 视图 API Controller

### 2. 修改文件列表

已修改以下文件：
- `fastgpt-backend/src/main/java/com/example/fastgptproject/service/impl/UserServiceImpl.java` - 使用视图查询用户

### 3. 重新编译后端

```bash
cd fastgpt-backend
./mvnw clean package -DskipTests
```

或在 IDEA 中点击 Maven -> Lifecycle -> package

### 4. 重启后端服务

```bash
java -jar target/fastgpt-project-0.0.1-SNAPSHOT.jar
```

## 四、API 使用说明

### 原有 API（保持不变）

用户升降级、删除等写操作仍使用原 API：

```http
# 提升用户为管理员（写操作，直接操作表）
PUT /api/users/promote/{userId}

# 降级管理员（写操作，直接操作表）
PUT /api/users/demote/{userId}

# 删除用户（写操作，直接操作表）
DELETE /api/users/{userId}
```

### 新增视图 API（只读，更安全）

查询操作推荐使用新的视图 API：

```http
# 获取所有用户（从安全视图，不含密码）
GET /api/admin/view/users

# 获取所有管理员（从管理员视图）
GET /api/admin/view/admins

# 根据用户ID查询用户（从安全视图）
GET /api/admin/view/users/{userId}

# 获取所有对话记录（从视图，包含用户信息）
GET /api/admin/view/chat-logs

# 根据用户ID查询对话记录
GET /api/admin/view/chat-logs/user/{userId}

# 根据分类查询对话记录
GET /api/admin/view/chat-logs/category/{category}

# 获取对话统计数据（按分类）
GET /api/admin/view/chat-stats

# 健康检查
GET /api/admin/view/health
```

## 五、前端集成（可选）

### 修改 config.ts

```typescript
export default {
  // 原有 API（写操作）
  AUTH_API_URL: 'http://localhost:8080/api',
  
  // 新增视图 API（查询操作，更安全）
  VIEW_API_URL: 'http://localhost:8080/api/admin/view'
};
```

### 修改管理后台查询代码

```typescript
// 原来：直接查询表
const response = await fetch(`${config.AUTH_API_URL}/users`);

// 改为：使用视图查询
const response = await fetch(`${config.VIEW_API_URL}/users`);
```

**写操作保持不变**：
```typescript
// 升降级仍使用原 API
await fetch(`${config.AUTH_API_URL}/users/promote/${userId}`, {
  method: 'PUT'
});
```

## 六、测试验证

### 1. 测试视图查询

```bash
# 测试用户视图 API
curl http://localhost:8080/api/admin/view/users

# 测试对话记录视图 API
curl http://localhost:8080/api/admin/view/chat-logs

# 测试统计 API
curl http://localhost:8080/api/admin/view/chat-stats
```

### 2. 测试升降级功能

```bash
# 提升用户为管理员（应该正常工作）
curl -X PUT http://localhost:8080/api/users/promote/123

# 验证：查询该用户，role_id 应为 2
curl http://localhost:8080/api/admin/view/users/123
```

### 3. 验证安全性

```sql
-- 在数据库中验证：视图不包含密码字段
SELECT * FROM v_users_safe WHERE user_name = 'testuser';
-- 结果应该没有 password 列

-- 原表仍包含密码（但不通过视图 API 暴露）
SELECT password FROM users WHERE user_name = 'testuser';
-- 结果应该有加密的密码
```

## 七、优势对比

| 特性 | 直接查询表 | 使用视图查询 |
|------|-----------|-------------|
| 安全性 | ⚠️ 需手动排除敏感字段 | ✅ 自动排除敏感字段 |
| 维护性 | ❌ 每个查询都要处理 | ✅ 统一在视图中处理 |
| 权限控制 | ❌ 难以细粒度控制 | ✅ 可授权视图访问 |
| 代码简洁 | ❌ 需要 `user.setPassword(null)` | ✅ 无需手动处理 |
| 性能 | ✅ 无额外开销 | ✅ 无额外开销（视图是虚拟表） |
| 写操作 | ✅ 直接支持 | ✅ 仍直接操作原表 |

## 八、常见问题

### Q: 视图会影响性能吗？
A: **不会**。视图是虚拟表，查询时 PostgreSQL 会直接查询底层表，性能与直接查询表相同。

### Q: 升降级功能是否还能用？
A: **能用**。升降级、删除等写操作仍直接操作原表（`UPDATE users SET role_id = 2`），不经过视图。

### Q: 如何同时使用视图和原表？
A: **混合使用**：
- **查询**：使用视图 API（`/api/admin/view/*`）
- **写操作**：使用原 API（`/api/users/*`）

### Q: 需要修改前端代码吗？
A: **可选**。如果想用视图 API，只需修改查询接口的 URL。写操作保持不变。

### Q: 视图能否跨数据库使用？
A: 本方案适用于 PostgreSQL、MySQL、SQL Server 等主流数据库，语法略有差异。

## 九、回滚方案

如果需要回滚到直接查询表：

1. 停用视图 API Controller：
```java
// 注释掉 @RestController 注解
// @RestController
public class AdminViewController {
```

2. 删除视图（可选）：
```sql
DROP VIEW IF EXISTS v_users_safe;
DROP VIEW IF EXISTS v_chat_logs_with_user;
DROP VIEW IF EXISTS v_admins;
DROP VIEW IF EXISTS v_chat_stats_by_category;
```

3. 重启后端服务

## 十、生产环境建议

1. **启用视图 API**：所有查询操作使用 `/api/admin/view/*`
2. **配置数据库权限**：创建只读用户，只授权视图访问
3. **监控日志**：记录所有 API 调用，审计敏感操作
4. **定期备份**：视图定义也应包含在备份中
5. **性能优化**：为视图的查询条件创建索引

---

**部署完成后，你的系统将具备更高的安全性，同时保留所有原有功能！**
