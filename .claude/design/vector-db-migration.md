# 向量数据库迁移方案设计文档

## 1. 需求背景

FastGPT 目前支持三种向量数据库：PostgreSQL (pgvector)、OceanBase、Milvus。用户在实际使用中可能需要在不同向量数据库之间进行迁移，例如：
- 从 PostgreSQL 迁移到 Milvus 以获得更好的扩展性
- 从 Milvus 迁移到 PostgreSQL 以简化运维
- 从一个数据库实例迁移到另一个实例

本方案提供两种迁移模式：
1. **停机版本**：简单直接，适合小规模数据或可接受停机窗口的场景
2. **不停机版本**：支持在线迁移，适合生产环境

## 2. 技术架构

### 2.1 数据结构

所有向量数据库使用统一的数据结构：

```typescript
type VectorRecord = {
  id: string;           // 向量ID (PostgreSQL/OceanBase: BIGINT, Milvus: Int64)
  vector: number[];     // 1536维向量
  teamId: string;       // 团队ID
  datasetId: string;    // 数据集ID
  collectionId: string; // 集合ID
  createTime: Date;     // 创建时间
};
```

### 2.2 迁移架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VectorMigrationController                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │   Source    │───▶│  MigrationCore  │───▶│      Target         │  │
│  │  (PG/OB/MV) │    │                 │    │    (PG/OB/MV)       │  │
│  └─────────────┘    │  - Extract      │    └─────────────────────┘  │
│                     │  - Transform    │                              │
│                     │  - Load         │                              │
│                     │  - Validate     │                              │
│                     └─────────────────┘                              │
│                            │                                         │
│                     ┌──────▼──────┐                                  │
│                     │   MongoDB   │                                  │
│                     │ (ID Mapping)│                                  │
│                     └─────────────┘                                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. 停机版本迁移方案

### 3.1 迁移流程

```
1. 停止应用服务
       ↓
2. 从源数据库导出向量数据 (分页读取)
       ↓
3. 转换数据格式 (适配目标数据库)
       ↓
4. 导入目标数据库 (批量插入)
       ↓
5. 更新 MongoDB 中的向量ID映射 (如果ID发生变化)
       ↓
6. 验证数据完整性
       ↓
7. 切换环境变量指向新数据库
       ↓
8. 启动应用服务
```

### 3.2 核心接口

```typescript
type MigrationConfig = {
  sourceType: 'pg' | 'oceanbase' | 'milvus';
  targetType: 'pg' | 'oceanbase' | 'milvus';
  sourceConfig: DatabaseConfig;
  targetConfig: DatabaseConfig;
  batchSize: number;        // 每批次处理的向量数量，默认 1000
  validateAfterMigration: boolean; // 是否验证迁移结果
};

type MigrationResult = {
  success: boolean;
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  idMappings: Map<string, string>; // 旧ID -> 新ID
  errors: MigrationError[];
  duration: number;         // 迁移耗时(ms)
};
```

### 3.3 实现要点

1. **分页读取**：使用 `getVectorDataByTime` 或基于 ID 的分页查询，避免一次加载全部数据
2. **批量写入**：每批次 500-1000 条记录，减少网络往返
3. **ID 映射**：如果目标数据库生成新 ID，需更新 MongoDB 中 `dataset_datas.indexes[].dataId`
4. **事务保护**：PostgreSQL/OceanBase 使用事务，Milvus 使用批量操作

## 4. 不停机版本迁移方案

### 4.1 迁移流程

```
阶段1: 准备
  1. 创建迁移状态表，记录进度
  2. 初始化目标数据库 schema

阶段2: 全量同步 (后台执行)
  1. 分批读取源数据库的历史数据
  2. 写入目标数据库
  3. 记录每批次完成的时间戳

阶段3: 增量同步 (持续运行)
  1. 监听新写入的数据
  2. 双写：同时写入源和目标数据库
  3. 保持两个数据库同步

阶段4: 切换
  1. 暂停写入操作
  2. 确认增量数据同步完成
  3. 切换读写到目标数据库
  4. 恢复服务
```

### 4.2 双写模式

```typescript
// 在迁移期间，修改 insertDatasetDataVector 函数
const insertDatasetDataVector = async (props) => {
  const migrationState = await getMigrationState();

  if (migrationState === 'migrating') {
    // 双写模式：同时写入源和目标
    const [sourceResult, targetResult] = await Promise.all([
      sourceVector.insert(props),
      targetVector.insert(props)
    ]);

    // 记录 ID 映射
    await saveIdMapping(sourceResult.insertIds, targetResult.insertIds);

    return sourceResult; // 返回源数据库的结果
  }

  return Vector.insert(props);
};
```

### 4.3 同步状态管理

```typescript
type MigrationState = {
  status: 'idle' | 'preparing' | 'full_sync' | 'incremental_sync' | 'switching' | 'completed';
  sourceType: string;
  targetType: string;
  lastSyncedTime: Date;      // 最后同步的时间点
  lastSyncedId: string;      // 最后同步的ID
  totalRecords: number;
  syncedRecords: number;
  startTime: Date;
  errors: MigrationError[];
};
```

## 5. MongoDB ID 更新策略

向量数据在 MongoDB 的 `dataset_datas` 集合中有引用关系：

