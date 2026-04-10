import type {
  PushDatasetDataChunkProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

/* ================= dataset ===================== */

export type RebuildEmbeddingProps = {
  datasetId: string;
  vectorModel: string;
};

/* ================= collection ===================== */
export type CreateCollectionResponse = Promise<{
  collectionId: string;
  results: PushDatasetDataResponse;
}>;

/* ================= data ===================== */
export type InsertOneDatasetDataProps = PushDatasetDataChunkProps & {
  collectionId: string;
};
