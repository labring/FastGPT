import React, { useState, useCallback } from 'react';
import { Flex, Box, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import ToolMenu from './ToolMenu';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { useTranslation } from 'next-i18next';

import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useRouter } from 'next/router';
import {
  type GetResourceFolderListProps,
  type GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import {
  ChatSidebarPaneEnum,
  DEFAULT_LOGO_BANNER_COLLAPSED_URL
} from '@/pageComponents/chat/constants';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { usePathname } from 'next/navigation';
import type { ChatSettingType } from '@fastgpt/global/core/chat/setting/type';

import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

const ChatHeader = ({
  history,
  showHistory,
  totalRecordsCount,

  pane,
  chatSettings,
  reserveSpace
}: {
  pane: ChatSidebarPaneEnum;
  chatSettings?: ChatSettingType;

  history: ChatItemType[];
  showHistory?: boolean;
  totalRecordsCount: number;
  reserveSpace?: boolean;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { source } = useChatStore();

  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);
  const isPlugin = chatData.app.type === AppTypeEnum.workflowTool;
  const isShare = source === 'share';
  const chatType = isShare ? ChatTypeEnum.share : ChatTypeEnum.chat;

  return isPc && isPlugin ? null : (
    <Flex
      alignItems={'center'}
      px={[3, 5]}
      minH={['46px', '60px']}
      borderBottom={'sm'}
      color={'myGray.900'}
      fontSize={'sm'}
    >
      {isPc ? (
        <>
          <PcHeader
            totalRecordsCount={totalRecordsCount}
            title={chatData.title || t('common:core.chat.New Chat')}
            chatModels={chatData.app.chatModels}
            chatId={chatData.chatId || ''}
          />
          <Box flex={1} />
        </>
      ) : (
        <MobileHeader
          appId={chatData.appId}
          name={
            pane === ChatSidebarPaneEnum.HOME && !isShare
              ? chatSettings?.homeTabTitle || 'FastGPT'
              : chatData.app.name
          }
          avatar={
            pane === ChatSidebarPaneEnum.HOME && !isShare
              ? chatSettings?.squareLogoUrl || DEFAULT_LOGO_BANNER_COLLAPSED_URL
              : chatData.app.avatar
          }
          showHistory={showHistory}
        />
      )}

      <Flex gap={2} alignItems={'center'}>
        {!isVariableVisible && <VariablePopover chatType={chatType} />}

        {/* control */}
        {!isPlugin && <ToolMenu history={history} reserveSpace={reserveSpace} />}
      </Flex>
    </Flex>
  );
};

const MobileDrawer = ({ onCloseDrawer, appId }: { onCloseDrawer: () => void; appId: string }) => {
  enum TabEnum {
    recently = 'recently',
    app = 'app'
  }
  const { t } = useTranslation();

  const { setChatId } = useChatStore();
  const myApps = useContextSelector(ChatPageContext, (v) => v.myApps);

  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.recently);

  const getAppList = useCallback(async ({ parentId }: GetResourceFolderListProps) => {
    return getMyApps({ parentId }).then((res) =>
      res.map<GetResourceListItemResponse>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: AppFolderTypeList.includes(item.type)
      }))
    );
  }, []);

  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  const onclickApp = (id: string) => {
    handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, id);
    onCloseDrawer();
    setChatId();
  };

  return (
    <Box
      position={'absolute'}
      top={'45px'}
      w={'100vw'}
      h={'calc(100% - 45px)'}
      background={'rgba(0, 0, 0, 0.2)'}
      left={0}
      zIndex={5}
      onClick={() => {
        onCloseDrawer();
      }}
    >
      {/* menu */}
      <Box
        w={'100vw'}
        px={[2, 5]}
        padding={2}
        onClick={(e) => e.stopPropagation()}
        background={'white'}
        position={'relative'}
      >
        <LightRowTabs<TabEnum>
          gap={3}
          inlineStyles={{
            px: 2
          }}
          list={[
            { label: t('common:core.chat.Recent use'), value: TabEnum.recently },
            { label: t('app:all_apps'), value: TabEnum.app }
          ]}
          value={currentTab}
          onChange={setCurrentTab}
        />
      </Box>
      <Box
        width={'100%'}
        minH={'10vh'}
        background={'white'}
        onClick={(e) => e.stopPropagation()}
        borderRadius={'0 0 10px 10px'}
        position={'relative'}
        py={3}
        pt={0}
        pb={4}
        h={'65vh'}
      >
        {/* history */}
        {currentTab === TabEnum.recently && (
          <Box px={3} overflow={'auto'} h={'100%'}>
            {Array.isArray(myApps) &&
              myApps.map((item) => (
                <Flex justify={'center'} key={item.appId}>
                  <Flex
                    py={2.5}
                    px={2}
                    width={'100%'}
                    borderRadius={'md'}
                    alignItems={'center'}
                    {...(item.appId === appId
                      ? {
                          backgroundColor: 'primary.50 !important',
                          color: 'primary.600'
                        }
                      : {
                          onClick: () => onclickApp(item.appId)
                        })}
                  >
                    <Avatar src={item.avatar} w={'24px'} borderRadius={'sm'} />
                    <Box ml={2} className={'textEllipsis'}>
                      {item.name}
                    </Box>
                  </Flex>
                </Flex>
              ))}
          </Box>
        )}
        {currentTab === TabEnum.app && (
          <SelectOneResource
            value={appId}
            onSelect={(item) => {
              if (!item) return;
              onclickApp(item.id);
            }}
            server={getAppList}
          />
        )}
      </Box>
    </Box>
  );
};

