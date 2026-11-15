import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { getVectorType, type VectorType } from '../constants';
import type { SqlFullTextAdapter } from './type';
import { getLogger, LogCategories } from '../../logger';
import {
  preparePgFullText,
  assertPgFullTextCapability,
  getPgFullTextMetadata,
  fillPgFullText,
  findMissingPgVectorIds,
  searchPgFullText
} from '../pg/fullText';
import { OceanBaseFullTextAdapter } from '../oceanbase/fullText';
import {
  prepareOpenGaussFullText,
  assertOpenGaussFullTextCapability,
  getOpenGaussFullTextMetadata,
  fillOpenGaussFullText,
  findMissingOpenGaussVectorIds,
  searchOpenGaussFullText
} from '../opengauss/fullText';

const adapters = new Map<SqlFullTextProvider, SqlFullTextAdapter>();

/** 只缓存无业务阶段的物理适配器；单个部署按当前 provider 执行同一套迁移编排。 */
export const getSqlFullTextAdapter = (
  provider: VectorType = getVectorType()
): SqlFullTextAdapter => {
  if (provider === 'milvus') throw new Error('Milvus uses its existing native full-text path');
  const cached = adapters.get(provider);
  if (cached) return cached;
  const adapter: SqlFullTextAdapter = (() => {
    if (provider === 'pg')
      return {
        provider,
        prepare: preparePgFullText,
        assertCapability: assertPgFullTextCapability,
        getMetadata: getPgFullTextMetadata,
        fill: fillPgFullText,
        findMissingVectorIds: findMissingPgVectorIds,
        search: searchPgFullText
      };
    if (provider === 'opengauss')
      return {
        provider,
        prepare: prepareOpenGaussFullText,
        assertCapability: assertOpenGaussFullTextCapability,
        getMetadata: getOpenGaussFullTextMetadata,
        fill: fillOpenGaussFullText,
        findMissingVectorIds: findMissingOpenGaussVectorIds,
        search: searchOpenGaussFullText
      };
    return new OceanBaseFullTextAdapter(provider);
  })();
  // 启动后台构建与手动迁移可能同时准备同一目标，共享当次 Promise，避免本进程重复 DDL。
  const prepare = adapter.prepare.bind(adapter);
  let preparing: ReturnType<SqlFullTextAdapter['prepare']> | undefined;
  adapter.prepare = () => {
    preparing ??= prepare().finally(() => {
      preparing = undefined;
    });
    return preparing;
  };
  adapters.set(provider, adapter);
  return adapter;
};

/**
 * 基础表和词串列就绪后异步准备全文索引，不让重型 DDL 延长节点启动等待。
 * 失败仅记录告警，迁移仍会重新准备并严格核验；索引构建不代表允许原生切读。
 * 此处仅解除应用启动等待，数据库自身的建索引锁仍由各 provider 管理。
 */
export const startSqlFullTextIndexBuild = (provider: SqlFullTextProvider): void => {
  void getSqlFullTextAdapter(provider)
    .prepare()
    .catch((error) => {
      getLogger(LogCategories.INFRA.VECTOR).warn('SQL full-text background index build failed', {
        provider,
        error
      });
    });
};