```typescript
// dataset_datas 文档结构
{
  _id: ObjectId,
  indexes: [
    {
      dataId: string,  // 这是向量数据库中的ID，迁移时需要更新
      text: string,
      type: string
    }
  ]
}
```

### 5.1 ID 更新方案

**方案A: 保持原ID (推荐用于 PostgreSQL ↔ OceanBase)**

PostgreSQL 和 OceanBase 都使用 BIGINT 自增 ID，可以通过指定 ID 插入来保持一致：

```sql
-- PostgreSQL
INSERT INTO modeldata (id, vector, team_id, ...) VALUES ($1, $2, $3, ...);

-- OceanBase
INSERT INTO modeldata (id, vector, team_id, ...) VALUES (?, ?, ?, ...);
```

**方案B: ID 映射表 (适用于涉及 Milvus 的迁移)**

Milvus 的 ID 生成机制不同，需要维护映射关系：

```typescript
// MongoDB 中创建 vector_id_mappings 集合
{
  oldId: string,
  newId: string,
  datasetId: string,
  migratedAt: Date
}

// 迁移完成后批量更新 dataset_datas
await DatasetData.updateMany(
  { 'indexes.dataId': { $in: oldIds } },
  { $set: { 'indexes.$[elem].dataId': newId } },
  { arrayFilters: [{ 'elem.dataId': { $in: oldIds } }] }
);
```

## 6. 文件结构

```
packages/service/common/vectorDB/migration/
├── index.ts                 # 导出迁移功能
├── type.ts                  # 类型定义
├── controller.ts            # 迁移控制器
├── exporters/
│   ├── pg.ts               # PostgreSQL 数据导出
│   ├── oceanbase.ts        # OceanBase 数据导出
│   └── milvus.ts           # Milvus 数据导出
├── importers/
│   ├── pg.ts               # PostgreSQL 数据导入
│   ├── oceanbase.ts        # OceanBase 数据导入
│   └── milvus.ts           # Milvus 数据导入
└── utils.ts                 # 工具函数

projects/app/src/pages/api/admin/
├── migrateVector.ts         # 迁移 API 端点

scripts/
├── migrateVector.ts         # CLI 迁移脚本
```

## 7. API 设计

### 7.1 启动迁移 API

```typescript
// POST /api/admin/migrateVector
type StartMigrationRequest = {
  mode: 'offline' | 'online';  // 停机/不停机
  sourceType: 'pg' | 'oceanbase' | 'milvus';
  targetType: 'pg' | 'oceanbase' | 'milvus';
  targetConfig: {
    address: string;
    token?: string;  // Milvus 用
  };
  options?: {
    batchSize?: number;
    validateAfterMigration?: boolean;
  };
};

type StartMigrationResponse = {
  migrationId: string;
  status: 'started';
  estimatedRecords: number;
};
```

### 7.2 查询迁移状态 API

```typescript
// GET /api/admin/migrateVector/status
type MigrationStatusResponse = {
  migrationId: string;
  status: MigrationState['status'];
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  errors: MigrationError[];
  startTime: Date;
  estimatedTimeRemaining?: number;
};
```

### 7.3 CLI 脚本

```bash
# 停机迁移
pnpm run migrate:vector --mode offline \
  --source pg --source-url "postgresql://..." \
  --target milvus --target-url "http://localhost:19530"

# 不停机迁移 - 启动
pnpm run migrate:vector --mode online --action start \
  --source pg --target milvus --target-url "http://localhost:19530"

# 不停机迁移 - 切换
pnpm run migrate:vector --mode online --action switch

# 查看状态
pnpm run migrate:vector --status
```

## 8. 错误处理与回滚

### 8.1 错误分类

```typescript
type MigrationError = {
  type: 'connection' | 'timeout' | 'data_corruption' | 'id_conflict' | 'unknown';
  message: string;
  recordId?: string;
  timestamp: Date;
  retryable: boolean;
};
```

### 8.2 回滚策略

**停机版本回滚：**
1. 不修改源数据库，保持原样
2. 清空目标数据库中已迁移的数据
3. 恢复环境变量到源数据库
4. 启动服务

**不停机版本回滚：**
1. 停止双写
2. 保留源数据库继续服务
3. 清理目标数据库
4. 清理 MongoDB 中的 ID 映射记录

## 9. 数据验证

### 9.1 验证项目

1. **数量验证**：源和目标的向量总数一致
2. **采样验证**：随机抽取 N 条记录，验证向量内容一致
3. **搜索验证**：使用相同查询向量，验证 Top-K 结果一致性

### 9.2 验证接口

```typescript
type ValidationResult = {
  passed: boolean;
  countMatch: {
    source: number;
    target: number;
    match: boolean;
  };
  sampleMatch: {
    checked: number;
    matched: number;
    mismatched: string[];  // 不匹配的 ID 列表
  };
  searchMatch: {
    queries: number;
    avgOverlap: number;  // Top-K 结果的平均重合度
  };
};
```

## 10. 性能考虑

1. **批量大小**：建议 500-1000 条/批，根据向量维度和网络延迟调整
2. **并发控制**：导出和导入可以并行，但同一数据库的写入需控制并发
3. **内存管理**：流式处理，避免一次性加载大量向量到内存
4. **断点续传**：记录已处理的 ID，支持中断后继续

## 11. 安全考虑

1. 迁移 API 仅限管理员访问
2. 数据库连接信息不记录日志
3. 迁移过程加密传输
4. 迁移完成后清理临时数据
