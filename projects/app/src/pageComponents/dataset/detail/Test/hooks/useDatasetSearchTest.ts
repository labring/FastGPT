import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { postSearchText } from '@/web/core/dataset/api';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDatasetTestResponse } from '@fastgpt/global/openapi/core/dataset/api';
import type { SearchTestFormType, SearchTestImageRef } from '../type';

export const useDatasetSearchTest = ({
  datasetId,
  queryImageRefs,
  defaultModels
}: {
  datasetId: string;
  queryImageRefs: SearchTestImageRef[];
  defaultModels: {
    rerank?: {
      model?: string;
    };
    llm?: {
      model?: string;
    };
  };
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
        rerankModel: defaultModels?.rerank?.model,
        rerankWeight: 0.5,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: defaultModels.llm?.model,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const inputText = useWatch({ control, name: 'inputText' });
  const searchParams = getValues('searchParams');

  const { runAsync: onTextTest, loading: textTestIsLoading } = useRequest(
    ({ inputText, searchParams }: SearchTestFormType) =>
      postSearchText({
        datasetId,
        text: inputText.trim(),
        // The backend resolves uploaded images by object key; previews stay client-side only.
        queryImageUrls: queryImageRefs.map((item) => item.key),
        ...searchParams
      }),
    {
      onSuccess(res: SearchDatasetTestResponse) {
        if (!res || res.list.length === 0) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: getValues('inputText').trim(),
          time: new Date(),
          results: res.list,
          queryImageRefs: queryImageRefs.length > 0 ? queryImageRefs : undefined,
          duration: res.duration,
          searchMode: res.searchMode,
          usingReRank: res.usingReRank,
          limit: res.limit,
          similarity: res.similarity,
          queryExtensionModel: res.queryExtensionModel
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
