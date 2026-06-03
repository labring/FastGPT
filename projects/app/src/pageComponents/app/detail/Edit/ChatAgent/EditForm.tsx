import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Grid,
  useDisclosure,
  Button,
  Switch,
  Input,
  Tag,
  ModalBody,
  ModalFooter,
  VStack
} from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import SkillSelect from '../FormComponent/ToolSelector/SkillSelect';
import { cardStyles } from '../../constants';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useSkillManager } from './hooks/useSkillManager';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AIModelSelector from '@/components/Select/AIModelSelector';
import {
  DatasetSearchModeEnum,
  DatasetRetrievalModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { getEmbeddingModelSelectList } from '@/web/core/app/utils';
import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';
import SfRadio from '@/components/SF/SfRadio';
import {
  defaultAppSelectFileConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import { FileTypeSelectorPanel } from '@fastgpt/web/components/core/app/FileTypeSelector';
import MyModal from '@fastgpt/web/components/common/MyModal';
import ChatFunctionTip from '@/components/core/app/Tip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import AccordionSection from '@/components/core/app/AccordionSection';
import TagFilterSection from '../../SmartCustomerService/TagFilterSection';
import { DEFAULT_VALUES } from '../../SmartCustomerService/constants';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

// ===== FormItem =====
const FormItem: React.FC<{
  label: string;
  children: React.ReactNode;
  tooltip?: string | React.ReactNode;
  h?: string | number;
}> = ({ label, children, tooltip, h }) => (
  <Flex alignItems={'center'} w={'100%'} h={h}>
    <FormLabel
      display={'flex'}
      alignItems={'center'}
      fontSize={'12px'}
      fontWeight={'500'}
      w={'92px'}
      flexShrink={0}
      mr={4}
    >
      {label}
      {tooltip && <QuestionTip ml={1} label={tooltip} />}
    </FormLabel>
    {children}
  </Flex>
);

// ===== 卡片包装 =====
const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box mt={4} {...cardStyles} border="1px solid;" borderColor="myGray.200">
    {children}
  </Box>
);

const EditForm = ({
  appForm,
  setAppForm
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { feConfigs, llmModelList, embeddingModelList, reRankModelList, defaultModels } =
    useSystemStore();
  const showDatasetSearchParams = feConfigs.show_dataset_search_params;
  const { teamPlanStatus } = useUserStore();

  // ===== 数据集 =====
  const selectDatasets = useMemo(() => appForm?.dataset?.datasets || [], [appForm]);
  const datasetIds = useMemo(() => selectDatasets.map((d) => d.datasetId), [selectDatasets]);
  // 从选中知识库中获取向量模型 ID（优先取有向量模型的知识库，避免数据库类型排在首位时取到空值）
  const datasetVectorModelId = useMemo(
    () => selectDatasets.find((d) => d.vectorModel?.id)?.vectorModel?.id,
    [selectDatasets]
  );

  // 知识库向量模型切换时，联动重置 embeddingModelId
  const prevDatasetVectorModelRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevDatasetVectorModelRef.current;
    prevDatasetVectorModelRef.current = datasetVectorModelId;
    if (prev === undefined || prev === datasetVectorModelId) return;
    setAppForm((state) => ({
      ...state,
      dataset: { ...state.dataset, embeddingModelId: datasetVectorModelId || '' }
    }));
  }, [datasetVectorModelId, setAppForm]);

  // 向量模型可选项
  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, datasetVectorModelId),
    [embeddingModelList, datasetVectorModelId]
  );

  // 校验并联动更新 embeddingModelId
  useEffect(() => {
    if (!datasetVectorModelId) return;
    setAppForm((state) => {
      const current = (state.dataset as AppDatasetSearchParamsType).embeddingModelId;
      const validIds = new Set(embeddingModelSelectList.map((m) => m.value));
      if (current && validIds.has(current)) return state;
      const newModel = validIds.has(datasetVectorModelId) ? datasetVectorModelId : '';
      return { ...state, dataset: { ...state.dataset, embeddingModelId: newModel } };
    });
  }, [datasetVectorModelId, embeddingModelSelectList, setAppForm]);

  // 知识库类型联动检索模式
  const knowledgeTypeConfig = useMemo(() => {
    return {
      hasDatabaseKnowledge: selectDatasets.some(
        (item) => item.datasetType && isDatabaseDataset(item.datasetType)
      ),
      hasOtherKnowledge:
        selectDatasets.some((item) => item.datasetType && !isDatabaseDataset(item.datasetType)) ||
        selectDatasets.length === 0
    };
  }, [selectDatasets]);

  useEffect(() => {
    setAppForm((prevForm) => ({
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
    }));
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

  // ===== AI 模型 =====
  const selectedModel = getWebLLMModel(appForm.aiSettings.modelId);
  const isReasoningSupported = useMemo(() => selectedModel?.reasoning ?? false, [selectedModel]);
  const tokenLimit = useMemo(
    () => selectedModel?.quoteMaxToken || DEFAULT_VALUES.TOKEN_LIMIT,
    [selectedModel?.quoteMaxToken]
  );

  useEffect(() => {
    if (!isReasoningSupported) {
      setAppForm((state) => ({
        ...state,
        aiSettings: { ...state.aiSettings, aiChatReasoning: false }
      }));
    }
  }, [isReasoningSupported, setAppForm]);

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

  // ===== Skill =====
  const { skillOption, selectedSkills, onClickSkill, onRemoveSkill, SkillModal } = useSkillManager({
    selectedTools: appForm.selectedTools,
    onDeleteTool: (id) => {
      setAppForm((state) => ({
        ...state,
        selectedTools: state.selectedTools?.filter((item) => item.id !== id) || []
      }));
    },
    onUpdateOrAddTool: (tool) => {
      setAppForm((state) => {
        const index = state.selectedTools.findIndex((item) => item.id === tool.id);
        if (index === -1) {
          return { ...state, selectedTools: [tool, ...(state.selectedTools || [])] };
        }
        return {
          ...state,
          selectedTools:
            state.selectedTools?.map((item) => (item.id === tool.id ? tool : item)) || []
        };
      });
    },
    canUploadFile: !!(
      appForm.chatConfig.fileSelectConfig?.canSelectFile ||
      appForm.chatConfig.fileSelectConfig?.canSelectImg ||
      appForm.chatConfig.fileSelectConfig?.canSelectVideo ||
      appForm.chatConfig.fileSelectConfig?.canSelectAudio ||
      appForm.chatConfig.fileSelectConfig?.canSelectCustomFileExtension
    ),
    hasSelectedDataset: (appForm.dataset.datasets?.length || 0) > 0,
    useAgentSandbox: !!appForm.aiSettings.useAgentSandbox
  });

  // ===== 文件上传 =====
  const fileSelectConfig = appForm.chatConfig.fileSelectConfig || defaultAppSelectFileConfig;
  const canUploadFile =
    fileSelectConfig.canSelectFile ||
    fileSelectConfig.canSelectImg ||
    fileSelectConfig.canSelectVideo ||
    fileSelectConfig.canSelectAudio ||
    fileSelectConfig.canSelectCustomFileExtension;

  const maxSelectFiles = Math.min(
    teamPlanStatus?.standard?.maxUploadFileCount || feConfigs.uploadFileMaxAmount || 50,
    50
  );

  const {
    isOpen: isOpenFileTypeModal,
    onOpen: onOpenFileTypeModal,
    onClose: onCloseFileTypeModal
  } = useDisclosure();
  const [localFileConfig, setLocalFileConfig] = React.useState(fileSelectConfig);

  const fileTypeTags = useMemo(() => {
    const tags: string[] = [];
    if (fileSelectConfig.canSelectFile)
      tags.push(t('app:upload_file_extension_type_canSelectFile'));
    if (fileSelectConfig.canSelectImg) tags.push(t('app:upload_file_extension_type_canSelectImg'));
    if (fileSelectConfig.canSelectVideo)
      tags.push(t('app:upload_file_extension_type_canSelectVideo'));
    if (fileSelectConfig.canSelectAudio)
      tags.push(t('app:upload_file_extension_type_canSelectAudio'));
    if (fileSelectConfig.canSelectCustomFileExtension)
      tags.push(t('app:upload_file_extension_type_canSelectCustomFileExtension'));
    return tags;
  }, [fileSelectConfig, t]);

  const updateFileSelectConfig = useCallback(
    (patch: Partial<typeof fileSelectConfig>) => {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          fileSelectConfig: {
            ...(state.chatConfig.fileSelectConfig || defaultAppSelectFileConfig),
            ...patch
          }
        }
      }));
    },
    [setAppForm]
  );

  // ===== 语音输入 =====
  const whisperConfig = appForm.chatConfig.whisperConfig || defaultWhisperConfig;

  const updateWhisperConfig = useCallback(
    (patch: Partial<typeof whisperConfig>) => {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          whisperConfig: { ...(state.chatConfig.whisperConfig || defaultWhisperConfig), ...patch }
        }
      }));
    },
    [setAppForm]
  );

  return (
    <>
      {/* 模块一：AI 配置 */}
      <SectionCard>
        <AccordionSection title={t('app:ai_settings')}>
          {/* AI 模型 */}
          <FormItem label={t('common:core.ai.Model')}>
            <Box flex={1}>
              <SettingLLMModel
                bg="myGray.50"
                defaultData={{ modelId: appForm.aiSettings.modelId }}
                showMaxToken={false}
                showTemperature={false}
                showTopP={false}
                showStopSign={false}
                showResponseFormat={false}
                showReasoning={false}
                onChange={({ maxHistories = 6, ...data }) => {
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: { ...state.aiSettings, ...data, maxHistories },
                    dataset: {
                      ...state.dataset,
                      ...(state.dataset.retrievalMode === DatasetRetrievalModeEnum.agentic &&
                      data.modelId
                        ? { agenticSearchLLMModelId: data.modelId }
                        : {})
                    }
                  }));
                }}
              />
            </Box>
          </FormItem>

          {/* 深度思考 */}
          <FormItem
            label={t('app:smart_customer_service_deep_thinking')}
            tooltip={!isReasoningSupported ? t('app:model_not_support_reasoning') : undefined}
          >
            <MyTooltip label={!isReasoningSupported ? t('app:model_not_support_reasoning') : ''}>
              <Switch
                isChecked={appForm.aiSettings.aiChatReasoning ?? false}
                isDisabled={!isReasoningSupported}
                onChange={(e) =>
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: { ...state.aiSettings, aiChatReasoning: e.target.checked }
                  }))
                }
              />
            </MyTooltip>
          </FormItem>

          {/* 提示词 */}
          <Box>
            <FormLabel fontSize={'12px'} fontWeight={'500'} mb={2}>
              {t('common:core.ai.Prompt')}
            </FormLabel>
            <PromptEditor
              minH={160}
              title={t('common:core.ai.Prompt')}
              isRichText={true}
              skillOption={skillOption}
              selectedSkills={selectedSkills}
              onClickSkill={onClickSkill}
              onRemoveSkill={onRemoveSkill}
              value={appForm.aiSettings.systemPrompt}
              onChange={(e) =>
                setAppForm((state) => ({
                  ...state,
                  aiSettings: { ...state.aiSettings, systemPrompt: e }
                }))
              }
            />
          </Box>
        </AccordionSection>
      </SectionCard>

      {/* 模块二：Skill + 工具 */}
      <SectionCard>
        <>
          <Box pt="16px" px="25px" pb={4}>
            <SkillSelect
              title="Skill"
              selectedSkills={appForm.selectedAgentSkills || []}
              onAddSkill={(skill) =>
                setAppForm((state) => ({
                  ...state,
                  selectedAgentSkills: [skill, ...(state.selectedAgentSkills || [])]
                }))
              }
              onRemoveSkill={(skillId) =>
                setAppForm((state) => ({
                  ...state,
                  selectedAgentSkills:
                    state.selectedAgentSkills?.filter((item) => item.skillId !== skillId) || []
                }))
              }
            />
          </Box>
          <Box h="1px" bg="myGray.200" mx="16px" />
        </>
        <Box pt="16px" px="25px" pb={4}>
          <ToolSelect
            selectedModel={selectedModel}
            selectedTools={appForm.selectedTools}
            fileSelectConfig={appForm.chatConfig.fileSelectConfig}
            onAddTool={(e) =>
              setAppForm((state) => ({
                ...state,
                selectedTools: [e, ...(state.selectedTools || [])]
              }))
            }
            onUpdateTool={(e) =>
              setAppForm((state) => ({
                ...state,
                selectedTools:
                  state.selectedTools?.map((item) => (item.id === e.id ? e : item)) || []
              }))
            }
            onRemoveTool={(id) =>
              setAppForm((state) => ({
                ...state,
                selectedTools: state.selectedTools?.filter((item) => item.pluginId !== id) || []
              }))
            }
          />
        </Box>
      </SectionCard>

      {/* 模块三：知识库 */}
      <SectionCard>
        {/* 知识库列表 */}
        <Box pt="16px" px="25px" pb="16px">
          <Flex h={'32px'} alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <FormLabel fontSize={'14px'} fontWeight={'600'} color={'myWhite.1000'}>
                {t('common:core.dataset.Dataset')}
              </FormLabel>
            </Flex>
            <Button
              variant={'transparentBase'}
              leftIcon={
                <MyIcon name="core/chat/sendLight" w={'14px'} transform="rotate(-135deg)" />
              }
              mr={'-5px'}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenKbSelect}
            >
              {t('common:Choose')}
            </Button>
          </Flex>
          <Grid mt="16px" gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={[2, 2]}>
            {selectDatasets.map((item) => (
              <MyTooltip key={item.datasetId} label={t('common:core.dataset.Read Dataset')}>
                <Flex
                  overflow={'hidden'}
                  alignItems={'center'}
                  py={1}
                  px={3}
                  h={'40px'}
                  bg={'white'}
                  borderRadius={'4px'}
                  border={'base'}
                  cursor={'pointer'}
                  onClick={() =>
                    router.push({
                      pathname: '/dataset/detail',
                      query: { datasetId: item.datasetId }
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
        <Box h="1px" bg="myGray.200" mx="16px" />
        <AccordionSection title={<Box py={2}>{t('app:retrieval_config')}</Box>} defaultIndex={[0]}>
          {/* 检索方式 */}
          <FormItem
            label={t('app:retrieval_config')}
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
                {
                  value: DatasetRetrievalModeEnum.standard,
                  title: t('app:retrieval_mode_single')
                },
                {
                  value: DatasetRetrievalModeEnum.agentic,
                  title: t('app:retrieval_mode_multiple')
                }
              ]}
              value={
                (appForm.dataset.retrievalMode as `${DatasetRetrievalModeEnum}`) ||
                DatasetRetrievalModeEnum.standard
              }
              onChange={(mode) =>
                setAppForm((state) => ({
                  ...state,
                  dataset: {
                    ...state.dataset,
                    retrievalMode: mode as DatasetRetrievalModeEnum,
                    ...(mode === DatasetRetrievalModeEnum.agentic
                      ? {
                          agenticSearchReasoning: state.dataset.agenticSearchReasoning ?? true,
                          agenticSearchLLMModelId:
                            state.dataset.agenticSearchLLMModelId || state.aiSettings.modelId,
                          agenticSearchRerankModelId:
                            state.dataset.agenticSearchRerankModelId ||
                            state.dataset.rerankModelId ||
                            defaultModels.rerank?.id
                        }
                      : {})
                  }
                }))
              }
            />
          </FormItem>

          {/* 向量模型 & 重排模型 / 参数配置 */}
          {(appForm.dataset.retrievalMode as string) === DatasetRetrievalModeEnum.agentic ? (
            <>
              {/* agentic: 向量模型 + 重排模型内联展示 */}
              <FormItem
                label={t('app:smart_customer_service_embedding_model')}
                tooltip={t('app:smart_customer_service_embedding_model_tip')}
              >
                <Box flex={1}>
                  <AIModelSelector
                    h={'32px'}
                    value={appForm.dataset.embeddingModelId}
                    list={embeddingModelSelectList}
                    placeholder={
                      !datasetVectorModelId
                        ? t('app:smart_customer_service_embedding_model_placeholder')
                        : undefined
                    }
                    onChange={(model) =>
                      setAppForm((state) => ({
                        ...state,
                        dataset: { ...state.dataset, embeddingModelId: model }
                      }))
                    }
                  />
                </Box>
              </FormItem>
              <FormItem label={t('app:smart_customer_service_rerank_model')}>
                <Box flex={1}>
                  <AIModelSelector
                    h={'32px'}
                    value={appForm.dataset.agenticSearchRerankModelId || defaultModels.rerank?.id}
                    list={reRankModelList.map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(model) =>
                      setAppForm((state) => ({
                        ...state,
                        dataset: { ...state.dataset, agenticSearchRerankModelId: model }
                      }))
                    }
                  />
                </Box>
              </FormItem>
            </>
          ) : showDatasetSearchParams ? (
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
          ) : (
            /* 标准检索 + 开关关闭: 内联展示 */
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
                    placeholder={
                      !datasetVectorModelId
                        ? t('app:smart_customer_service_embedding_model_placeholder')
                        : undefined
                    }
                    onChange={(model) =>
                      setAppForm((state) => ({
                        ...state,
                        dataset: { ...state.dataset, embeddingModelId: model }
                      }))
                    }
                  />
                </Box>
              </FormItem>
              <FormItem label={t('app:smart_customer_service_rerank_model')}>
                <Box flex={1}>
                  <AIModelSelector
                    h={'32px'}
                    value={appForm.dataset.rerankModelId || defaultModels.rerank?.id}
                    list={reRankModelList.map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(model) =>
                      setAppForm((state) => ({
                        ...state,
                        dataset: { ...state.dataset, rerankModelId: model }
                      }))
                    }
                  />
                </Box>
              </FormItem>
            </>
          )}

          {/* 输出思考过程（仅多轮智能检索时显示） */}
          {(appForm.dataset.retrievalMode as string) === DatasetRetrievalModeEnum.agentic && (
            <FormItem
              label={t('app:retrieval_output_thinking')}
              tooltip={t('app:retrieval_output_thinking_tooltip')}
            >
              <Switch
                isChecked={appForm.dataset.agenticSearchReasoning ?? true}
                onChange={(e) =>
                  setAppForm((state) => ({
                    ...state,
                    dataset: {
                      ...state.dataset,
                      agenticSearchReasoning: e.target.checked
                    }
                  }))
                }
              />
            </FormItem>
          )}
        </AccordionSection>
        <Box h="1px" bg="myGray.200" mx="16px" />
        <Box px="25px" py="16px">
          <TagFilterSection
            datasets={selectDatasets}
            value={appForm.dataset.collectionFilterMatch}
            authTmbId={appForm.dataset?.authTmbId ?? false}
            onAuthTmbIdChange={(v) =>
              setAppForm((state) => ({
                ...state,
                dataset: { ...state.dataset, authTmbId: v }
              }))
            }
            onChange={(v) =>
              setAppForm((state) => ({
                ...state,
                dataset: { ...state.dataset, collectionFilterMatch: v }
              }))
            }
          />
        </Box>
      </SectionCard>

      {/* 模块四：问答配置 */}
      <SectionCard>
        <AccordionSection title={t('app:smart_customer_service_qa_config')} spacing={2}>
          {/* 对话开场白 */}
          <Flex alignItems={'center'} w={'100%'} h={'32px'}>
            <FormLabel
              display={'flex'}
              alignItems={'center'}
              fontSize={'12px'}
              fontWeight={'500'}
              w={'92px'}
              flexShrink={0}
              mr={4}
            >
              {t('common:core.app.Welcome Text')}
              <ChatFunctionTip type={'welcome'} />
            </FormLabel>
            <Input
              flex={1}
              h={'32px'}
              value={appForm.chatConfig.welcomeText || ''}
              placeholder={t('app:smart_customer_service_welcome_text_placeholder')}
              onChange={(e) =>
                setAppForm((state) => ({
                  ...state,
                  chatConfig: { ...state.chatConfig, welcomeText: e.target.value }
                }))
              }
            />
          </Flex>

          {/* 文件上传开关 */}
          <Flex alignItems={'center'} w={'100%'} h={'32px'}>
            <FormLabel
              display={'flex'}
              alignItems={'center'}
              fontSize={'12px'}
              fontWeight={'500'}
              w={'92px'}
              flexShrink={0}
              mr={4}
            >
              {t('app:file_upload')}
              <ChatFunctionTip type={'file'} />
            </FormLabel>
            <Switch
              isChecked={!!canUploadFile}
              onChange={(e) => {
                if (e.target.checked) {
                  updateFileSelectConfig({ canSelectFile: true });
                } else {
                  updateFileSelectConfig({
                    canSelectFile: false,
                    canSelectImg: false,
                    canSelectVideo: false,
                    canSelectAudio: false,
                    canSelectCustomFileExtension: false
                  });
                }
              }}
            />
          </Flex>

          {/* 文件上传展开配置 */}
          {canUploadFile && (
            <>
              {/* 最大文件数量 */}
              <FormItem
                label={t('app:upload_file_max_amount')}
                tooltip={t('app:upload_file_max_amount_tip')}
                h={'32px'}
              >
                <MyNumberInput
                  min={1}
                  flex={1}
                  max={maxSelectFiles}
                  inputFieldProps={{ background: 'white', h: '32px' }}
                  step={1}
                  value={fileSelectConfig.maxFiles ?? 10}
                  onChange={(val) => {
                    if (val !== undefined && !isNaN(val)) updateFileSelectConfig({ maxFiles: val });
                  }}
                />
              </FormItem>

              {/* 支持上传类型 */}
              <FormItem label={t('app:upload_file_extension_types')} h={'32px'}>
                <Flex flex={1} alignItems={'center'} gap={2} flexWrap={'wrap'}>
                  {fileTypeTags.map((tag) => (
                    <MyTag key={tag} colorSchema={'gray'}>
                      {tag}
                    </MyTag>
                  ))}
                  <MyIcon
                    name={'edit'}
                    w={'16px'}
                    h={'16px'}
                    cursor={'pointer'}
                    color="blue.600"
                    onClick={() => {
                      setLocalFileConfig(fileSelectConfig);
                      onOpenFileTypeModal();
                    }}
                  />
                </Flex>
              </FormItem>
            </>
          )}

          {/* 文件类型选择弹窗 */}
          <MyModal
            iconSrc="core/app/simpleMode/file"
            title={t('app:upload_file_extension_types')}
            isOpen={isOpenFileTypeModal}
            onClose={onCloseFileTypeModal}
            w={'500px'}
          >
            <ModalBody>
              <VStack
                w="full"
                spacing={3}
                alignItems={'flex-start'}
                border="1px solid"
                borderColor="myGray.200"
                borderRadius="md"
                p={4}
              >
                <FileTypeSelectorPanel
                  value={localFileConfig}
                  onChange={(newValue) =>
                    setLocalFileConfig({ ...newValue, customPdfParse: newValue.canSelectFile })
                  }
                />
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button
                onClick={() => {
                  updateFileSelectConfig(localFileConfig);
                  onCloseFileTypeModal();
                }}
                px={8}
              >
                {t('common:Confirm')}
              </Button>
            </ModalFooter>
          </MyModal>

          {/* 语音输入开关 */}
          <FormItem label={t('common:core.app.Whisper')} h={'32px'}>
            <Switch
              isChecked={whisperConfig.open}
              onChange={(e) => updateWhisperConfig({ open: e.target.checked })}
            />
          </FormItem>

          {/* 语音输入展开配置 */}
          {whisperConfig.open && (
            <>
              {/* 自动发送 */}
              <FormItem
                label={t('common:core.app.whisper.Auto send')}
                tooltip={t('common:core.app.whisper.Auto send tip')}
                h={'32px'}
              >
                <Switch
                  isChecked={whisperConfig.autoSend}
                  onChange={(e) => updateWhisperConfig({ autoSend: e.target.checked })}
                />
              </FormItem>

              {/* 自动语音回复（仅自动发送开启时显示） */}
              {whisperConfig.autoSend && (
                <FormItem
                  label={t('common:core.app.whisper.Auto tts response')}
                  tooltip={t('common:core.app.whisper.Auto tts response tip')}
                  h={'32px'}
                >
                  <Switch
                    isChecked={whisperConfig.autoTTSResponse}
                    onChange={(e) => updateWhisperConfig({ autoTTSResponse: e.target.checked })}
                  />
                </FormItem>
              )}
            </>
          )}
        </AccordionSection>
      </SectionCard>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            name: item.name,
            avatar: item.avatar,
            vectorModel: item.vectorModel,
            datasetType: item.datasetType
          }))}
          onClose={onCloseKbSelect}
          onChange={(e) =>
            setAppForm((state) => ({
              ...state,
              dataset: { ...state.dataset, datasets: e }
            }))
          }
        />
      )}
      <SkillModal />
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
