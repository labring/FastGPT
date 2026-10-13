import React from 'react';
import SideBar from '@/components/SideBar';
import NextHead from '@/components/common/NextHead';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import ToolMenu from '@/pageComponents/chat/ToolMenu';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import ChatHistorySidebar, {
  CHAT_HISTORY_SLIDER_PC_WIDTH
} from '@/pageComponents/chat/slider/ChatSliderSidebar';
import { streamFetch } from '@/web/common/api/fetch';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getModelDetail } from '@/web/core/ai/model/modelData';
import { useModelDefault } from '@/web/core/ai/model/useModelDefault';
import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { useModelSummary } from '@/web/core/ai/model/useModelSummary';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import { getInitChatInfo } from '@/web/core/chat/api';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { getDisplayHistoryTitle } from '@/web/core/chat/context/historyTitleUtils';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { postMarkChatRead } from '@/web/core/chat/history/api';
import { getAppChatSourceKey } from '@/web/core/chat/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure
} from '@chakra-ui/react';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import type { AppWhisperConfigType } from '@fastgpt/global/core/app/type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { homeChatFileSelectConfig } from '@fastgpt/global/core/chat/setting/constants';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useLocalStorageState, useMemoizedFn, useMount } from 'ahooks';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import { ChatSidebarPaneEnum } from '../constants';
import ChatAIModelSelector from './ChatAIModelSelector';
import ChatWindowHeader from './ChatWindowHeader';
import MobileModelSelectorDrawer from './MobileModelSelectorDrawer';
import { mobileChatHeaderIconButtonStyle } from './headerIconButtonStyle';
import { useAppChatGenerateStatusSync } from './useAppChatGenerateStatusSync';

const defaultFileSelectConfig: AppFileSelectConfigType = {
  ...homeChatFileSelectConfig,
  canSelectImg: false
};

const defaultWhisperConfig: AppWhisperConfigType = {
  open: true,
  autoSend: false,
  autoTTSResponse: false
};

