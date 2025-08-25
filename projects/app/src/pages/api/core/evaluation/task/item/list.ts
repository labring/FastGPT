import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvaluationItemDisplayType } from '@fastgpt/global/core/evaluation/type';
import type { ListEvaluationItemsBody } from '@fastgpt/global/core/evaluation/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<ListEvaluationItemsBody>
): Promise<PaginationResponse<EvaluationItemDisplayType>> {
  try {
    const { evalId, pageNum = 1, pageSize = 20 } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    // 验证分页参数
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

    addLog.info('[Evaluation] 评估项列表查询成功', {
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
    addLog.error('[Evaluation] 查询评估项列表失败', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
