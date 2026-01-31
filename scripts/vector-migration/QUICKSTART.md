# 快速开始指南

## 5 分钟快速上手

### 1. 安装依赖

```bash
cd scripts/vector-migration
pnpm install
```

### 2. 创建配置文件

创建 `migration-config.json`：

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
  "batchSize": 1000
}
```

### 3. 执行迁移

```bash
# 停机迁移（推荐首次使用）
pnpm migrate migration-config.json

# 或使用 tsx 直接运行
npx tsx cli.ts migrate migration-config.json
```

### 4. 查看进度

迁移过程中会实时显示进度：

```
🔍 开始预检查...
  连接源数据库...
  ✓ 源数据库记录数: 100000
  连接目标数据库...
  ✓ 目标数据库记录数: 0
📦 开始全量迁移，共 100 批次
  处理批次 1/100 (offset: 0, limit: 1000)
  ✓ 进度: 1.00% (1000/100000)
  ...
```

### 5. 查看状态

```bash
pnpm status
```

## 常见配置示例

### PostgreSQL → OceanBase

```json
{
  "source": {
    "type": "pg",
    "pgUrl": "postgresql://fastgpt:password@pg-server:5432/fastgpt"
  },
  "target": {
    "type": "oceanbase",
    "oceanbaseUrl": "mysql://root@tenantname:password@ob-server:2881/fastgpt"
  },
  "batchSize": 5000
}
```

### OceanBase → Milvus

```json
{
  "source": {
    "type": "oceanbase",
    "oceanbaseUrl": "mysql://root@tenantname:password@ob-server:2881/fastgpt"
  },
  "target": {
    "type": "milvus",
    "milvusAddress": "http://milvus-server:19530"
  },
  "batchSize": 1000
}
```

### Milvus → PostgreSQL（在线迁移）

```json
{
  "source": {
    "type": "milvus",
    "milvusAddress": "http://milvus-server:19530"
  },
  "target": {
    "type": "pg",
    "pgUrl": "postgresql://fastgpt:password@pg-server:5432/fastgpt"
  },
  "batchSize": 500,
  "enableCDC": true,
  "cdcPollInterval": 5000
}
```

## 故障处理

### 迁移中断

如果迁移过程中断，直接重新运行命令即可，会自动从检查点继续：

```bash
pnpm migrate migration-config.json
```

### 重新开始

如果需要重新开始迁移：

```bash
pnpm reset
pnpm migrate migration-config.json
```

### 查看详细状态

```bash
pnpm status
```

会显示：
- 当前阶段
- 已处理记录数
- 失败记录数
- 批次统计

## 性能调优

### 批次大小建议

- **小数据量 (< 10万)**: `batchSize: 1000`
- **中等数据量 (10万-100万)**: `batchSize: 5000`
- **大数据量 (> 100万)**: `batchSize: 10000`

### Milvus 特殊说明

Milvus 建议使用较小的批次：

```json
{
  "batchSize": 500  // Milvus 推荐 100-1000
}
```

## 注意事项

1. ⚠️ **备份数据**: 迁移前务必备份源数据库
2. ⚠️ **测试环境**: 建议先在测试环境验证
3. ⚠️ **网络稳定**: 确保网络连接稳定
4. ⚠️ **磁盘空间**: 确保有足够空间存储检查点

## 获取帮助

- 查看完整文档: `README.md`
- 查看使用指南: `USAGE.md`
- 查看实现总结: `SUMMARY.md`

## 下一步

迁移完成后：
1. 验证数据一致性（工具会自动验证）
2. 检查目标数据库索引
3. 更新应用配置指向新数据库
4. 测试应用功能