const MobileHeader = ({
  showHistory,
  name,
  avatar,
  appId
}: {
  showHistory?: boolean;
  avatar: string;
  name: string;
  appId: string;
}) => {
  const router = useRouter();
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);
  const { isOpen: isOpenDrawer, onToggle: toggleDrawer, onClose: onCloseDrawer } = useDisclosure();
  const isShareChat = router.pathname === '/chat/share';

  return (
    <>
      {showHistory && (
        <MyIcon
          name={'core/chat/sidebar/menu'}
          w={'20px'}
          h={'20px'}
          color={'myGray.900'}
          onClick={onOpenSlider}
        />
      )}
      <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
        <Flex alignItems={'center'} onClick={toggleDrawer}>
          <Avatar borderRadius={'sm'} src={avatar} w={'1rem'} />

          <Box ml={1} className="textEllipsis">
            {name}
          </Box>

          {isShareChat ? null : (
            <MyIcon
              name={'core/chat/chevronSelector'}
              w={'1.25rem'}
              color={isOpenDrawer ? 'primary.600' : 'myGray.900'}
            />
          )}
        </Flex>
      </Flex>

      {isOpenDrawer && !isShareChat && <MobileDrawer appId={appId} onCloseDrawer={onCloseDrawer} />}
    </>
  );
};

export const PcHeader = ({
  title,
  chatModels,
  totalRecordsCount,
  chatId
}: {
  title: string;
  chatModels?: string[];
  totalRecordsCount: number;
  chatId: string;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  return (
    <>
      <MyTooltip label={chatId ? t('common:chat_chatId', { chatId }) : ''}>
        <Box
          mr={3}
          maxW={'200px'}
          className="textEllipsis"
          color={'myGray.1000'}
          cursor={'pointer'}
          onClick={() => {
            copyData(chatId);
          }}
        >
          {title}
        </Box>
      </MyTooltip>
      <MyTag>
        <MyIcon name={'history'} w={'14px'} />
        <Box ml={1}>
          {totalRecordsCount === 0
            ? t('common:core.chat.New Chat')
            : t('common:core.chat.History Amount', { amount: totalRecordsCount })}
        </Box>
      </MyTag>
      {!!chatModels && chatModels.length > 0 && (
        <MyTooltip label={chatModels.join(',')}>
          <MyTag ml={2} colorSchema={'green'}>
            <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
            <Box ml={1} maxW={'200px'} className="textEllipsis">
              {chatModels.join(',')}
            </Box>
          </MyTag>
        </MyTooltip>
      )}
    </>
  );
};

export default ChatHeader;
