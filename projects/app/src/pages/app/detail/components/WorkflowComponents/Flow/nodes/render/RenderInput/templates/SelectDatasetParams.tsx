import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal, { DatasetParamsProps } from '@/components/core/app/DatasetParamsModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const [data, setData] = useState<DatasetParamsProps>({
    searchMode: DatasetSearchModeEnum.embedding,
    limit: 5,
    similarity: 0.5,
    usingReRank: false,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionModel: llmModelList[0]?.model,
    datasetSearchExtensionBg: ''
  });

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodeList.forEach((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.chatNode) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          llmModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [llmModelList, nodeList]);

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    inputs.forEach((input) => {
      // @ts-ignore
      if (data[input.key] !== undefined) {
        setData((state) => ({
          ...state,
          [input.key]: input.value
        }));
      }
    });
  }, [inputs]);

  const Render = useMemo(() => {
    return (
      <>
        {/* label */}
        <Flex alignItems={'center'} mb={3} fontWeight={'medium'} color={'myGray.600'}>
          {t('core.dataset.search.Params Setting')}
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
          queryExtensionModel={data.datasetSearchExtensionModel}
        />
      </>
    );
  }, [data, onOpen, t]);

  return (
    <>
      {Render}
      {isOpen && (
        <DatasetParamsModal
          {...data}
          maxTokens={tokenLimit}
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
