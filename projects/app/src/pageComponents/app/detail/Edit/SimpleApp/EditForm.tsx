import React, { useCallback, useEffect, useMemo, useTransition } from 'react';
import {
  Box,
  Flex,
  Grid,
  type BoxProps,
  useDisclosure,
  Button,
  HStack,
  Switch
} from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import VariableEdit from '@/components/core/app/VariableEdit';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { SmallAddIcon } from '@chakra-ui/icons';
import { SANDBOX_ICON } from '@fastgpt/global/core/ai/sandbox/tools';
import SandboxConfigButton from '../../components/SandboxConfigButton';
import { useUserStore } from '@/web/support/user/useUserStore';
import DatasetCard from '@/components/core/app/DatasetCard';
import DatasetTagFilterRows, {
  DatasetTagFilterDeprecated,
  DatasetTagFilterUpgradeButton,
  TagFilterLogicToggle
} from '@/components/core/dataset/DatasetTagFilterRows';
import { useWelcomeTextFoldState } from '@/components/core/app/useAppEditorUIState';
import {
  findClientModelByReference,
  resolveClientModelReferenceId
} from '@/web/core/ai/model/modelReference';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  createEmptyTagFilterValue,
  isDatasetTagFilterValue,
  type DatasetTagFilterValue
} from '@fastgpt/global/core/dataset/workflowTagFilter';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const WelcomeQuestionsConfig = dynamic(
  () => import('@/components/core/app/WelcomeQuestionsConfig')
);
const FileSelectConfig = dynamic(() => import('@/components/core/app/FileSelect'));

const BoxStyles: BoxProps = {
  px: [4, 6],
  py: '16px',
  borderBottomWidth: '1px',
  borderBottomColor: 'borderColor.low'
};
const LabelStyles: BoxProps = {
  w: ['60px', '100px'],
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontSize: 'sm',
  color: 'myGray.900'
};

