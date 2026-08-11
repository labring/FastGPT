import type { Schema } from 'mongoose';
import { getDalLogger } from './logger';

const operations = [
  /^find/,
  'save',
  'create',
  /^update/,
  /^delete/,
  'aggregate',
  'count',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'insertMany'
] as const;

/**
 * DAL Model 的慢查询中间件：只做慢查询计时日志。
 */
export const createSlowQueryMiddleware = (schema: Schema) => {
  operations.forEach((op: any) => {
    schema.pre(op, function (this: any, next) {
      this._startTime = Date.now();
      this._query = this.getQuery ? this.getQuery() : null;
      next();
    });

    schema.post(op, function (this: any, _result, next) {
      if (this._startTime) {
        const logger = getDalLogger();
        const duration = Date.now() - this._startTime;

        const getLogData = () => {
          const collectionName = this.model?.collection?.name || this._model?.collection?.name;
          const operation = (() => {
            if (this.op) return this.op;
            if (this._pipeline) return 'aggregate';
            if (this.constructor?.name === 'model') return 'save/create';
            return this.constructor?.name || 'unknown';
          })();
          return {
            duration,
            collectionName,
            op: operation,
            ...(this._query && { query: this._query }),
            ...(this._pipeline && { pipeline: this._pipeline }),
            ...(this._update && { update: this._update }),
            ...(this._delete && { delete: this._delete })
          };
        };

        if (duration > 2000) {
          logger.warn('MongoDB slow query (>2s)', getLogData());
        } else if (duration > 500) {
          logger.warn('MongoDB slow query (>500ms)', getLogData());
        }
      }
      next();
    });
  });

  return schema;
};
