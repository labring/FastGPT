import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvaluationDisplayType } from '@fastgpt/global/core/evaluation/type';
import type { ListEvaluationsBody } from '@fastgpt/global/core/evaluation/api';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<ListEvaluationsBody>
): Promise<PaginationResponse<EvaluationDisplayType>> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // 验证分页参数
    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    const result = await EvaluationTaskService.listEvaluations(
      {
        req,
        authToken: true
      },
      pageNumInt,
      pageSizeInt,
      searchKey?.trim()
    );

    addLog.info('[Evaluation] 评估任务列表查询成功', {
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      searchKey: searchKey?.trim(),
      total: result.total,
      returned: result.evaluations.length
    });

    return {
      list: result.evaluations,
      total: result.total
    };
  } catch (error) {
    addLog.error('[Evaluation] 查询评估任务列表失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
