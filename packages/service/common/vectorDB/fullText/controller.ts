import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { getVectorType, type VectorType } from '../constants';
import type { SqlFullTextAdapter } from './type';
import {
  preparePgFullText,
  assertPgFullTextCapability,
  getPgFullTextMetadata,
  preflightPgFullText,
  fillPgFullText,
  searchPgFullText,
  PG_FULL_TEXT_ANALYZER_VERSION
} from '../pg/fullText';
import { OceanBaseFullTextAdapter } from '../oceanbase/fullText';
import {
  prepareOpenGaussFullText,
  assertOpenGaussFullTextCapability,
  getOpenGaussFullTextMetadata,
  preflightOpenGaussFullText,
  fillOpenGaussFullText,
  searchOpenGaussFullText,
  OPENGAUSS_FULL_TEXT_ANALYZER_VERSION
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
        analyzerVersion: PG_FULL_TEXT_ANALYZER_VERSION,
        prepare: preparePgFullText,
        assertCapability: assertPgFullTextCapability,
        getMetadata: getPgFullTextMetadata,
        preflight: preflightPgFullText,
        fill: fillPgFullText,
        search: searchPgFullText
      };
    if (provider === 'opengauss')
      return {
        provider,
        analyzerVersion: OPENGAUSS_FULL_TEXT_ANALYZER_VERSION,
        prepare: prepareOpenGaussFullText,
        assertCapability: assertOpenGaussFullTextCapability,
        getMetadata: getOpenGaussFullTextMetadata,
        preflight: preflightOpenGaussFullText,
        fill: fillOpenGaussFullText,
        search: searchOpenGaussFullText
      };
    return new OceanBaseFullTextAdapter(provider);
  })();
  adapters.set(provider, adapter);
  return adapter;
};
