import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum, rawSearchKey } from '@/constants/chat';
import { modelToolMap } from '@/utils/plugin';
import { getVector } from '@/pages/api/openapi/plugin/vector';
import { countModelPrice, pushTaskBillListItem } from '@/service/events/pushBill';
import { getModel } from '@/service/utils/data';
import { authUser } from '@/service/utils/auth';

export type QuoteItemType = {
  kb_id: string;
  id: string;
  q: string;
  a: string;
  source?: string;
};
type Props = {
  kb_ids: string[];
  history: ChatItemType[];
  similarity: number;
  limit: number;
  maxToken: number;
  userChatInput: string;
  stream?: boolean;
  billId?: string;
};
type Response = {
  [rawSearchKey]: QuoteItemType[];
  isEmpty?: boolean;
  quotePrompt?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await authUser({ req, authRoot: true });

    const { kb_ids = [], userChatInput } = req.body as Props;

    if (!userChatInput) {
      throw new Error('用户输入为空');
    }

    if (!Array.isArray(kb_ids) || kb_ids.length === 0) {
      throw new Error('没有选择知识库');
    }

    const result = await kbSearch({
      ...req.body,
      kb_ids,
      userChatInput
    });

    jsonRes<Response>(res, {
      data: result
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function kbSearch({
  kb_ids = [],
  history = [],
  similarity = 0.8,
  limit = 5,
  maxToken = 2500,
  userChatInput,
  billId
}: Props): Promise<Response> {
  if (kb_ids.length === 0)
    return {
      isEmpty: true,
      rawSearch: [],
      quotePrompt: undefined
    };

  // get vector
  const vectorModel = global.vectorModels[0].model;
  const { vectors, tokenLen } = await getVector({
    model: vectorModel,
    input: [userChatInput]
  });

  // search kb
  const [res]: any = await Promise.all([
    PgClient.query(
      `BEGIN;
    SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
    select kb_id,id,q,a,source from modelData where kb_id IN (${kb_ids
      .map((item) => `'${item}'`)
      .join(',')}) AND vector <#> '[${vectors[0]}]' < -${similarity} order by vector <#> '[${
        vectors[0]
      }]' limit ${limit};
    COMMIT;`
    ),
    pushTaskBillListItem({
      billId,
      moduleName: 'Vector Generate',
      amount: countModelPrice({ model: vectorModel, tokens: tokenLen }),
      model: getModel(vectorModel)?.name,
      tokenLen
    })
  ]);

  const searchRes: QuoteItemType[] = res?.[2]?.rows || [];

  // filter part quote by maxToken
  const sliceResult = modelToolMap
    .tokenSlice({
      model: 'gpt-3.5-turbo',
      maxToken,
      messages: searchRes.map((item, i) => ({
        obj: ChatRoleEnum.System,
        value: `${i + 1}: [${item.q}\n${item.a}]`
      }))
    })
    .map((item) => item.value)
    .join('\n')
    .trim();

  // slice filterSearch
  const rawSearch = searchRes.slice(0, sliceResult.length);

  return {
    isEmpty: rawSearch.length === 0 ? true : undefined,
    rawSearch,
    quotePrompt: sliceResult ? `知识库:\n${sliceResult}` : undefined
  };
}
