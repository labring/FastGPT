import React, { useState, useCallback } from 'react';
import { Flex, useTheme, Box, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import ToolMenu from './ToolMenu';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { useTranslation } from 'next-i18next';

import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { InitChatResponse } from '@/global/core/chat/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useRouter } from 'next/router';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
enum TabEnum {
  recently = 'recently',
  'app' = 'app'
}
const ChatHeader = ({
  chatData,
  history,
  showHistory,
  onRoute2AppDetail,
  apps
}: {
  history: ChatItemType[];
  showHistory?: boolean;
  onRoute2AppDetail?: () => void;
  apps?: AppListItemType[];
  chatData: InitChatResponse;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { onChangeAppId, chatId: activeChatId } = useContextSelector(ChatContext, (v) => v);
  const chatModels = chatData.app.chatModels;
  const isPlugin = chatData.app.type === AppTypeEnum.plugin;
  const { isOpen: isOpenDrawer, onToggle: toggleDrawer, onClose: onCloseDrawer } = useDisclosure();
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);
  const isTeamChat = router.pathname === '/chat/team';
  const isShareChat = router.pathname === '/chat/share';
  const getAppList = useCallback(async ({ parentId }: GetResourceFolderListProps) => {
    return getMyApps({ parentId }).then((res) =>
      res.map<GetResourceListItemResponse>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: item.type === AppTypeEnum.folder
      }))
    );
  }, []);
  const [currentTab, setCurrentTab] = useState<TabEnum>(
    isTeamChat ? TabEnum.app : TabEnum.recently
  );
  return (
    <>
      {isPc && isPlugin ? null : (
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
              <Box mr={3} maxW={'160px'} className="textEllipsis" color={'myGray.1000'}>
                {chatData.title}
              </Box>
              <MyTag>
                <MyIcon name={'history'} w={'14px'} />
                <Box ml={1}>
                  {history.length === 0
                    ? t('common:core.chat.New Chat')
                    : t('core.chat.History Amount', { amount: history.length })}
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
              <Box flex={1} />
            </>
          ) : (
            <>
              {showHistory && (
                <MyIcon
                  name={'menu'}
                  w={'20px'}
                  h={'20px'}
                  color={'myGray.900'}
                  onClick={onOpenSlider}
                />
              )}
              {isPc && isPlugin ? null : (
                <Flex
                  alignItems={'center'}
                  px={[3, 5]}
                  minH={['46px', '60px']}
                  borderBottom={theme.borders.sm}
                  color={'myGray.900'}
                  fontSize={'sm'}
                >
                  {isPc ? (
                    <>
                      <Box mr={3} maxW={'160px'} className="textEllipsis" color={'myGray.1000'}>
                        {chatData.title}
                      </Box>
                      <MyTag>
                        <MyIcon name={'history'} w={'14px'} />
                        <Box ml={1}>
                          {history.length === 0
                            ? t('common:core.chat.New Chat')
                            : t('core.chat.History Amount', { amount: history.length })}
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
                      <Box flex={1} />
                    </>
                  ) : (
                    <>
                      {showHistory && (
                        <MyIcon
                          name={'menu'}
                          w={'20px'}
                          h={'20px'}
                          color={'myGray.900'}
                          onClick={onOpenSlider}
                        />
                      )}

                      <Flex
                        px={3}
                        alignItems={'center'}
                        flex={'1 0 0'}
                        w={0}
                        justifyContent={'center'}
                      >
                        <Avatar src={chatData.app.avatar} w={'16px'} />
                        <Box ml={1} className="textEllipsis" onClick={onRoute2AppDetail}>
                          {chatData.app.name}
                        </Box>
                        {isShareChat ? null : (
                          <MyIcon
                            _active={{ transform: 'scale(0.9)' }}
                            name={'core/chat/chevronSelector'}
                            w={'20px'}
                            h={'20px'}
                            color={isOpenDrawer ? 'primary.600' : 'myGray.900'}
                            onClick={toggleDrawer}
                          />
                        )}
                      </Flex>
                    </>
                  )}

                  {/* control */}
                  {!isPlugin && <ToolMenu history={history} />}
                </Flex>
              )}
              <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
                <Avatar src={chatData.app.avatar} w={'16px'} />
                <Box ml={1} className="textEllipsis" onClick={onRoute2AppDetail}>
                  {chatData.app.name}
                </Box>
                {isShareChat ? null : (
                  <MyIcon
                    _active={{ transform: 'scale(0.9)' }}
                    name={'core/chat/chevronSelector'}
                    w={'20px'}
                    h={'20px'}
                    color={isOpenDrawer ? 'primary.600' : 'myGray.900'}
                    onClick={toggleDrawer}
                  />
                )}
              </Flex>
            </>
          )}

          {/* control */}
          {!isPlugin && <ToolMenu history={history} />}
        </Flex>
      )}
      {/* 最近使用和应用弹窗 */}
      {!isPc && isOpenDrawer && !isShareChat && (
        <Box
          position={'absolute'}
          top={'46px'}
          w={'100%'}
          h={'calc(100% - 46px)'}
          background={'rgba(0, 0, 0, 0.2)'}
          zIndex={5}
          onClick={() => {
            onCloseDrawer();
            onCloseDrawer();
          }}
        >
          {/* menu */}
          <Box
            w={'100%'}
            px={[2, 5]}
            padding={2}
            onClick={(e) => e.stopPropagation()}
            background={'white'}
            position={'relative'}
          >
            {!isPc && chatData.appId && (
              <LightRowTabs<TabEnum>
                flex={'1 0 0'}
                width={isTeamChat ? '30%' : '60%'}
                mr={10}
                inlineStyles={{
                  px: 1
                }}
                list={[
                  ...(isTeamChat
                    ? [{ label: t('App'), value: TabEnum.recently }]
                    : [
                        { label: t('core.chat.Recent use'), value: TabEnum.recently },
                        { label: t('App'), value: TabEnum.app }
                      ])
                ]}
                value={currentTab}
                onChange={setCurrentTab}
              />
            )}
          </Box>
          <Box
            width={'100%'}
            height={'auto'}
            minH={'10vh'}
            maxH={'60vh'}
            overflow={'auto'}
            background={'white'}
            zIndex={3}
            onClick={(e) => e.stopPropagation()}
            borderRadius={'0 0 10px 10px'}
            position={'relative'}
            padding={3}
            pt={0}
            pb={4}
          >
            {/* history */}
            {currentTab === TabEnum.recently && !isPc && (
              <>
                {Array.isArray(apps) &&
                  apps.map((item) => (
                    <Flex justify={'center'} key={item._id}>
                      <Flex
                        py={2.5}
                        px={2}
                        width={'100%'}
                        borderRadius={'md'}
                        alignItems={'center'}
                        {...(item._id === chatData.appId
                          ? {
                              backgroundColor: 'primary.50 !important',
                              color: 'primary.600'
                            }
                          : {
                              onClick: () => onChangeAppId(item._id)
                            })}
                      >
                        <Avatar src={item.avatar} w={'24px'} />
                        <Box ml={2} className={'textEllipsis'}>
                          {item.name}
                        </Box>
                      </Flex>
                    </Flex>
                  ))}
              </>
            )}
            {currentTab === TabEnum.app && !isPc && (
              <>
                <SelectOneResource
                  value={chatData.appId}
                  onSelect={(id) => {
                    if (!id) return;
                    onChangeAppId(id);
                  }}
                  server={getAppList}
                />
              </>
            )}
          </Box>
        </Box>
      )}
    </>
  );
};

export default ChatHeader;
