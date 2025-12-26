import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import ExcelJS from 'exceljs';

/**
 * Download training task evaluation report (XLSX format)
 * POST /api/core/train/rerank/task/eval-report
 *
 * This API exports an evaluation report comparing rerank performance before and after training.
 *
 * Request Body:
 * - taskId: Training task ID
 * - headers: (Optional) Custom column headers for internationalization
 *
 * XLSX Columns (6 columns):
 * - Question: The evaluation question
 * - Best Match Context: The best match context (expected rank 1)
 * - Collection Name: The source collection/document name
 * - Rank Before Training: Rank in base model retrieval results
 * - Rank After Training: Rank in tuned model retrieval results
 * - Improvement: Calculated improvement in ranking
 *
 * Notes:
 * - One row per question (shows only the best match context)
 * - Sorted by rank before training (descending) and improvement (descending)
 * - Best match context is limited to 100 characters
 * - No cell merging
 * - Supports i18n column headers
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId, headers } = req.body as {
    taskId: string;
    headers?: {
      question?: string;
      bestMatchContext?: string;
      collectionName?: string;
      rankBefore?: string;
      rankAfter?: string;
      improvement?: string;
    };
  };

  if (!taskId || typeof taskId !== 'string') {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Default headers (English)
  const defaultHeaders = {
    question: 'Question',
    bestMatchContext: 'Best Match Context',
    collectionName: 'Collection Name',
    rankBefore: 'Rank Before Training',
    rankAfter: 'Rank After Training',
    improvement: 'Improvement'
  };

  // Merge with passed headers
  const resolvedHeaders = {
    ...defaultHeaders,
    ...headers
  };

  // 1. Authenticate: verify user read permission for training task
  const { task } = await authRerankTrainTask({
    req,
    authToken: true,
    taskId,
    per: ReadPermissionVal
  });

  // 2. Get evaluation dataset ID
  const evalDatasetId =
    task.result?.evalDatasetId || task.checkpoint?.data?.evaluating?.evalDatasetId;

  if (!evalDatasetId) {
    return Promise.reject(RerankTrainErrEnum.evalDatasetNotGenerated);
  }

  // 3. Get evaluation results from checkpoint
  const baseModelEvalResult = task.checkpoint?.data?.evaluating?.baseModelEvalResult;
  const tunedModelEvalResult = task.checkpoint?.data?.evaluating?.tunedModelEvalResult;

  if (!baseModelEvalResult || !tunedModelEvalResult) {
    return Promise.reject(RerankTrainErrEnum.evalResultsNotFound);
  }

  // Extract retrieval ranks (case-by-case)
  const baseModelRanks = baseModelEvalResult.retrieval_ranks || [];
  const tunedModelRanks = tunedModelEvalResult.retrieval_ranks || [];

  // 4. Query evaluation data
  const evalData = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  })
    .select({
      _id: 1,
      [EvalDatasetDataKeyEnum.UserInput]: 1,
      [EvalDatasetDataKeyEnum.ExpectedContextIds]: 1
    })
    .lean();

  if (!evalData || evalData.length === 0) {
    return Promise.reject(RerankTrainErrEnum.evalDatasetEmpty);
  }

  // 5. Get best match context (first expected context) from ExpectedContextIds
  const bestMatchContextIds = evalData
    .map((item: any) => {
      const expectedContextIds = item[EvalDatasetDataKeyEnum.ExpectedContextIds] || [];
      return expectedContextIds[0]; // Only get the first one (best match)
    })
    .filter(Boolean);

  const datasetDataMap = new Map<string, { collectionName: string; chunk: string }>();

  if (bestMatchContextIds.length > 0) {
    const datasetDataItems = await MongoDatasetData.find({
      _id: { $in: bestMatchContextIds }
    })
      .populate('collectionId', 'name')
      .lean();

    datasetDataItems.forEach((item: any) => {
      // collectionId is populated with { _id, name } or null if document was deleted
      const collectionName =
        item.collectionId && typeof item.collectionId === 'object'
          ? item.collectionId.name || 'Unknown'
          : 'Unknown';
      const chunk = item.q || item.a || '';
      datasetDataMap.set(String(item._id), { collectionName, chunk });
    });
  }

  // 6. Build row data with improvement calculation
  interface RowData {
    question: string;
    bestMatchContext: string;
    collectionName: string;
    rankBefore: number;
    rankAfter: number;
    improvement: number;
    improvementStr: string;
  }

  const rowsData: RowData[] = [];

  evalData.forEach((item: any, index: number) => {
    const question = item[EvalDatasetDataKeyEnum.UserInput] || '';
    const expectedContextIds = item[EvalDatasetDataKeyEnum.ExpectedContextIds] || [];
    const bestMatchContextId = expectedContextIds[0];

    // Get best match context info
    const datasetInfo = bestMatchContextId ? datasetDataMap.get(bestMatchContextId) : null;
    let bestMatchContext = datasetInfo?.chunk || '';
    // Limit best match context to 100 characters with ellipsis
    if (bestMatchContext.length > 100) {
      bestMatchContext = bestMatchContext.substring(0, 100) + '...';
    }
    const collectionName = datasetInfo?.collectionName || 'Unknown';

    // Get retrieval ranks for the best match context (first expected context)
    const baseRanks = baseModelRanks[index] || [];
    const tunedRanks = tunedModelRanks[index] || [];
    const baseRank = baseRanks[0] !== undefined ? baseRanks[0] : -1;
    const tunedRank = tunedRanks[0] !== undefined ? tunedRanks[0] : -1;

    // Calculate improvement based on distance to expected rank
    // Expected rank is 1 for best match context
    const expectedRank = 1;
    let improvement = 0;
    let improvementStr = '0';

    if (baseRank > 0 && tunedRank > 0) {
      const baseDistance = Math.abs(baseRank - expectedRank);
      const tunedDistance = Math.abs(tunedRank - expectedRank);
      improvement = baseDistance - tunedDistance;
      improvementStr = improvement > 0 ? `+${improvement}` : String(improvement);
    }

    rowsData.push({
      question,
      bestMatchContext,
      collectionName,
      rankBefore: baseRank,
      rankAfter: tunedRank,
      improvement,
      improvementStr
    });
  });

  // 7. Sort by comprehensive criteria:
  // Priority 1: Rank Before Training descending (worse rank first, i.e., higher number first)
  // Priority 2: Improvement descending (higher improvement first)
  rowsData.sort((a, b) => {
    // First, sort by rankBefore descending (higher rank number = worse position, should be first)
    if (a.rankBefore !== b.rankBefore) {
      return b.rankBefore - a.rankBefore;
    }
    // Then, sort by improvement descending
    return b.improvement - a.improvement;
  });

  // 8. Generate XLSX using exceljs
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Evaluation Detail');

  // Set column headers (using internationalized headers)
  worksheet.columns = [
    { header: resolvedHeaders.question, key: 'question', width: 30 },
    { header: resolvedHeaders.bestMatchContext, key: 'bestMatchContext', width: 40 },
    { header: resolvedHeaders.collectionName, key: 'collectionName', width: 25 },
    { header: resolvedHeaders.rankBefore, key: 'rankBefore', width: 20 },
    { header: resolvedHeaders.rankAfter, key: 'rankAfter', width: 20 },
    { header: resolvedHeaders.improvement, key: 'improvement', width: 15 }
  ];

  // Add data rows (no cell merging needed)
  rowsData.forEach((row) => {
    worksheet.addRow({
      question: row.question,
      bestMatchContext: row.bestMatchContext,
      collectionName: row.collectionName,
      rankBefore: row.rankBefore,
      rankAfter: row.rankAfter,
      improvement: row.improvementStr
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // 9. Set response headers and return XLSX file
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="eval-report-${taskId}.xlsx"`);
  res.setHeader('Content-Length', buffer.byteLength);

  return res.send(buffer);
}

export default NextAPI(handler);
