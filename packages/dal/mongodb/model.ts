import type { Model, Mongoose, Schema } from 'mongoose';
import { createSlowQueryMiddleware } from './middleware';

/**
 * DAL Model 统一注册入口：同一 client 内按模型名复用，注册前挂慢查询中间件。
 */
export const getDalModel = <T>(
  client: Mongoose,
  name: string,
  schema: Schema,
  collectionName: string
): Model<T> => {
  const existing = client.models[name] as Model<T> | undefined;
  if (existing) return existing;

  createSlowQueryMiddleware(schema);
  return client.model(name, schema, collectionName) as unknown as Model<T>;
};
