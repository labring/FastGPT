# 测试说明

## 测试类型

### 1. 单元测试 (`test/app.test.ts`)

基础的 HTTP 端点测试，无需外部依赖。

```bash
bun run test
```

测试内容：
- `/health` 健康检查
- `/openapi` OpenAPI 文档
- Bearer Token 鉴权

### 2. 集成测试 (`test/integration/`)

测试与真实 Sealos API 的集成，需要配置环境变量。

#### 配置步骤

1. 复制环境变量模板：
```bash
cp test/.env.test.template test/.env.test.local
```

2. 编辑 `test/.env.test.local`，填写真实配置：
```env
# 服务器配置
PORT=3000
TOKEN=your-api-token

# Sealos 配置（使用测试环境）- 提供 SEALOS_KC 后集成测试自动运行
SEALOS_BASE_URL=https://your-sealos-api.com
SEALOS_KC=your-kubeconfig-token

# 测试镜像
TEST_IMAGE=nginx:alpine
TEST_SANDBOX_IMAGE=ghcr.io/your-org/sandbox-server:latest
```

3. 运行测试（集成测试会自动运行，如果配置了 SEALOS_KC）：
```bash
bun run test
```

#### 测试内容

**容器生命周期测试** (`test/integration/container.test.ts`)
- ✅ 创建容器
- ✅ 获取容器信息
- ✅ 暂停容器
- ✅ 启动容器
- ✅ 删除容器
- ✅ 幂等性测试（重复创建、删除不存在的容器）

**沙盒操作测试** (`test/integration/sandbox.test.ts`)
- ✅ 健康检查
- ✅ 执行简单命令
- ✅ 捕获 stdout/stderr
- ✅ 工作目录设置
- ✅ 管道命令
- ✅ 多行脚本
- ✅ 错误处理

## 运行测试

### 仅运行单元测试
```bash
bun run test:run
```

### 运行所有测试（包括集成测试）
```bash
# 确保已配置 .env.test.local 并提供 SEALOS_KC
bun run test
```

### 运行特定测试文件
```bash
bun run test test/integration/container.test.ts
```

### 查看测试覆盖率
```bash
bun run test -- --coverage
```

## 注意事项

### 集成测试注意事项

1. **使用测试环境**
   - 不要在生产环境运行集成测试
   - 确保有足够的资源配额

2. **清理资源**
   - 测试会自动清理创建的容器
   - 如果测试中断，可能需要手动清理

3. **网络要求**
   - 需要能访问 Sealos API
   - 需要能拉取测试镜像

4. **超时设置**
   - 容器启动可能需要 60-90 秒
   - 某些测试设置了较长的超时时间

### 环境变量优先级

1. `.env.test.local` - 本地测试配置（不提交到 git）
2. 默认值 - 使用 mock 数据

### 跳过集成测试

如果 `SEALOS_KC` 未提供，集成测试会自动跳过。这样可以避免意外运行集成测试。

## 故障排查

### 测试失败：认证错误
- 检查 `SEALOS_KC` 是否有效
- 确认 token 有足够的权限

### 测试失败：超时
- 增加测试超时时间
- 检查网络连接
- 确认 Sealos 服务正常

### 测试失败：容器创建失败
- 检查资源配额
- 确认镜像可访问
- 查看 Sealos 日志

## 示例

### 运行完整测试流程

```bash
# 1. 配置环境变量
cp test/.env.test.template test/.env.test.local
# 编辑 test/.env.test.local

# 2. 运行测试（集成测试会自动运行）
bun run test
```
