# 使用指南

## 快速开始

### 1. 安装依赖

```bash
cd scripts/vector-migration
pnpm install
# 或
npm install
```

### 2. 创建配置文件

复制示例配置文件并修改：

```bash
cp migration-config.example.json migration-config.json
```

编辑 `migration-config.json`，配置源数据库和目标数据库连接信息。

### 3. 执行迁移

#### 停机迁移（推荐用于小数据量或可以停机的场景）

```bash
pnpm migrate migration-config.json
```

#### 在线迁移（支持增量同步，适合大数据量或不能停机的场景）

```bash
pnpm migrate-online migration-config.json
```

## 配置说明

### 基本配置

```json
{
  "source": {
    "type": "pg",  // 源数据库类型: pg | oceanbase | milvus
    "pgUrl": "postgresql://user:pass@host:5432/db"
  },
  "target": {
    "type": "oceanbase",  // 目标数据库类型
    "oceanbaseUrl": "mysql://root@tenant:pass@host:2881/db"
  },
  "batchSize": 1000,  // 每批处理数量
  "checkpointDir": "./checkpoints",  // 检查点目录
  "enableCDC": false,  // 是否启用 CDC（仅在线迁移）
  "cdcPollInterval": 5000  // CDC 轮询间隔（毫秒）
}
```

### PostgreSQL 配置

```json
{
  "type": "pg",
  "pgUrl": "postgresql://username:password@host:port/database"
}
```

### OceanBase 配置

```json
{
  "type": "oceanbase",
  "oceanbaseUrl": "mysql://username@tenantname:password@host:port/database"
}
```

注意：OceanBase 的连接字符串格式为 `mysql://用户名@租户名:密码@主机:端口/数据库`

### Milvus 配置

```json
{
  "type": "milvus",
  "milvusAddress": "http://localhost:19530",
  "milvusToken": "your-token"  // 可选，Zilliz Cloud 需要
}
```

## 迁移场景示例

### 场景 1: PostgreSQL → OceanBase（停机迁移）

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

执行：
```bash
pnpm migrate migration-config.json
```

### 场景 2: OceanBase → Milvus（在线迁移）

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
  "batchSize": 1000,
  "enableCDC": true,
  "cdcPollInterval": 5000
}
```

执行：
```bash
pnpm migrate-online migration-config.json
```

### 场景 3: Milvus → PostgreSQL（停机迁移）

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
  "batchSize": 500
}
```

执行：
```bash
pnpm migrate migration-config.json
```

## 命令说明

### migrate / migrate-offline

执行停机迁移（全量迁移）。

```bash
pnpm migrate [config-file]
```

特点：
- 全量数据迁移
- 支持断点续传
- 迁移完成后自动验证数据一致性

### migrate-online

执行在线迁移（增量迁移 + CDC）。

```bash
pnpm migrate-online [config-file]
```

特点：
- 先执行全量快照迁移
- 然后持续进行 CDC 增量同步
- 支持断点续传
- 需要手动停止（Ctrl+C）

### status

查看迁移状态。

```bash
pnpm status
```

显示：
- 当前迁移阶段
- 已处理记录数
- 失败记录数
- 批次统计信息

### reset

清除检查点，重新开始迁移。

```bash
pnpm reset
```

⚠️ 警告：清除检查点后，迁移将从零开始。

## 性能优化建议

### 批次大小调整

根据数据库性能和网络情况调整 `batchSize`：

- **PostgreSQL**: 1000-10000（推荐 5000）
- **OceanBase**: 1000-10000（推荐 5000）
- **Milvus**: 100-1000（推荐 500）

### 网络优化

- 确保源数据库和目标数据库之间的网络延迟低
- 如果跨地域迁移，考虑使用 VPN 或专线

### 数据库优化

迁移前可以：
- 临时关闭不必要的索引（迁移后重建）
- 增加数据库连接池大小
- 调整数据库内存配置

## 故障处理

### 迁移中断

如果迁移过程中断：

1. 检查检查点文件：`./checkpoints/migration-checkpoint.json`
2. 查看迁移状态：`pnpm status`
3. 重新运行迁移命令，会自动从断点继续

### 数据不一致

如果迁移后数据不一致：

1. 检查错误日志
2. 使用 `pnpm reset` 清除检查点
3. 重新执行迁移

### CDC 同步停止

如果在线迁移的 CDC 同步停止：

1. 记录最后同步时间（检查点文件中的 `lastTimestamp`）
2. 手动同步该时间之后的数据
3. 或重新启动在线迁移

## 注意事项

1. **备份数据**：迁移前务必备份源数据库
2. **测试环境**：建议先在测试环境验证迁移流程
3. **网络稳定**：确保网络连接稳定，避免迁移中断
4. **磁盘空间**：确保有足够的磁盘空间存储检查点文件
5. **权限检查**：确保数据库用户有足够的读写权限
6. **索引重建**：迁移完成后，根据需要在目标数据库重建索引

## 常见问题

### Q: 迁移速度很慢怎么办？

A: 
1. 增大 `batchSize`
2. 检查网络延迟
3. 检查数据库性能
4. 考虑使用并行迁移（需要修改代码）

### Q: 如何验证迁移结果？

A: 迁移完成后会自动进行数据验证，比较源数据库和目标数据库的记录数。也可以手动查询对比。

### Q: CDC 同步会一直运行吗？

A: 是的，CDC 同步会持续运行直到手动停止（Ctrl+C）。停止后检查点会保存当前状态。

### Q: 可以同时迁移多个表吗？

A: 当前版本只支持单个表（modeldata）的迁移。如需迁移多个表，需要多次执行迁移命令。

### Q: 支持哪些数据库版本？

A: 
- PostgreSQL: 12+ (需要 pgvector 扩展)
- OceanBase: 4.x+
- Milvus: 2.x+

## 技术支持

如遇到问题，请：
1. 查看错误日志
2. 检查配置文件格式
3. 查看检查点文件状态
4. 提交 Issue 到项目仓库
