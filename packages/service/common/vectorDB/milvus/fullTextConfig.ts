import { DataType, FunctionType } from '@zilliz/milvus2-sdk-node';
import type {
  FieldType,
  FunctionObject
} from '@zilliz/milvus2-sdk-node/dist/milvus/types/Collection';
import type { CreateIndexSimpleReq } from '@zilliz/milvus2-sdk-node/dist/milvus/types/MilvusIndex';
import { serviceEnv } from '../../../env';

export const MILVUS_TEXT_MAX_LENGTH = 65535;
export const MILVUS_QUERY_MAX_LENGTH = 4000;

/**
 * 召回 over-fetch:一条数据可产出多条向量(Q/A/摘要/自定义索引),同一 dataId 的向量在
 * BM25 top-K 里可能聚簇。先多取若干向量、再按 dataId 去重补足到 limit 条不同数据,
 * 避免下游按 dataId 去重后召回结果不足。FACTOR 为单轮取向量倍率,MAX 为单次召回取回向量总上限。
 *
 * 取值约束:召回 limit 常见 60/100,必须满足 `limit * FACTOR < MAX` 才能保留第二轮兜底
 * (search() 中 `fetchBatch < MAX` 才触发第二轮)。FACTOR=2 时 limit=100 首轮 200 行,仍小于
 * MAX=500;若 FACTOR=5,limit=100 首轮 500=MAX,第二轮会被静默禁用,高扇出时结果不足。
 */
export const FULL_TEXT_OVER_FETCH_FACTOR = 2;
export const FULL_TEXT_OVER_FETCH_MAX = 500;

/**
 * 按 UTF-8 字节截断文本。
 * Milvus VarChar max_length 按字节计(中文等 3 字节字符),JS 的 String.length 按 UTF-16
 * 码元计,直接用 slice 截到字符数会超字节上限导致写入失败。这里逐码点累计字节预算,
 * 返回不超过 maxBytes 的合法前缀(不拆代理对/emoji)。
 */
export const truncateFullTextByBytes = (text: string, maxBytes: number): string => {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;

  let bytes = 0;
  let index = 0; // UTF-16 索引(供 slice,代理对占 2 码元)
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    index += char.length;
  }
  return text.slice(0, index);
};

export type MilvusIndexParam = Omit<CreateIndexSimpleReq, 'collection_name'>;

export type LanguageIdentifier = 'lingua' | 'whatlang';

export const getMilvusLanguageIdentifier = (): LanguageIdentifier => {
  const value = serviceEnv.MILVUS_LANGUAGE_IDENTIFIER;
  if (value === 'lingua' || value === 'whatlang') return value;
  throw new Error(`Invalid MILVUS_LANGUAGE_IDENTIFIER: ${value}`);
};

// BM25 Function: input text -> output sparse vector
export const createBM25Function = (): FunctionObject => ({
  name: 'text_bm25_emb',
  type: FunctionType.BM25,
  input_field_names: ['text'],
  output_field_names: ['sparse'],
  params: {}
});

// analyzer 由 MILVUS_LANGUAGE_IDENTIFIER 决定(lingua -> Chinese, whatlang -> Mandarin)
export const buildAnalyzerParams = (identifier: LanguageIdentifier) => ({
  tokenizer: {
    type: 'language_identifier',
    identifier,
    analyzers: {
      default: { tokenizer: 'standard' },
      English: { type: 'english' },
      ...(identifier === 'lingua'
        ? { Chinese: { tokenizer: 'jieba' } }
        : { Mandarin: { tokenizer: 'jieba' } })
    }
  }
});

/**
 * modeldata_v2 字段定义:
 * 向量 + 全文单表,主键 id 沿用 modeldata 的 Int64 向量 id。
 * text = indexes[].text,BM25 function 自动推导 sparse。
 */
export const createFullTextFieldDefs = (analyzerParams: Record<string, any>): FieldType[] => [
  { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: false },
  { name: 'vector', data_type: DataType.FloatVector, dim: 1536 },
  {
    name: 'text',
    data_type: DataType.VarChar,
    max_length: MILVUS_TEXT_MAX_LENGTH,
    enable_analyzer: true,
    enable_match: true,
    analyzer_params: analyzerParams
  },
  { name: 'sparse', data_type: DataType.SparseFloatVector },
  { name: 'createTime', data_type: DataType.Int64 },
  { name: 'teamId', data_type: DataType.VarChar, max_length: 64 },
  { name: 'datasetId', data_type: DataType.VarChar, max_length: 64 },
  { name: 'collectionId', data_type: DataType.VarChar, max_length: 64 }
];

export const createFullTextIndexParams = (): MilvusIndexParam[] => [
  {
    field_name: 'sparse',
    index_name: 'sparse_BM25',
    index_type: 'SPARSE_INVERTED_INDEX',
    metric_type: 'BM25',
    params: { bm25_k1: 1.2, bm25_b: 0.75 }
  },
  { field_name: 'createTime', index_type: 'STL_SORT' },
  { field_name: 'teamId', index_type: 'Trie' },
  { field_name: 'datasetId', index_type: 'Trie' },
  { field_name: 'collectionId', index_type: 'Trie' }
];
