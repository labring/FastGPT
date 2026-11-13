import { postDatasetSearch } from '@/web/core/dataset/api';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { rerankCandidateNumRange } from '@fastgpt/global/core/dataset/search/utils';
import type { SearchDatasetResponse } from '@fastgpt/global/openapi/core/dataset/search/api';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { SearchTestFormType, SearchTestImageRef } from '../type';

/** 将页面表单映射为统一搜索请求，结果继续沿用已有的本地历史记录格式。 */
export const useDatasetSearchTest = ({
  datasetId,
  queryImageRefs
}: {
  datasetId: string;
  queryImageRefs: SearchTestImageRef[];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { pushDatasetTestItem } = useSearchTestStore();
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();

  const { control, getValues, setValue, register, handleSubmit } = useForm<SearchTestFormType>({
    defaultValues: {
      inputText: '',
      searchParams: {
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        rerankCandidateNum: rerankCandidateNumRange.default,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const inputText = useWatch({ control, name: 'inputText' });
  const searchParams = getValues('searchParams');

  const { runAsync: onTextTest, loading: textTestIsLoading } = useRequest(
    ({ inputText, searchParams }: SearchTestFormType) =>
      postDatasetSearch({
        usageScene: 'searchTest',
        scope: { datasetIds: [datasetId] },
        query: {
          text: inputText.trim(),
          // 只传已上传图片的对象 key，预览地址保留在客户端。
          imageKeys: queryImageRefs.map((item) => item.key)
        },
        retrieval: {
          mode: searchParams.searchMode,
          embeddingWeight: searchParams.embeddingWeight
        },
        rerank: searchParams.usingReRank
          ? {
              enabled: true,
              modelId: isEmptyModelValue(searchParams.rerankModelId)
                ? undefined
                : searchParams.rerankModelId,
              weight: searchParams.rerankWeight,
              candidateNum: searchParams.rerankCandidateNum
            }
          : { enabled: false },
        queryExtension: searchParams.datasetSearchUsingExtensionQuery
          ? {
              enabled: true,
              modelId: isEmptyModelValue(searchParams.datasetSearchExtensionModelId)
                ? undefined
                : searchParams.datasetSearchExtensionModelId,
              background: searchParams.datasetSearchExtensionBg
            }
          : { enabled: false },
        result: { maxTokens: searchParams.limit, similarity: searchParams.similarity }
      }),
    {
      onSuccess(res: SearchDatasetResponse, [submitted]: [SearchTestFormType]) {
        if (!res || res.list.length === 0) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: submitted.inputText.trim(),
          time: new Date(),
          results: res.list,
          queryImageRefs: queryImageRefs.length > 0 ? queryImageRefs : undefined,
          duration: `${(res.meta.durationMs / 1000).toFixed(3)}s`,
          searchMode: submitted.searchParams.searchMode,
          usingReRank: res.meta.usingReRank,
          limit: submitted.searchParams.limit ?? 5000,
          similarity: submitted.searchParams.similarity ?? 0,
          queryExtensionModel: res.meta.queryExtensionModelId
        };

        pushDatasetTestItem(testItem);
        setDatasetTestItem(testItem);
      }
    }
  );

  return {
    setDatasetTestItem,
    currentDatasetTestItem: datasetTestItem?.datasetId === datasetId ? datasetTestItem : undefined,
    inputText,
    searchParams,
    setValue,
    register,
    onSubmit: handleSubmit((data) => onTextTest(data)),
    textTestIsLoading
  };
};
