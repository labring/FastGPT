import { POST } from '../../../common/api/serverRequest';
import { getDefaultRerankModel } from '../model';
import { getAxiosConfig } from '../config';
import { type RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countPromptTokens } from '../../../common/string/tiktoken';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.RERANK);

type PostReRankResponse = {
  id: string;
  results: {
    index: number;
    relevance_score: number;
  }[];
  meta?: {
    tokens: {
      input_tokens: number;
      output_tokens: number;
    };
  };
};
type ReRankCallResult = {
  results: { id: string; score?: number }[];
  inputTokens: number;
};

export function reRankRecall({
  model = getDefaultRerankModel(),
  query,
  documents,
  headers
}: {
  model?: RerankModelItemType;
  query: string;
  documents: { id: string; text: string }[];
  headers?: Record<string, string>;
}): Promise<ReRankCallResult> {
  if (!model) {
    return Promise.reject('No rerank model');
  }
  if (documents.length === 0) {
    return Promise.resolve({
      results: [],
      inputTokens: 0
    });
  }

  const { baseUrl, authorization } = getAxiosConfig();

  let start = Date.now();
  const documentsTextArray = documents.map((doc) => doc.text);
  return POST<PostReRankResponse>(
    model.requestUrl ? model.requestUrl : `${baseUrl}/rerank`,
    {
      model: model.model,
      query,
      documents: documentsTextArray
    },
    {
      headers: {
        Authorization: model.requestAuth ? `Bearer ${model.requestAuth}` : authorization,
        ...headers
      },
      timeout: 30000
    }
  )
    .then(async (data) => {
      logger.info('Rerank completed', { durationMs: Date.now() - start });

      if (!data?.results || data?.results?.length === 0) {
        logger.error('Rerank returned empty results', { data });
      }

      return {
        results: data?.results?.map((item) => ({
          id: documents[item.index].id,
          score: item.relevance_score
        })),
        inputTokens:
          data?.meta?.tokens?.input_tokens ||
          (await countPromptTokens(documentsTextArray.join('\n') + query, ''))
      };
    })
    .catch((err) => {
      logger.error('Rerank request failed', { error: err });

      return Promise.reject(err);
    });
}
