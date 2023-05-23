import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import type { ChatItemSimpleType } from '@/types/chat';
import type { ModelSchema } from '@/types/mongoSchema';
import { ModelVectorSearchModeEnum } from '@/constants/model';
import { authModel } from '@/service/utils/auth';
import { ChatModelMap } from '@/constants/model';
import { ChatRoleEnum } from '@/constants/chat';
import { openaiEmbedding } from '../plugin/openaiEmbedding';
import { ModelDataStatusEnum } from '@/constants/model';
import { modelToolMap } from '@/utils/plugin';

export type QuoteItemType = { id: string; q: string; a: string; isEdit: boolean };
type Props = {
  prompts: ChatItemSimpleType[];
  similarity: number;
  appId: string;
};
type Response = {
  code: 200 | 201;
  rawSearch: QuoteItemType[];
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
      userId,
      prompts,
      similarity,
      model
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
  prompts,
  similarity
}: {
  userId: string;
  prompts: ChatItemSimpleType[];
  similarity: number;
  model: ModelSchema;
}): Promise<Response> {
  const modelConstantsData = ChatModelMap[model.chat.chatModel];

  // search two times.
  const userPrompts = prompts.filter((item) => item.obj === 'Human');

  const input: string[] = [
    userPrompts[userPrompts.length - 1].value,
    userPrompts[userPrompts.length - 2]?.value
  ].filter((item) => item);

  // get vector
  const promptVectors = await openaiEmbedding({
    userId,
    input
  });

  // search kb
  const searchRes = await Promise.all(
    promptVectors.map((promptVector) =>
      PgClient.select<QuoteItemType>('modelData', {
        fields: ['id', 'q', 'a'],
        where: [
          ['status', ModelDataStatusEnum.ready],
          'AND',
          `kb_id IN (${model.chat.relatedKbs.map((item) => `'${item}'`).join(',')})`,
          'AND',
          `vector <=> '[${promptVector}]' < ${similarity}`
        ],
        order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
        limit: promptVectors.length === 1 ? 15 : 10
      }).then((res) => res.rows)
    )
  );

  // filter same search result
  const idSet = new Set<string>();
  const filterSearch = searchRes.map((search) =>
    search.filter((item) => {
      if (idSet.has(item.id)) {
        return false;
      }
      idSet.add(item.id);
      return true;
    })
  );

  // slice search result by rate.
  const sliceRateMap: Record<number, number[]> = {
    1: [1],
    2: [0.7, 0.3]
  };
  const sliceRate = sliceRateMap[searchRes.length] || sliceRateMap[0];
  // 计算固定提示词的 token 数量
  const fixedPrompts = [
    // user system prompt
    ...(model.chat.systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: model.chat.systemPrompt
          }
        ]
      : model.chat.searchMode === ModelVectorSearchModeEnum.noContext
      ? [
          {
            obj: ChatRoleEnum.System,
            value: `知识库是关于"${model.name}"的内容,根据知识库内容回答问题.`
          }
        ]
      : [
          {
            obj: ChatRoleEnum.System,
            value: `玩一个问答游戏,规则为:
1.你完全忘记你已有的知识
2.你只回答关于"${model.name}"的问题
3.你只从知识库中选择内容进行回答
4.如果问题不在知识库中,你会回答:"我不知道。"
请务必遵守规则`
          }
        ])
  ];
  const fixedSystemTokens = modelToolMap[model.chat.chatModel].countTokens({
    messages: fixedPrompts
  });
  const maxTokens = modelConstantsData.systemMaxToken - fixedSystemTokens;
  const sliceResult = sliceRate.map((rate, i) =>
    modelToolMap[model.chat.chatModel]
      .tokenSlice({
        maxToken: Math.round(maxTokens * rate),
        messages: filterSearch[i].map((item) => ({
          obj: ChatRoleEnum.System,
          value: `${item.q}\n${item.a}`
        }))
      })
      .map((item) => item.value)
  );

  // slice filterSearch
  const sliceSearch = filterSearch.map((item, i) => item.slice(0, sliceResult[i].length)).flat();

  //  system prompt
  const systemPrompt = sliceResult.flat().join('\n').trim();

  /* 高相似度+不回复 */
  if (!systemPrompt && model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity) {
    return {
      code: 201,
      rawSearch: [],
      searchPrompts: [
        {
          obj: ChatRoleEnum.System,
          value: '对不起，你的问题不在知识库中。'
        }
      ]
    };
  }
  /* 高相似度+无上下文，不添加额外知识,仅用系统提示词 */
  if (!systemPrompt && model.chat.searchMode === ModelVectorSearchModeEnum.noContext) {
    return {
      code: 200,
      rawSearch: [],
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
    rawSearch: sliceSearch,
    searchPrompts: [
      {
        obj: ChatRoleEnum.System,
        value: `知识库:${systemPrompt}`
      },
      ...fixedPrompts
    ]
  };
}
