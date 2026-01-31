# 向量数据迁移工具

支持 PostgreSQL、OceanBase、Milvus 之间的向量数据迁移，提供停机版本和不停机版本两种迁移方案。

## 功能特性

### 停机版本（简单迁移）
- ✅ 全量数据导出和导入
- ✅ 批量处理（可配置批次大小）
- ✅ 断点续传支持
- ✅ 进度跟踪
- ✅ 数据验证

### 不停机版本（增量迁移）
- ✅ 全量快照迁移
- ✅ CDC 增量同步
- ✅ 断点续传支持
- ✅ 实时进度跟踪
- ✅ 自动重试机制

## 数据流

### 停机迁移数据流
```
┌──────────┐
│ 源数据库  │
└─────┬────┘
      │ 1. 批量读取 (SQL查询)
      ↓
┌──────────┐
│ CSV文件  │ ← 每批1000-10000条
└─────┬────┘
      │ 2. 格式转换
      ↓
┌──────────┐
│ 中间格式  │ ← 标准JSON/CSV
└─────┬────┘
      │ 3. 批量写入
      ↓
┌──────────┐
│ 目标数据库│
└──────────┘
```

每一步都保存检查点 ✓

### 在线迁移数据流
```
┌──────────┐
│ 源数据库  │
└────┬─────┘
     │
┌────┴──────┐
↓           ↓
┌──────────┐  ┌──────────┐
│全量快照   │  │CDC增量   │
│(一次性)   │  │(持续同步) │
└─────┬────┘  └─────┬────┘
      │             │
      └──────┬──────┘
             ↓
      ┌──────────┐
      │数据合并   │
      └─────┬────┘
            ↓
      ┌──────────┐
      │目标数据库 │
      └──────────┘
```

## 安装依赖

```bash
cd scripts/vector-migration
pnpm install
```

## 配置

创建配置文件 `migration-config.json`：

```json
{
  "source": {
    "type": "pg",
    "pgUrl": "postgresql://username:password@localhost:5432/postgres"
  },
  "target": {
    "type": "oceanbase",
    "oceanbaseUrl": "mysql://root@tenantname:tenantpassword@localhost:2881/test"
  },
  "batchSize": 1000,
  "checkpointDir": "./checkpoints",
  "enableCDC": false,
  "cdcPollInterval": 5000
}
```

### 数据库类型配置

#### PostgreSQL
```json
{
  "type": "pg",
  "pgUrl": "postgresql://username:password@host:port/database"
}
```

#### OceanBase
```json
{
  "type": "oceanbase",
  "oceanbaseUrl": "mysql://username@tenantname:password@host:port/database"
}
```

#### Milvus
```json
{
  "type": "milvus",
  "milvusAddress": "http://localhost:19530",
  "milvusToken": "your-token" // 可选
}
```

## 使用方法

### 停机迁移

```bash
# 使用默认配置文件
node cli.ts migrate

# 指定配置文件
node cli.ts migrate migration-config.json
```

### 在线迁移（增量同步）

```bash
# 启用 CDC 增量同步
node cli.ts migrate-online migration-config.json
```

### 查看迁移状态

```bash
node cli.ts status
```

### 重置检查点

```bash
node cli.ts reset
```

## 迁移流程

### 总体方案
```
开始
  ↓
┌────────────────┐
│ 1. 预检查      │ ← 验证连接、磁盘空间、配置
└───────┬────────┘
        ↓
┌────────────────┐
│ 2. 全量导出    │ ← 分批从源库读取数据
└───────┬────────┘
        ↓
┌────────────────┐
│ 3. 格式转换    │ ← 转换为目标库格式
└───────┬────────┘
        ↓
┌────────────────┐
│ 4. 全量导入    │ ← 分批写入目标库
└───────┬────────┘
        ↓
┌────────────────┐
│ 5. 创建索引    │ ← 建立向量索引
└───────┬────────┘
        ↓
┌────────────────┐
│ 6. 数据验证    │ ← 验证数据一致性
└───────┬────────┘
        ↓
完成
```

## 检查点机制

迁移过程中会自动保存检查点，支持断点续传：

- 检查点文件：`./checkpoints/migration-checkpoint.json`
- 包含信息：
  - 当前迁移阶段
  - 已处理记录数
  - 失败记录数
  - 批次状态
  - 最后更新时间

## 进度跟踪

迁移过程中会实时显示进度：

```
📦 开始全量迁移，共 100 批次
  处理批次 1/100 (offset: 0, limit: 1000)
  ✓ 进度: 1.00% (1000/100000)
  处理批次 2/100 (offset: 1000, limit: 1000)
  ✓ 进度: 2.00% (2000/100000)
  ...
```

## 注意事项

1. **数据一致性**：迁移前建议备份源数据库
2. **性能优化**：
   - 根据数据库性能调整 `batchSize`
   - PostgreSQL/OceanBase 建议 1000-10000
   - Milvus 建议 100-1000
3. **网络稳定性**：确保源数据库和目标数据库之间的网络连接稳定
4. **磁盘空间**：确保有足够的磁盘空间存储检查点文件
5. **CDC 同步**：在线迁移时，CDC 会持续运行，需要手动停止（Ctrl+C）

## 故障恢复

如果迁移过程中断，可以：

1. 检查检查点文件状态
2. 重新运行迁移命令，会自动从断点继续
3. 如需重新开始，使用 `node cli.ts reset` 清除检查点

## 示例场景

### 场景1：PG → OceanBase（停机迁移）

```json
{
  "source": {
    "type": "pg",
    "pgUrl": "postgresql://user:pass@pg-host:5432/db"
  },
  "target": {
    "type": "oceanbase",
    "oceanbaseUrl": "mysql://root@tenant:pass@ob-host:2881/db"
  },
  "batchSize": 5000
}
```

### 场景2：OceanBase → Milvus（在线迁移）

```json
{
  "source": {
    "type": "oceanbase",
    "oceanbaseUrl": "mysql://root@tenant:pass@ob-host:2881/db"
  },
  "target": {
    "type": "milvus",
    "milvusAddress": "http://milvus-host:19530"
  },
  "batchSize": 1000,
  "enableCDC": true,
  "cdcPollInterval": 5000
}
```

## 常见问题

### Q: 迁移速度慢怎么办？
A: 可以增大 `batchSize`，但要注意数据库连接数和内存限制。

### Q: 迁移中断后如何继续？
A: 直接重新运行迁移命令，会自动从检查点继续。

### Q: CDC 同步如何停止？
A: 使用 Ctrl+C 停止进程，检查点会保存当前状态。

### Q: 如何验证迁移结果？
A: 迁移完成后会自动进行数据验证，比较源数据库和目标数据库的记录数。

## 许可证

MIT
