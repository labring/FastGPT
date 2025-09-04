# FastGPT 评估权限功能测试

这个目录包含了FastGPT评估模块权限控制功能的端到端功能测试。

## 测试概述

功能测试通过真实的HTTP请求验证评估权限系统的正确性，包括：

- ✅ **权限认证**: 验证用户身份和权限获取
- ✅ **权限过滤**: 验证只返回用户有权限访问的资源
- ✅ **CRUD权限**: 验证创建、读取、更新、删除操作的权限控制
- ✅ **权限层次**: 验证read < write < manage的权限层次关系
- ✅ **边界测试**: 验证无效请求和异常情况的处理

## 文件说明

### 核心测试文件
- `demo.js` - 基础功能演示脚本
- `evaluation-permissions.test.ts` - 完整功能测试套件
- `evaluation-permissions-simple.test.ts` - 简化功能测试套件
- `run-evaluation-tests.sh` - 测试运行脚本

### 配置和文档
- `.env.example` - 环境变量配置示例
- `get-token-guide.md` - Token获取指南
- `README.md` - 本说明文档

## 测试文件

### 1. 基础功能测试
**文件**: `evaluation-permissions-simple.test.ts`

这是一个轻量级的测试，适合快速验证基本功能：
- 验证API可访问性
- 验证权限信息返回
- 验证无认证请求拒绝
- 验证响应时间合理性

### 2. 完整功能测试  
**文件**: `evaluation-permissions.test.ts`

这是一个全面的测试套件，包含：
- 多用户权限测试
- 资源生命周期测试（创建→读取→更新→删除）
- 权限边界和异常处理测试
- 性能测试

## 快速开始

### 1. 配置环境

复制环境配置模板：
```bash
cp test/cases/function/packages/service/support/permission/evaluation/.env.example test/cases/function/packages/service/support/permission/evaluation/.env
```

编辑 `.env` 文件，填入必需的配置：
```env
# FastGPT服务地址
FASTGPT_BASE_URL=http://localhost:3000

# 基础测试令牌（必需）
TEST_TOKEN=your-auth-token-here
```

### 2. 获取测试令牌

1. 在FastGPT前端登录
2. 打开浏览器开发者工具 (F12)
3. 转到Network标签页，刷新页面
4. 找到任意API请求，复制Authorization header的值
5. 将令牌填入 `.env` 文件的 `TEST_TOKEN` 字段

### 3. 运行测试

#### 方法一：demo演示脚本
```bash
node test/cases/function/packages/service/support/permission/evaluation/demo.js
```

#### 方法二：使用自动化脚本
```bash
chmod +x test/cases/function/packages/service/support/permission/evaluation/run-evaluation-tests.sh
./test/cases/function/packages/service/support/permission/evaluation/run-evaluation-tests.sh
```

#### 方法三：直接运行测试
```bash
# 基础功能测试
pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions-simple.test.ts

# 完整功能测试
pnpm test test/cases/function/packages/service/support/permission/evaluation/evaluation-permissions.test.ts
```

## 环境配置详解

### 必需配置
- `FASTGPT_BASE_URL`: FastGPT服务的基础URL
- `TEST_TOKEN`: 有效的用户认证令牌

### 可选配置（用于高级测试）
- `OWNER_TOKEN`: 拥有管理权限的用户令牌
- `MEMBER_TOKEN`: 普通成员用户令牌  
- `READONLY_TOKEN`: 只读权限用户令牌
- `NO_ACCESS_TOKEN`: 无权限用户令牌
- `TEST_APP_ID`: 测试用的应用ID

## 测试场景

### 基础权限验证
- ✅ 验证已认证用户可以访问资源列表
- ✅ 验证未认证用户被正确拒绝
- ✅ 验证返回的资源包含正确的权限信息
- ✅ 验证权限层次关系（manage > write > read）

### 资源级权限
- ✅ **评估任务**: 验证任务的创建、查看、修改、删除权限
- ✅ **评估数据集**: 验证数据集的权限控制
- ✅ **评估指标**: 验证指标的权限控制

### 权限过滤
- ✅ 验证列表API只返回用户有读权限的资源
- ✅ 验证详情API正确返回权限信息
- ✅ 验证无权限资源被正确过滤

### 异常情况
- ✅ 无效令牌处理
- ✅ 过期令牌处理
- ✅ 不存在的资源ID处理
- ✅ 网络超时处理

## 性能测试

功能测试还包含性能验证：
- 权限检查不应显著影响API响应时间（< 5秒）
- 大量数据的权限过滤应该高效（< 3秒）
- 并发权限验证应该稳定

## 故障排查

### 测试失败常见原因

1. **连接失败**
   - 检查`FASTGPT_BASE_URL`配置是否正确
   - 确认FastGPT服务正在运行
   - 检查网络连接

2. **认证失败 (401/403)**
   - 检查`TEST_TOKEN`是否有效
   - 令牌可能已过期，需要重新获取
   - 确认用户有足够的权限

3. **权限验证失败**
   - 检查用户是否对测试资源有相应权限
   - 确认权限系统配置正确

4. **超时错误**
   - 检查服务响应性能
   - 可以适当增加超时时间配置

### 调试技巧

1. **启用详细日志**：测试会输出详细的操作信息
2. **逐步测试**：先运行基础测试，再运行完整测试
3. **检查API响应**：查看控制台输出的错误详情

## 扩展测试

如需添加新的测试场景：

1. **添加新API端点测试**：在`EvaluationAPIClient`中添加新方法
2. **添加新权限场景**：在测试用例中添加新的权限验证逻辑
3. **添加性能测试**：在性能测试部分添加新的基准测试

## 最佳实践

1. **定期运行**：在权限相关代码变更后运行功能测试
2. **CI/CD集成**：将测试集成到持续集成流水线
3. **多环境测试**：在开发、测试、预生产环境都运行测试
4. **监控性能**：关注权限验证对API性能的影响

## 测试报告

测试完成后会显示：
- ✅ 通过的测试数量
- ❌ 失败的测试详情
- ⏱️ 性能指标
- 📊 权限验证覆盖率

示例输出：
```
🎉 评估权限功能测试完成！
✅ 基础功能测试: 通过 (5/5)
✅ 完整功能测试: 通过 (15/15)  
⏱️ 平均响应时间: 245ms
📊 权限验证覆盖率: 100%
```

## 支持

如遇到问题，请：
1. 查看故障排查部分
2. 检查控制台错误输出
3. 提交issue到FastGPT仓库