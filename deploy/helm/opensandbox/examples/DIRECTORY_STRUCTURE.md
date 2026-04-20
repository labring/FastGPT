# Examples 目录结构

本文档说明 `examples/` 目录的组织结构和设计原则。

## 📂 目录结构

```
examples/
├── README.md                          # 主文档：快速开始、最佳实践
├── DIRECTORY_STRUCTURE.md             # 本文档：目录结构说明
├── pool-examples.md                   # 详细的 Pool 配置说明
│
├── pool-agent-production.yaml         # 🌟 生产级 Agent Pool（推荐）
├── pool-sdk-compatible.yaml           # SDK 基础 Pool（execd only）
├── pool-sdk-with-tasks.yaml           # SDK 完整 Pool（execd + task-executor）
│
├── batchsandbox-basic.yaml            # Non-pooled 模式示例
└── batchsandbox-with-tasks.yaml       # Pooled 批量任务示例
```

## 📝 文件分类

### Pool 配置文件（3 个）

| 文件 | 类型 | SDK 支持 | 自定义 entrypoint | 推荐度 |
|------|------|----------|-----------------|--------|
| `pool-agent-production.yaml` | 生产级 | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| `pool-sdk-with-tasks.yaml` | 完整功能 | ✅ | ✅ | ⭐⭐⭐⭐ |
| `pool-sdk-compatible.yaml` | 基础功能 | ✅ | ❌ | ⭐⭐⭐ |

**选择建议**：
- **生产环境**：使用 `pool-agent-production.yaml`（包含详细注释和最佳实践）
- **快速测试**：使用 `pool-sdk-with-tasks.yaml`（更简洁）
- **特殊需求**：如果不需要自定义 entrypoint，使用 `pool-sdk-compatible.yaml`

### BatchSandbox 配置文件（2 个）

| 文件 | 模式 | 依赖 | 用途 |
|------|------|------|------|
| `batchsandbox-basic.yaml` | Non-pooled | 无 | 演示直接创建 Pod |
| `batchsandbox-with-tasks.yaml` | Pooled | Pool | 演示批量异构任务 |

**使用说明**：
- **SDK 场景**：通常不需要手动创建 BatchSandbox（SDK 自动创建）
- **kubectl 场景**：用于批量任务执行（RL 训练、压力测试等）

### 文档文件（3 个）

| 文件 | 内容 | 面向用户 |
|------|------|---------|
| `README.md` | 快速开始、最佳实践、故障排查 | 所有用户 |
| `pool-examples.md` | Pool 详细配置说明 | 高级用户 |
| `DIRECTORY_STRUCTURE.md` | 目录结构说明 | 开发者 |

## 🎯 设计原则

### 1. 简化选择

**问题**：之前有太多相似的示例（pool-basic, pool-with-execd, pool-with-task-executor...），用户不知道选哪个。

**解决**：
- 保留 3 个 Pool 示例，明确分类和推荐度
- 删除误导性示例（pool-basic 无 execd，pool-with-task-executor 无 execd）
- 突出推荐 `pool-agent-production.yaml`

### 2. 面向实际场景

**问题**：示例文件缺乏实际使用场景说明。

**解决**：
- 明确标注适用场景（Agent 服务、RL 训练、压力测试等）
- 提供完整的 SDK 使用代码示例
- 包含部署、验证、监控的完整流程

### 3. 最佳实践优先

**问题**：缺少生产级配置参考。

**解决**：
- 创建 `pool-agent-production.yaml` 包含：
  - 详细的配置注释
  - 容量规划建议
  - 安全最佳实践
  - 监控和调试指南

### 4. 纠正常见误区

**问题**：用户容易误解 Pool 的使用方式。

**解决**：
- 在 README.md 中突出"常见误区"章节
- 明确说明：
  - Pool 是 Pod 池，不是 Sandbox 池
  - 不需要预创建 BatchSandbox
  - SDK 每次 create() 创建新 BatchSandbox

## 🔄 文件变更历史

### 删除的文件（4 个）

| 文件 | 删除原因 |
|------|---------|
| `pool-basic.yaml` | 无 execd，SDK 无法使用，误导性 |
| `pool-with-task-executor.yaml` | 只有 task-executor 无 execd，不完整 |
| `pool-with-execd.yaml` | execd 启动方式不标准，已被 pool-sdk-compatible.yaml 替代 |
| `batchsandbox-pooled.yaml` | 依赖不存在的 basic-pool，无效 |

### 新增的文件（1 个）

| 文件 | 内容 |
|------|------|
| `pool-agent-production.yaml` | 生产级 Agent Pool 配置，包含详细注释和最佳实践 |

### 修改的文件（3 个）

| 文件 | 修改内容 |
|------|---------|
| `README.md` | 重写，添加场景分类、常见误区、容量规划等 |
| `batchsandbox-with-tasks.yaml` | 修改 poolRef 为 agent-pool，添加注释 |
| `batchsandbox-basic.yaml` | 添加详细注释说明 |

## 📊 使用场景映射

### 场景 A：多 Agent 并发使用

```
用户需求: Agent 服务、Code Interpreter、动态工作流
      ↓
推荐配置: pool-agent-production.yaml
      ↓
  使用方式: SDK 动态创建 sandbox
      ↓
    流程: Helm 部署 Pool → SDK.create() → SDK.kill()
```

### 场景 B：批量任务执行

```
用户需求: RL 训练、压力测试、批量数据处理
      ↓
推荐配置: pool-agent-production.yaml + batchsandbox-with-tasks.yaml
      ↓
  使用方式: kubectl 创建 BatchSandbox
      ↓
    流程: kubectl apply pool → kubectl apply batchsandbox → 自动清理
```

### 场景 C：测试和开发

```
用户需求: 测试特定镜像、验证功能
      ↓
推荐配置: batchsandbox-basic.yaml (non-pooled)
      ↓
  使用方式: kubectl 直接创建
      ↓
    流程: kubectl apply → kubectl delete
```

## 🔗 相关资源

- **深度分析**：`/data/home/cz/sandbox-test/pool-analysis/`
  - Pool 使用指南
  - 架构流程图
  - 验证测试脚本

- **Helm 配置**：`/data/home/cz/OpenSandbox/kubernetes/helm-chart/`
  - `values.yaml` - 默认配置
  - `values-e2e.yaml` - E2E 测试配置
  - 生产/开发环境配置：使用 `--set` 或自定义 values 文件

- **主文档**：`/data/home/cz/OpenSandbox/kubernetes/README.md`
  - Kubernetes 部署完整指南

## 💡 维护建议

### 添加新示例时

1. **明确场景**：每个示例应对应明确的使用场景
2. **完整注释**：包含配置说明、使用方式、注意事项
3. **验证测试**：确保示例可以正常运行
4. **更新文档**：同步更新 README.md 和本文档

### 修改现有示例时

1. **保持兼容**：避免破坏性变更
2. **版本说明**：在注释中说明版本要求
3. **测试验证**：修改后进行完整测试
4. **文档同步**：更新相关文档

### 删除示例时

1. **评估影响**：确认没有外部依赖
2. **提供替代**：在文档中说明替代方案
3. **迁移指南**：如果有用户使用，提供迁移步骤