const EditForm = ({
  appForm,
  setAppForm
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const { defaultModels } = useUserModelStore();
  const showSandbox = feConfigs.show_agent_sandbox;
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);
  const [, startTst] = useTransition();
  const isAgentSandboxEnabled = !!appForm.aiSettings.useAgentSandbox;
  const { isWelcomeTextFolded, toggleWelcomeTextFold } = useWelcomeTextFoldState(appDetail._id);

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
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
          id: VARIABLE_NODE_ID,
          label: t('common:core.module.Variable'),
          avatar: 'core/workflow/template/variable'
        }
      })),
    [appForm.chatConfig.variables, t]
  );

  const tagFilterReferenceList = useMemo(
    () => [
      {
        label: t('common:core.module.Variable'),
        value: VARIABLE_NODE_ID,
        children: formatVariables.map((item) => ({
          label: item.label,
          value: item.key,
          valueType: item.valueType
        }))
      }
    ],
    [formatVariables, t]
  );

  const onCollectionFilterMatchChange = useCallback(
    (value: DatasetTagFilterValue | string) => {
      setAppForm((state) => ({
        ...state,
        dataset: {
          ...state.dataset,
          collectionFilterMatch: value
        }
      }));
    },
    [setAppForm]
  );

  const { llmModelList, reRankModelList } = useUserModelLists();
  const selectedModel =
    findClientModelByReference({
      models: llmModelList,
      reference: appForm.aiSettings
    }) ??
    (appForm.aiSettings.modelId === undefined && !appForm.aiSettings.model
      ? llmModelList[0]
      : undefined);
  const tokenLimit = useMemo(() => {
    return selectedModel?.config.quoteMaxToken ?? 3000;
  }, [selectedModel?.config.quoteMaxToken]);

  const updateWelcomeText = useCallback(
    (value: string) => {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          welcomeText: value,
          welcomeConfig: {
            ...state.chatConfig.welcomeConfig,
            welcomeText: value
          }
        }
      }));
    },
    [setAppForm]
  );

  const updateWelcomeQuestions = useCallback(
    (value: string[]) => {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          welcomeConfig: {
            ...state.chatConfig.welcomeConfig,
            welcomeQuestions: value
          }
        }
      }));
    },
    [setAppForm]
  );

  useEffect(() => {
    setAppForm((state) => {
      const modelId = resolveClientModelReferenceId({
        models: llmModelList,
        reference: state.aiSettings
      });
      const rerankModelId =
        resolveClientModelReferenceId({
          models: reRankModelList,
          reference: {
            modelId: state.dataset.rerankModelId,
            model: state.dataset.rerankModel
          }
        }) ??
        (state.dataset.usingReRank &&
        state.dataset.rerankModelId === undefined &&
        !state.dataset.rerankModel
          ? defaultModels.rerank?.modelId
          : undefined);
      const datasetSearchExtensionModelId =
        resolveClientModelReferenceId({
          models: llmModelList,
          reference: {
            modelId: state.dataset.datasetSearchExtensionModelId,
            model: state.dataset.datasetSearchExtensionModel
          }
        }) ??
        (state.dataset.datasetSearchUsingExtensionQuery &&
        state.dataset.datasetSearchExtensionModelId === undefined &&
        !state.dataset.datasetSearchExtensionModel
          ? defaultModels.llm?.modelId
          : undefined);

      if (
        modelId === state.aiSettings.modelId &&
        rerankModelId === state.dataset.rerankModelId &&
        datasetSearchExtensionModelId === state.dataset.datasetSearchExtensionModelId
      ) {
        return state;
      }
      return {
        ...state,
        aiSettings: {
          ...state.aiSettings,
          modelId
        },
        dataset: {
          ...state.dataset,
          rerankModelId,
          datasetSearchExtensionModelId
        }
      };
    });
  }, [
    defaultModels.llm?.modelId,
    defaultModels.rerank?.modelId,
    llmModelList,
    reRankModelList,
    setAppForm
  ]);

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

  return (
    <>
      <Box>
        {/* ai */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <MyIcon name={'core/app/simpleMode/ai'} w={'20px'} />
            <FormLabel ml={2} flex={1}>
              {t('app:ai_settings')}
            </FormLabel>
          </Flex>
          <Flex alignItems={'center'} mt={5}>
            <Box {...LabelStyles}>{t('common:core.ai.Model')}</Box>
            <Box flex={'1 0 0'}>
              <SettingLLMModel
                bg="myGray.50"
                defaultData={{
                  modelId:
                    appForm.aiSettings.modelId !== undefined
                      ? appForm.aiSettings.modelId
                      : appForm.aiSettings.model || undefined,
                  temperature: appForm.aiSettings.temperature,
                  maxToken: appForm.aiSettings.maxToken,
                  maxHistories: appForm.aiSettings.maxHistories,
                  aiChatReasoning: appForm.aiSettings.aiChatReasoning ?? true,
                  aiChatReasoningEffort: appForm.aiSettings.aiChatReasoningEffort,
                  aiChatTopP: appForm.aiSettings.aiChatTopP,
                  aiChatStopSign: appForm.aiSettings.aiChatStopSign,
                  aiChatResponseFormat: appForm.aiSettings.aiChatResponseFormat,
                  aiChatJsonSchema: appForm.aiSettings.aiChatJsonSchema
                }}
                showMultimodalConfig={false}
                onChange={({ modelId, maxHistories = 6, ...data }) => {
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: {
                      ...state.aiSettings,
                      ...data,
                      modelId,
                      model: undefined,
                      maxHistories
                    }
                  }));
                }}
              />
            </Box>
          </Flex>

          <Box mt={4}>
            <HStack {...LabelStyles} w={'100%'}>
              <Box>{t('common:core.ai.Prompt')}</Box>
              <QuestionTip label={t('common:core.app.tip.systemPromptTip')} />

              <Box flex={1} />
              <VariableTip color={'myGray.500'} />
            </HStack>
            <Box mt={1}>
              <PromptEditor
                minH={150}
                value={appForm.aiSettings.systemPrompt}
                bg={'myGray.50'}
                onChange={(text) => {
                  startTst(() => {
                    setAppForm((state) => ({
                      ...state,
                      aiSettings: {
                        ...state.aiSettings,
                        systemPrompt: text
                      }
                    }));
                  });
                }}
                variableLabels={formatVariables}
                variables={formatVariables}
                placeholder={t('common:core.app.tip.systemPromptTip')}
                title={t('common:core.ai.Prompt')}
                ExtensionPopover={[OptimizerPopverComponent]}
                isRichText={true}
              />
            </Box>
          </Box>
        </Box>

        {/* Use Computer */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={SANDBOX_ICON} w={'20px'} />
              <FormLabel ml={2}>{t('app:use_agent_sandbox')}</FormLabel>
              <QuestionTip ml={1} label={t('app:use_computer_desc')} />
            </Flex>
            <SandboxConfigButton
              showSandbox={!!showSandbox}
              enableSandbox={enableSandbox}
              isEnabled={isAgentSandboxEnabled}
              entrypoint={appForm.aiSettings.sandboxEntrypoint}
              onChangeSandbox={(checked) => {
                if (checked && (!showSandbox || !enableSandbox)) return;

                setAppForm((state) => ({
                  ...state,
                  aiSettings: {
                    ...state.aiSettings,
                    useAgentSandbox: checked
                  }
                }));
              }}
              onChangeEntrypoint={(value) => {
                setAppForm((state) => ({
                  ...state,
                  aiSettings: {
                    ...state.aiSettings,
                    sandboxEntrypoint: value
                  }
                }));
              }}
            />
          </Flex>
        </Box>

        {/* tool choice */}
        {selectedModel && (
          <Box {...BoxStyles}>
            <ToolSelect
              selectedModel={selectedModel}
              selectedTools={appForm.selectedTools}
              fileSelectConfig={appForm.chatConfig.fileSelectConfig}
              onAddTool={(e) => {
                setAppForm((state) => ({
                  ...state,
                  selectedTools: [e, ...(state.selectedTools || [])]
                }));
              }}
              onUpdateTool={(e) => {
                setAppForm((state) => ({
                  ...state,
                  selectedTools:
                    state.selectedTools?.map((item) => (item.id === e.id ? e : item)) || []
                }));
              }}
              onRemoveTool={(id, source) => {
                setAppForm((state) => ({
                  ...state,
                  selectedTools:
                    state.selectedTools?.filter(
                      (item) =>
                        getToolIdentityKey(item.pluginId, item.source) !==
                        getToolIdentityKey(id, source)
                    ) || []
                }));
              }}
            />
          </Box>
        )}

        {/* dataset */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/simpleMode/dataset'} w={'20px'} />
              <FormLabel ml={2}>{t('app:dataset')}</FormLabel>
            </Flex>
            {feConfigs?.isPlus && (
              <Flex alignItems={'center'} mr={2}>
                <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'nowrap'}>
                  {t('workflow:auth_tmb_id')}
                </Box>
                <QuestionTip ml={1} label={t('workflow:auth_tmb_id_tip')} />
                <Switch
                  ml={2}
                  size={'sm'}
                  isChecked={!!appForm.dataset.authTmbId}
                  onChange={(e) => {
                    setAppForm((state) => ({
                      ...state,
                      dataset: {
                        ...state.dataset,
                        authTmbId: e.target.checked
                      }
                    }));
                  }}
                />
              </Flex>
            )}
            <Button
              variant={'transparentBase'}
              leftIcon={<MyIcon name={'edit'} w={'14px'} />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenDatasetParams}
            >
              {t('common:Params')}
            </Button>
            <Button
              mr={'-5px'}
              variant={'transparentBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenDatasetSelect}
            >
              {t('common:Choose')}
            </Button>
          </Flex>
          {appForm.dataset.datasets?.length > 0 && (
            <Box my={3}>
              <SearchParamsTip
                searchMode={appForm.dataset.searchMode}
                similarity={appForm.dataset.similarity}
                limit={appForm.dataset.limit}
                usingReRank={appForm.dataset.usingReRank}
                usingExtensionQuery={appForm.dataset.datasetSearchUsingExtensionQuery}
                queryExtensionModel={
                  appForm.dataset.datasetSearchExtensionModelId ||
                  appForm.dataset.datasetSearchExtensionModel
                }
              />
            </Box>
          )}
          <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={[2, 4]}>
            {selectDatasets.map((dataset) => (
              <DatasetCard
                key={dataset.datasetId}
                dataset={dataset}
                onDelete={(datasetId) => {
                  setAppForm((state) => ({
                    ...state,
                    dataset: {
                      ...state.dataset,
                      datasets:
                        state.dataset.datasets?.filter((pre) => pre.datasetId !== datasetId) || []
                    }
                  }));
                }}
              />
            ))}
          </Grid>
          {appForm.dataset.datasets?.length > 0 && feConfigs?.isPlus && (
            <Box mt={4}>
              <Flex alignItems={'center'} mb={2}>
                <FormLabel color={'myGray.600'}>
                  {typeof appForm.dataset.collectionFilterMatch === 'string'
                    ? t('workflow:collection_metadata_filter')
                    : t('workflow:tag_filter')}
                </FormLabel>
                <QuestionTip
                  ml={1}
                  label={
                    typeof appForm.dataset.collectionFilterMatch === 'string'
                      ? t('workflow:filter_description')
                      : t('workflow:tag_filter_description')
                  }
                />
                {typeof appForm.dataset.collectionFilterMatch === 'string' ? (
                  <>
                    <Box flex={1} />
                    <DatasetTagFilterUpgradeButton
                      onUpgrade={() => onCollectionFilterMatchChange(createEmptyTagFilterValue())}
                    />
                  </>
                ) : (
                  <Box ml={2}>
                    <TagFilterLogicToggle
                      value={
                        isDatasetTagFilterValue(appForm.dataset.collectionFilterMatch)
                          ? appForm.dataset.collectionFilterMatch
                          : undefined
                      }
                      onChange={onCollectionFilterMatchChange}
                    />
                  </Box>
                )}
              </Flex>
              {typeof appForm.dataset.collectionFilterMatch === 'string' ? (
                <DatasetTagFilterDeprecated
                  value={appForm.dataset.collectionFilterMatch}
                  onChange={onCollectionFilterMatchChange}
                  variables={formatVariables}
                  variableLabels={formatVariables}
                />
              ) : (
                <DatasetTagFilterRows
                  value={appForm.dataset.collectionFilterMatch}
                  onChange={onCollectionFilterMatchChange}
                  datasetIds={appForm.dataset.datasets.map((item) => item.datasetId)}
                  referenceList={tagFilterReferenceList}
                />
              )}
            </Box>
          )}
        </Box>

        {/* File select */}
        <Box {...BoxStyles}>
          <FileSelectConfig
            value={appForm.chatConfig.fileSelectConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  fileSelectConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* variable */}
        <Box {...BoxStyles}>
          <VariableEdit
            variables={appForm.chatConfig.variables}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  variables: e
                }
              }));
            }}
          />
        </Box>

        {/* welcome */}
        <Box {...BoxStyles}>
          <WelcomeTextConfig
            value={appForm.chatConfig.welcomeText}
            isFolded={isWelcomeTextFolded}
            onToggleFold={toggleWelcomeTextFold}
            onChange={(e) => {
              updateWelcomeText(e.target.value);
            }}
          />
          {!isWelcomeTextFolded && (
            <Box mt={3}>
              <WelcomeQuestionsConfig
                value={appForm.chatConfig.welcomeConfig?.welcomeQuestions}
                onChange={updateWelcomeQuestions}
              />
            </Box>
          )}
        </Box>

        {/* tts */}
        <Box {...BoxStyles}>
          <TTSSelect
            value={appForm.chatConfig.ttsConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  ttsConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* whisper */}
        <Box {...BoxStyles}>
          <WhisperConfig
            isOpenAudio={appForm.chatConfig.ttsConfig?.type !== TTSTypeEnum.none}
            value={appForm.chatConfig.whisperConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  whisperConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* question guide */}
        <Box {...BoxStyles}>
          <QGConfig
            value={appForm.chatConfig.questionGuide}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  questionGuide: e
                }
              }));
            }}
          />
        </Box>

        {/* question tips */}
        <Box {...BoxStyles}>
          <InputGuideConfig
            appId={appDetail._id}
            value={appForm.chatConfig.chatInputGuide}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  chatInputGuide: e
                }
              }));
            }}
          />
        </Box>
      </Box>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            name: item.name,
            avatar: item.avatar,
            vectorModel: item.vectorModel,
            isDeleted: item.isDeleted
          }))}
          onClose={onCloseDatasetSelect}
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
      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...appForm.dataset}
          maxTokens={tokenLimit}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            setAppForm((state) => ({
              ...state,
              dataset: {
                ...state.dataset,
                ...e
              }
            }));
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
