import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { Flex, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useField, useNodeActions, type WorkflowFieldHandle } from '@/web/core/workflow/editor';
import { useWorkflowQuoteLimit } from '../../../../hooks/useWorkflowQuoteLimit';
import type { RenderInputProps } from '../type';
import { getDatasetSearchParamInputs, getDatasetSearchParams } from './SelectDatasetParams.utils';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const nodeActions = useNodeActions(nodeId);
  const searchModeField = useField(nodeId, NodeInputKeyEnum.datasetSearchMode, 'input');
  const embeddingWeightField = useField(
    nodeId,
    NodeInputKeyEnum.datasetSearchEmbeddingWeight,
    'input'
  );
  const limitField = useField(nodeId, NodeInputKeyEnum.datasetMaxTokens, 'input');
  const similarityField = useField(nodeId, NodeInputKeyEnum.datasetSimilarity, 'input');
  const usingReRankField = useField(nodeId, NodeInputKeyEnum.datasetSearchUsingReRank, 'input');
  const rerankModelIdField = useField(nodeId, NodeInputKeyEnum.datasetSearchRerankModelId, 'input');
  const rerankModelField = useField(nodeId, NodeInputKeyEnum.datasetSearchRerankModel, 'input');
  const rerankWeightField = useField(nodeId, NodeInputKeyEnum.datasetSearchRerankWeight, 'input');
  const usingExtensionQueryField = useField(
    nodeId,
    NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
    'input'
  );
  const extensionModelIdField = useField(
    nodeId,
    NodeInputKeyEnum.datasetSearchExtensionModelId,
    'input'
  );
  const extensionModelField = useField(
    nodeId,
    NodeInputKeyEnum.datasetSearchExtensionModel,
    'input'
  );
  const extensionBgField = useField(nodeId, NodeInputKeyEnum.datasetSearchExtensionBg, 'input');
  const llmMaxQuoteContext = useWorkflowQuoteLimit();
  const { t } = useTranslation();
  const data = useMemo(() => {
    const getValue = (key: string, field: WorkflowFieldHandle | undefined) =>
      (field?.data.input ?? inputs.find((input) => input.key === key))?.value;

    const fields: Array<[string, WorkflowFieldHandle | undefined]> = [
      [NodeInputKeyEnum.datasetSearchMode, searchModeField],
      [NodeInputKeyEnum.datasetSearchEmbeddingWeight, embeddingWeightField],
      [NodeInputKeyEnum.datasetMaxTokens, limitField],
      [NodeInputKeyEnum.datasetSimilarity, similarityField],
      [NodeInputKeyEnum.datasetSearchUsingReRank, usingReRankField],
      [NodeInputKeyEnum.datasetSearchRerankModelId, rerankModelIdField],
      [NodeInputKeyEnum.datasetSearchRerankModel, rerankModelField],
      [NodeInputKeyEnum.datasetSearchRerankWeight, rerankWeightField],
      [NodeInputKeyEnum.datasetSearchUsingExtensionQuery, usingExtensionQueryField],
      [NodeInputKeyEnum.datasetSearchExtensionModelId, extensionModelIdField],
      [NodeInputKeyEnum.datasetSearchExtensionModel, extensionModelField],
      [NodeInputKeyEnum.datasetSearchExtensionBg, extensionBgField]
    ];

    return getDatasetSearchParams(
      fields.map(([key, field]) => ({ key, value: getValue(key, field) })) as Pick<
        FlowNodeInputItemType,
        'key' | 'value'
      >[]
    );
  }, [
    embeddingWeightField,
    extensionBgField,
    extensionModelField,
    extensionModelIdField,
    inputs,
    limitField,
    rerankModelField,
    rerankModelIdField,
    rerankWeightField,
    searchModeField,
    similarityField,
    usingExtensionQueryField,
    usingReRankField
  ]);

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
