import { DataType } from '@zilliz/milvus2-sdk-node';
import type { FieldType } from '@zilliz/milvus2-sdk-node/dist/milvus/types/Collection';
import type { CreateIndexSimpleReq } from '@zilliz/milvus2-sdk-node/dist/milvus/types/MilvusIndex';
import {
  DatasetVectorTableName,
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName
} from '../constants';

export const MILVUS_VECTOR_DIMENSION = 1536;

export type MilvusIndexParam = Omit<CreateIndexSimpleReq, 'collection_name'>;

export type MilvusCollectionConfig = {
  name: string;
  description: string;
  fields: FieldType[];
  indexParams: MilvusIndexParam[];
};

const createBaseFields = (): FieldType[] => [
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

const createBaseIndexParams = (): MilvusIndexParam[] => [
  {
    field_name: 'vector',
    index_name: 'vector_HNSW',
    index_type: 'HNSW',
    metric_type: 'IP',
    params: { efConstruction: 32, M: 64 }
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

export const milvusCollectionDefinitions: MilvusCollectionConfig[] = [
  {
    name: DatasetVectorTableName,
    description: 'Store dataset vector',
    fields: createBaseFields(),
    indexParams: createBaseIndexParams()
  },
  {
    name: DBDatasetVectorTableName,
    description: 'Store database table column description embeddings',
    fields: [
      ...createBaseFields(),
      { name: 'columnDesIndex', data_type: DataType.VarChar, max_length: 1024 }
    ],
    indexParams: createBaseIndexParams()
  },
  {
    name: DBDatasetValueVectorTableName,
    description: 'Store database table column value example embeddings',
    fields: [
      ...createBaseFields(),
      { name: 'columnValIndex', data_type: DataType.VarChar, max_length: 1024 }
    ],
    indexParams: createBaseIndexParams()
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
};
