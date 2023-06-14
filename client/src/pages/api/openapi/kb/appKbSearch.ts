import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import type { ChatItemSimpleType } from '@/types/chat';
import type { ModelSchema } from '@/types/mongoSchema';
import { appVectorSearchModeEnum } from '@/constants/model';
import { authModel } from '@/service/utils/auth';
import { ChatModelMap } from '@/constants/model';
import { ChatRoleEnum } from '@/constants/chat';
import { openaiEmbedding } from '../plugin/openaiEmbedding';
import { modelToolMap } from '@/utils/plugin';

export type QuoteItemType = {
  id: string;
  q: string;
  a: string;
  source?: string;
};
type Props = {
  prompts: ChatItemSimpleType[];
  similarity: number;
  appId: string;
};
type Response = {
  code: 200 | 201;
  rawSearch: QuoteItemType[];
  guidePrompt: string;
  searchPrompts: {
    obj: ChatRoleEnum;
    value: string;
  }[];
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { userId } = await authUser({ req });

    if (!userId) {
      throw new Error('userId is empty');
    }

    const { prompts, similarity, appId } = req.body as Props;

    if (!similarity || !Array.isArray(prompts) || !appId) {
      throw new Error('params is error');
    }

    // auth model
    const { model } = await authModel({
      modelId: appId,
      userId
    });

    const result = await appKbSearch({
      model,
      userId,
      fixedQuote: [],
      prompt: prompts[prompts.length - 1],
      similarity
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

export async function appKbSearch({
  model,
  userId,
  fixedQuote,
  prompt,
  similarity
}: {
  model: ModelSchema;
  userId: string;
  fixedQuote: QuoteItemType[];
  prompt: ChatItemSimpleType;
  similarity: number;
}): Promise<Response> {
  const modelConstantsData = ChatModelMap[model.chat.chatModel];

  // get vector
  const promptVector = await openaiEmbedding({
    userId,
    input: [prompt.value],
    type: 'chat'
  });

  // search kb
  const res: any = await PgClient.query(
    `BEGIN;
    SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
    select id,q,a,source from modelData where kb_id IN (${model.chat.relatedKbs
      .map((item) => `'${item}'`)
      .join(',')}) AND vector <#> '[${promptVector[0]}]' < -${similarity} order by vector <#> '[${
      promptVector[0]
    }]' limit 10;
    COMMIT;`
  );

  const searchRes: QuoteItemType[] = res?.[2]?.rows || [];

  // filter same search result
  const idSet = new Set<string>();
  const filterSearch = [
    ...searchRes.slice(0, 3),
    ...fixedQuote.slice(0, 2),
    ...searchRes.slice(3),
    ...fixedQuote.slice(2, 5)
  ].filter((item) => {
    if (idSet.has(item.id)) {
      return false;
    }
    idSet.add(item.id);
    return true;
  });

  // 计算固定提示词的 token 数量
  const guidePrompt = model.chat.systemPrompt // user system prompt
    ? {
        obj: ChatRoleEnum.System,
        value: model.chat.systemPrompt
      }
    : model.chat.searchMode === appVectorSearchModeEnum.noContext
    ? {
        obj: ChatRoleEnum.System,
        value: `知识库是关于"${model.name}"的内容,根据知识库内容回答问题.`
      }
    : {
        obj: ChatRoleEnum.System,
        value: `玩一个问答游戏,规则为:
1.你完全忘记你已有的知识
2.你只回答关于"${model.name}"的问题
3.你只从知识库中选择内容进行回答
4.如果问题不在知识库中,你会回答:"我不知道。"
请务必遵守规则`
      };

  const fixedSystemTokens = modelToolMap[model.chat.chatModel].countTokens({
    messages: [guidePrompt]
  });
  const sliceResult = modelToolMap[model.chat.chatModel]
    .tokenSlice({
      maxToken: modelConstantsData.systemMaxToken - fixedSystemTokens,
      messages: filterSearch.map((item) => ({
        obj: ChatRoleEnum.System,
        value: `${item.q}\n${item.a}`
      }))
    })
    .map((item) => item.value);

  // slice filterSearch
  const rawSearch = filterSearch.slice(0, sliceResult.length);

  //  system prompt
  const systemPrompt = sliceResult.join('\n').trim();

  /* 高相似度+不回复 */
  if (!systemPrompt && model.chat.searchMode === appVectorSearchModeEnum.hightSimilarity) {
    return {
      code: 201,
      rawSearch: [],
      guidePrompt: '',
      searchPrompts: [
        {
          obj: ChatRoleEnum.System,
          value: '对不起，你的问题不在知识库中。'
        }
      ]
    };
  }
  /* 高相似度+无上下文，不添加额外知识,仅用系统提示词 */
  if (!systemPrompt && model.chat.searchMode === appVectorSearchModeEnum.noContext) {
    return {
      code: 200,
      rawSearch: [],
      guidePrompt: model.chat.systemPrompt || '',
      searchPrompts: model.chat.systemPrompt
        ? [
            {
              obj: ChatRoleEnum.System,
              value: model.chat.systemPrompt
            }
          ]
        : []
    };
  }

  return {
    code: 200,
    rawSearch,
    guidePrompt: guidePrompt.value || '',
    searchPrompts: [
      {
        obj: ChatRoleEnum.System,
        value: `知识库:<${systemPrompt}>`
      },
      guidePrompt
    ]
  };
}
