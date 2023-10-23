import { PgClient } from '@/service/pg';
import type { ChatHistoryItemResType } from '@/types/chat';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { countModelPrice } from '@/service/common/bill/push';
import type { SelectedDatasetType } from '@/types/core/dataset';
import type { QuoteItemType } from '@/types/chat';
import { PgDatasetTableName } from '@/constants/plugin';
import { FlowModuleTypeEnum } from '@/constants/flow';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModelTypeEnum } from '@/service/core/ai/model';

import { sqlz_connect, rows_to_markdown } from '@/service/utils/sqlz';

type KBSearchProps = ModuleDispatchProps<{
  kbList: SelectedDatasetType;
  similarity: number;
  limit: number;
  userChatInput: string;
}>;
export type KBSearchResponse = {
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  isEmpty?: boolean;
  unEmpty?: boolean;
  quoteQA: QuoteItemType[];
};

export async function dispatchKBSearch(props: Record<string, any>): Promise<KBSearchResponse> {
  const {
    moduleName,
    user,
    inputs: { kbList = [], similarity = 0.4, limit = 5, userChatInput }
  } = props as KBSearchProps;

  if (kbList.length === 0) {
    return Promise.reject("You didn't choose the knowledge base");
  }

  if (!userChatInput) {
    return Promise.reject('Your input is empty');
  }

  // get vector
  const vectorModel = kbList[0]?.vectorModel || global.vectorModels[0];
  const { vectors, tokenLen } = await getVector({
    model: vectorModel.model,
    input: [userChatInput]
  });

  // search kb
  const res: any = await PgClient.query(
    `BEGIN;
    SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 40};
    select id, kb_id, q, a, source, file_id, (vector <#> '[${
      vectors[0]
    }]') * -1 AS score from ${PgDatasetTableName} where user_id='${user._id}' AND kb_id IN (${kbList
      .map((item) => `'${item.kbId}'`)
      .join(',')}) AND vector <#> '[${vectors[0]}]' < -${similarity} order by vector <#> '[${
      vectors[0]
    }]' limit ${limit};
    COMMIT;`
  );

  const searchRes: QuoteItemType[] = res?.[2]?.rows || [];

  // 处理 searchRes 中的每一行
  for (let i = 0; i < searchRes.length; i++) {
    const row = searchRes[i];
    const q = row.q; // 获取 q 字段的值

    try {
      // 解析连接字符串和查询语句
      const connectionMatch = q.match(/{{connec:(.*?)}}/);
      const queryMatch = q.match(/{{query:(.*?)}}/s);

      if (connectionMatch && queryMatch) {
        const connectionString = connectionMatch[1]; // 提取连接字符串
        const query = queryMatch[1]; // 提取查询语句
        const sqlz = sqlz_connect(connectionString);

        const result = await sqlz.query(query); // 使用 Sequelize 执行查询语句
        const _cnt = result[1] as number;
        const _rows = result[0] as object[];
        var formattedResult = '';
        if (_cnt > 0 && _rows.length > 0) {
          formattedResult = rows_to_markdown(_rows);
        } else {
          console.log(`Query returned an empty result: ${query}`);
        }
        // Replace the query statement in the row with the formatted result
        searchRes[i].q = searchRes[i].q
          .replace(/{{connec:(.*?)}}/g, '')
          .replace(/{{query:(.*?)}}/gs, formattedResult);
      }
    } catch (error) {
      console.error(`执行查询时出错：${q}`);
      console.error(error);
    }
  }
  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData: {
      moduleType: FlowModuleTypeEnum.kbSearchNode,
      moduleName,
      price: countModelPrice({
        model: vectorModel.model,
        tokens: tokenLen,
        type: ModelTypeEnum.vector
      }),
      model: vectorModel.name,
      tokens: tokenLen,
      similarity,
      limit
    }
  };
}
