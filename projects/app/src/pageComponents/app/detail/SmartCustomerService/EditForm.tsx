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
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Input,
  VStack
} from '@chakra-ui/react';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
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
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import MyTextarea from '@/components/common/Textarea/MyTextarea';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
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
  tooltip?: string;
}> = ({ label, children, minWidth = SIZES.FORM_LABEL_MIN_WIDTH.MEDIUM, tooltip }) => (
  <Flex alignItems={'center'} w={'100%'}>
    <FormLabel minW={minWidth}>
      {label}
      {tooltip && <QuestionTip ml={1} label={tooltip} />}
    </FormLabel>
    {children}
  </Flex>
);

// 手风琴组件包装器
const AccordionSection: React.FC<{
  title: string;
  icon: any; // 使用any类型来接受MyIcon的name属性
  iconColor?: string;
  children: React.ReactNode;
  defaultIndex?: number[];
}> = ({ title, icon, iconColor = 'primary.600', children, defaultIndex = [] }) => (
  <Accordion allowToggle defaultIndex={defaultIndex}>
    <AccordionItem border="none">
      <AccordionButton _hover={{}} px={0}>
        <Flex flex="1" textAlign="left" fontWeight="bold" alignItems={'center'}>
          <MyIcon name={icon} w={5} h={5} mr={2} color={iconColor} />
          {title}
        </Flex>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel pb={4} px={0}>
        <VStack spacing={4} align="stretch">
          {children}
        </VStack>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
);

