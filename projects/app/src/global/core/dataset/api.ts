import type { PushDataResponseType } from '@fastgpt/global/openapi/core/dataset/data/api';

/* ================= collection ===================== */
export type CreateCollectionResponse = Promise<{
  collectionId: string;
  results: PushDataResponseType;
}>;
