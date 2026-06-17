/**
 * @file 智能客服编辑表单组件
 * @description 智能客服应用的核心配置表单，包含知识库选择、问答配置、AI模型配置等功能模块
 * 提供手风琴式折叠面板布局，支持配置知识库、问答模式、欢迎语、AI模型、系统提示词等参数
 */
import React, { useCallback, useEffect, useMemo, useTransition } from 'react';
import {
  Box,
  Flex,
  Grid,
  type BoxProps,
  useTheme,
  useDisclosure,
  Button,
  Switch,
  Input
} from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

// 导入常量
import { FAQAnswerModeEnum, DEFAULT_VALUES, GRID_COLUMNS, SIZES } from './constants';

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import {
  DatasetSearchModeEnum,
  DatasetRetrievalModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import {
  type AppChatConfigType,
  type AppDatasetSearchParamsType
} from '@fastgpt/global/core/app/type';
import { getEmbeddingModelSelectList } from '@/web/core/app/utils';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import SfRadio from '@/components/SF/SfRadio';
import SfLeftRadio from '@/components/SF/SfLeftRadio';
import TagFilterSection from './TagFilterSection';
import AccordionSection from '@/components/core/app/AccordionSection';

const SfDatasetSelectModal = dynamic(() => import('@/components/core/app/sfDatasetSelectModal'));
const QGConfig = dynamic(() => import('@/components/core/app/assistant/QGConfig'));

// 样式常量
const BOX_STYLES: BoxProps = {
  mx: [4, 6],
  py: '16px',
  borderBottomWidth: '1px',
  borderBottomColor: 'borderColor.low'
};

// 通用表单项组件
const FormItem: React.FC<{
  label: string;
  children: React.ReactNode;
  minWidth?: string;
  tooltip?: string | React.ReactNode;
}> = ({ label, children, minWidth = SIZES.FORM_LABEL_MIN_WIDTH.MEDIUM, tooltip }) => (
  <Flex alignItems={'center'} w={'100%'}>
    <FormLabel
      display={'flex'}
      alignItems={'center'}
      fontSize={'12px'}
      fontWeight={'500'}
      minW={minWidth}
    >
      {label}
      {tooltip && <QuestionTip ml={1} label={tooltip} />}
    </FormLabel>
    {children}
  </Flex>
);

const EditForm = ({
  appForm,
  setAppForm
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);
  const datasetIds = useMemo(
    () => appForm.dataset.datasets.map((d) => d.datasetId),
    [appForm.dataset.datasets]
  );
  const [, startTst] = useTransition();
  const { feConfigs, llmModelList, embeddingModelList, reRankModelList, defaultModels } =
    useSystemStore();
  const showDatasetSearchParams = feConfigs.show_dataset_search_params;

  // 从选中知识库中获取向量模型 ID（优先取有向量模型的非数据库知识库，避免数据库类型排在首位时取到空值）
  const datasetVectorModelId = useMemo(
    () => selectDatasets.find((d) => d.vectorModel?.id)?.vectorModel?.id,
    [selectDatasets]
  );

  // 向量模型可选项：知识库为空时展示空列表；否则展示与知识库向量模型匹配的模型
  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, datasetVectorModelId),
    [embeddingModelList, datasetVectorModelId]
  );

  // 当知识库向量模型变更时，校验并联动更新 embeddingModelId 选中值
  useEffect(() => {
    if (!datasetVectorModelId) return;

    setAppForm((state) => {
      const current = (state.dataset as AppDatasetSearchParamsType).embeddingModelId;
      const validIds = new Set(embeddingModelSelectList.map((m) => m.value));
      // 当前值有效则保留，否则重置为基模（基模不在列表则置空）
      if (current && validIds.has(current)) return state;
      const newModel = validIds.has(datasetVectorModelId) ? datasetVectorModelId : '';
      return { ...state, dataset: { ...state.dataset, embeddingModelId: newModel } };
    });
  }, [datasetVectorModelId, embeddingModelSelectList, setAppForm]);

  const knowledgeTypeConfig = useMemo(() => {
    return {
      hasDatabaseKnowledge: selectDatasets.some(
        (item) => item.datasetType && isDatabaseDataset(item.datasetType)
      ),
      // 若没选择知识库，保留之前的展示逻辑
      hasOtherKnowledge:
        selectDatasets.some((item) => item.datasetType && !isDatabaseDataset(item.datasetType)) ||
        selectDatasets.length === 0
    };
  }, [selectDatasets]);

  useEffect(() => {
    setAppForm((prevForm) => {
      return {
        ...prevForm,
        dataset: {
          ...prevForm.dataset,
          searchMode:
            knowledgeTypeConfig.hasDatabaseKnowledge && !knowledgeTypeConfig.hasOtherKnowledge
              ? DatasetSearchModeEnum.database
              : prevForm.dataset.searchMode === DatasetSearchModeEnum.database
                ? DatasetSearchModeEnum.embedding
                : prevForm.dataset.searchMode,
          generateSqlModelId: prevForm.dataset?.generateSqlModelId || defaultModels.llm?.id
        }
      };
    });
  }, [knowledgeTypeConfig, defaultModels.llm?.id, setAppForm]);

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParamsModal,
    onOpen: onOpenDatasetParamsModal,
    onClose: onCloseDatasetParamsModal
  } = useDisclosure();

  const formatVariables = useMemo(
    () =>
      formatEditorVariablePickerIcon([
        ...workflowSystemVariables.filter(
          (variable) =>
            !['appId', 'chatId', 'responseChatItemId', 'histories'].includes(variable.key)
        ),
        ...(appForm.chatConfig.variables || [])
      ]).map((item) => ({
        ...item,
        label: t(item.label as any),
        parent: {
          id: 'VARIABLE_NODE_ID',
          label: t('common:core.module.Variable'),
          avatar: 'core/workflow/template/variable'
        }
      })),
    [appForm.chatConfig.variables, t]
  );

  const selectedModel = getWebLLMModel(appForm.aiSettings.modelId);
  const tokenLimit = useMemo(() => {
    return selectedModel?.quoteMaxToken || DEFAULT_VALUES.TOKEN_LIMIT;
  }, [selectedModel?.quoteMaxToken]);

  // 检查当前选择的模型是否支持深度思考
  const isReasoningSupported = useMemo(() => {
    return selectedModel?.reasoning ?? false;
  }, [selectedModel?.reasoning]);

  // Force close image select when model not support vision
  useEffect(() => {
    if (!selectedModel?.vision) {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          ...(state.chatConfig.fileSelectConfig
            ? {
                fileSelectConfig: {
                  ...state.chatConfig.fileSelectConfig,
                  canSelectImg: false
                }
              }
            : {})
        }
      }));
    }
  }, [selectedModel, setAppForm]);

  // Force close deep thinking when model not support reasoning
  useEffect(() => {
    if (!isReasoningSupported) {
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          aiChatReasoning: false
        }
      }));
    }
  }, [isReasoningSupported, setAppForm]);

  const OptimizerPopverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => {
      return (
        <OptimizerPopover
          iconButtonStyle={iconButtonStyle}
          defaultPrompt={appForm.aiSettings.systemPrompt}
          onChangeText={(e) => {
            setAppForm((state) => ({
              ...state,
              aiSettings: {
                ...state.aiSettings,
                systemPrompt: e
              }
            }));
          }}
        />
      );
    },
    [appForm.aiSettings.systemPrompt, setAppForm]
  );

  const updateVariableValue = useCallback(
    (key: keyof AppChatConfigType, newValue: any) => {
      setAppForm((state) => {
        return {
          ...state,
          chatConfig: {
            ...state.chatConfig,
            [key]: newValue
          }
        };
      });
    },
    [setAppForm]
  );

  // 同步 AI 模型到 questionGuide.modelId
  useEffect(() => {
    if (appForm.aiSettings.modelId) {
      setAppForm((state) => {
        const currentQG = state.chatConfig.questionGuide;
        return {
          ...state,
          chatConfig: {
            ...state.chatConfig,
            questionGuide: {
              open: currentQG?.open ?? false,
              modelId: appForm.aiSettings.modelId,
              customPrompt: currentQG?.customPrompt || undefined
            }
          }
        };
      });
    }
  }, [appForm.aiSettings.modelId, setAppForm]);

  // 优化的聊天配置更新函数
  const updateChatConfig = useCallback(
    (updates: Partial<AppFormEditFormType['chatConfig']>) => {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          ...updates
        }
      }));
    },
    [setAppForm]
  );

  // 优化的AI设置更新函数
  const updateAISettings = useCallback(
    (updates: Partial<AppFormEditFormType['aiSettings']>) => {
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          ...updates
        }
      }));
    },
    [setAppForm]
  );

  // FAQ选项配置
  const FAQ_OPTIONS = useMemo(
    () => [
      {
        title: t('app:smart_customer_service_direct_quote'),
        value: FAQAnswerModeEnum.Quote
      },
      {
        title: t('app:smart_customer_service_llm_summary'),
        value: FAQAnswerModeEnum.LLMSummary
      }
    ],
    [t]
  );

  // 兜底回复开关选项配置
  const FALLBACK_REPLY_OPTIONS = useMemo(
    () => [
      {
        title: t('app:smart_customer_service_use_fallback_reply'),
        value: 'useFallbackReply'
      },
      {
        title: t('app:smart_customer_service_llm_reply'),
        value: 'llmReply'
      }
    ],
    [t]
  );

  return (
    <>
      {/* dataset */}
      <Box {...BOX_STYLES}>
        <Flex h={'32px'} mb={4} alignItems={'center'}>
          <Flex alignItems={'center'} flex={1}>
            <FormLabel color={'myWhite.1000'} fontWeight="600">
              {t('common:core.dataset.Choose Dataset')}
            </FormLabel>
          </Flex>
          <Button
            variant={'transparentBase'}
            leftIcon={<MyIcon name="core/chat/sendLight" w={'14px'} transform="rotate(-135deg)" />}
            size={'sm'}
            fontSize={'sm'}
            onClick={onOpenKbSelect}
          >
            {t('common:Choose')}
          </Button>
        </Flex>
        <Grid gridTemplateColumns={GRID_COLUMNS.DATASET} gridGap={[2, 2]}>
          {selectDatasets.map((item) => (
            <MyTooltip key={item.datasetId} label={t('common:core.dataset.Read Dataset')}>
              <Flex
                overflow={'hidden'}
                alignItems={'center'}
                py={1}
                px={3}
                h={SIZES.DATASET_ITEM_HEIGHT}
                bg={'white'}
                borderRadius={'md'}
                border={theme.borders.base}
                cursor={'pointer'}
                onClick={() =>
                  router.push({
                    pathname: '/dataset/detail',
                    query: {
                      datasetId: item.datasetId
                    }
                  })
                }
              >
                <Avatar src={item.avatar} w={4} h={4} />
                <Box
                  ml={2}
                  flex={'1 0 0'}
                  w={0}
                  className={'textEllipsis'}
                  fontSize={'sm'}
                  color={'myGray.900'}
                  lineHeight={'20px'}
                >
                  {item.name}
                </Box>
              </Flex>
            </MyTooltip>
          ))}
        </Grid>
      </Box>
      {/* 检索配置 */}
      <Box {...BOX_STYLES}>
        <AccordionSection title={t('app:retrieval_config')} nested defaultIndex={[]}>
          <FormItem
            label={t('app:retrieval_mode')}
            tooltip={
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
          >
            <SfRadio
              flex={1}
              list={[
                { value: DatasetRetrievalModeEnum.standard, title: t('app:retrieval_mode_single') },
                { value: DatasetRetrievalModeEnum.agentic, title: t('app:retrieval_mode_multiple') }
              ]}
              value={
                (appForm.dataset.retrievalMode as `${DatasetRetrievalModeEnum}`) ||
                DatasetRetrievalModeEnum.standard
              }
              onChange={(mode) => {
                setAppForm((state) => ({
                  ...state,
                  dataset: {
                    ...state.dataset,
                    retrievalMode: mode as DatasetRetrievalModeEnum
                  }
                }));
              }}
            />
          </FormItem>
          {/* 向量模型 & 重排模型 / 参数配置 */}
          {(appForm.dataset.retrievalMode as string) === DatasetRetrievalModeEnum.agentic ||
          !showDatasetSearchParams ? (
            <>
              <FormItem
                label={t('app:smart_customer_service_embedding_model')}
                tooltip={t('app:smart_customer_service_embedding_model_tip')}
              >
                <Box flex={1}>
                  <AIModelSelector
                    h={'32px'}
                    value={appForm.dataset.embeddingModelId}
                    list={embeddingModelSelectList}
                    onChange={(model) => {
                      setAppForm((state) => ({
                        ...state,
                        dataset: {
                          ...state.dataset,
                          embeddingModelId: model
                        }
                      }));
                    }}
                  />
                </Box>
              </FormItem>
              <FormItem label={t('app:smart_customer_service_rerank_model')}>
                <Box flex={1}>
                  <AIModelSelector
                    h={'32px'}
                    value={appForm.dataset.rerankModelId || defaultModels.rerank?.id}
                    list={reRankModelList.map((item) => ({
                      value: item.id,
                      label: item.name
                    }))}
                    onChange={(model) => {
                      setAppForm((state) => ({
                        ...state,
                        dataset: {
                          ...state.dataset,
                          rerankModelId: model
                        }
                      }));
                    }}
                  />
                </Box>
              </FormItem>
            </>
          ) : (
            /* 标准检索 + 开关开启: 参数配置入口 */
            <FormItem label={t('app:Params_config')}>
              <Box flex={1} display="flex" alignItems="center">
                <MyIcon
                  name="common/settingLight"
                  w="16px"
                  cursor="pointer"
                  onClick={onOpenDatasetParamsModal}
                />
              </Box>
            </FormItem>
          )}
          {(appForm.dataset.retrievalMode as string) === DatasetRetrievalModeEnum.standard &&
            !showDatasetSearchParams && (
              <FormItem
                label={t('common:core.module.template.Query extension')}
                tooltip={t('common:core.dataset.Query extension intro')}
              >
                <Switch
                  isChecked={appForm.dataset.datasetSearchUsingExtensionQuery ?? true}
                  onChange={(e) =>
                    setAppForm((state) => ({
                      ...state,
                      dataset: {
                        ...state.dataset,
                        datasetSearchUsingExtensionQuery: e.target.checked
                      }
                    }))
                  }
                />
              </FormItem>
            )}
          {(appForm.dataset.retrievalMode as string) === DatasetRetrievalModeEnum.agentic && (
            <FormItem
              label={t('app:retrieval_output_thinking')}
              tooltip={t('app:retrieval_output_thinking_tooltip')}
            >
              <Switch
                isChecked={appForm.dataset.agenticSearchReasoning ?? true}
                onChange={(e) => {
                  setAppForm((state) => ({
                    ...state,
                    dataset: {
                      ...state.dataset,
                      agenticSearchReasoning: e.target.checked
                    }
                  }));
                }}
              />
            </FormItem>
          )}
        </AccordionSection>
      </Box>
      {/* 检索过滤 */}
      <Box {...BOX_STYLES}>
        <TagFilterSection
          datasets={selectDatasets}
          value={appForm.dataset.collectionFilterMatch}
          onChange={(v) =>
            setAppForm((state) => ({
              ...state,
              dataset: { ...state.dataset, collectionFilterMatch: v }
            }))
          }
          authTmbId={appForm.dataset.authTmbId ?? false}
          onAuthTmbIdChange={(v) =>
            setAppForm((state) => ({
              ...state,
              dataset: { ...state.dataset, authTmbId: v }
            }))
          }
        />
      </Box>
      <Box>
        {/* 问答配置 */}
        <Box {...BOX_STYLES}>
          <AccordionSection
            title={t('app:smart_customer_service_qa_config')}
            nested
            defaultIndex={[]}
          >
            {/* 猜你想问 */}
            <Box>
              <QGConfig
                value={appForm.chatConfig.questionGuide}
                onChange={(questionGuide) => updateChatConfig({ questionGuide })}
              />
            </Box>

            <FormItem
              label={t('app:smart_customer_service_faq_answer_mode')}
              tooltip={t('app:smart_customer_service_faq_answer_mode_tooltip')}
            >
              <SfLeftRadio<string>
                list={FAQ_OPTIONS}
                value={appForm.chatConfig.faqAnswerMode || FAQAnswerModeEnum.Quote}
                onChange={(e) => updateVariableValue('faqAnswerMode', e)}
                flex={1}
                gridTemplateColumns={GRID_COLUMNS.FAQ_OPTIONS}
              />
            </FormItem>

            <FormItem label={t('app:smart_customer_service_welcome_text')}>
              <Input
                value={appForm.chatConfig.welcomeText || ''}
                onChange={(e) => updateChatConfig({ welcomeText: e.target.value })}
                placeholder={t(DEFAULT_VALUES.WELCOME_TEXT)}
              />
            </FormItem>

            {/* 兜底回复配置 */}
            <Box>
              {/* 兜底回复单选按钮 */}
              <FormItem
                label={t('app:smart_customer_service_fallback_reply')}
                tooltip={t('app:smart_customer_service_fallback_reply_tooltip')}
              >
                <SfLeftRadio<string>
                  list={FALLBACK_REPLY_OPTIONS}
                  value={appForm.chatConfig.enableFallbackReply || 'useFallbackReply'}
                  onChange={(e) => updateVariableValue('enableFallbackReply', e)}
                  flex={1}
                  gridTemplateColumns={GRID_COLUMNS.FAQ_OPTIONS}
                />
              </FormItem>

              {/* 兜底回复文本框 */}
              {appForm.chatConfig.enableFallbackReply !== 'llmReply' && (
                <Flex alignItems={'start'} mt={3}>
                  <Box minW={SIZES.FORM_LABEL_MIN_WIDTH.MEDIUM} />
                  <MyTextarea
                    value={appForm.chatConfig.fallbackReply}
                    rows={3}
                    onChange={(e) => updateVariableValue('fallbackReply', e.target.value)}
                    flex={1}
                  />
                </Flex>
              )}
            </Box>
          </AccordionSection>
        </Box>

        {/* AI 配置 */}
        <Box {...BOX_STYLES}>
          <AccordionSection
            title={t('app:smart_customer_service_ai_config')}
            nested
            defaultIndex={[]}
          >
            <FormItem
              label={t('app:smart_customer_service_ai_model')}
              minWidth={SIZES.FORM_LABEL_MIN_WIDTH.SMALL}
            >
              <Box flex={1}>
                <AIModelSelector
                  h={'32px'}
                  value={appForm.aiSettings.modelId || defaultModels.llm?.id}
                  list={llmModelList.map((item) => ({
                    value: item.id,
                    label: item.name
                  }))}
                  onChange={(modelId) => updateAISettings({ modelId })}
                />
              </Box>
            </FormItem>

            {/* <FormItem
              label={t('app:smart_customer_service_deep_thinking')}
              minWidth={SIZES.FORM_LABEL_MIN_WIDTH.SMALL}
            >
              <MyTooltip label={!isReasoningSupported ? t('app:model_not_support_reasoning') : ''}>
                <Switch
                  isChecked={appForm.aiSettings.aiChatReasoning ?? false}
                  onChange={(e) => updateAISettings({ aiChatReasoning: e.target.checked })}
                  isDisabled={!isReasoningSupported}
                />
              </MyTooltip>
            </FormItem> */}
            <Flex flexDirection={'column'}>
              <FormLabel fontSize={'12px'} fontWeight={'500'} mb={3}>
                {t('app:smart_customer_service_prompt_config')}
              </FormLabel>
              <PromptEditor
                minH={120}
                maxH={500}
                value={appForm.aiSettings.systemPrompt}
                onChange={(text) => {
                  startTst(() => {
                    updateAISettings({ systemPrompt: text });
                  });
                }}
                variableLabels={formatVariables}
                variables={formatVariables}
                placeholder=""
                resizable={true}
              />
            </Flex>
          </AccordionSection>
        </Box>
      </Box>

      {isOpenDatasetSelect && (
        <SfDatasetSelectModal
          isOpen={isOpenDatasetSelect}
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            vectorModel: item.vectorModel,
            name: item.name,
            avatar: item.avatar,
            datasetType: item.datasetType
          }))}
          onClose={onCloseKbSelect}
          onChange={(e) => {
            setAppForm((state) => ({
              ...state,
              dataset: {
                ...state.dataset,
                datasets: e
              }
            }));
          }}
        />
      )}
      {/* 标准检索参数配置弹窗 */}
      {isOpenDatasetParamsModal && (
        <DatasetParamsModal
          {...appForm.dataset}
          searchMode={
            appForm.dataset.searchMode === DatasetSearchModeEnum.database
              ? DatasetSearchModeEnum.embedding
              : appForm.dataset.searchMode
          }
          maxTokens={tokenLimit}
          datasetVectorModelId={datasetVectorModelId}
          hasDatabaseKnowledge={knowledgeTypeConfig.hasDatabaseKnowledge}
          hasOtherKnowledge={knowledgeTypeConfig.hasOtherKnowledge}
          onClose={onCloseDatasetParamsModal}
          onSuccess={(e) => {
            setAppForm((state) => ({
              ...state,
              dataset: { ...state.dataset, ...e }
            }));
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
