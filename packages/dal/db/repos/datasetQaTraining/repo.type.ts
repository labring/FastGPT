import z from 'zod';
import { EntityIdSchema, EntityIdStringSchema } from '@fastgpt/global/common/string/entityId';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import type { DbSession } from '../../types';

export const DatasetQaTrainingStatusSchema = z.enum(['active', 'error']);
export type DatasetQaTrainingStatus = z.infer<typeof DatasetQaTrainingStatusSchema>;

/** DatasetQaTraining 读路径归一化基准 Schema。 */
export const DatasetQaTrainingDomainReadSchema = z.object({
  _id: EntityIdSchema,
  teamId: EntityIdSchema,
  tmbId: EntityIdSchema,
  datasetId: EntityIdSchema,
  collectionId: EntityIdSchema,
  q: z.string().default(''),
  chunkIndex: z.number().default(0),
  dataMetadata: optionalNullToUndefined(z.record(z.string(), z.any())),
  status: DatasetQaTrainingStatusSchema.default('active'),
  errorMsg: optionalNullToUndefined(z.string()),
  createTime: optionalNullToUndefined(z.coerce.date()),
  updateTime: optionalNullToUndefined(z.coerce.date())
});
export type DatasetQaTrainingDomainDTO = z.infer<typeof DatasetQaTrainingDomainReadSchema>;

export const CreateDatasetQaTrainingWriteSchema = z.object({
  _id: EntityIdStringSchema.optional(),
  teamId: EntityIdStringSchema,
  tmbId: EntityIdStringSchema,
  datasetId: EntityIdStringSchema,
  collectionId: EntityIdStringSchema,
  q: z.string().optional(),
  chunkIndex: z.number().optional(),
  dataMetadata: z.record(z.string(), z.any()).optional(),
  status: DatasetQaTrainingStatusSchema.optional(),
  errorMsg: z.string().optional()
});
export type CreateDatasetQaTrainingWriteInput = z.input<typeof CreateDatasetQaTrainingWriteSchema>;

export type DatasetQaTrainingCounts = {
  _id: string;
  activeCount: number;
  finalErrorCount: number;
};

export type DatasetQaTrainingScope = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};

/** 批量删除范围约束：至少指定一个租户/知识库/集合条件，在类型层面阻断空过滤全表删除。 */
export type DatasetQaTrainingDeleteScope =
  | {
      teamId: string;
      datasetId?: string;
      datasetIds?: readonly string[];
      collectionId?: string;
      collectionIds?: readonly string[];
    }
  | {
      teamId?: string;
      datasetId: string;
      datasetIds?: readonly string[];
      collectionId?: string;
      collectionIds?: readonly string[];
    }
  | {
      teamId?: string;
      datasetId?: string;
      datasetIds: readonly string[];
      collectionId?: string;
      collectionIds?: readonly string[];
    }
  | {
      teamId?: string;
      datasetId?: string;
      datasetIds?: readonly string[];
      collectionId: string;
      collectionIds?: readonly string[];
    }
  | {
      teamId?: string;
      datasetId?: string;
      datasetIds?: readonly string[];
      collectionId?: string;
      collectionIds: readonly string[];
    };

export type DatasetQaTrainingRepository = {
  findById: (params: {
    id: string;
    scope?: Partial<DatasetQaTrainingScope>;
    tx?: DbSession;
  }) => Promise<DatasetQaTrainingDomainDTO | null>;
  findOneEditable: (params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId: string;
    includeActive?: boolean;
    tx?: DbSession;
  }) => Promise<DatasetQaTrainingDomainDTO | null>;
  list: (params: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    sort?: 'chunkOrder' | 'idAsc';
    limit?: number;
    tx?: DbSession;
  }) => Promise<DatasetQaTrainingDomainDTO[]>;
  exists: (params: {
    id?: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    collectionIds?: readonly string[];
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) => Promise<boolean>;
  count: (params: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) => Promise<number>;
  countByCollections: (params: {
    teamId: string;
    datasetId: string;
    collectionIds: readonly string[];
    useReadReplica?: boolean;
    tx?: DbSession;
  }) => Promise<DatasetQaTrainingCounts[]>;
  createMany: (params: {
    items: readonly CreateDatasetQaTrainingWriteInput[];
    tx?: DbSession;
  }) => Promise<DatasetQaTrainingDomainDTO[]>;
  markFailed: (params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    id: string;
    errorMsg: string;
    tx?: DbSession;
  }) => Promise<boolean>;
  retryMany: (params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId?: string;
    includeActive?: boolean;
    edit?: { q?: string; chunkIndex?: number };
    tx?: DbSession;
  }) => Promise<number>;
  deleteOne: (params: {
    id: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) => Promise<number>;
  deleteMany: (params: DatasetQaTrainingDeleteScope & { tx?: DbSession }) => Promise<number>;
};
