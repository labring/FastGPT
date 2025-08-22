import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  ListEvaluationItemsRequest,
  ListEvaluationItemsResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<ListEvaluationItemsRequest>
): Promise<ListEvaluationItemsResponse> {
  try {
    const { evalId, pageNum = 1, pageSize = 20 } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    const result = await EvaluationTaskService.listEvaluationItems(
      evalId,
      {
        req,
        authToken: true
      },
      pageNumInt,
      pageSizeInt
    );

    addLog.info('[Evaluation] Evaluation items list query successful', {
      evalId,
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      total: result.total,
      returned: result.items.length
    });

    return {
      list: result.items,
      total: result.total
    };
  } catch (error) {
    addLog.error('[Evaluation] Failed to query evaluation items list', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
