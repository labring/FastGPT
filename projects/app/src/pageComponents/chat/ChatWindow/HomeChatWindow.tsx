import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import {
  Flex,
  Box,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Checkbox
} from '@chakra-ui/react';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { useTranslation } from 'react-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideBar from '@/components/SideBar';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import React, { useMemo, useEffect } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useLocalStorageState, useMemoizedFn, useMount } from 'ahooks';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextHead from '@/components/common/NextHead';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { form2AppWorkflow } from '@/web/core/app/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { getPreviewPluginNode } from '@/web/core/app/api/plugin';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getWebLLMModel } from '@/web/common/system/utils';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import type {
  AppFileSelectConfigType,
  AppListItemType,
  AppWhisperConfigType
} from '@fastgpt/global/core/app/type';
import ChatHeader from '@/pageComponents/chat/ChatHeader';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { ChatSidebarPaneEnum } from '../constants';

type Props = {
  myApps: AppListItemType[];
};

const defaultFileSelectConfig: AppFileSelectConfigType = {
  maxFiles: 20,
  canSelectImg: false,
  canSelectFile: true
};

const defaultWhisperConfig: AppWhisperConfigType = {
  open: true,
  autoSend: false,
  autoTTSResponse: false
};

const HomeChatWindow = ({ myApps }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();
  const { llmModelList, defaultModels, feConfigs } = useSystemStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  const availableModels = useMemo(
    () => llmModelList.map((model) => ({ value: model.model, label: model.name })),
    [llmModelList]
  );
  const [selectedModel, setSelectedModel] = useLocalStorageState('chat_home_model', {
    defaultValue: defaultModels.llm?.model
  });

  const availableTools = useMemo(
    () => chatSettings?.selectedTools || [],
    [chatSettings?.selectedTools]
  );
  const [selectedToolIds = [], setSelectedToolIds] = useLocalStorageState<string[]>(
    'chat_home_tools',
    {
      defaultValue: []
    }
  );
  const selectedTools = useMemo(() => {
    return availableTools.filter((tool) => selectedToolIds.includes(tool.pluginId));
  }, [availableTools, selectedToolIds]);
  // If selected ToolIds not in availableTools, Remove it
  useEffect(() => {
    if (!chatSettings?.selectedTools) return;
    setSelectedToolIds(
      selectedToolIds.filter((id) => availableTools.some((tool) => tool.pluginId === id))
    );
  }, [availableTools, chatSettings?.selectedTools]);

  // 初始化聊天数据
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current || !feConfigs?.isPlus) return;

      const modelData = getWebLLMModel(selectedModel);
      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;
      if (!res.app.chatConfig) {
        res.app.chatConfig = {
          fileSelectConfig: {
            ...defaultFileSelectConfig,
            canSelectImg: !!modelData.vision
          },
          whisperConfig: defaultWhisperConfig
        };
      } else {
        res.app.chatConfig.fileSelectConfig = {
          ...defaultFileSelectConfig,
          canSelectImg: !!modelData.vision
        };
        res.app.chatConfig.whisperConfig = {
          ...defaultWhisperConfig,
          open: true
        };
      }

      setChatBoxData(res);

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId],
      errorToast: '',
      onFinally() {
        forbidLoadChat.current = false;
      },
      onError() {
        if (feConfigs.isPlus) {
          handlePaneChange(ChatSidebarPaneEnum.HOME);
        } else {
          handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
        }
      }
    }
  );

  useMount(() => {
    if (!feConfigs?.isPlus) {
      handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
    }
  });

  // 使用类似AppChatWindow的对话逻辑
  const onStartChat = useMemoizedFn(
    async ({
      messages,
      variables,
      controller,
      responseChatItemId,
      generatingMessage
    }: StartChatFnProps) => {
      if (!selectedModel) {
        return Promise.reject('No model selected');
      }

      const histories = messages.slice(-1);

      // 根据所选工具 ID 动态拉取节点，并填充默认输入
      const tools: FlowNodeTemplateType[] = await Promise.all(
        selectedToolIds.map(async (toolId) => {
          const node = await getPreviewPluginNode({ appId: toolId });
          node.inputs = node.inputs.map((input) => {
            const tool = availableTools.find((tool) => tool.pluginId === toolId);
            const value = tool?.inputs?.[input.key];
            return { ...input, value };
          });
          return node;
        })
      );

      const formData = getDefaultAppForm();
      formData.aiSettings.model = selectedModel;
      formData.selectedTools = tools;
      formData.chatConfig = chatBoxData.app.chatConfig || {};

      const { responseText } = await streamFetch({
        url: '/api/proApi/core/chat/chatHome',
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:home.chat_app'),
          chatId,
          ...form2AppWorkflow(formData, t)
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      onUpdateHistoryTitle({ chatId, newTitle });
      setChatBoxData((state) => ({
        ...state,
        title: newTitle
      }));

      return { responseText, isNewChat: forbidLoadChat.current };
    }
  );

  // 自定义按钮组（模型选择和工具选择）
  const InputLeftComponent = useMemo(
    () => (
      <>
        {/* 模型选择 */}
        {availableModels.length > 0 && (
          <Box flex={['1', '0']} w={[0, 'auto']}>
            <AIModelSelector
              h={['30px', '36px']}
              boxShadow={'none'}
              size="sm"
              bg={'myGray.50'}
              rounded="full"
              list={availableModels}
              value={selectedModel}
              onChange={async (model) => {
                setChatBoxData((state) => ({
                  ...state,
                  app: {
                    ...state.app,
                    chatConfig: {
                      ...state.app.chatConfig,
                      fileSelectConfig: {
                        ...defaultFileSelectConfig,
                        canSelectImg: !!getWebLLMModel(model).vision
                      }
                    }
                  }
                }));
                setSelectedModel(model);
              }}
            />
          </Box>
        )}

        {/* 工具选择下拉框 */}
        {availableTools.length > 0 && (
          <Menu isLazy closeOnSelect={false} autoSelect={false}>
            <MenuButton
              as={Button}
              h={['30px', '36px']}
              boxShadow={'none'}
              size="sm"
              rounded="full"
              variant="whiteBase"
              leftIcon={<MyIcon name="core/app/toolCall" w="14px" />}
              _active={{
                transform: 'none'
              }}
              {...(selectedTools.length > 0 && {
                color: 'primary.600',
                bg: 'primary.50',
                borderColor: 'primary.200'
              })}
            >
              {isPc
                ? selectedTools.length > 0
                  ? t('chat:home.tools', { num: selectedTools.length })
                  : t('chat:home.select_tools')
                : `：${selectedTools.length}`}
            </MenuButton>
            <MenuList px={2}>
              {availableTools.map((tool) => {
                const toolId = tool.pluginId || '';
                const isSelected = selectedToolIds.includes(toolId);

                return (
                  <MenuItem
                    key={toolId}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedToolIds(
                        selectedToolIds.includes(toolId)
                          ? selectedToolIds.filter((id) => id !== toolId)
                          : [...selectedToolIds, toolId]
                      );
                    }}
                    closeOnSelect={false}
                    _hover={{
                      bg: 'primary.50'
                    }}
                    _notLast={{ mb: 1 }}
                    borderRadius={'md'}
                  >
                    <Checkbox size={'sm'} isChecked={isSelected} mr={3} />
                    <Flex alignItems="center" gap={2}>
                      <Avatar src={tool.avatar} w={5} borderRadius="xs" />
                      <Box fontSize="sm">{tool.name}</Box>
                    </Flex>
                  </MenuItem>
                );
              })}
            </MenuList>
          </Menu>
        )}
      </>
    ),
    [
      availableModels,
      selectedModel,
      availableTools,
      selectedTools.length,
      t,
      setSelectedModel,
      selectedToolIds,
      setSelectedToolIds,
      setChatBoxData,
      isPc
    ]
  );

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']}>
      {/* set window title and icon */}
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      {/* show history slider */}
      {isPc || !appId ? (
        <SideBar externalTrigger={Boolean(datasetCiteData)}>
          <ChatHistorySlider
            customSliderTitle={t('chat:history_slider.home.title')}
            confirmClearText={t('common:core.chat.Confirm to clear history')}
          />
        </SideBar>
      ) : (
        <Drawer
          size="xs"
          placement="left"
          autoFocus={false}
          isOpen={isOpenSlider}
          onClose={onCloseSlider}
        >
          <DrawerOverlay backgroundColor="rgba(255,255,255,0.5)" />
          <DrawerContent maxWidth="75vw">
            <ChatHistorySlider
              customSliderTitle={t('chat:history_slider.home.title')}
              confirmClearText={t('common:core.chat.Confirm to clear history')}
            />
          </DrawerContent>
        </Drawer>
      )}

      {/* chat container */}
      <Flex
        position={'relative'}
        h={[0, '100%']}
        w={['100%', 0]}
        flex={'1 0 0'}
        flexDirection={'column'}
      >
        {isPc ? (
          chatBoxData?.title && (
            <Flex
              py={3}
              bg="white"
              fontWeight={500}
              color="myGray.600"
              alignItems="center"
              justifyContent="center"
              borderBottom="sm"
            >
              {chatBoxData?.title}
            </Flex>
          )
        ) : (
          <ChatHeader
            showHistory
            apps={myApps}
            history={chatRecords}
            totalRecordsCount={totalRecordsCount}
          />
        )}

        <Box flex={'1 0 0'} bg={'white'}>
          <ChatBox
            appId={appId}
            chatId={chatId}
            isReady={!loading}
            feedbackType={'user'}
            chatType={ChatTypeEnum.home}
            outLinkAuthData={outLinkAuthData}
            onStartChat={onStartChat}
            InputLeftComponent={InputLeftComponent}
            dialogTips={chatSettings?.dialogTips}
            wideLogo={chatSettings?.wideLogoUrl}
            slogan={chatSettings?.slogan}
          />
        </Box>
      </Flex>
    </Flex>
  );
};

export default HomeChatWindow;
