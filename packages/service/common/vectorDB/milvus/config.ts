import { DataType, FunctionType } from '@zilliz/milvus2-sdk-node';
import type {
  FieldType,
  FunctionObject
} from '@zilliz/milvus2-sdk-node/dist/milvus/types/Collection';
import type { CreateIndexSimpleReq } from '@zilliz/milvus2-sdk-node/dist/milvus/types/MilvusIndex';
import {
  DatasetVectorTableName,
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  HNSW_EF_CONSTRUCTION,
  HNSW_M
} from '../constants';
import { milvusVersionManager } from './version';

export const MILVUS_VECTOR_DIMENSION = 1536;
export const MILVUS_TEXT_MAX_LENGTH = 65535;

// Milvus 2.6+ 多语言分析器配置
// 使用 language_identifier 自动识别文本语言并选择合适的分词器
export const MILVUS_MULTI_LANGUAGE_ANALYZER = {
  tokenizer: {
    type: 'language_identifier', // 语言识别器类型
    identifier: 'whatlang', // 使用 whatlang 进行语言识别
    analyzers: {
      default: {
        tokenizer: 'standard' // 未识别语言的后备分词器
      },
      English: {
        type: 'english' // 英文使用 english 分析器（含词干提取、停用词等）
      },
      Mandarin: {
        tokenizer: 'jieba' // 中文使用 jieba 分词器
      }
    }
  }
};

export type MilvusIndexParam = Omit<CreateIndexSimpleReq, 'collection_name'>;

export type MilvusCollectionConfig = {
  name: string;
  description: string;
  fields: FieldType[];
  indexParams: MilvusIndexParam[];
  functions?: FunctionObject[];
};

const createBaseFields = (): FieldType[] => {
  const baseFields: FieldType[] = [
    {
      name: 'id',
      data_type: DataType.Int64,
      is_primary_key: true,
      autoID: false
    },
    {
      name: 'vector',
      data_type: DataType.FloatVector,
      dim: MILVUS_VECTOR_DIMENSION
    },
    { name: 'teamId', data_type: DataType.VarChar, max_length: 64 },
    { name: 'datasetId', data_type: DataType.VarChar, max_length: 64 },
    { name: 'collectionId', data_type: DataType.VarChar, max_length: 64 },
    {
      name: 'createTime',
      data_type: DataType.Int64
    }
  ];

  // Milvus 2.6+ 添加全文检索相关字段
  if (milvusVersionManager.supportsFullText()) {
    // 原始文本字段（用于 BM25 Function 输入）
    // 配置多语言分析器：自动识别中英文并使用对应的分词器
    baseFields.push({
      name: 'text',
      data_type: DataType.VarChar,
      max_length: MILVUS_TEXT_MAX_LENGTH,
      enable_analyzer: true,
      enable_match: true,
      analyzer_params: MILVUS_MULTI_LANGUAGE_ANALYZER,
      nullable: true
    } as any);

    // 稀疏向量字段（用于存储 BM25 生成的稀疏向量）
    baseFields.push({
      name: 'sparse',
      data_type: DataType.SparseFloatVector
    });

    // 元数据字段（用于后续扩展）
    baseFields.push({
      name: 'metadata',
      data_type: DataType.JSON,
      nullable: true
    } as any);
  }

  return baseFields;
};

const createBaseIndexParams = (): MilvusIndexParam[] => {
  const indexParams: MilvusIndexParam[] = [
    {
      field_name: 'vector',
      index_name: 'vector_HNSW',
      index_type: 'HNSW',
      metric_type: 'IP',
      params: { efConstruction: Number(HNSW_EF_CONSTRUCTION), M: Number(HNSW_M) }
    },
    {
      field_name: 'teamId',
      index_type: 'Trie'
    },
    {
      field_name: 'datasetId',
      index_type: 'Trie'
    },
    {
      field_name: 'collectionId',
      index_type: 'Trie'
    },
    {
      field_name: 'createTime',
      index_type: 'STL_SORT'
    }
  ];

  // Milvus 2.6+ 在 sparse 字段上添加 BM25 全文索引
  if (milvusVersionManager.supportsFullText()) {
    indexParams.push({
      field_name: 'sparse',
      index_name: 'sparse_bm25',
      index_type: 'SPARSE_INVERTED_INDEX',
      metric_type: 'BM25',
      params: {
        inverted_index_algo: 'DAAT_MAXSCORE',
        bm25_k1: 1.2,
        bm25_b: 0.75
      }
    } as any);
  }

  return indexParams;
};

const createBaseFunctions = (): FunctionObject[] | undefined => {
  if (!milvusVersionManager.supportsFullText()) {
    return undefined;
  }

  return [
    {
      name: 'text_bm25_emb',
      type: FunctionType.BM25,
      input_field_names: ['text'],
      output_field_names: ['sparse'],
      params: {}
    }
  ];
};

// 动态生成集合定义（在版本检测完成后调用）
export const getMilvusCollectionDefinitions = (): MilvusCollectionConfig[] => [
  {
    name: DatasetVectorTableName,
    description: 'Store dataset vector',
    fields: createBaseFields(),
    indexParams: createBaseIndexParams(),
    functions: createBaseFunctions()
  },
  {
    name: DBDatasetVectorTableName,
    description: 'Store database table column description embeddings',
    fields: [
      ...createBaseFields(),
      { name: 'columnDesIndex', data_type: DataType.VarChar, max_length: 1024 }
    ],
    indexParams: createBaseIndexParams(),
    functions: createBaseFunctions()
  },
  {
    name: DBDatasetValueVectorTableName,
    description: 'Store database table column value example embeddings',
    fields: [
      ...createBaseFields(),
      { name: 'columnValIndex', data_type: DataType.VarChar, max_length: 1024 }
    ],
    indexParams: createBaseIndexParams(),
    functions: createBaseFunctions()
  }
];

export type MilvusInsertRow = {
  id: number;
  vector: number[];
  teamId: string;
  datasetId: string;
  collectionId: string;
  createTime: number;
  columnDesIndex?: string;
  columnValIndex?: string;
  text?: string; // Milvus 2.6+ 原始文本（BM25 输入）
  metadata?: Record<string, any>; // Milvus 2.6+ 元数据扩展字段
  // 注意：sparse 字段由 BM25 Function 自动生成，不需要手动插入
};
