import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, Switch } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  DatasetRetrievalModeEnum,
  DatasetSearchModeEnum,
  RerankMethodEnum
} from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { getWebLLMModel } from '@/web/common/system/utils';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import RetrievalModeSelector from './RetrievalModeSelector';
import SelectAiModel from '@/components/Select/AIModelSelector';
import { getEmbeddingModelSelectList } from '@/web/core/app/utils';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const getNodeList = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeList);
  const nodeAmount = useContextSelector(WorkflowBufferDataContext, (v) => v.nodeAmount);
  const { t } = useTranslation();
  const { defaultModels, llmModelList, reRankModelList, embeddingModelList } = useSystemStore();

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

  useEffect(() => {
    setData((state) => {
      const next = { ...state };
      inputs.forEach((input) => {
        // 同步通用 data 字段
        // @ts-ignore
        if (data[input.key] !== undefined) {
          // @ts-ignore
          next[input.key] = input.value ?? state[input.key];
        }
        if (input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel) {
          next.embeddingModel = input.value ?? state.embeddingModel;
        }
      });
      return next;
    });

    setAgenticSearchConfig((state) => {
      const next = { ...state };
      inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel) {
          next.embeddingModel = input.value ?? state.embeddingModel;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchLLMModel) {
          next.agenticSearchLLMModel = input.value || state.agenticSearchLLMModel;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchReasoning) {
          next.agenticSearchReasoning = input.value ?? state.agenticSearchReasoning;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchRerankModel) {
          next.agenticSearchRerankModel = input.value || state.agenticSearchRerankModel;
        }
      });
      return next;
    });

    inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.datasetRetrievalMode) {
        setRetrievalMode(input.value || DatasetRetrievalModeEnum.standard);
      }
    });

    // 新建节点时 input.value 为 undefined，将默认值写入 inputs 确保参数下发
    [
      { key: NodeInputKeyEnum.datasetSearchExtensionModel, defaultValue: defaultModels.llm?.model },
      { key: NodeInputKeyEnum.datasetAgenticSearchLLMModel, defaultValue: defaultModels.llm?.model },
      { key: NodeInputKeyEnum.datasetSearchRerankModel, defaultValue: defaultModels.rerank?.model },
      {
        key: NodeInputKeyEnum.datasetAgenticSearchRerankModel,
        defaultValue: defaultModels.rerank?.model
      }
    ].forEach(({ key, defaultValue }) => {
      if (!defaultValue) return;
      const input = inputs.find((i) => i.key === key);
      if (input && !input.value) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key,
          value: { ...input, value: defaultValue }
        });
      }
    });
  }, [inputs, nodeId, onChangeNode, defaultModels.rerank?.model, defaultModels.llm?.model]);

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
    // 初次选择知识库（prev === undefined）且 inputs 中 embeddingModel 无已保存值时，也自动配置
    const currentInputEmbeddingModel = inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModel
    )?.value;
    const isFirstSelect = prev === undefined && !currentInputEmbeddingModel;
    const isSwitchDataset = prev !== undefined && prev !== datasetVectorModel;

    if (isFirstSelect || isSwitchDataset) {
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

  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, knowledgeTypeConfig.datasetVectorModel),
    [embeddingModelList, knowledgeTypeConfig.datasetVectorModel]
  );

  const updateNodeInput = useCallback(
    (key: string, val: string | boolean) => {
      const item = inputs.find((input) => input.key === key);
      if (!item) return;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key,
        value: { ...item, value: val }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

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
              const prevMode = retrievalMode;
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

              // 切换检索模式时，清空另一模式的字段
              if (mode !== prevMode) {
                if (mode === DatasetRetrievalModeEnum.standard) {
                  // 标准检索 → 清空多轮智能检索相关字段
                  setAgenticSearchConfig((prev) => ({
                    ...prev,
                    agenticSearchLLMModel: '',
                    agenticSearchRerankModel: '',
                    agenticSearchReasoning: false
                  }));
                  updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchLLMModel, '');
                  updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchRerankModel, '');
                  updateNodeInput(
                    NodeInputKeyEnum.datasetAgenticSearchReasoning,
                    false
                  );
                } else {
                  // 多轮智能检索 → 清空标准检索相关字段
                  setData((prev) => ({
                    ...prev,
                    datasetSearchExtensionModel: '',
                    rerankModel: ''
                  }));
                  updateNodeInput(NodeInputKeyEnum.datasetSearchExtensionModel, '');
                  updateNodeInput(NodeInputKeyEnum.datasetSearchRerankModel, '');
                }
              }

              if (knowledgeTypeConfig.hasDatabaseKnowledge) {
                const newAiModel =
                  mode === DatasetRetrievalModeEnum.agentic
                    ? agenticSearchConfig.agenticSearchLLMModel
                    : data.datasetSearchExtensionModel || '';
                if (newAiModel) {
                  updateNodeInput(NodeInputKeyEnum.generateSqlModel, newAiModel);
                }
              }
            }}
          />
        </Box>

        {/* 内联表单（两种模式共享，仅值/Key/部分提示不同） */}
        <Box>
          {/* AI 模型 */}
          <Flex alignItems="center" justifyContent="space-between" mb={3} fontSize="12px">
            <FormLabel w="96px" fontSize="12px" fontWeight="normal">
              {t('app:smart_customer_service_ai_model')}
              <QuestionTip
                ml={0.5}
                label={
                  retrievalMode === DatasetRetrievalModeEnum.agentic
                    ? t('app:smart_customer_service_ai_model_tip_agentic')
                    : t('app:smart_customer_service_ai_model_tip_standard')
                }
              />
            </FormLabel>
            <Box flex="1">
              <SelectAiModel
                fontSize="12px"
                fontWeight="normal"
                width="100%"
                value={
                  retrievalMode === DatasetRetrievalModeEnum.agentic
                    ? agenticSearchConfig.agenticSearchLLMModel
                    : data.datasetSearchExtensionModel || ''
                }
                list={llmModelList.map((item) => ({ value: item.model, label: item.name }))}
                onChange={(val: string) => {
                  if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                    setAgenticSearchConfig((prev) => ({ ...prev, agenticSearchLLMModel: val }));
                    updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchLLMModel, val);
                  } else {
                    setData((prev) => ({ ...prev, datasetSearchExtensionModel: val }));
                    updateNodeInput(NodeInputKeyEnum.datasetSearchExtensionModel, val);
                  }
                  if (knowledgeTypeConfig.hasDatabaseKnowledge) {
                    updateNodeInput(NodeInputKeyEnum.generateSqlModel, val);
                  }
                }}
              />
            </Box>
          </Flex>

          {/* 向量模型 */}
          <Flex alignItems="center" justifyContent="space-between" mb={3} fontSize="12px">
            <FormLabel w="96px" fontSize="12px" fontWeight="normal">
              {t('common:core.ai.model.Vector Model')}
              {retrievalMode === DatasetRetrievalModeEnum.agentic && (
                <QuestionTip ml={0.5} label={t('app:smart_customer_service_embedding_model_tip')} />
              )}
            </FormLabel>
            <Box flex="1">
              <SelectAiModel
                width="100%"
                fontSize="12px"
                fontWeight="normal"
                value={
                  retrievalMode === DatasetRetrievalModeEnum.agentic
                    ? agenticSearchConfig.embeddingModel
                    : data.embeddingModel
                }
                list={embeddingModelSelectList}
                onChange={(val: string) => {
                  if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                    setAgenticSearchConfig((prev) => ({ ...prev, embeddingModel: val }));
                  } else {
                    setData((prev) => ({ ...prev, embeddingModel: val }));
                  }
                  updateNodeInput(NodeInputKeyEnum.datasetSearchEmbeddingModel, val);
                }}
              />
            </Box>
          </Flex>

          {/* 重排模型 */}
          <Flex alignItems="center" justifyContent="space-between" mb={3} fontSize="12px">
            <FormLabel w="96px" fontSize="12px" fontWeight="normal">
              {t('app:smart_customer_service_rerank_model')}
            </FormLabel>
            <Box flex="1">
              <SelectAiModel
                width="100%"
                fontSize="12px"
                fontWeight="normal"
                value={
                  retrievalMode === DatasetRetrievalModeEnum.agentic
                    ? agenticSearchConfig.agenticSearchRerankModel
                    : data.rerankModel || ''
                }
                list={reRankModelList.map((item) => ({ value: item.model, label: item.name }))}
                onChange={(val: string) => {
                  if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                    setAgenticSearchConfig((prev) => ({
                      ...prev,
                      agenticSearchRerankModel: val
                    }));
                    updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchRerankModel, val);
                  } else {
                    setData((prev) => ({ ...prev, rerankModel: val }));
                    updateNodeInput(NodeInputKeyEnum.datasetSearchRerankModel, val);
                  }
                }}
              />
            </Box>
          </Flex>

          {/* 输出思考过程 —— 仅多轮智能检索 */}
          {retrievalMode === DatasetRetrievalModeEnum.agentic && (
            <Flex alignItems="center" justifyContent="space-between" mb={3} fontSize="12px">
              <FormLabel w="96px" fontSize="12px" fontWeight="normal">
                {t('app:retrieval_output_thinking')}
                <QuestionTip ml={0.5} label={t('app:retrieval_output_thinking_tooltip')} />
              </FormLabel>
              <Switch
                isChecked={agenticSearchConfig.agenticSearchReasoning}
                onChange={(e) => {
                  setAgenticSearchConfig((prev) => ({
                    ...prev,
                    agenticSearchReasoning: e.target.checked
                  }));
                  updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchReasoning, e.target.checked);
                }}
              />
            </Flex>
          )}
        </Box>
      </>
    );
  }, [
    retrievalMode,
    inputs,
    nodeId,
    onChangeNode,
    t,
    data.embeddingModel,
    data.rerankModel,
    data.datasetSearchExtensionModel,
    knowledgeTypeConfig.hasDatabaseKnowledge,
    agenticSearchConfig,
    embeddingModelSelectList,
    llmModelList,
    reRankModelList,
    updateNodeInput
  ]);

  return <>{Render}</>;
};

export default React.memo(SelectDatasetParam);
