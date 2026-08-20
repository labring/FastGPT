import { MongoAdapter } from '@fastgpt/dal/mongodb';
import { setDalLogger } from '@fastgpt/dal/mongodb';
import type { DatabaseAdapter } from '@fastgpt/dal/db';
import type { Mongoose } from 'mongoose';
import { connectionMongo } from '../../mongo';
import { getLogger, LogCategories } from '../../logger';

// 把业务 logger 注入 DAL 慢查询中间件，避免 DAL 包反向依赖 service 日志实现。
// 测试环境可能只 mock 部分 LogCategories，这里做存在性防护，未注入时 DAL 退回 console。
if (LogCategories.INFRA?.MONGO) {
  setDalLogger(getLogger(LogCategories.INFRA.MONGO));
}

export const createMongoAdapter = (client: Mongoose = connectionMongo): DatabaseAdapter => {
  return new MongoAdapter({ client });
};
