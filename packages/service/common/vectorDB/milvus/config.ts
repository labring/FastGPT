import { DataType, FunctionType } from '@zilliz/milvus2-sdk-node';
import type {
  FieldType,
  FunctionObject
} from '@zilliz/milvus2-sdk-node/dist/milvus/types/Collection';
import type { CreateIndexSimpleReq } from '@zilliz/milvus2-sdk-node/dist/milvus/types/MilvusIndex';
import { DatasetVectorTableName } from '../constants';

export const MILVUS_VECTOR_DIMENSION = 1536;
export const MILVUS_TEXT_MAX_LENGTH = 65535;
export const MILVUS_QUERY_MAX_LENGTH = 4000;

export type MilvusIndexParam = Omit<CreateIndexSimpleReq, 'collection_name'>;

export type MilvusCollectionConfig = {
  name: string;
  description: string;
  fields: FieldType[];
  indexParams: MilvusIndexParam[];
  functions?: FunctionObject[];
};

export type MilvusInsertRow = {
  id: number;
  vector: number[];
  teamId: string;
  datasetId: string;
  collectionId: string;
  createTime: number;
  text?: string;
};

// BM25 Function: input text, output sparse vector
export const createBM25Function = (): FunctionObject => ({
  name: 'text_bm25_emb',
  type: FunctionType.BM25,
  input_field_names: ['text'],
  output_field_names: ['sparse'],
  params: {}
});

// Multi-language analyzer fallback configs (language_identifier -> standard -> jieba)
export type AnalyzerConfig = {
  name: string;
  params: Record<string, any>;
};

export const analyzerConfigs: AnalyzerConfig[] = [
  {
    name: 'language_identifier',
    params: {
      tokenizer: {
        type: 'language_identifier',
        identifier: 'whatlang',
        analyzers: {
          default: { tokenizer: 'standard' },
          English: { type: 'english' },
          Mandarin: { tokenizer: 'jieba' }
        }
      }
    }
  },
  {
    name: 'standard',
    params: { tokenizer: 'standard' }
  },
  {
    name: 'jieba',
    params: { tokenizer: 'jieba' }
  }
];

export const ANALYZER_ERROR_CODES = [
  'ANALYZER_NOT_SUPPORTED',
  'INVALID_ANALYZER',
  'UNSUPPORTED_ANALYZER'
];

export const isAnalyzerError = (err: unknown): boolean => {
  const code = extractErrorCode(err);
  if (code && ANALYZER_ERROR_CODES.includes(code)) return true;
  return false;
};

export const extractErrorCode = (err: unknown): string | undefined => {
  if (!err) return undefined;
  const e = err as any;
  return e?.code || e?.error_code || e?.errorCode || e?.status?.error_code;
};

export const extractErrorMessage = (err: unknown): string => {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  const e = err as any;
  return e?.message || e?.reason || e?.status?.reason || String(err);
};

const createBaseFields = (dim: number, supportsFullText: boolean): FieldType[] => {
  const fields: FieldType[] = [
    {
      name: 'id',
      data_type: DataType.Int64,
      is_primary_key: true,
      autoID: false
    },
    {
      name: 'vector',
      data_type: DataType.FloatVector,
      dim
    },
    { name: 'teamId', data_type: DataType.VarChar, max_length: 64 },
    { name: 'datasetId', data_type: DataType.VarChar, max_length: 64 },
    { name: 'collectionId', data_type: DataType.VarChar, max_length: 64 },
    { name: 'createTime', data_type: DataType.Int64 }
  ];

  if (supportsFullText) {
    fields.push({
      name: 'text',
      data_type: DataType.VarChar,
      max_length: MILVUS_TEXT_MAX_LENGTH,
      enable_analyzer: true,
      enable_match: true,
      analyzer_params: analyzerConfigs[0].params,
      nullable: true
    } as FieldType);
    fields.push({
      name: 'sparse',
      data_type: DataType.SparseFloatVector
    } as FieldType);
  }

  return fields;
};

export const createFullTextFields = (dim: number): FieldType[] => createBaseFields(dim, true);

export const createBaseIndexParams = (supportsFullText: boolean): MilvusIndexParam[] => {
  const params: MilvusIndexParam[] = [
    {
      field_name: 'vector',
      index_name: 'vector_HNSW',
      index_type: 'HNSW',
      metric_type: 'IP',
      params: { efConstruction: 128, M: 32 }
    },
    { field_name: 'teamId', index_type: 'Trie' },
    { field_name: 'datasetId', index_type: 'Trie' },
    { field_name: 'collectionId', index_type: 'Trie' },
    { field_name: 'createTime', index_type: 'STL_SORT' }
  ];

  if (supportsFullText) {
    params.push({
      field_name: 'sparse',
      index_name: 'sparse_BM25',
      index_type: 'SPARSE_INVERTED_INDEX',
      metric_type: 'BM25',
      params: { bm25_k1: 1.2, bm25_b: 0.75 }
    } as MilvusIndexParam);
  }

  return params;
};

export const createBaseFunctions = (supportsFullText: boolean): FunctionObject[] | undefined => {
  if (!supportsFullText) return undefined;
  return [createBM25Function()];
};

export const getMilvusCollectionDefinitions = (
  supportsFullText: boolean
): MilvusCollectionConfig[] => [
  {
    name: DatasetVectorTableName,
    description: 'Store dataset vector',
    fields: createBaseFields(MILVUS_VECTOR_DIMENSION, supportsFullText),
    indexParams: createBaseIndexParams(supportsFullText),
    functions: createBaseFunctions(supportsFullText)
  }
];

export const isSchemaMismatchError = (err: unknown): boolean => {
  const code = extractErrorCode(err);
  if (code) {
    return ['SchemaMismatch', 'InvalidSchema', 'SCHEMA_MISMATCH', 'INVALID_SCHEMA'].includes(code);
  }
  const msg = extractErrorMessage(err).toLowerCase();
  return msg.includes('schema') && (msg.includes('mismatch') || msg.includes('invalid'));
};
