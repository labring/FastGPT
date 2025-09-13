import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  Box,
  Flex,
  Grid,
  type BoxProps,
  useTheme,
  useDisclosure,
  Button,
  HStack
} from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type.d';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useRouter } from 'next/router';
import { i18n, useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import VariableEdit from '@/components/core/app/VariableEdit';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum, workflowStartNodeId } from '@/web/core/app/constants';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  getSystemPlugTemplates,
  getPluginGroups,
  getMcpChildren,
  getPreviewPluginNode
} from '@/web/core/app/api/plugin';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type {
  EditorSkillPickerType,
  SkillSubToolItem
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

// Extended tool type with unconfigured state
type ExtendedToolType = FlowNodeTemplateType & {
  isUnconfigured?: boolean;
};

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const ConfigToolModal = dynamic(() => import('../component/ConfigToolModal'));
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
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);
  const [, startTst] = useTransition();
  const [configTool, setConfigTool] = useState<ExtendedToolType>();
  const onCloseConfigTool = useCallback(() => setConfigTool(undefined), []);

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

  const { data: systemPlugins = [] } = useRequest2(
    async () => {
      try {
        return await getSystemPlugTemplates({ parentId: '', searchKey: '' });
      } catch (error) {
        console.error('Failed to load system plugin templates:', error);
        return [];
      }
    },
    {
      manual: false,
      refreshDeps: [appDetail._id]
    }
  );
  const { data: pluginGroups = [] } = useRequest2(
    async () => {
      try {
        return await getPluginGroups();
      } catch (error) {
        console.error('Failed to load plugin groups:', error);
        return [];
      }
    },
    {
      manual: false
    }
  );
  const skillTemplates: EditorSkillPickerType[] = useMemo(() => {
    const lang = i18n?.language as localeType;

    const categorizedTools = pluginGroups
      .map((group) => {
        const categoryMap = group.groupTypes.reduce<
          Record<
            string,
            {
              list: Array<{
                key: string;
                name: string;
                avatar: string;
                canOpen?: boolean;
                subItems?: {
                  key: string;
                  label: string;
                  description: string;
                }[];
              }>;
              label: string;
            }
          >
        >((acc, item) => {
          acc[item.typeId] = {
            list: [],
            label: t(parseI18nString(item.typeName, lang))
          };
          return acc;
        }, {});

        systemPlugins.forEach((plugin) => {
          if (categoryMap[plugin.templateType]) {
            const canOpen = plugin.flowNodeType === 'toolSet' || plugin.isFolder;

            categoryMap[plugin.templateType].list.push({
              key: plugin.id,
              name: t(parseI18nString(plugin.name, lang)),
              avatar: plugin.avatar || 'core/workflow/template/toolCall',
              canOpen
            });
          }
        });

        return {
          key: group.groupName,
          label: t(group.groupName as any),
          icon: 'core/workflow/template/toolCall',
          toolCategories: Object.entries(categoryMap)
            .map(([type, { list, label }]) => ({
              type,
              label,
              list
            }))
            .filter((item) => item.list.length > 0)
        };
      })
      .filter((group) => group.toolCategories.length > 0);

    return categorizedTools;
  }, [systemPlugins, pluginGroups, t, i18n?.language]);
  const handleLoadToolSubItems = useCallback(
    async (toolId: string): Promise<SkillSubToolItem[]> => {
      const lang = i18n?.language as localeType;

      const systemPlugins = await getSystemPlugTemplates({ parentId: toolId });
      return systemPlugins.map((plugin) => ({
        key: plugin.id,
        label: t(parseI18nString(plugin.name, lang)),
        description: t(parseI18nString(plugin.intro, lang))
      }));
    },
    [i18n?.language, t]
  );
  const { toast } = useToast();

  const handleConfigureTool = useCallback(
    (toolId: string) => {
      const tool = appForm.selectedTools.find((tool) => tool.id === toolId) as ExtendedToolType;
      if (tool && tool.isUnconfigured) {
        // 打开配置模态框
        setConfigTool(tool);
      }
    },
    [appForm.selectedTools]
  );

  const onAddTool = useCallback(
    (tool: FlowNodeTemplateType) => {
      setAppForm((state) => ({
        ...state,
        selectedTools: state.selectedTools.map((t) =>
          t.id === tool.id ? { ...tool, isUnconfigured: false } : t
        )
      }));
      setConfigTool(undefined);
      toast({
        title: 'Tool configured successfully',
        status: 'success'
      });
    },
    [setAppForm, toast]
  );

  const handleAddToolFromEditor = useCallback(
    async (toolKey: string): Promise<string> => {
      const toolId = `tool_${getNanoid(6)}`;
      const toolTemplate = await getPreviewPluginNode({
        appId: toolKey
      });

      /* Invalid plugin check
        1. Reference type. but not tool description;
        2. Has dataset select
        3. Has dynamic external data
      */
      const oneFileInput =
        toolTemplate.inputs.filter((input) =>
          input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
        ).length === 1;
      const canUploadFile =
        appForm.chatConfig?.fileSelectConfig?.canSelectFile ||
        appForm.chatConfig?.fileSelectConfig?.canSelectImg;
      const invalidFileInput = oneFileInput && !!canUploadFile;
      if (
        toolTemplate.inputs.some(
          (input) =>
            (input.renderTypeList.length === 1 &&
              input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
              !input.toolDescription) ||
            input.renderTypeList.includes(FlowNodeInputTypeEnum.selectDataset) ||
            input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam) ||
            (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) && !invalidFileInput)
        )
      ) {
        toast({
          title: t('app:simple_tool_tips'),
          status: 'warning'
        });
        throw new Error('Invalid plugin configuration');
      }

      // 判断是否可以直接添加工具,满足以下任一条件:
      // 1. 有工具描述
      // 2. 是模型选择类型
      // 3. 是文件上传类型且:已开启文件上传、非必填、只有一个文件上传输入
      const hasInputForm =
        toolTemplate.inputs.length > 0 &&
        toolTemplate.inputs.some((input) => {
          if (input.toolDescription) {
            return false;
          }
          if (input.key === NodeInputKeyEnum.forbidStream) {
            return false;
          }
          if (input.key === NodeInputKeyEnum.systemInputConfig) {
            return true;
          }

          // Check if input has any of the form render types
          const formRenderTypes = [
            FlowNodeInputTypeEnum.input,
            FlowNodeInputTypeEnum.textarea,
            FlowNodeInputTypeEnum.numberInput,
            FlowNodeInputTypeEnum.switch,
            FlowNodeInputTypeEnum.select,
            FlowNodeInputTypeEnum.JSONEditor
          ];

          return formRenderTypes.some((type) => input.renderTypeList.includes(type));
        });

      // 构建默认表单数据
      const defaultForm = {
        ...toolTemplate,
        id: toolId,
        inputs: toolTemplate.inputs.map((input) => {
          // 如果是文件上传类型,设置为从工作流开始节点获取用户文件
          if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
            return {
              ...input,
              value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
            };
          }
          return input;
        })
      };

      const toolWithConfig: ExtendedToolType = {
        ...defaultForm,
        isUnconfigured: hasInputForm
      };

      setAppForm((state) => ({
        ...state,
        selectedTools: [...state.selectedTools, toolWithConfig]
      }));

      return toolId;
    },
    [appForm.chatConfig, setAppForm, toast, t]
  );

  const selectedModel = getWebLLMModel(appForm.aiSettings.model);
  const tokenLimit = useMemo(() => {
    return selectedModel?.quoteMaxToken || 3000;
  }, [selectedModel?.quoteMaxToken]);

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
                llmModelType={'all'}
                defaultData={{
                  model: appForm.aiSettings.model,
                  temperature: appForm.aiSettings.temperature,
                  maxToken: appForm.aiSettings.maxToken,
                  maxHistories: appForm.aiSettings.maxHistories,
                  aiChatReasoning: appForm.aiSettings.aiChatReasoning ?? true,
                  aiChatTopP: appForm.aiSettings.aiChatTopP,
                  aiChatStopSign: appForm.aiSettings.aiChatStopSign,
                  aiChatResponseFormat: appForm.aiSettings.aiChatResponseFormat,
                  aiChatJsonSchema: appForm.aiSettings.aiChatJsonSchema
                }}
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
                onAddToolFromEditor={handleAddToolFromEditor}
                onConfigureTool={handleConfigureTool}
                selectedTools={appForm.selectedTools}
                variableLabels={formatVariables}
                variables={formatVariables}
                skills={skillTemplates}
                onLoadSubItems={handleLoadToolSubItems}
                placeholder={t('common:core.app.tip.systemPromptTip')}
                title={t('common:core.ai.Prompt')}
                ExtensionPopover={[OptimizerPopverComponent]}
                isRichText={true}
              />
            </Box>
          </Box>
        </Box>

        {/* dataset */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/simpleMode/dataset'} w={'20px'} />
              <FormLabel ml={2}>{t('common:core.dataset.Choose Dataset')}</FormLabel>
            </Flex>
            <Button
              variant={'transparentBase'}
              leftIcon={<MyIcon name="common/addLight" w={'0.8rem'} />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenKbSelect}
            >
              {t('common:Choose')}
            </Button>
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
          </Flex>
          {appForm.dataset.datasets?.length > 0 && (
            <Box my={3}>
              <SearchParamsTip
                searchMode={appForm.dataset.searchMode}
                similarity={appForm.dataset.similarity}
                limit={appForm.dataset.limit}
                usingReRank={appForm.dataset.usingReRank}
                datasetSearchUsingExtensionQuery={appForm.dataset.datasetSearchUsingExtensionQuery}
                queryExtensionModel={appForm.dataset.datasetSearchExtensionModel}
              />
            </Box>
          )}
          <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={[2, 4]}>
            {selectDatasets.map((item) => (
              <MyTooltip key={item.datasetId} label={t('common:core.dataset.Read Dataset')}>
                <Flex
                  overflow={'hidden'}
                  alignItems={'center'}
                  p={2}
                  bg={'white'}
                  boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
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
                  <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'sm'} />
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

        {/* tool choice */}
        <Box {...BoxStyles}>
          <ToolSelect appForm={appForm} setAppForm={setAppForm} />
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
          isOpen={isOpenDatasetSelect}
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            vectorModel: item.vectorModel,
            name: item.name,
            avatar: item.avatar
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
      {!!configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={onCloseConfigTool}
          onAddTool={onAddTool}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
