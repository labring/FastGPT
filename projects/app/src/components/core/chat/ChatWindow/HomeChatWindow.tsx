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
import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import router from 'next/router';
import { getPreviewPluginNode } from '@/web/core/app/api/plugin';

type Props = {
  settings: ChatSettingSchema | null;
};

const HomeChatWindow: React.FC<Props> = ({ settings }) => {
  //------------ hooks ------------//
  const { t } = useTranslation();
  const { isPc } = useSystem();

  //------------ stores ------------//
  const { userInfo } = useUserStore();
  const { llmModelList } = useSystemStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  //------------ context states ------------//
  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const forbidLoadChat = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const onUpdateHistoryTitle = useContextSelector(ChatContext, (v) => v.onUpdateHistoryTitle);

  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);

  //------------ states ------------//
  const availableModels = useMemo(
    () => llmModelList.map((model) => ({ value: model.model, label: model.name })),
    [llmModelList]
  );

  // settings中配置的可用工具（从配置加载）
  const [availableTools, setAvailableTools] = useState<ChatSettingSchema['selectedTools']>([]);
  // 用户选择的工具 ID 列表
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(availableModels[0]?.value || '');

  // 工作流数据
  const [workflowData, setWorkflowData] = useState(() => form2AppWorkflow(getDefaultAppForm(), t));

  const loadChatSettings = useCallback(async () => {
    try {
      if (settings?.selectedTools) {
        setAvailableTools(settings.selectedTools);
      }
    } catch (error) {
      console.error('Failed to load chat settings:', error);
    }
  }, [settings]);

  // 加载聊天设置并构建工作流
  useEffect(() => {
    if (appId) {
      loadChatSettings();
    }
  }, [appId, loadChatSettings]);

  // 计算选中的工具对象
  const selectedTools = useMemo(() => {
    return availableTools.filter((tool) => selectedToolIds.includes(tool.id));
  }, [availableTools, selectedToolIds]);

  // 工具选择处理
  const handleToolToggle = useCallback((toolId: string) => {
    setSelectedToolIds((prev) => {
      if (prev.includes(toolId)) {
        return prev.filter((id) => id !== toolId);
      } else {
        return [...prev, toolId];
      }
    });
  }, []);

  // 模型选择处理
  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
  }, []);

  // 构建工作流数据
  useEffect(() => {
    (async () => {
      const formData = getDefaultAppForm();
      formData.aiSettings.model = selectedModel;
      let tools = [];
      for (const tool of selectedTools) {
        if (!tool.pluginId) continue;
        const node = await getPreviewPluginNode({ appId: tool.pluginId });
        tools.push(node);
      }
      formData.selectedTools = tools;
      const { nodes, edges, chatConfig } = form2AppWorkflow(formData, t);
      setWorkflowData({ nodes, edges, chatConfig });
    })();
  }, [selectedModel, selectedTools, t]);

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
      onError(e: any) {
        if (e?.code && e.code >= 502000) {
          router.replace({
            query: {
              ...router.query,
              appId
            }
          });
        }
      },
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
      const { responseText } = await streamFetch({
        url: '/api/proApi/core/chat/chatHome',
        data: {
          messages: histories,
          variables,
          responseChatItemId,
          appId,
          appName: t('chat:home.chat_app', { name: 'FastGPT' }),
          chatId,
          nodes: workflowData.nodes,
          edges: workflowData.edges,
          chatConfig: workflowData.chatConfig
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);
      onUpdateHistoryTitle({ chatId, newTitle });

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
        <Menu closeOnSelect={false}>
          <MenuButton
            as={Button}
            size="sm"
            rounded="full"
            variant="outline"
            color={selectedTools.length > 0 ? 'primary.500' : 'gray.500'}
            bg={selectedTools.length > 0 ? 'primary.50' : 'transparent'}
            leftIcon={<MyIcon name="core/app/toolCall" w="14px" />}
          >
            {selectedTools.length > 0 ? `工具：${selectedTools.length}` : '选择工具'}
          </MenuButton>
          <MenuList>
            {availableTools.map((tool) => {
              const toolId = tool.id;
              const isSelected = selectedToolIds.includes(toolId);
              return (
                <MenuItem
                  key={toolId}
                  onClick={() => handleToolToggle(toolId)}
                  closeOnSelect={false}
                >
                  <Checkbox
                    isChecked={isSelected}
                    mr={3}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleToolToggle(toolId)}
                  />
                  <Flex alignItems="center" gap={2}>
                    <Avatar src={tool.avatar} w={4} />
                    <Box fontSize="xs">{tool.name}</Box>
                  </Flex>
                </MenuItem>
              );
            })}
            {availableTools.length === 0 && <MenuItem isDisabled>暂无可用工具</MenuItem>}
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
      handleToolToggle
    ]
  );

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']}>
      {/* set window title and icon */}
      <NextHead title={settings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

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
        <Box flex={'1 0 0'} bg={'white'}>
          <ChatBox
            showHomeChatEmptyIntro
            dialogTips={settings?.dialogTips}
            wideLogo={settings?.wideLogoUrl}
            slogan={settings?.slogan}
            appId={appId}
            chatId={chatId}
            isReady={!loading}
            feedbackType={'user'}
            chatType={ChatTypeEnum.chat}
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