const HomeChatWindow = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const {
    isOpen: isModelDrawerOpen,
    onOpen: onOpenModelDrawer,
    onClose: onCloseModelDrawer
  } = useDisclosure();

  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { chatId, appId, outLinkAuthData } = useChatStore();

  const forbidLoadChatRef = useContextSelector(ChatContext, (v) => v.forbidLoadChat);
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);
  const currentHistory = useContextSelector(ChatContext, (v) =>
    v.histories.find((item) => item.chatId === chatId && item.appId === appId)
  );

  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const isShowCite = useContextSelector(ChatItemContext, (v) => v.isShowCite);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);

  const chatSettings = useContextSelector(ChatPageContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const homeAppId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId || '');
  const refreshRecentlyUsed = useContextSelector(ChatPageContext, (v) => v.refreshRecentlyUsed);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const onChatGenerateStatusChange = useAppChatGenerateStatusSync();

  const isCurrentChatReady = chatBoxData.appId === appId && chatBoxData.chatId === chatId;
  const chatWindowTitle = getDisplayHistoryTitle({
    customTitle: currentHistory?.customTitle,
    title: isCurrentChatReady ? chatBoxData.title : undefined,
    fallbackTitle: t('common:core.chat.New Chat')
  });
  const { SandboxEntryIcon } = useSandboxStatus({ appId, chatId, outLinkAuthData });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId,
    chatId,
    outLinkAuthData
  });

  const [selectedModel, setSelectedModel] = useLocalStorageState<string>('chat_home_model', {
    defaultValue: ''
  });
  const { model: defaultModel } = useModelDefault({
    modelType: ModelTypeEnum.llm,
    enabled: !selectedModel
  });
  const { model: selectedModelData } = useModelDetail({
    modelType: ModelTypeEnum.llm,
    modelId: selectedModel
  });
  const { detail: selectedSummary } = useModelSummary({ modelId: selectedModel });
  useEffect(() => {
    if (!selectedModel && defaultModel) setSelectedModel(defaultModel.modelId);
  }, [selectedModel, defaultModel, setSelectedModel]);
  useEffect(() => {
    setChatBoxData((state) => ({
      ...state,
      app: {
        ...state.app,
        chatConfig: {
          ...state.app.chatConfig,
          fileSelectConfig: {
            ...defaultFileSelectConfig,
            canSelectImg: !!selectedModelData?.config.vision
          }
        }
      }
    }));
  }, [selectedModelData, setChatBoxData]);
  const onChangeModel = useMemoizedFn((modelId: string) => {
    setSelectedModel(modelId);
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
    return availableTools.filter((tool) =>
      selectedToolIds.includes(getToolIdentityKey(tool.pluginId, tool.source))
    );
  }, [availableTools, selectedToolIds]);
  // If selected ToolIds not in availableTools, Remove it
  useEffect(() => {
    if (!chatSettings?.selectedTools) return;
    setSelectedToolIds(
      selectedToolIds
        .map((id) => {
          // 兼容旧版只保存 pluginId 的首页工具选择。
          if (availableTools.some((tool) => tool.pluginId === id)) {
            return getToolIdentityKey(id, undefined);
          }
          return id;
        })
        .filter((id) =>
          availableTools.some((tool) => getToolIdentityKey(tool.pluginId, tool.source) === id)
        )
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTools, chatSettings?.selectedTools]);

  // 初始化聊天数据
  const { loading } = useRequest(
    async () => {
      if (!appId || forbidLoadChatRef.current || !feConfigs?.isPlus) return;

      const modelData = await getModelDetail({
        modelId: selectedModel,
        modelType: ModelTypeEnum.llm
      });
      const res = await getInitChatInfo({ appId, chatId });
      res.userAvatar = userInfo?.avatar ?? undefined;

      if (!res.app.chatConfig) {
        res.app.chatConfig = {
          fileSelectConfig: {
            ...defaultFileSelectConfig,
            canSelectImg: !!modelData?.config.vision
          },
          whisperConfig: defaultWhisperConfig
        };
      } else {
        res.app.chatConfig.fileSelectConfig = {
          ...defaultFileSelectConfig,
          canSelectImg: !!modelData?.config.vision
        };
        res.app.chatConfig.whisperConfig = {
          ...defaultWhisperConfig,
          open: true
        };
      }

      setChatBoxData({
        ...res,
        appId,
        sourceKey: getAppChatSourceKey(appId)
      });

      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });
    },
    {
      manual: false,
      // Plus 配置晚于首屏就绪时，需重新拉会话状态（含 chatGenerateStatus，供流恢复）
      refreshDeps: [appId, chatId, feConfigs?.isPlus],
      onFinally() {
        forbidLoadChatRef.current = false;
      },
      onError() {
        if (feConfigs.isPlus) {
          handlePaneChange(ChatSidebarPaneEnum.HOME);
        } else {
          handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
        }
      }
    }
  );

  const handleSwitchQuickApp = async (id: string) => {
    handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, id);
  };

  useMount(() => {
    if (!feConfigs?.isPlus) {
      handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
    }
  });

  // 使用类似 AppChatWindow 的对话逻辑
  const onStartChat = useMemoizedFn(
    async ({
      messages,
      variables,
      controller,
      responseChatItemId,
      generatingMessage
    }: StartChatFnProps) => {
      if (!appId) {
        return Promise.reject(new UserError('appId is empty'));
      }

      const histories = messages.slice(-1);

      // Home chat uses the selected model and tools. Quick apps enter the normal app chat pane.
      if (!selectedModel) {
        return Promise.reject(new UserError('No model selected'));
      }

      const tools = (
        await Promise.all(
          selectedToolIds.map(async (toolKey) => {
            const tool = availableTools.find(
              (item) => getToolIdentityKey(item.pluginId, item.source) === toolKey
            );
            if (!tool) return;
            const node = await getClientToolPreviewNode({
              appId: tool.pluginId,
              versionId: '',
              source: tool.source
            });
            node.inputs = node.inputs.map((input) => {
              const value = tool?.inputs?.[input.key];
              return { ...input, value };
            });
            return node;
          })
        )
      ).filter((tool): tool is FlowNodeTemplateType => !!tool);

      const formData = getDefaultAppForm();
      formData.aiSettings.modelId = selectedModel;
      formData.aiSettings.model = undefined;
      formData.aiSettings.aiChatReasoning = true;
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
          retainDatasetCite: isShowCite,
          showSkillReferences,
          ...form2AppWorkflow(formData, t)
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      refreshRecentlyUsed();

      return { responseText, isNewChat: forbidLoadChatRef.current };
    }
  );

  // 自定义按钮组（模型选择和工具选择）
  const InputLeftComponent = useMemo(
    () => (
      <>
        {/* 模型选择 */}
        {isPc && (
          <Box w={'fit-content'} maxW={'300px'} flex={'0 1 auto'} minW={0}>
            <ChatAIModelSelector
              modelType={ModelTypeEnum.llm}
              h={'36px'}
              w={'fit-content'}
              maxW={'300px'}
              boxShadow={'none'}
              size="sm"
              bg={'myGray.50'}
              rounded="10px"
              value={selectedModel}
              onChange={onChangeModel}
            />
          </Box>
        )}

        {/* 工具选择下拉框 */}
        {availableTools.length > 0 && (
          <Menu isLazy closeOnSelect={false} autoSelect={false}>
            <MenuButton
              as={Button}
              h={'36px'}
              boxShadow={'none'}
              size="sm"
              rounded="full"
              variant="whiteBase"
              leftIcon={<MyIcon name="core/app/toolCall" w="14px" />}
              flexShrink={0}
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
                : t('chat:home.tools', { num: selectedTools.length })}
            </MenuButton>
            <MenuList px={2}>
              {availableTools.map((tool) => {
                const toolId = tool.pluginId || '';
                const toolKey = getToolIdentityKey(toolId, tool.source);
                const isSelected = selectedToolIds.includes(toolKey);

                return (
                  <MenuItem
                    key={toolKey}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedToolIds(
                        selectedToolIds.includes(toolKey)
                          ? selectedToolIds.filter((id) => id !== toolKey)
                          : [...selectedToolIds, toolKey]
                      );
                    }}
                    closeOnSelect={false}
                    _hover={{
                      bg: 'primary.50'
                    }}
                    _notLast={{ mb: 1 }}
                    borderRadius={'md'}
                  >
                    <Flex alignItems="center" gap={3} minW={0}>
                      <Checkbox size={'sm'} isChecked={isSelected} />
                      <Flex alignItems="center" gap={2} minW={0}>
                        <Avatar src={tool.avatar} w={5} borderRadius="xs" />
                        <Box fontSize="sm">{tool.name}</Box>
                      </Flex>
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
      selectedModel,
      availableTools,
      selectedTools,
      t,
      setSelectedModel,
      selectedToolIds,
      setSelectedToolIds,
      setChatBoxData,
      isPc,
      onChangeModel
    ]
  );

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']}>
      {/* set window title and icon */}
      <NextHead title={chatSettings?.homeTabTitle} icon={getWebReqUrl(feConfigs?.favicon)} />

      {/* show history slider */}
      {isPc ? (
        <SideBar
          w={`0 0 ${CHAT_HISTORY_SLIDER_PC_WIDTH}`}
          externalTrigger={Boolean(datasetCiteData)}
        >
          <ChatHistorySidebar
            title={appId === homeAppId ? t('chat:history_slider.home.title') : undefined}
            menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
          />
        </SideBar>
      ) : (
        <ChatSliderMobileDrawer
          banner={chatSettings?.wideLogoUrl}
          menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
        />
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
          <ChatWindowHeader
            title={chatWindowTitle}
            history={chatRecords}
            chatType={ChatTypeEnum.home}
            rightActions={<SandboxEntryIcon onOpen={onOpenSandboxModal} />}
          />
        ) : (
          <Flex
            h="48px"
            px={4}
            bg="white"
            alignItems="center"
            justifyContent="space-between"
            color="myGray.600"
          >
            <IconButton
              aria-label="Open history"
              icon={<MyIcon name="core/chat/sidebar/menu" w="20px" h="20px" color="currentColor" />}
              variant="unstyled"
              {...mobileChatHeaderIconButtonStyle}
              onClick={onOpenSlider}
            />
            <Flex alignItems="center" gap={1} minW={0} onClick={onOpenModelDrawer}>
              <Box
                fontSize="16px"
                fontWeight={500}
                color="myGray.900"
                className="textEllipsis"
                maxW="200px"
              >
                {selectedSummary && 'name' in selectedSummary
                  ? selectedSummary.name
                  : selectedModel}
              </Box>
              <MyIcon name="core/chat/chevronDown" w="16px" h="16px" color="myGray.500" />
            </Flex>
            <Box minW="36px">
              <ToolMenu history={chatRecords} chatType={ChatTypeEnum.home} />
            </Box>
          </Flex>
        )}

        <MobileModelSelectorDrawer
          isOpen={isModelDrawerOpen}
          value={selectedModel}
          onChange={onChangeModel}
          onClose={onCloseModelDrawer}
        />

        <Box flex={'1 0 0'} bg={'white'}>
          <ChatBox
            sourceTarget={{ sourceType: ChatSourceTypeEnum.app, sourceId: appId }}
            chatId={chatId}
            isReady={!loading && !!appId && isCurrentChatReady}
            features={{
              autoResume: true,
              feedbackType: 'user',
              quickReplies: true,
              inputGuide: true,
              voice: true,
              tts: true,
              sandbox: true
            }}
            chatType={ChatTypeEnum.home}
            slogan={chatSettings?.slogan}
            outLinkAuthData={outLinkAuthData}
            wideLogo={chatSettings?.wideLogoUrl}
            squareLogo={chatSettings?.squareLogoUrl}
            dialogTips={chatSettings?.dialogTips}
            InputLeftComponent={InputLeftComponent}
            onStartChat={onStartChat}
            onMarkChatRead={postMarkChatRead}
            onChatGenerateStatusChange={onChatGenerateStatusChange}
            quickAppList={chatSettings?.quickAppList || []}
            onSwitchQuickApp={handleSwitchQuickApp}
          />
        </Box>
        <SandboxEditorModal />
      </Flex>
    </Flex>
  );
};

export default HomeChatWindow;
