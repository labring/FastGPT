import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode, useFlowProviderStore } from '../../../../FlowProvider';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal, {
  DatasetParamsProps
} from '@/components/core/module/DatasetParamsModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';

const SelectDatasetParam = ({ inputs = [], moduleId }: RenderInputProps) => {
  const { nodes } = useFlowProviderStore();
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

    nodes.forEach((item) => {
      if (item.type === FlowNodeTypeEnum.chatNode) {
        const model =
          item.data.inputs.find((item) => item.key === ModuleInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          llmModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [llmModelList, nodes]);

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
        <Flex alignItems={'center'} mb={3}>
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
          usingQueryExtension={data.datasetSearchUsingExtensionQuery}
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
                moduleId,
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
