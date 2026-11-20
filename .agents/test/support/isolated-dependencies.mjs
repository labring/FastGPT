const testHost = '100.96.142.32';

/** 在读取或写入夹具前验证连接目标与本轮身份一致。 */
export function assertIsolatedMongoTarget({ mongoUri, database, runId }) {
  const target = new URL(mongoUri);
  if (
    !/^[0-9a-f]{32}$/.test(runId) ||
    database !== `fg_it_${runId}` ||
    target.protocol !== 'mongodb:' ||
    target.hostname !== testHost ||
    target.pathname !== `/${database}`
  ) {
    throw new Error('Mongo 连接不属于本轮远端隔离测试库');
  }
}

/** 根据本轮随机身份派生远端独立测试库；拒绝本地、默认 Redis DB 和不可验证的库名。 */
export function deriveIsolatedConnections({ mongoUri, redisUri, pgUri, runId, redisDb }) {
  if (!/^[0-9a-f]{32}$/.test(runId)) throw new Error('无效的隔离测试运行标识');
  if (!Number.isInteger(redisDb) || redisDb < 1 || redisDb > 15) {
    throw new Error('必须选择非默认 Redis 测试 DB');
  }

  const mongo = new URL(mongoUri);
  const redis = new URL(redisUri);
  const pg = new URL(pgUri);
  if (
    mongo.protocol !== 'mongodb:' ||
    !['redis:', 'rediss:'].includes(redis.protocol) ||
    !['postgres:', 'postgresql:'].includes(pg.protocol) ||
    [mongo, redis, pg].some((url) => url.hostname !== testHost)
  ) {
    throw new Error('测试依赖必须使用 Mac Mini 的明确连接');
  }

  const database = `fg_it_${runId}`;
  mongo.pathname = `/${database}`;
  const mongoLog = new URL(mongo);
  mongoLog.pathname = `/${database}_log`;
  redis.pathname = `/${redisDb}`;
  pg.pathname = `/${database}`;
  return {
    database,
    mongoUri: mongo.toString(),
    mongoLogUri: mongoLog.toString(),
    redisUri: redis.toString(),
    pgUri: pg.toString()
  };
}
