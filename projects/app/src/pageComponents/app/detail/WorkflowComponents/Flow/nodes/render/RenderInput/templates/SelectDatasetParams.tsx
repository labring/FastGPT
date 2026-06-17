import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, Switch, useDisclosure } from '@chakra-ui/react';
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
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import MyIcon from '@fastgpt/web/components/common/Icon';

const SelectDatasetParam = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const getNodeList = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeList);
  const nodeAmount = useContextSelector(WorkflowBufferDataContext, (v) => v.nodeAmount);
  const { t } = useTranslation();
  const { defaultModels, llmModelList, reRankModelList, embeddingModelList, feConfigs } =
    useSystemStore();
  const showDatasetSearchParams = feConfigs.show_dataset_search_params;

  const [data, setData] = useState<AppDatasetSearchParamsType>({
    searchMode: DatasetSearchModeEnum.embedding,
    embeddingWeight: 0.5,
    limit: 3000,
    similarity: 0.5,
    usingReRank: true,
    rerankModelId: defaultModels.rerank?.id,
    rerankMethod: RerankMethodEnum.content,
    rerankWeight: 0.6,
    datasetSearchUsingExtensionQuery: false,
    datasetSearchExtensionModelId: defaultModels.llm?.id,
    datasetSearchExtensionBg: '',
    generateSqlModelId: defaultModels.llm?.id,
    embeddingModelId: ''
  });

  const [retrievalMode, setRetrievalMode] = useState<`${DatasetRetrievalModeEnum}`>(
    DatasetRetrievalModeEnum.standard
  );
  const [agenticSearchConfig, setAgenticSearchConfig] = useState({
    agenticSearchLLMModelId: defaultModels.llm?.id || '',
    embeddingModelId: '',
    agenticSearchRerankModelId: defaultModels.rerank?.id || '',
    agenticSearchReasoning: true
  });

  const {
    isOpen: isOpenDatasetParamsModal,
    onOpen: onOpenDatasetParamsModal,
    onClose: onCloseDatasetParamsModal
  } = useDisclosure();

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
        datasetVectorModelId: undefined
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
      // 优先取有向量模型的知识库，避免数据库类型排在首位时取到空值
      datasetVectorModelId: knowledgeInfoList.find((d) => d.vectorModel?.id)?.vectorModel?.id
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
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModelId)?.value || '';
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
        if (input.key === NodeInputKeyEnum.datasetSearchEmbeddingModelId) {
          next.embeddingModelId = input.value ?? state.embeddingModelId;
        }
      });
      return next;
    });

    setAgenticSearchConfig((state) => {
      const next = { ...state };
      inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSearchEmbeddingModelId) {
          next.embeddingModelId = input.value ?? state.embeddingModelId;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchLLMModelId) {
          next.agenticSearchLLMModelId = input.value || state.agenticSearchLLMModelId;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchReasoning) {
          next.agenticSearchReasoning = input.value ?? state.agenticSearchReasoning;
        }
        if (input.key === NodeInputKeyEnum.datasetAgenticSearchRerankModelId) {
          next.agenticSearchRerankModelId = input.value || state.agenticSearchRerankModelId;
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
      { key: NodeInputKeyEnum.datasetSearchExtensionModelId, defaultValue: defaultModels.llm?.id },
      { key: NodeInputKeyEnum.datasetAgenticSearchLLMModelId, defaultValue: defaultModels.llm?.id },
      { key: NodeInputKeyEnum.datasetSearchRerankModelId, defaultValue: defaultModels.rerank?.id },
      {
        key: NodeInputKeyEnum.datasetAgenticSearchRerankModelId,
        defaultValue: defaultModels.rerank?.id
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

  // 知识库变更时同步 embeddingModelId：清空则清空；切换则更新为新的向量模型
  const prevDatasetVectorModelRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    const datasetVectorModelId = knowledgeTypeConfig.datasetVectorModelId;
    if (datasetVectorModelId === prevDatasetVectorModelRef.current) return;

    const prev = prevDatasetVectorModelRef.current;
    prevDatasetVectorModelRef.current = datasetVectorModelId;

    if (!datasetVectorModelId) {
      if (data.embeddingModelId) {
        setData((prev) => ({ ...prev, embeddingModelId: '' }));
        const embeddingModelInput = inputs.find(
          (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModelId
        );
        if (embeddingModelInput) {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: NodeInputKeyEnum.datasetSearchEmbeddingModelId,
            value: { ...embeddingModelInput, value: '' }
          });
        }
      }
      return;
    }

    // 知识库从有值A切换为有值B时，更新 embeddingModelId 为新的向量模型
    // 初次选择知识库（prev === undefined）且 inputs 中 embeddingModel 无已保存值时，也自动配置
    const currentInputEmbeddingModelId = inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModelId
    )?.value;
    const isFirstSelect = prev === undefined && !currentInputEmbeddingModelId;
    const isSwitchDataset = prev !== undefined && prev !== datasetVectorModelId;

    if (isFirstSelect || isSwitchDataset) {
      setData((state) => ({ ...state, embeddingModelId: datasetVectorModelId }));
      const embeddingModelInput = inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchEmbeddingModelId
      );
      if (embeddingModelInput) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: NodeInputKeyEnum.datasetSearchEmbeddingModelId,
          value: { ...embeddingModelInput, value: datasetVectorModelId }
        });
      }
    }
  }, [
    knowledgeTypeConfig.datasetVectorModelId,
    data.embeddingModelId,
    inputs,
    nodeId,
    onChangeNode
  ]);

  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, knowledgeTypeConfig.datasetVectorModelId),
    [embeddingModelList, knowledgeTypeConfig.datasetVectorModelId]
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
        <Flex alignItems="center" justifyContent="space-between" mb={2} fontWeight={'medium'}>
          <FormLabel w="96px" color={'myGray.600'}>
            {t('app:retrieval_mode')}
            <QuestionTip
              ml={1}
              label={
                <Box lineHeight={'24px'} fontSize={'12px'}>
                  <Box>
                    <span style={{ fontWeight: 600 }}>{t('app:retrieval_mode_single_title')}</span>
                    <span>{t('app:retrieval_mode_single_desc')}</span>
                  </Box>
                  <Box>
                    <span style={{ fontWeight: 600 }}>
                      {t('app:retrieval_mode_multiple_title')}
                    </span>
                    <span>{t('app:retrieval_mode_multiple_desc')}</span>
                  </Box>
                </Box>
              }
            />
          </FormLabel>
          <Box flex="1">
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
                      agenticSearchLLMModelId: '',
                      agenticSearchRerankModelId: '',
                      agenticSearchReasoning: false
                    }));
                    updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchLLMModelId, '');
                    updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchRerankModelId, '');
                    updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchReasoning, false);
                  } else {
                    // 多轮智能检索 → 清空标准检索相关字段
                    setData((prev) => ({
                      ...prev,
                      datasetSearchExtensionModelId: '',
                      rerankModelId: ''
                    }));
                    updateNodeInput(NodeInputKeyEnum.datasetSearchExtensionModelId, '');
                    updateNodeInput(NodeInputKeyEnum.datasetSearchRerankModelId, '');
                  }
                }

                if (knowledgeTypeConfig.hasDatabaseKnowledge) {
                  const newAiModel =
                    mode === DatasetRetrievalModeEnum.agentic
                      ? agenticSearchConfig.agenticSearchLLMModelId
                      : data.datasetSearchExtensionModelId || '';
                  if (newAiModel) {
                    updateNodeInput(NodeInputKeyEnum.generateSqlModelId, newAiModel);
                  }
                }
              }}
            />
          </Box>
        </Flex>

        {/* 内联表单 / 参数配置入口 */}
        <Box>
          {retrievalMode === DatasetRetrievalModeEnum.standard && showDatasetSearchParams ? (
            /* 标准检索 + 开关开启: 参数配置入口 */
            <Flex alignItems="center" justifyContent="space-between" mb={2} fontWeight={'medium'}>
              <FormLabel w="96px" color={'myGray.600'}>
                {t('app:Params_config')}
              </FormLabel>
              <Box flex="1" display="flex" alignItems="center">
                <MyIcon
                  name="common/settingLight"
                  w="16px"
                  cursor="pointer"
                  onClick={onOpenDatasetParamsModal}
                />
              </Box>
            </Flex>
          ) : (
            <>
              {/* AI 模型 */}
              <Flex alignItems="center" justifyContent="space-between" mb={2} fontWeight={'medium'}>
                <FormLabel w="96px" color={'myGray.600'}>
                  {t('app:smart_customer_service_ai_model')}
                  <QuestionTip
                    ml={1}
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
                        ? agenticSearchConfig.agenticSearchLLMModelId
                        : data.datasetSearchExtensionModelId || ''
                    }
                    list={llmModelList.map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(val: string) => {
                      if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                        setAgenticSearchConfig((prev) => ({
                          ...prev,
                          agenticSearchLLMModelId: val
                        }));
                        updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchLLMModelId, val);
                      } else {
                        setData((prev) => ({ ...prev, datasetSearchExtensionModelId: val }));
                        updateNodeInput(NodeInputKeyEnum.datasetSearchExtensionModelId, val);
                      }
                      if (knowledgeTypeConfig.hasDatabaseKnowledge) {
                        updateNodeInput(NodeInputKeyEnum.generateSqlModelId, val);
                      }
                    }}
                  />
                </Box>
              </Flex>

              {/* 向量模型 */}
              <Flex alignItems="center" justifyContent="space-between" mb={2} fontWeight={'medium'}>
                <FormLabel w="96px" color={'myGray.600'}>
                  {t('common:core.ai.model.Vector Model')}
                  {retrievalMode === DatasetRetrievalModeEnum.agentic && (
                    <QuestionTip
                      ml={1}
                      label={t('app:smart_customer_service_embedding_model_tip')}
                    />
                  )}
                </FormLabel>
                <Box flex="1">
                  <SelectAiModel
                    width="100%"
                    fontSize="12px"
                    fontWeight="normal"
                    value={
                      retrievalMode === DatasetRetrievalModeEnum.agentic
                        ? agenticSearchConfig.embeddingModelId
                        : data.embeddingModelId
                    }
                    list={embeddingModelSelectList}
                    onChange={(val: string) => {
                      if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                        setAgenticSearchConfig((prev) => ({ ...prev, embeddingModelId: val }));
                      } else {
                        setData((prev) => ({ ...prev, embeddingModelId: val }));
                      }
                      updateNodeInput(NodeInputKeyEnum.datasetSearchEmbeddingModelId, val);
                    }}
                  />
                </Box>
              </Flex>

              {/* 重排模型 */}
              <Flex alignItems="center" justifyContent="space-between" mb={2} fontWeight={'medium'}>
                <FormLabel w="96px" color={'myGray.600'}>
                  {t('app:smart_customer_service_rerank_model')}
                </FormLabel>
                <Box flex="1">
                  <SelectAiModel
                    width="100%"
                    fontSize="12px"
                    fontWeight="normal"
                    value={
                      retrievalMode === DatasetRetrievalModeEnum.agentic
                        ? agenticSearchConfig.agenticSearchRerankModelId
                        : data.rerankModelId || ''
                    }
                    list={reRankModelList.map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(val: string) => {
                      if (retrievalMode === DatasetRetrievalModeEnum.agentic) {
                        setAgenticSearchConfig((prev) => ({
                          ...prev,
                          agenticSearchRerankModelId: val
                        }));
                        updateNodeInput(NodeInputKeyEnum.datasetAgenticSearchRerankModelId, val);
                      } else {
                        setData((prev) => ({ ...prev, rerankModelId: val }));
                        updateNodeInput(NodeInputKeyEnum.datasetSearchRerankModelId, val);
                      }
                    }}
                  />
                </Box>
              </Flex>
            </>
          )}

          {/* 问题改写 */}
          {retrievalMode === DatasetRetrievalModeEnum.standard && !showDatasetSearchParams && (
            <Flex alignItems="center" mb={2} fontWeight={'medium'}>
              <FormLabel w="96px" color={'myGray.600'}>
                {t('common:core.module.template.Query extension')}
                <QuestionTip ml={1} label={t('common:core.dataset.Query extension intro')} />
              </FormLabel>
              <Switch
                ml={2}
                isChecked={data.datasetSearchUsingExtensionQuery}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setData((prev) => ({ ...prev, datasetSearchUsingExtensionQuery: checked }));
                  updateNodeInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, checked);
                }}
              />
            </Flex>
          )}

          {/* 输出思考过程 —— 仅多轮智能检索 */}
          {retrievalMode === DatasetRetrievalModeEnum.agentic && (
            <Flex alignItems="center" mb={2} fontWeight={'medium'}>
              <FormLabel w="96px" color={'myGray.600'}>
                {t('app:retrieval_output_thinking')}
                <QuestionTip ml={1} label={t('app:retrieval_output_thinking_tooltip')} />
              </FormLabel>
              <Switch
                ml={2}
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
    data.embeddingModelId,
    data.rerankModelId,
    data.datasetSearchExtensionModelId,
    knowledgeTypeConfig.hasDatabaseKnowledge,
    agenticSearchConfig,
    embeddingModelSelectList,
    llmModelList,
    reRankModelList,
    updateNodeInput,
    showDatasetSearchParams
  ]);

  return (
    <>
      {Render}
      {/* 标准检索参数配置弹窗 */}
      {isOpenDatasetParamsModal && (
        <DatasetParamsModal
          {...data}
          searchMode={
            data.searchMode === DatasetSearchModeEnum.database
              ? DatasetSearchModeEnum.embedding
              : data.searchMode
          }
          maxTokens={tokenLimit}
          datasetVectorModelId={knowledgeTypeConfig.datasetVectorModelId}
          hasDatabaseKnowledge={knowledgeTypeConfig.hasDatabaseKnowledge}
          hasOtherKnowledge={knowledgeTypeConfig.hasOtherKnowledge}
          onClose={onCloseDatasetParamsModal}
          onSuccess={(e) => {
            setData((prev) => ({ ...prev, ...e }));
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
