import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, useDisclosure, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  DatasetRetrievalModeEnum,
  DatasetSearchModeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { getWebLLMModel } from '@/web/common/system/utils';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import RetrievalModeSelector from './RetrievalModeSelector';
import MultipleRetrievalModal from './MultipleRetrievalModal';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const getNodeList = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeList);
  const nodeAmount = useContextSelector(WorkflowBufferDataContext, (v) => v.nodeAmount);
  const { t } = useTranslation();
  const { defaultModels } = useSystemStore();

  const [data, setData] = useState<AppDatasetSearchParamsType>({
    searchMode: DatasetSearchModeEnum.embedding,
    embeddingWeight: 0.5,
    limit: 3000,
    similarity: 0.5,
    usingReRank: true,
    rerankModel: defaultModels.rerank?.model,
    rerankMethod: RerankMethodEnum.content,
    rerankWeight: 0.6,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionModel: defaultModels.llm?.model,
    datasetSearchExtensionBg: '',
    generateSqlModel: defaultModels.llm?.model,
    embeddingModel: ''
  });

  const [retrievalMode, setRetrievalMode] = useState<`${DatasetRetrievalModeEnum}`>(
    DatasetRetrievalModeEnum.standard
  );
  const [agenticSearchConfig, setAgenticSearchConfig] = useState({
    agenticSearchLLMModel: defaultModels.llm?.model || '',
    embeddingModel: '',
    agenticSearchRerankModel: defaultModels.rerank?.model || '',
    agenticSearchReasoning: true
  });

  const knowledgeTypeConfig = useMemo(() => {
    const datasetList = inputs.filter((input) => input.key === NodeInputKeyEnum.datasetSelectList);
    const knowledgeInfoList = datasetList
      .map((dataset) => dataset.value)
      .flat()
      .filter((v) => v);

    // 引用变量场景展示全部
    if (datasetList.some((v) => v.selectedTypeIndex == 1)) {
      return {
        isVariableRef: true,
        hasDatabaseKnowledge: true,
        hasOtherKnowledge: true,
        datasetVectorModel: undefined
      };
    }

    return {
      isVariableRef: false,
      hasDatabaseKnowledge: knowledgeInfoList.some(
        (item) => item.datasetType && isDatabaseDataset(item.datasetType)
      ),
      // 没选择知识库时展示通用知识库配置
      hasOtherKnowledge:
        knowledgeInfoList.some(
          (item) => item.datasetType && !isDatabaseDataset(item.datasetType)
        ) || knowledgeInfoList.length === 0,
      datasetVectorModel: knowledgeInfoList[0]?.vectorModel?.model
    };
  }, [inputs]);

  useEffect(() => {
    if (knowledgeTypeConfig.isVariableRef) {
      setData((e) => ({
        ...e,
        searchMode:
          e.searchMode === DatasetSearchModeEnum.database
            ? DatasetSearchModeEnum.embedding
            : e.searchMode
      }));
    }
  }, [knowledgeTypeConfig.isVariableRef]);

  const tokenLimit = useMemo(() => {
    let maxTokens = 0;

    getNodeList().forEach((item) => {
      if ([FlowNodeTypeEnum.chatNode, FlowNodeTypeEnum.agent].includes(item.flowNodeType)) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken = getWebLLMModel(model)?.quoteMaxToken ?? 0;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens ? maxTokens : undefined;
  }, [getNodeList, nodeAmount]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isAgenticModalOpen,
    onOpen: onAgenticModalOpen,
    onClose: onAgenticModalClose
  } = useDisclosure();

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
      if (input.key === NodeInputKeyEnum.datasetRetrievalMode) {
        setRetrievalMode(input.value || DatasetRetrievalModeEnum.standard);
      }
      if (input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel) {
        setData((prev) => ({
          ...prev,
          embeddingModel: input.value ?? prev.embeddingModel
        }));
        setAgenticSearchConfig((prev) => ({
          ...prev,
          embeddingModel: input.value ?? prev.embeddingModel
        }));
      }
      if (input.key === NodeInputKeyEnum.datasetAgenticSearchLLMModel) {
        setAgenticSearchConfig((prev) => ({
          ...prev,
          agenticSearchLLMModel: input.value || prev.agenticSearchLLMModel
        }));
      }
      if (input.key === NodeInputKeyEnum.datasetAgenticSearchReasoning) {
        setAgenticSearchConfig((prev) => ({
          ...prev,
          agenticSearchReasoning: input.value ?? prev.agenticSearchReasoning
        }));
      }
      if (input.key === NodeInputKeyEnum.datasetAgenticSearchRerankModel) {
        setAgenticSearchConfig((prev) => ({
          ...prev,
          agenticSearchRerankModel: input.value || prev.agenticSearchRerankModel
        }));
      }
    });
  }, [inputs]);

  // 知识库变更时同步 embeddingModel：清空则清空；切换则更新为新的向量模型
  const prevDatasetVectorModelRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    const datasetVectorModel = knowledgeTypeConfig.datasetVectorModel;
    if (datasetVectorModel === prevDatasetVectorModelRef.current) return;

    const prev = prevDatasetVectorModelRef.current;
    prevDatasetVectorModelRef.current = datasetVectorModel;

    if (!datasetVectorModel) {
      if (data.embeddingModel) {
        setData((prev) => ({ ...prev, embeddingModel: '' }));
        const embeddingModelInput = inputs.find(
          (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel
        );
        if (embeddingModelInput) {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: NodeInputKeyEnum.datasetSearchEmbeddingModel,
            value: { ...embeddingModelInput, value: '' }
          });
        }
      }
      return;
    }

    // 知识库从有值A切换为有值B时，更新 embeddingModel 为新的向量模型
    if (prev !== undefined && prev !== datasetVectorModel) {
      setData((state) => ({ ...state, embeddingModel: datasetVectorModel }));
      const embeddingModelInput = inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel
      );
      if (embeddingModelInput) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.datasetSearchEmbeddingModel,
          value: { ...embeddingModelInput, value: datasetVectorModel }
        });
      }
    }
  }, [knowledgeTypeConfig.datasetVectorModel, data.embeddingModel, inputs, nodeId, onChangeNode]);

  const Render = useMemo(() => {
    return (
      <>
        <Flex alignItems={'center'} mb={3} fontSize={'sm'}>
          {t('app:retrieval_config')}
          <QuestionTip
            ml={1}
            label={
              <Box lineHeight={'24px'} fontSize={'12px'}>
                <Box>
                  <span style={{ fontWeight: 600 }}>{t('app:retrieval_mode_single_title')}</span>
                  <span>{t('app:retrieval_mode_single_desc')}</span>
                </Box>
                <Box>
                  <span style={{ fontWeight: 600 }}>{t('app:retrieval_mode_multiple_title')}</span>
                  <span>{t('app:retrieval_mode_multiple_desc')}</span>
                </Box>
              </Box>
            }
          />
        </Flex>
        <Box mb={3}>
          <RetrievalModeSelector
            value={retrievalMode}
            onChange={(mode) => {
              setRetrievalMode(mode);
              const item = inputs.find(
                (input) => input.key === NodeInputKeyEnum.datasetRetrievalMode
              );
              if (item) {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.datasetRetrievalMode,
                  value: { ...item, value: mode }
                });
              }
            }}
            onConfigClick={(mode) => {
              if (mode === DatasetRetrievalModeEnum.standard) {
                onOpen();
              } else {
                onAgenticModalOpen();
              }
            }}
          />
        </Box>
      </>
    );
  }, [retrievalMode, inputs, nodeId, onChangeNode, onOpen, onAgenticModalOpen, t]);

  return (
    <>
      {Render}
      {isOpen && (
        <DatasetParamsModal
          {...data}
          {...knowledgeTypeConfig}
          datasetVectorModel={knowledgeTypeConfig.datasetVectorModel}
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
      {isAgenticModalOpen && (
        <MultipleRetrievalModal
          defaultValues={agenticSearchConfig}
          datasetVectorModel={knowledgeTypeConfig.datasetVectorModel}
          onClose={onAgenticModalClose}
          onSuccess={(config: any) => {
            setAgenticSearchConfig(config);

            // 更新 agenticSearchLLMModel
            const llmModelInput = inputs.find(
              (input) => input.key === NodeInputKeyEnum.datasetAgenticSearchLLMModel
            );
            if (llmModelInput) {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.datasetAgenticSearchLLMModel,
                value: { ...llmModelInput, value: config.agenticSearchLLMModel }
              });
            }

            // 更新 embeddingModel
            const embeddingModelInput = inputs.find(
              (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel
            );
            if (embeddingModelInput) {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.datasetSearchEmbeddingModel,
                value: { ...embeddingModelInput, value: config.embeddingModel }
              });
            }

            // 更新 agenticSearchReasoning
            const outputThinkingInput = inputs.find(
              (input) => input.key === NodeInputKeyEnum.datasetAgenticSearchReasoning
            );
            if (outputThinkingInput) {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.datasetAgenticSearchReasoning,
                value: { ...outputThinkingInput, value: config.agenticSearchReasoning }
              });
            }

            // 更新 rerankModel
            const rerankModelInput = inputs.find(
              (input) => input.key === NodeInputKeyEnum.datasetAgenticSearchRerankModel
            );
            if (rerankModelInput) {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.datasetAgenticSearchRerankModel,
                value: { ...rerankModelInput, value: config.agenticSearchRerankModel }
              });
            }
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetParam);
