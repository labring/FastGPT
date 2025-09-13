import React, { useCallback, useEffect, useMemo, useTransition } from 'react';
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
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
import { TTSTypeEnum } from '@/web/core/app/constants';
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
import {
  getSystemPlugTemplates,
  getPluginGroups,
  getMcpChildren,
  getPreviewPluginNode
} from '@/web/core/app/api/plugin';
import type { EditorToolAddData } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type {
  EditorSkillPickerType,
  SkillSubItem
} from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
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

  // Build skill templates with categorized secondary options
  const skillTemplates: EditorSkillPickerType[] = useMemo(() => {
    const lang = i18n?.language as localeType;

    // 构建分类后的系统工具
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
              // subItems 将通过 onLoadSubItems 按需加载
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

  console.log('skillTemplates', skillTemplates);

  // 加载工具子项的函数
  const handleLoadToolSubItems = useCallback(
    async (toolId: string, toolType: string): Promise<SkillSubItem[]> => {
      try {
        const lang = i18n?.language as localeType;

        if (toolType === 'mcp') {
          // 处理 MCP 工具集
          const mcpChildren = await getMcpChildren({ id: toolId });
          return mcpChildren.map((child) => ({
            key: child.id,
            label: child.name,
            description: child.description
          }));
        } else {
          // 处理系统插件
          const systemPlugins = await getSystemPlugTemplates({ parentId: toolId });
          return systemPlugins.map((plugin) => ({
            key: plugin.id,
            label: t(parseI18nString(plugin.name, lang)),
            description: t(parseI18nString(plugin.intro, lang))
          }));
        }
      } catch (error) {
        console.error('Failed to load tool sub items:', error);
        throw error;
      }
    },
    [i18n?.language, t]
  );

  // 处理从编辑器添加工具的回调
  const handleAddToolFromEditor = useCallback(
    (toolData: EditorToolAddData): string => {
      const instanceId = `tool_${getNanoid(6)}`;

      console.log('handleAddToolFromEditor - 接收到工具数据:', toolData);
      console.log('handleAddToolFromEditor - 生成的instanceId:', instanceId);

      // 根据是否有子项来确定工具配置
      const toolName = toolData.subItemLabel || toolData.toolName;
      const toolKey = toolData.subItemKey || toolData.toolKey;

      // 先创建一个临时的工具对象
      const tempTool = {
        id: instanceId,
        pluginId: toolData.parentKey || toolData.toolKey,
        templateType: 'tools' as const,
        flowNodeType: FlowNodeTypeEnum.tool,
        avatar: toolData.toolAvatar,
        name: toolName,
        intro: '',
        showStatus: true,
        isTool: true,
        catchError: false,
        version: '',
        versionLabel: '',
        isLatestVersion: true,
        showSourceHandle: true,
        showTargetHandle: true,
        currentCost: 0,
        systemKeyCost: 0,
        hasTokenFee: false,
        hasSystemSecret: false,
        isFolder: false,
        inputs: [],
        outputs: [],
        toolConfig: {},
        // 如果是子项，记录相关信息
        ...(toolData.subItemKey && {
          subItemKey: toolData.subItemKey,
          parentKey: toolData.parentKey
        })
      };

      setAppForm((state) => ({
        ...state,
        selectedTools: [...state.selectedTools, tempTool]
      }));

      (async () => {
        try {
          const fullTemplate = await getPreviewPluginNode({
            appId: toolData.parentKey || toolData.toolKey
          });

          const completeTool = {
            ...tempTool,
            pluginId: fullTemplate.pluginId || tempTool.pluginId,
            templateType: fullTemplate.templateType || tempTool.templateType,
            flowNodeType: fullTemplate.flowNodeType || tempTool.flowNodeType,
            intro: fullTemplate.intro || tempTool.intro,
            showStatus: fullTemplate.showStatus ?? tempTool.showStatus,
            catchError: fullTemplate.catchError ?? tempTool.catchError,
            version: fullTemplate.version || tempTool.version,
            versionLabel: fullTemplate.versionLabel || tempTool.versionLabel,
            isLatestVersion: fullTemplate.isLatestVersion ?? tempTool.isLatestVersion,
            currentCost: fullTemplate.currentCost ?? tempTool.currentCost,
            systemKeyCost: fullTemplate.systemKeyCost ?? tempTool.systemKeyCost,
            hasTokenFee: fullTemplate.hasTokenFee ?? tempTool.hasTokenFee,
            hasSystemSecret: fullTemplate.hasSystemSecret ?? tempTool.hasSystemSecret,
            isFolder: fullTemplate.isFolder ?? tempTool.isFolder,
            inputs: fullTemplate.inputs || tempTool.inputs,
            outputs: fullTemplate.outputs || tempTool.outputs,
            toolConfig: fullTemplate.toolConfig || tempTool.toolConfig
          };

          // 更新selectedTools中的工具信息
          setAppForm((state) => ({
            ...state,
            selectedTools: state.selectedTools.map((tool) =>
              tool.id === instanceId ? completeTool : tool
            )
          }));

          console.log('handleAddToolFromEditor - 更新后的完整工具:', completeTool);
        } catch (error) {
          console.error('Failed to get full template:', error);
          // 如果获取失败，尝试从基础模板获取信息
          const pluginTemplate = systemPlugins.find(
            (plugin) => plugin.id === (toolData.parentKey || toolData.toolKey)
          );

          if (pluginTemplate) {
            const fallbackTool = {
              ...tempTool,
              templateType: pluginTemplate.templateType || tempTool.templateType,
              flowNodeType: pluginTemplate.flowNodeType || tempTool.flowNodeType,
              intro: pluginTemplate.intro || tempTool.intro,
              isFolder: pluginTemplate.isFolder ?? tempTool.isFolder
            };

            setAppForm((state) => ({
              ...state,
              selectedTools: state.selectedTools.map((tool) =>
                tool.id === instanceId ? fallbackTool : tool
              )
            }));

            console.log('handleAddToolFromEditor - 回退更新的工具:', fallbackTool);
          }
        }
      })();

      return instanceId;
    },
    [systemPlugins, setAppForm]
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
    </>
  );
};

export default React.memo(EditForm);
