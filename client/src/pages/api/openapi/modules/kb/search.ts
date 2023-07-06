import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { openaiEmbedding_system } from '../../plugin/openaiEmbedding';
import { modelToolMap } from '@/utils/plugin';

export type QuoteItemType = {
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
};
type Response = {
  rawSearch: QuoteItemType[];
  isEmpty?: boolean;
  quotePrompt?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      kb_ids = [],
      history = [],
      similarity,
      limit,
      maxToken,
      userChatInput
    } = req.body as Props;

    if (!similarity || !Array.isArray(kb_ids)) {
      throw new Error('params is error');
    }

    const result = await kbSearch({
      kb_ids,
      history,
      similarity,
      limit,
      maxToken,
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
  userChatInput
}: Props): Promise<Response> {
  // get vector
  const promptVector = await openaiEmbedding_system({
    input: [userChatInput]
  });

  // search kb
  const res: any = await PgClient.query(
    `BEGIN;
    SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
    select id,q,a,source from modelData where kb_id IN (${kb_ids
      .map((item) => `'${item}'`)
      .join(',')}) AND vector <#> '[${promptVector[0]}]' < -${similarity} order by vector <#> '[${
      promptVector[0]
    }]' limit ${limit};
    COMMIT;`
  );

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
