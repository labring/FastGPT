import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { Flex, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowQuoteLimit } from '../../../../hooks/useWorkflowQuoteLimit';
import type { RenderInputProps } from '../type';
import { getDatasetSearchParamInputs, getDatasetSearchParams } from './SelectDatasetParams.utils';

const emptyInputs: FlowNodeInputItemType[] = [];

const SelectDatasetParam = ({ nodeId }: RenderInputProps) => {
  const nodeActions = useNodeActions(nodeId);
  const currentInputs =
    useNode<FlowNodeInputItemType[]>(nodeId, (node) => node?.data.inputs) ?? emptyInputs;
  const llmMaxQuoteContext = useWorkflowQuoteLimit();
  const { t } = useTranslation();
  const data = useMemo(() => {
    const getValue = (key: string) => currentInputs.find((input) => input.key === key)?.value;
    return getDatasetSearchParams(
      [
        NodeInputKeyEnum.datasetSearchMode,
        NodeInputKeyEnum.datasetSearchEmbeddingWeight,
        NodeInputKeyEnum.datasetMaxTokens,
        NodeInputKeyEnum.datasetSimilarity,
        NodeInputKeyEnum.datasetSearchUsingReRank,
        NodeInputKeyEnum.datasetSearchRerankModelId,
        NodeInputKeyEnum.datasetSearchRerankModel,
        NodeInputKeyEnum.datasetSearchRerankWeight,
        NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
        NodeInputKeyEnum.datasetSearchExtensionModelId,
        NodeInputKeyEnum.datasetSearchExtensionModel,
        NodeInputKeyEnum.datasetSearchExtensionBg
      ].map((key) => ({ key, value: getValue(key) })) as Pick<
        FlowNodeInputItemType,
        'key' | 'value'
      >[]
    );
  }, [currentInputs]);

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
            // 记录级增改：以派发瞬间的 inputs 为基准合并后一次提交，避免逐条提交产生多条历史。
            nodeActions?.updateNode((current) => {
              const nextInputs = [...current.inputs];
              getDatasetSearchParamInputs({ inputs: current.inputs, values: e }).forEach(
                (input) => {
                  const index = nextInputs.findIndex((item) => item.key === input.key);
                  if (index >= 0) nextInputs[index] = input;
                  else nextInputs.push(input);
                }
              );
              return { inputs: nextInputs };
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetParam);
