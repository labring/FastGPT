import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { getDatasetSearchParamInputs, getDatasetSearchParams } from './SelectDatasetParams.utils';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const llmMaxQuoteContext = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.llmMaxQuoteContext
  );
  const { t } = useTranslation();
  const data = useMemo(() => getDatasetSearchParams(inputs), [inputs]);

  const { isOpen, onOpen, onClose } = useDisclosure();

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
        queryExtensionModel={data.datasetSearchExtensionModelId}
      />

      {isOpen && (
        <DatasetParamsModal
          {...data}
          maxTokens={llmMaxQuoteContext}
          onClose={onClose}
          onSuccess={(e) => {
            for (const input of getDatasetSearchParamInputs({ inputs, values: e })) {
              if (inputs.some((item) => item.key === input.key)) {
                onChangeNode({ nodeId, type: 'updateInput', key: input.key, value: input });
              } else {
                onChangeNode({ nodeId, type: 'addInput', value: input });
              }
            }
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetParam);
