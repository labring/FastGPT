import { NextAPI } from '@/service/middleware/entry';
import { DeleteDatasetQuerySchema } from '@fastgpt/global/openapi/core/dataset/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { deleteDataset } from '@/service/core/dataset/delete';

async function handler(req: ApiRequestProps) {
  const { id: datasetId } = parseApiInput({ req, querySchema: DeleteDatasetQuerySchema }).query;

  await deleteDataset({ req, id: datasetId });
}

export default NextAPI(handler);
