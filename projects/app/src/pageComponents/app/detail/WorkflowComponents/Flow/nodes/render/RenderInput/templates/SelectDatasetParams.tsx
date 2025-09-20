import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { getWebLLMModel } from '@/web/common/system/utils';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const knowledgeTypeConfig = useMemo(() => {
    const datasetList = (nodeList.find((node) => node.nodeId === nodeId)?.inputs || []).filter(
      (input) => input.key === NodeInputKeyEnum.datasetSelectList
    );
    const knowledgeInfoList = datasetList
      .map((dataset) => dataset.value)
      .flat()
      .filter((v) => v);

    // 引用变量场景展示全部
    if (datasetList.some((v) => v.selectedTypeIndex == 1)) {
      return {
        hasDatabaseKnowledge: true,
        hasOtherKnowledge: true
      };
    }

    return {
      hasDatabaseKnowledge: knowledgeInfoList.some(
        (item) => item.datasetType === DatasetTypeEnum.database
      ),
      hasOtherKnowledge: knowledgeInfoList.some(
        (item) => item.datasetType !== DatasetTypeEnum.database
      )
    };
  }, [nodeList, nodeId]);

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
    datasetSearchExtensionBg: '',
    generateSqlModel: defaultModels.embedding?.model
  });

  const tokenLimit = useMemo(() => {
    let maxTokens = 0;

    nodeList.forEach((item) => {
      if ([FlowNodeTypeEnum.chatNode, FlowNodeTypeEnum.agent].includes(item.flowNodeType)) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken = getWebLLMModel(model)?.quoteMaxToken ?? 0;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens ? maxTokens : undefined;
  }, [nodeList]);

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

  const Render = useMemo(() => {
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
          generateSqlModel={data.generateSqlModel}
          usingReRank={data.usingReRank}
          datasetSearchUsingExtensionQuery={data.datasetSearchUsingExtensionQuery}
          queryExtensionModel={data.datasetSearchExtensionModel}
          {...knowledgeTypeConfig}
        />
      </>
    );
  }, [data, onOpen, t, knowledgeTypeConfig]);

  return (
    <>
      {Render}
      {isOpen && (
        <DatasetParamsModal
          {...data}
          {...knowledgeTypeConfig}
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
