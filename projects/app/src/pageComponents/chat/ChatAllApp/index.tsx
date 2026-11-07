import React, { useMemo, useState } from 'react';
import { Box, Flex, Input, InputGroup, InputRightElement } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'react-i18next';
import ChatFavouriteApp from '@/pageComponents/chat/ChatFavouriteApp';
import ChatTeamApp from '@/pageComponents/chat/ChatTeamApp';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { ChatAllAppTabEnum, ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';

/**
 * 全部应用页只负责承载原有精选应用和团队应用列表，保持两个已有组件的筛选、
 * 搜索、移动端侧栏和跳转逻辑不变。
 *
 * 当前子页签由 URL 的 tab 参数驱动（如 /chat?pane=aa&tab=ta），
 * 便于外链直达团队应用、刷新后保持页签。
 */
const ChatAllApp = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const showFavouriteApps = !!feConfigs.isPlus;
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  /**
   * tab 参数按 pane 复用（设置页使用 h/d/l/f），因此这里只接受全部应用页自己的取值，
   * 其他 pane 的 tab 或非法值都会回退到默认页签。
   */
  const isChatAllAppTab = (value: unknown): value is ChatAllAppTabEnum =>
    typeof value === 'string' &&
    Object.values(ChatAllAppTabEnum).includes(value as ChatAllAppTabEnum);

  const tabQuery = router.query.tab;
  // 非商业版没有精选应用页签，直接固定为团队应用。
  // 这里只从 URL 派生、不在 mount 时回写，避免与 pane 初始化互相触发 replace。
  const activeTab =
    showFavouriteApps && isChatAllAppTab(tabQuery)
      ? tabQuery
      : showFavouriteApps
        ? ChatAllAppTabEnum.FAVOURITE_APPS
        : ChatAllAppTabEnum.TEAM_APPS;

  // 页签切换写回 URL，保证刷新、分享后仍停留在同一页签。
  const setTab = (tab: ChatAllAppTabEnum) => {
    handlePaneChange(ChatSidebarPaneEnum.ALL_APPS, undefined, tab);
  };

  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileSearchKey, setMobileSearchKey] = useState('');

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);
  const wideLogoUrl = useContextSelector(ChatPageContext, (v) => v.chatSettings?.wideLogoUrl);

  const tabOptions = useMemo(
    () => [
      ...(showFavouriteApps
        ? [
            {
              label: t('chat:sidebar.favourite_apps'),
              value: ChatAllAppTabEnum.FAVOURITE_APPS
            }
          ]
        : []),
      {
        label: t('chat:sidebar.team_apps'),
        value: ChatAllAppTabEnum.TEAM_APPS
      }
    ],
    [showFavouriteApps, t]
  );

  if (!isPc) {
    return (
      <Flex flexDirection="column" h="100%" bg="white">
        <Flex
          h="48px"
          px="16px"
          py="6px"
          alignItems="center"
          justifyContent="space-between"
          flexShrink={0}
        >
          <Flex
            w="36px"
            h="36px"
            alignItems="center"
            justifyContent="center"
            color="myGray.600"
            cursor="pointer"
            onClick={onOpenSlider}
          >
            <MyIcon w="24px" color="currentColor" name="core/chat/sidebar/menu" />
          </Flex>

          <Box fontSize="16px" fontWeight={600} color="myGray.900">
            {t('chat:all_apps.title')}
          </Box>

          <Flex
            w="36px"
            h="36px"
            alignItems="center"
            justifyContent="center"
            color="myGray.600"
            cursor="pointer"
            onClick={() => setShowMobileSearch((state) => !state)}
          >
            <MyIcon w="24px" color="currentColor" name="common/searchLight" />
          </Flex>
        </Flex>

        <ChatSliderMobileDrawer
          showList={false}
          showMenu={false}
          banner={wideLogoUrl}
          menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
        />

        <Box px="16px" py="8px" flexShrink={0}>
          <FillRowTabs<ChatAllAppTabEnum>
            list={tabOptions}
            value={activeTab}
            onChange={setTab}
            outerPadding="4px"
            outerHeight="40px"
            itemHeight="32px"
            labelSize="16px"
            w="100%"
          />
        </Box>

        {showMobileSearch && (
          <Box px={5} pt={4} flexShrink={0}>
            <InputGroup>
              <Input
                h="36px"
                lineHeight="36px"
                py={0}
                pr="36px"
                bg="white"
                placeholder={t('app:search_app')}
                maxLength={30}
                value={mobileSearchKey}
                onChange={(e) => setMobileSearchKey(e.target.value)}
              />
              {mobileSearchKey && (
                <InputRightElement h="36px" w="36px">
                  <Flex
                    w="24px"
                    h="24px"
                    p="4px"
                    borderRadius="full"
                    bg="myGray.100"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onClick={() => setMobileSearchKey('')}
                  >
                    <MyIcon name="common/closeLight" w="16px" color="myGray.500" />
                  </Flex>
                </InputRightElement>
              )}
            </InputGroup>
          </Box>
        )}

        <Box flex="1 0 0" h={0} overflow="hidden">
          {showFavouriteApps && activeTab === ChatAllAppTabEnum.FAVOURITE_APPS && (
            <ChatFavouriteApp hideMobileHeader mobileSearchKey={mobileSearchKey} />
          )}
          {activeTab === ChatAllAppTabEnum.TEAM_APPS && (
            <ChatTeamApp hideMobileHeader mobileSearchKey={mobileSearchKey} />
          )}
        </Box>
      </Flex>
    );
  }

  return (
    <Flex flexDirection="column" h="100%">
      <Box px={[4, 6]} pt={[4, 6]}>
        <FillRowTabs<ChatAllAppTabEnum>
          list={tabOptions}
          value={activeTab}
          onChange={setTab}
          outerPadding="4px"
          outerHeight="40px"
          itemHeight="32px"
          labelSize="16px"
        />
      </Box>

      <Box flex="1 0 0" h={0}>
        {showFavouriteApps && activeTab === ChatAllAppTabEnum.FAVOURITE_APPS && (
          <ChatFavouriteApp />
        )}
        {activeTab === ChatAllAppTabEnum.TEAM_APPS && <ChatTeamApp />}
      </Box>
    </Flex>
  );
};

export default ChatAllApp;
