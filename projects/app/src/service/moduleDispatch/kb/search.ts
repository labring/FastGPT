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
    SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
    select kb_id,id,q,a,source,file_id from ${PgDatasetTableName} where kb_id IN (${kbList
      .map((item) => `'${item.kbId}'`)
      .join(',')}) AND vector <#> '[${vectors[0]}]' < -${similarity} order by vector <#> '[${
      vectors[0]
    }]' limit ${limit};
    COMMIT;`
  );

  const searchRes: QuoteItemType[] = res?.[2]?.rows || [];

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    responseData: {
      moduleType: FlowModuleTypeEnum.kbSearchNode,
      moduleName,
      price: countModelPrice({ model: vectorModel.model, tokens: tokenLen }),
      model: vectorModel.name,
      tokens: tokenLen,
      similarity,
      limit
    }
  };
}
