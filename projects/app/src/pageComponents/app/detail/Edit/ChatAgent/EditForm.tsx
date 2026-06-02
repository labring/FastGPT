import React, { useEffect, useMemo } from 'react';
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
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum } from '@/web/core/app/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import { cardStyles } from '../../constants';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSkillManager } from './hooks/useSkillManager';
import { AGENT_SANDBOX_TOOLSET_ID, SANDBOX_ICON } from '@fastgpt/global/core/ai/sandbox/tools';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SandboxTipTag from '../../components/SandboxTipTag';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useAgentSkillSelect } from './hooks/useAgentSkillSelect';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import DatasetCard from '@/components/core/app/DatasetCard';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const SkillSelectModal = dynamic(() => import('../FormComponent/ToolSelector/SkillSelectModal'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const FileSelectConfig = dynamic(() => import('@/components/core/app/FileSelect'));

const BoxStyles: BoxProps = {
  px: [4, 6],
  py: '16px',
  borderBottomWidth: '1px',
  borderBottomColor: 'borderColor.low'
};

const EditForm = ({
  appForm,
  setAppForm
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;

  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);

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
          return {
            ...state,
            selectedTools: [tool, ...(state.selectedTools || [])]
          };
        } else {
          return {
            ...state,
            selectedTools:
              state.selectedTools?.map((item) => (item.id === tool.id ? tool : item)) || []
          };
        }
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

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();

  const selectedModel = getWebLLMModel(appForm.aiSettings.model);
  const {
    selectedAgentSkills,
    isAgentSkillSandboxUnavailable,
    isOpenSkillSelect,
    onCloseSkillSelect,
    openSkillSelect,
    onAddAgentSkill,
    onRemoveAgentSkill,
    onChangeAgentSandbox,
    ConfirmModal,
    isOpenRecharge,
    onCloseRecharge
  } = useAgentSkillSelect({
    appForm,
    showSandbox,
    enableSandbox,
    setAppForm
  });
  const promptSkillOption = useMemo(
    () => ({
      ...skillOption,
      onSelect: async (id: string) => {
        const option = await skillOption.onSelect?.(id);
        if (!option?.onClick) return option;

        return {
          ...option,
          onClick: async (toolId: string) => {
            const skillId = await option.onClick?.(toolId);

            // AgentV2 提示词 @虚拟机 时，同步打开下方虚拟机开关。
            if (skillId === AGENT_SANDBOX_TOOLSET_ID && !appForm.aiSettings.useAgentSandbox) {
              onChangeAgentSandbox(true);
            }

            return skillId;
          }
        };
      }
    }),
    [appForm.aiSettings.useAgentSandbox, onChangeAgentSandbox, skillOption]
  );
  const tokenLimit = useMemo(() => {
    return selectedModel.quoteMaxToken || 3000;
  }, [selectedModel.quoteMaxToken]);

  // 简易 Agent 不暴露多模态开关，文件选择能力直接跟随模型能力。
  useEffect(() => {
    setAppForm((state) => ({
      ...state,
      chatConfig: {
        ...state.chatConfig,
        ...(state.chatConfig.fileSelectConfig
          ? {
              fileSelectConfig: {
                ...state.chatConfig.fileSelectConfig,
                canSelectImg: !!selectedModel.vision,
                canSelectAudio: !!selectedModel.audio,
                canSelectVideo: !!selectedModel.video
              }
            }
          : {})
      }
    }));
  }, [selectedModel, setAppForm]);

  return (
    <>
      <Box mt={4} {...cardStyles} boxShadow={'3.5'}>
        {/* ai */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <MyIcon name={'core/app/simpleMode/ai'} w={'20px'} />
            <FormLabel ml={2} flex={1}>
              {t('app:ai_settings')}
            </FormLabel>
          </Flex>
          <Flex alignItems={'center'} mt={5}>
            <FormLabel w={['60px', '100px']}>{t('common:core.ai.Model')}</FormLabel>
            <Box flex={'1 0 0'}>
              <SettingLLMModel
                bg="myGray.50"
                defaultData={{
                  model: appForm.aiSettings.model,
                  // temperature: appForm.aiSettings.temperature,
                  // maxToken: appForm.aiSettings.maxToken,
                  // maxHistories: appForm.aiSettings.maxHistories,
                  aiChatReasoning: appForm.aiSettings.aiChatReasoning ?? true,
                  aiChatReasoningEffort: appForm.aiSettings.aiChatReasoningEffort
                  // aiChatTopP: appForm.aiSettings.aiChatTopP,
                  // aiChatStopSign: appForm.aiSettings.aiChatStopSign,
                  // aiChatResponseFormat: appForm.aiSettings.aiChatResponseFormat,
                  // aiChatJsonSchema: appForm.aiSettings.aiChatJsonSchema
                }}
                showMaxToken={false}
                showTemperature={false}
                showTopP={false}
                showStopSign={false}
                showResponseFormat={false}
                showMultimodalConfig={false}
                onChange={({ maxHistories = 6, ...data }) => {
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: {
                      ...state.aiSettings,
                      ...data,
                      maxHistories
                    }
                  }));
                }}
              />
            </Box>
          </Flex>

          {/* Prompt */}
          <Box mt={4}>
            <HStack w={'100%'}>
              <FormLabel>{t('common:core.ai.Prompt')}</FormLabel>
            </HStack>
            <Box mt={2}>
              <PromptEditor
                minH={160}
                bg={'myGray.50'}
                title={t('common:core.ai.Prompt')}
                isRichText={true}
                skillOption={promptSkillOption}
                selectedSkills={selectedSkills}
                onClickSkill={onClickSkill}
                onRemoveSkill={onRemoveSkill}
                value={appForm.aiSettings.systemPrompt}
                onChange={(e) => {
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: {
                      ...state.aiSettings,
                      systemPrompt: e
                    }
                  }));
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Sandbox (虚拟机) */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={SANDBOX_ICON} w={'20px'} />
              <FormLabel ml={2}>{t('app:use_agent_sandbox')}</FormLabel>
              <QuestionTip ml={1} label={t('app:use_computer_desc')} />
            </Flex>

            {showSandbox && enableSandbox && (
              <Box mr={2}>
                <SandboxTipTag />
              </Box>
            )}
            <Switch
              isChecked={appForm.aiSettings.useAgentSandbox ?? false}
              onChange={(e) => onChangeAgentSandbox(e.target.checked)}
            />
          </Flex>
        </Box>

        {/* skill choice */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'common/skill'} w={'20px'} color={'#487FFF'} />
              <FormLabel ml={2}>{t('skill:associated_skills')}</FormLabel>
            </Flex>
            {isAgentSkillSandboxUnavailable && (
              <MyTag
                mr={2}
                colorSchema={'red'}
                type={'borderFill'}
                cursor={'pointer'}
                onClick={openSkillSelect}
              >
                {t('skill:sandbox_unavailable_tag')}
              </MyTag>
            )}
            <Button
              variant={'transparentBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              mr={'-5px'}
              size={'sm'}
              fontSize={'sm'}
              onClick={openSkillSelect}
            >
              {t('common:Choose')}
            </Button>
          </Flex>
          <Grid
            mt={selectedAgentSkills.length > 0 ? 2 : 0}
            gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
            gridGap={[2, 4]}
          >
            {selectedAgentSkills.map((item) => {
              const isDeleted = !!item.isDeleted;

              return (
                <MyTooltip
                  key={item.skillId}
                  label={isDeleted ? t('skill:skill_deleted_click_remove_tip') : item.description}
                >
                  <Flex
                    overflow={'hidden'}
                    alignItems={'center'}
                    p={2.5}
                    bg={'white'}
                    boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                    borderRadius={'md'}
                    border={'base'}
                    borderColor={isDeleted ? 'red.600' : undefined}
                    userSelect={'none'}
                    _hover={{
                      borderColor: isDeleted ? 'red.600' : 'primary.300',
                      '.delete': {
                        display: 'flex'
                      },
                      '.hoverStyle': {
                        display: 'flex'
                      },
                      '.unHoverStyle': {
                        display: 'none'
                      }
                    }}
                  >
                    {item.avatar ? (
                      <Avatar src={item.avatar} w={'1.5rem'} h={'1.5rem'} borderRadius={'sm'} />
                    ) : (
                      <MyIcon name={'core/skill/default'} w={'1.5rem'} h={'1.5rem'} />
                    )}
                    <Box
                      flex={'1 0 0'}
                      ml={2}
                      className={'textEllipsis'}
                      fontSize={'sm'}
                      color={'myGray.900'}
                    >
                      {item.name}
                    </Box>
                    {isDeleted && (
                      <MyTag colorSchema="red" type="fill" className="unHoverStyle">
                        <MyIcon name={'common/error'} w={'14px'} mr={1} />
                        <Box color={'red.600'} maxW={'120px'} className="textEllipsis">
                          {t('skill:skill_deleted')}
                        </Box>
                      </MyTag>
                    )}
                    <Box className="hoverStyle" display={['flex', 'none']} ml={0.5}>
                      <MyIconButton
                        icon="delete"
                        hoverBg="red.50"
                        hoverColor="red.600"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAgentSkill(item.skillId);
                        }}
                      />
                    </Box>
                  </Flex>
                </MyTooltip>
              );
            })}
          </Grid>

          {isOpenSkillSelect && (
            <SkillSelectModal
              selectedSkills={selectedAgentSkills}
              onAddSkill={onAddAgentSkill}
              onRemoveSkill={onRemoveAgentSkill}
              onClose={onCloseSkillSelect}
            />
          )}
        </Box>

        {/* tool choice */}
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
            onRemoveTool={(id) => {
              setAppForm((state) => ({
                ...state,
                selectedTools: state.selectedTools?.filter((item) => item.pluginId !== id) || []
              }));
            }}
          />
        </Box>

        {/* dataset */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/simpleMode/dataset'} w={'20px'} />
              <FormLabel ml={2}>{t('app:dataset')}</FormLabel>
            </Flex>
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
              onClick={onOpenKbSelect}
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
                queryExtensionModel={appForm.dataset.datasetSearchExtensionModel}
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
        </Box>

        {/* File select */}
        <Box {...BoxStyles}>
          <FileSelectConfig
            forbidVision={!selectedModel?.vision}
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
        {/* <Box {...BoxStyles}>
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
        </Box> */}
      </Box>
      <Box mt={4} {...cardStyles} boxShadow={'3.5'}>
        {/* welcome */}
        <Box {...BoxStyles}>
          <WelcomeTextConfig
            value={appForm.chatConfig.welcomeText}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  welcomeText: e.target.value
                }
              }));
            }}
          />
        </Box>

        {/* tts */}
        {/* <Box {...BoxStyles}>
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
        </Box> */}

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
        {/* <Box {...BoxStyles}>
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
        </Box> */}

        {/* question tips */}
        {/* <Box {...BoxStyles}>
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
        </Box> */}
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
      <ConfirmModal />
      {isOpenRecharge && <RechargeModal onClose={onCloseRecharge} onPaySuccess={onCloseRecharge} />}
      <SkillModal />
    </>
  );
};

export default React.memo(EditForm);
