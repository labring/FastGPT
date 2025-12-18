import React, { useEffect, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const llmMaxQuoteContext = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.llmMaxQuoteContext
  );
  const { t } = useTranslation();
  const { defaultModels } = useSystemStore();

  const [data, setData] = useState<AppDatasetSearchParamsType>({
    searchMode: DatasetSearchModeEnum.embedding,
    embeddingWeight: 0.5,
    limit: 3000,
    similarity: 0.5,
    usingReRank: true,
    rerankModel: defaultModels.llm?.model,
    rerankWeight: 0.6,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionModel: defaultModels.llm?.model,
    datasetSearchExtensionBg: ''
  });

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    inputs.forEach((input) => {
      // @ts-ignore
      if (data[input.key] !== undefined) {
        setData((state) => ({
          ...state,
          // @ts-ignore
          [input.key]: input.value ?? state[input.key]
        }));
      }
    });
  }, [inputs]);

  return (
    <>
      {/* label */}
      <Flex alignItems={'center'} mb={3} fontWeight={'medium'} color={'myGray.600'}>
        {t('common:core.dataset.search.Params Setting')}
        <MyIcon
          name={'common/settingLight'}
          ml={2}
          w={'16px'}
          cursor={'pointer'}
          _hover={{
            color: 'primary.600'
          }}
          onClick={onOpen}
        />
      </Flex>
      <SearchParamsTip
        searchMode={data.searchMode}
        similarity={data.similarity}
        limit={data.limit}
        usingReRank={data.usingReRank}
        usingExtensionQuery={data.datasetSearchUsingExtensionQuery}
        queryExtensionModel={data.datasetSearchExtensionModel}
      />

      {isOpen && (
        <DatasetParamsModal
          {...data}
          maxTokens={llmMaxQuoteContext}
          onClose={onClose}
          onSuccess={(e) => {
            setData(e);
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key,
                value: {
                  ...item,
                  //@ts-ignore
                  value: e[key]
                }
              });
            }
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetParam);
