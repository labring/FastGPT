import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/**
 * Download training task evaluation dataset (JSONL format)
 * POST /api/core/train/rerank/task/eval-dataset
 *
 * This API exports the evaluation dataset containing all expected contexts.
 *
 * Request Body:
 * - taskId: Training task ID
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId } = req.body as { taskId: string };

  if (!taskId || typeof taskId !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate: verify user read permission for training task
  const { task } = await authRerankTrainTask({
    req,
    authToken: true,
    taskId,
    per: ReadPermissionVal
  });

  // 2. Get evaluation dataset ID
  // Priority: result field, fallback to checkpoint field
  const evalDatasetId =
    task.result?.evalDatasetId || task.checkpoint?.data?.evaluating?.evalDatasetId;

  if (!evalDatasetId) {
    return Promise.reject(RerankTrainErrEnum.evalDatasetNotGenerated);
  }

  // 3. Query evaluation data (with complete fields)
  const evalData = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  })
    .select({
      _id: 1,
      [EvalDatasetDataKeyEnum.UserInput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedContextIds]: 1,
      [EvalDatasetDataKeyEnum.RetrievalContextsFull]: 1
    })
    .lean();

  if (!evalData || evalData.length === 0) {
    return Promise.reject(RerankTrainErrEnum.evalDatasetEmpty);
  }

  // 4. Convert to JSONL format (one JSON object per line)
  const jsonlLines = evalData.map((item) => {
    return JSON.stringify({
      dataId: String(item._id),
      question: item[EvalDatasetDataKeyEnum.UserInput] || '',
      answer: item[EvalDatasetDataKeyEnum.ExpectedOutput] || '',
      expectedContextIds: item[EvalDatasetDataKeyEnum.ExpectedContextIds] || [],
      retrievalContextsFull: item[EvalDatasetDataKeyEnum.RetrievalContextsFull] || []
    });
  });

  const jsonlContent = jsonlLines.join('\n');

  // 5. Set response headers and return file stream
  res.setHeader('Content-Type', 'application/jsonl');
  res.setHeader('Content-Disposition', `attachment; filename="eval-dataset-${taskId}.jsonl"`);
  res.setHeader('Content-Length', Buffer.byteLength(jsonlContent, 'utf8'));

  return res.send(jsonlContent);
}

export default NextAPI(handler);
