import { addLog } from '../../../common/system/log';
import { POST } from '../../../common/api/serverRequest';
import { getDefaultRerankModel } from '../model';
import { getAxiosConfig } from '../config';
import { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';

type PostReRankResponse = {
  id: string;
  results: {
    index: number;
    relevance_score: number;
  }[];
};
type ReRankCallResult = { id: string; score?: number }[];

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
    return Promise.reject('no rerank model');
  }
  if (documents.length === 0) {
    return Promise.resolve([]);
  }

  const { baseUrl, authorization } = getAxiosConfig();

  let start = Date.now();
  return POST<PostReRankResponse>(
    model.requestUrl ? model.requestUrl : `${baseUrl}/rerank`,
    {
      model: model.model,
      query,
      documents: documents.map((doc) => doc.text)
    },
    {
      headers: {
        Authorization: model.requestAuth ? `Bearer ${model.requestAuth}` : authorization,
        ...headers
      },
      timeout: 30000
    }
  )
    .then((data) => {
      addLog.info('ReRank finish:', { time: Date.now() - start });

      if (!data?.results || data?.results?.length === 0) {
        addLog.error('ReRank error, empty result', data);
      }

      return data?.results?.map((item) => ({
        id: documents[item.index].id,
        score: item.relevance_score
      }));
    })
    .catch((err) => {
      addLog.error('rerank error', err);

      return Promise.reject(err);
    });
}
