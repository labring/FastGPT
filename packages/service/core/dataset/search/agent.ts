import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLLMModel } from '../../ai/model';
import { filterGPTMessageByMaxContext } from '../../chat/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { createChatCompletion } from '../../ai/config';
import { llmCompletionsBodyFormat } from '../../ai/utils';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { searchDatasetData } from './controller';

type SearchDatasetDataProps = {
  queries: string[];
  histories: ChatItemType[];
  teamId: string;
  model: string;
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
  usingReRank?: boolean;
  reRankQuery: string;

  /* 
      {
        tags: {
          $and: ["str1","str2"],
          $or: ["str1","str2",null] null means no tags
        },
        createTime: {
          $gte: 'xx',
          $lte: 'xxx'
        }
      }
    */
  collectionFilterMatch?: string;
};

const analyzeQuery = async ({ query, histories }: { query: string; histories: ChatItemType[] }) => {
  const modelData = getLLMModel('gpt-4o-mini');

  const systemFewShot = `
## 知识背景
FastGPT 是低代码AI应用构建平台，支持通过语义相似度实现精准数据检索。用户正在利用该功能开发数据检索应用。

## 任务目标
基于用户历史对话和知识背景，生成多维度检索方案，确保覆盖核心语义及潜在关联维度。

## 工作流程
1. 问题解构阶段
   [意图识别] 提取用户问题的核心实体和关系：
   - 显性需求：直接提及的关键词
   - 隐性需求：可能涉及的关联概念
   [示例] 若问题为"推荐手机"，需考虑价格、品牌、使用场景等维度

2. 完整性校验阶段
   [完整性评估] 检查是否缺失核心实体和关系：
   - 主语完整
   - 多实体关系准确
   [维度扩展] 检查是否需要补充：
   □ 时间范围 □ 地理限定 □ 比较维度 
   □ 专业术语 □ 同义词替换 □ 场景参数

3. 检索生成阶段
   [组合策略] 生成包含以下要素的查询序列：
   ① 基础查询（核心关键词）
   ② 扩展查询（核心+同义词）
   ③ 场景查询（核心+场景限定词）
   ④ 逆向查询（相关技术/对比对象）

## 输出规范
格式要求：
1. 每个查询为完整陈述句
2. 包含至少1个核心词+1个扩展维度
3. 按查询范围从宽到窄排序

禁止项：
- 使用问句形式
- 包含解决方案描述
- 超出话题范围的假设

## 执行示例
用户问题："如何优化数据检索速度"

查询内容：
1. FastGPT 数据检索速度优化的常用方法
2. FastGPT 大数据量下的语义检索性能提升方案
3. FastGPT API 响应时间的优化指标

## 任务开始
`.trim();
  const filterHistories = await filterGPTMessageByMaxContext({
    messages: chats2GPTMessages({ messages: histories, reserveId: false }),
    maxContext: modelData.maxContext - 1000
  });

  const messages = [
    {
      role: 'system',
      content: systemFewShot
    },
    ...filterHistories,
    {
      role: 'user',
      content: query
    }
  ] as any;

  const { response: result } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        stream: false,
        model: modelData.model,
        temperature: 0.1,
        messages
      },
      modelData
    )
  });
  let answer = result.choices?.[0]?.message?.content || '';

  // Extract queries from the answer by line number
  const queries = answer
    .split('\n')
    .map((line) => {
      const match = line.match(/^\d+\.\s*(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean) as string[];

  if (queries.length === 0) {
    return [answer];
  }

  return queries;
};
const checkQuery = async ({
  queries,
  histories,
  searchResult
}: {
  queries: string[];
  histories: ChatItemType[];
  searchResult: SearchDataResponseItemType[];
}) => {
  const modelData = getLLMModel('gpt-4o-mini');

  const systemFewShot = `
## 知识背景
FastGPT 是低代码AI应用构建平台，支持通过语义相似度实现精准数据检索。用户正在利用该功能开发数据检索应用。

## 查询结果
${searchResult.map((item) => item.q + item.a).join('---\n---')}

## 任务目标
检查"检索结果"是否覆盖用户的问题，如果无法覆盖用户问题，则再次生成检索方案。

## 工作流程
1. 检查检索结果是否覆盖用户的问题
2. 如果检索结果覆盖用户问题，则直接输出："Done"
3. 如果无法覆盖用户问题，则结合用户问题和检索结果，生成进一步的检索方案，进行深度检索

## 输出规范

1. 每个查询均为完整的查询语句
2. 通过序号来表示多个检索内容

## 输出示例1
Done

## 输出示例2
1. 环界云计算的办公地址
2. 环界云计算的注册地址在哪里

## 任务开始
`.trim();
  const filterHistories = await filterGPTMessageByMaxContext({
    messages: chats2GPTMessages({ messages: histories, reserveId: false }),
    maxContext: modelData.maxContext - 1000
  });

  const messages = [
    {
      role: 'system',
      content: systemFewShot
    },
    ...filterHistories,
    {
      role: 'user',
      content: queries.join('\n')
    }
  ] as any;
  console.log(messages);
  const { response: result } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        stream: false,
        model: modelData.model,
        temperature: 0.1,
        messages
      },
      modelData
    )
  });
  let answer = result.choices?.[0]?.message?.content || '';
  console.log(answer);
  if (answer.includes('Done')) {
    return [];
  }

  const nextQueries = answer
    .split('\n')
    .map((line) => {
      const match = line.match(/^\d+\.\s*(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean) as string[];

  return nextQueries;
};
export const agentSearchDatasetData = async ({
  searchRes = [],
  tokens = 0,
  ...props
}: SearchDatasetDataProps & {
  searchRes?: SearchDataResponseItemType[];
  tokens?: number;
}) => {
  const query = props.queries[0];

  const searchResultList: SearchDataResponseItemType[] = [];
  let searchQueries: string[] = [];

  // 1. agent 分析问题
  searchQueries = await analyzeQuery({ query, histories: props.histories });

  // 2. 检索内容 + 检查
  let retryTimes = 3;
  while (true) {
    retryTimes--;
    if (retryTimes < 0) break;

    console.log(searchQueries, '--');
    const { searchRes: searchRes2, tokens: tokens2 } = await searchDatasetData({
      ...props,
      queries: searchQueries
    });
    // console.log(searchRes2.map((item) => item.q));
    // deduplicate and merge search results
    const uniqueResults = searchRes2.filter((item) => {
      return !searchResultList.some((existingItem) => existingItem.id === item.id);
    });
    searchResultList.push(...uniqueResults);
    if (uniqueResults.length === 0) break;

    const checkResult = await checkQuery({
      queries: searchQueries,
      histories: props.histories,
      searchResult: searchRes2
    });

    if (checkResult.length > 0) {
      searchQueries = checkResult;
    } else {
      break;
    }
  }

  console.log(searchResultList.length);
  return {
    searchRes: searchResultList,
    tokens: 0,
    usingSimilarityFilter: false,
    usingReRank: false
  };
};
