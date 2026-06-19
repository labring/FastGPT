# FastGPT 备份恢复 runbook

## 范围

企业 runtime 默认包含以下持久化数据：

| 组件 | 数据 | 卷 |
| --- | --- | --- |
| MongoDB | 用户、团队、应用、知识库元数据、对话等 | `fastgpt-mongo` |
| PostgreSQL/PgVector | 向量索引 | `fastgpt-pg` |
| Redis | 缓存、流式恢复等临时状态 | `fastgpt-redis` |
| MinIO | 上传文件、知识库源文件、私有对象 | `fastgpt-minio` |
| AIProxy PostgreSQL | 模型网关配置和日志 | `fastgpt-aiproxy-pg` |

## 备份频率建议

| 数据 | 频率 | 保留 |
| --- | --- | --- |
| MongoDB | 每日全量，关键变更前手动备份 | 30 天 |
| PostgreSQL/PgVector | 每日全量，关键变更前手动备份 | 30 天 |
| MinIO | 每日增量或对象存储生命周期备份 | 30 到 90 天 |
| AIProxy PostgreSQL | 每日全量 | 30 天 |
| Redis | 不作为核心恢复来源，保留 AOF/RDB 即可 | 7 天 |

## 备份目录

示例使用宿主机目录：

```bash
set -a
source ../enterprise/.env.enterprise
set +a
export BACKUP_DIR=/data/backups/fastgpt/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
```

## MongoDB 备份

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-mongo \
  mongodump \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --archive \
  --gzip > "$BACKUP_DIR/mongo.archive.gz"
```

恢复：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-mongo \
  mongorestore \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --archive \
  --gzip \
  --drop < "$BACKUP_DIR/mongo.archive.gz"
```

## PostgreSQL/PgVector 备份

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-vector \
  pg_dump \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --format custom \
  --file /tmp/fastgpt-vector.dump

docker cp fastgpt-pg:/tmp/fastgpt-vector.dump "$BACKUP_DIR/fastgpt-vector.dump"
```

恢复：

```bash
docker cp "$BACKUP_DIR/fastgpt-vector.dump" fastgpt-pg:/tmp/fastgpt-vector.dump

docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-vector \
  pg_restore \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --clean \
  --if-exists \
  /tmp/fastgpt-vector.dump
```

## AIProxy PostgreSQL 备份

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-aiproxy-pg \
  pg_dump \
  --username "$AIPROXY_POSTGRES_USER" \
  --dbname "$AIPROXY_POSTGRES_DB" \
  --format custom \
  --file /tmp/aiproxy.dump

docker cp fastgpt-aiproxy-pg:/tmp/aiproxy.dump "$BACKUP_DIR/aiproxy.dump"
```

恢复：

```bash
docker cp "$BACKUP_DIR/aiproxy.dump" fastgpt-aiproxy-pg:/tmp/aiproxy.dump

docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec -T fastgpt-aiproxy-pg \
  pg_restore \
  --username "$AIPROXY_POSTGRES_USER" \
  --dbname "$AIPROXY_POSTGRES_DB" \
  --clean \
  --if-exists \
  /tmp/aiproxy.dump
```

## MinIO 备份

推荐使用对象存储原生复制、快照或 `mc mirror`。示例：

```bash
mc alias set fastgpt-minio "$STORAGE_EXTERNAL_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mirror --overwrite fastgpt-minio/"$STORAGE_PUBLIC_BUCKET" "$BACKUP_DIR/minio-public"
mc mirror --overwrite fastgpt-minio/"$STORAGE_PRIVATE_BUCKET" "$BACKUP_DIR/minio-private"
```

恢复：

```bash
mc mirror --overwrite "$BACKUP_DIR/minio-public" fastgpt-minio/"$STORAGE_PUBLIC_BUCKET"
mc mirror --overwrite "$BACKUP_DIR/minio-private" fastgpt-minio/"$STORAGE_PRIVATE_BUCKET"
```

## Redis

Redis 主要用于缓存和临时状态，不建议作为核心恢复来源。当前 compose 开启 appendonly，可以保留卷级快照。

如需手动保存：

```bash
docker compose --env-file ../enterprise/.env.enterprise -f docker-compose.enterprise.yml exec fastgpt-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
```

## 恢复演练流程

1. 在 staging 准备一套空环境。
2. 停止 FastGPT 主服务和写入流量。
3. 恢复 MongoDB。
4. 恢复 PgVector。
5. 恢复 MinIO bucket。
6. 恢复 AIProxy PostgreSQL。
7. 启动所有服务。
8. 登录 root 或管理员账号。
9. 检查应用列表、知识库列表、文件预览、RAG 检索、模型调用。
10. 记录恢复耗时和失败点。

## 升级前检查

升级前必须完成：

1. 生成一次完整备份。
2. 在 staging 完成恢复演练。
3. 记录当前镜像 tag。
4. 记录当前 `.env.enterprise` 和 `config.json` 的安全副本。
5. 准备回滚镜像 tag 和备份路径。
