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
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { streamFetch } from '@/web/common/api/fetch';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { useMemoizedFn } from 'ahooks';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getInitChatInfo } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import NextHead from '@/components/common/NextHead';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import router from 'next/router';
import { getPreviewPluginNode } from '@/web/core/app/api/plugin';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { useChatSettingContext } from '@/web/core/chat/context/chatSettingContext';

const HomeChatWindow = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();
  const { llmModelList } = useSystemStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  const { chatSettings } = useChatSettingContext();

  const availableModels = useMemo(
    () => llmModelList.map((model) => ({ value: model.model, label: model.name })),
    [llmModelList]
  );
  const [selectedModel, setSelectedModel] = useState<string>(availableModels[0]?.value || '');

  const [availableTools, setAvailableTools] = useState<ChatSettingSchema['selectedTools']>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const selectedTools = useMemo(() => {
    return availableTools.filter((tool) => selectedToolIds.includes(tool.pluginId || ''));
  }, [availableTools, selectedToolIds]);

  const loadChatSettings = useCallback(async () => {
    try {
      if (chatSettings?.selectedTools) {
        setAvailableTools(chatSettings.selectedTools);
      }
    } catch (error) {
      console.error('Failed to load chat settings:', error);
    }
  }, [chatSettings]);

  useEffect(() => {
    if (appId) {
      loadChatSettings();
    }
  }, [appId, loadChatSettings]);

  // 工具选择处理
  const handleToolToggle = useCallback((toolId: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  }, []);

  // 模型选择处理
  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
  }, []);

  // 初始化聊天数据
  const { loading } = useRequest2(
    async () => {
      if (!appId || forbidLoadChat.current) return;

      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar;

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
      }
    }
  );

  // 使用类似AppChatWindow的对话逻辑
  const onStartChat = useMemoizedFn(
    async ({
      messages,
      variables,
      controller,
      responseChatItemId,
      generatingMessage
    }: StartChatFnProps) => {
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
      const { nodes, edges, chatConfig } = form2AppWorkflow(formData, t);

      const { responseText } = await streamFetch({
        url: '/api/proApi/core/chat/chatHome',
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:home.chat_app', { name: 'FastGPT' }),
          chatId,
          nodes,
          edges,
          chatConfig
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
  const customButtonGroup = useMemo(
    () => (
      <>
        {/* 模型选择 */}
        {availableModels.length > 0 && (
          <AIModelSelector
            h="28px"
            size="sm"
            list={availableModels}
            value={selectedModel}
            onChange={handleModelChange}
          />
        )}

        {/* 工具选择下拉框 */}
        <Menu isLazy closeOnSelect={false}>
          <MenuButton
            as={Button}
            size="sm"
            rounded="full"
            variant="outline"
            color={selectedTools.length > 0 ? 'primary.500' : 'gray.500'}
            bg={selectedTools.length > 0 ? 'primary.50' : 'transparent'}
            leftIcon={<MyIcon name="core/app/toolCall" w="14px" />}
          >
            {selectedTools.length > 0
              ? t('chat:home.tools', { num: selectedTools.length })
              : t('chat:home.select_tools')}
          </MenuButton>
          <MenuList>
            {availableTools.map((tool) => {
              const toolId = tool.pluginId || '';
              const isSelected = selectedToolIds.includes(toolId);
              return (
                <MenuItem
                  key={toolId}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleToolToggle(toolId);
                  }}
                  closeOnSelect={false}
                >
                  <Checkbox isChecked={isSelected} mr={3} />
                  <Flex alignItems="center" gap={2}>
                    <Avatar src={tool.avatar} w={4} rounded="8px" />
                    <Box fontSize="xs">{tool.name}</Box>
                  </Flex>
                </MenuItem>
              );
            })}
            {availableTools.length === 0 && (
              <MenuItem isDisabled fontSize="xs" color="myGray.500">
                <Box textAlign="center" flex="1">
                  {t('chat:home.no_available_tools')}
                </Box>
              </MenuItem>
            )}
          </MenuList>
        </Menu>
      </>
    ),
    [
      availableModels,
      selectedModel,
      selectedTools,
      availableTools,
      selectedToolIds,
      handleModelChange,
      handleToolToggle,
      t
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
        <Flex
          py={4}
          bg="white"
          fontWeight={500}
          color="myGray.900"
          alignItems="center"
          justifyContent="center"
        >
          {chatBoxData?.title}
        </Flex>

        <Box flex={'1 0 0'} bg={'white'}>
          <ChatBox
            dialogTips={chatSettings?.dialogTips}
            wideLogo={chatSettings?.wideLogoUrl}
            slogan={chatSettings?.slogan}
            showHomeChatEmptyIntro
            appId={appId}
            chatId={chatId}
            isReady={!loading}
            feedbackType={'user'}
            chatType={ChatTypeEnum.home}
            outLinkAuthData={outLinkAuthData}
            onStartChat={onStartChat}
            customButtonGroup={customButtonGroup}
          />
        </Box>
      </Flex>
    </Flex>
  );
};

export default HomeChatWindow;
