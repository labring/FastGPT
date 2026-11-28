import { injectRepo } from '@fastgpt/dal/db/container';
import { DatasetQaTrainingRepoToken } from '@fastgpt/dal/db/repos/datasetQaTraining/repo';
import type {
  CreateDatasetQaTrainingWriteInput,
  DatasetQaTrainingCounts,
  DatasetQaTrainingDeleteScope,
  DatasetQaTrainingRepository,
  DatasetQaTrainingScope,
  DatasetQaTrainingStatus
} from '@fastgpt/dal/db/repos/datasetQaTraining/repo.type';
import type { DbSession } from '@fastgpt/dal/db/types';

/** 知识库 QA 训练领域服务（通过构造函数注入 DAL 仓储）。 */
export class DatasetQaTrainingService {
  private readonly repoOverride?: DatasetQaTrainingRepository;

  constructor({ repo }: { repo?: DatasetQaTrainingRepository } = {}) {
    this.repoOverride = repo;
  }

  private get repo(): DatasetQaTrainingRepository {
    return this.repoOverride ?? injectRepo(DatasetQaTrainingRepoToken);
  }

  findById(params: { id: string; scope?: Partial<DatasetQaTrainingScope>; tx?: DbSession }) {
    return this.repo.findById(params);
  }

  findOneEditable(params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId: string;
    includeActive?: boolean;
    tx?: DbSession;
  }) {
    return this.repo.findOneEditable(params);
  }

  list(params: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    sort?: 'chunkOrder' | 'idAsc';
    limit?: number;
    tx?: DbSession;
  }) {
    return this.repo.list(params);
  }

  exists(params: {
    id?: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    collectionIds?: readonly string[];
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) {
    return this.repo.exists(params);
  }

  count(params: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) {
    return this.repo.count(params);
  }

  countByCollections(params: {
    teamId: string;
    datasetId: string;
    collectionIds: readonly string[];
    useReadReplica?: boolean;
    tx?: DbSession;
  }) {
    return this.repo.countByCollections(params);
  }

  createMany(params: { items: readonly CreateDatasetQaTrainingWriteInput[]; tx?: DbSession }) {
    return this.repo.createMany(params);
  }

  markFailed(params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    id: string;
    errorMsg: string;
    tx?: DbSession;
  }) {
    return this.repo.markFailed(params);
  }

  retryMany(params: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    taskId?: string;
    includeActive?: boolean;
    edit?: { q?: string; chunkIndex?: number };
    tx?: DbSession;
  }) {
    return this.repo.retryMany(params);
  }

  deleteOne(params: {
    id: string;
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
    status?: DatasetQaTrainingStatus;
    tx?: DbSession;
  }) {
    return this.repo.deleteOne(params);
  }

  deleteMany(params: DatasetQaTrainingDeleteScope & { tx?: DbSession }) {
    return this.repo.deleteMany(params);
  }
}

export const datasetQaTrainingService = new DatasetQaTrainingService();

/** 按集合汇总 QA 待处理与失败数，供集合列表、详情与训练详情共用。 */
export const countDatasetQaTrainingByCollection = (params: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
  useReadReplica?: boolean;
  tx?: DbSession;
}): Promise<DatasetQaTrainingCounts[]> => datasetQaTrainingService.countByCollections(params);
