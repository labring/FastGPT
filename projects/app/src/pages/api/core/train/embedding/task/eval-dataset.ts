import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainTask } from '@fastgpt/service/support/permission/train/embedding/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/**
 * Download training task evaluation dataset (JSONL format)
 * POST /api/core/train/embedding/task/eval-dataset
 *
 * This API exports the evaluation dataset containing all expected contexts.
 *
 * Request Body:
 * - taskId: Training task ID
 *
 * JSONL format (embedding does not include retrievalContextsFull):
 * {"dataId":"...","question":"...","answer":"...","expectedContextIds":["..."]}
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId } = req.body as { taskId: string };

  if (!taskId || typeof taskId !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate: verify user read permission for training task
  const { task } = await authEmbeddingTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: ReadPermissionVal
  });

  // 2. Get evaluation dataset ID
  // Priority: result field, fallback to checkpoint field
  const evalDatasetId =
    task.result?.evalDatasetId || task.checkpoint?.data?.generate_evaldataset?.evalDatasetId;

  if (!evalDatasetId) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingEvalDatasetNotGenerated);
  }

  // 3. Query evaluation data (embedding does not need retrievalContextsFull)
  const evalData = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  })
    .select({
      _id: 1,
      [EvalDatasetDataKeyEnum.UserInput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedContextIds]: 1
    })
    .lean();

  if (!evalData || evalData.length === 0) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingEvalDatasetEmpty);
  }

  // 4. Convert to JSONL format (one JSON object per line)
  // Embedding format does not include retrievalContextsFull (rerank-specific field)
  const jsonlLines = evalData.map((item) => {
    return JSON.stringify({
      dataId: String(item._id),
      question: item[EvalDatasetDataKeyEnum.UserInput] || '',
      answer: item[EvalDatasetDataKeyEnum.ExpectedOutput] || '',
      expectedContextIds: item[EvalDatasetDataKeyEnum.ExpectedContextIds] || []
    });
  });

  const jsonlContent = jsonlLines.join('\n');

  // 5. Set response headers and return file stream
  res.setHeader('Content-Type', 'application/jsonl');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="embedding-eval-dataset-${taskId}.jsonl"`
  );
  res.setHeader('Content-Length', Buffer.byteLength(jsonlContent, 'utf8'));

  return res.send(jsonlContent);
}

export default NextAPI(handler);