const EditForm = ({
  appForm,
  setAppForm
}: {
  appForm: AppSimpleEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppSimpleEditFormType>>;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);
  const [, startTst] = useTransition();
  const { llmModelList, defaultModels } = useSystemStore();

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
          generateSqlModel: prevForm.dataset?.generateSqlModel || defaultModels.llm?.model
        }
      };
    });
  }, [knowledgeTypeConfig, defaultModels.llm?.model, setAppForm]);

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
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

  const selectedModel = getWebLLMModel(appForm.aiSettings.model);
  const tokenLimit = useMemo(() => {
    return selectedModel?.quoteMaxToken || DEFAULT_VALUES.TOKEN_LIMIT;
  }, [selectedModel?.quoteMaxToken]);

  // 检查当前选择的模型是否支持深度思考
  const isReasoningSupported = useMemo(() => {
    return selectedModel?.reasoning ?? false;
  }, [selectedModel?.reasoning]);

  // Force close image select when model not support vision
  useEffect(() => {
    if (!selectedModel.vision) {
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
    (newValue: any) => {
      setAppForm((state) => {
        return {
          ...state,
          chatConfig: {
            ...state.chatConfig,
            fallbackReply: newValue
          }
        };
      });
    },
    [setAppForm]
  );

  // 优化的聊天配置更新函数
  const updateChatConfig = useCallback(
    (updates: Partial<AppSimpleEditFormType['chatConfig']>) => {
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
    (updates: Partial<AppSimpleEditFormType['aiSettings']>) => {
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

  return (
    <>
      {/* dataset */}
      <Box {...BOX_STYLES}>
        <Flex h={'32px'} mb={4} alignItems={'center'}>
          <Flex alignItems={'center'} flex={1}>
            <MyIcon name={'core/app/assistant/database'} w={'20px'} h={5} color={'primary.600'} />
            <FormLabel color={'myGray.900'} ml={2}>
              {t('common:core.dataset.Choose Dataset')}
            </FormLabel>
          </Flex>
          <Button
            variant={'transparentBase'}
            leftIcon={<MyIcon name="common/selectLight" w={'0.8rem'} />}
            iconSpacing={1}
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
                py={2.5}
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
                >
                  {item.name}
                </Box>
              </Flex>
            </MyTooltip>
          ))}
        </Grid>
      </Box>
      <Box>
        {/* 问答配置 */}
        <Box {...BOX_STYLES}>
          <AccordionSection
            title={t('app:smart_customer_service_qa_config')}
            icon="core/app/assistant/answer"
          >
            {/* 猜你想问 */}
            <Box>
              <QGConfig
                value={appForm.chatConfig.questionGuide}
                onChange={(questionGuide) => updateChatConfig({ questionGuide })}
              />
            </Box>

            {/* <FormItem
              label={t('app:smart_customer_service_faq_answer_mode')}
              tooltip={t('app:smart_customer_service_faq_answer_mode_tooltip')}
            >
              <LeftRadio<string>
                list={FAQ_OPTIONS}
                px={3}
                py={2.5}
                value={getVariableValue(
                  VARIABLE_KEYS.FAQ_ANSWER_MODE,
                  DEFAULT_VALUES.FAQ_ANSWER_MODE
                )}
                onChange={(value) => updateVariableValue(VARIABLE_KEYS.FAQ_ANSWER_MODE, value)}
                flex={1}
                defaultBg="white"
                activeBg="white"
                gridTemplateColumns={GRID_COLUMNS.FAQ_OPTIONS}
              />
            </FormItem> */}

            <FormItem
              label={t('app:smart_customer_service_welcome_text')}
              minWidth={SIZES.FORM_LABEL_MIN_WIDTH.MEDIUM}
            >
              <Input
                value={appForm.chatConfig.welcomeText || ''}
                onChange={(e) => updateChatConfig({ welcomeText: e.target.value })}
                placeholder={t(DEFAULT_VALUES.WELCOME_TEXT)}
              />
            </FormItem>

            <Flex alignItems={'start'}>
              <FormLabel minW={SIZES.FORM_LABEL_MIN_WIDTH.MEDIUM}>
                {t('app:smart_customer_service_fallback_reply')}
                <QuestionTip
                  ml={1}
                  label={t('app:smart_customer_service_fallback_reply_tooltip')}
                />
              </FormLabel>
              <MyTextarea
                value={appForm.chatConfig.fallbackReply}
                rows={3}
                onChange={(e) => updateVariableValue(e.target.value)}
              />
            </Flex>
          </AccordionSection>
        </Box>

        {/* AI 配置 */}
        <Box {...BOX_STYLES}>
          <AccordionSection
            title={t('app:smart_customer_service_ai_config')}
            icon="core/app/assistant/robot"
          >
            <FormItem
              label={t('app:smart_customer_service_ai_model')}
              minWidth={SIZES.FORM_LABEL_MIN_WIDTH.SMALL}
            >
              <Box flex={1}>
                <AIModelSelector
                  value={appForm.aiSettings.model || defaultModels.llm?.model}
                  list={llmModelList.map((item) => ({
                    value: item.model,
                    label: item.name
                  }))}
                  onChange={(model) => updateAISettings({ model })}
                />
              </Box>
            </FormItem>

            <Flex alignItems="center" h={8}>
              <FormLabel minW={SIZES.FORM_LABEL_MIN_WIDTH.SMALL}>
                {t('app:smart_customer_service_deep_thinking')}
              </FormLabel>
              <MyTooltip label={!isReasoningSupported ? t('所选 AI 模型不支持深度思考') : ''}>
                <Switch
                  isChecked={appForm.aiSettings.aiChatReasoning ?? false}
                  onChange={(e) => updateAISettings({ aiChatReasoning: e.target.checked })}
                  isDisabled={!isReasoningSupported}
                />
              </MyTooltip>
            </Flex>

            <Flex flexDirection={'column'}>
              <FormLabel mb={4}>{t('app:smart_customer_service_prompt_config')}</FormLabel>
              <PromptEditor
                mt={2}
                minH={120}
                value={appForm.aiSettings.systemPrompt}
                bg={'myGray.50'}
                onChange={(text) => {
                  startTst(() => {
                    updateAISettings({ systemPrompt: text });
                  });
                }}
                variableLabels={formatVariables}
                variables={formatVariables}
                placeholder=""
                ExtensionPopover={[OptimizerPopverComponent]}
              />
            </Flex>
          </AccordionSection>
        </Box>
      </Box>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
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
    </>
  );
};

export default React.memo(EditForm);
