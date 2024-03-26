import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  useTheme,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useRouter } from 'next/router';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import Tabs from '@/components/Tabs';
import { useUserStore } from '@/web/support/user/useUserStore';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useQuery } from '@tanstack/react-query';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

type HistoryItemType = {
  id: string;
  title: string;
  customTitle?: string;
  top?: boolean;
};

enum TabEnum {
  'app' = 'app',
  'history' = 'history'
}

const ChatHistorySlider = ({
  appId,
  appName,
  appAvatar,
  history,
  apps = [],
  confirmClearText,
  activeChatId,
  onChangeChat,
  onDelHistory,
  onClearHistory,
  onSetHistoryTop,
  onSetCustomTitle,
  onClose
}: {
  appId?: string;
  appName: string;
  appAvatar: string;
  history: HistoryItemType[];
  activeChatId: string;
  apps?: AppListItemType[];
  confirmClearText: string;
  onChangeChat: (chatId?: string) => void;
  onDelHistory: (e: { chatId: string }) => void;
  onClearHistory: () => void;
  onSetHistoryTop?: (e: { chatId: string; top: boolean }) => void;
  onSetCustomTitle?: (e: { chatId: string; title: string }) => void;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const { userInfo } = useUserStore();

  const [currentTab, setCurrentTab] = useState<`${TabEnum}`>(TabEnum.history);

  const showApps = apps?.length > 0;
  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('core.chat.Custom History Title'),
    placeholder: t('core.chat.Custom History Title Description')
  });
  const { openConfirm, ConfirmModal } = useConfirm({
    content: confirmClearText
  });

  const concatHistory = useMemo<HistoryItemType[]>(
    () =>
      !activeChatId
        ? [{ id: activeChatId, title: t('core.chat.New Chat') }].concat(history)
        : history,
    [activeChatId, history, t]
  );

  useQuery(['init'], () => {
    if (!showApps) {
      setCurrentTab(TabEnum.history);
      return null;
    }
    return;
  });

  const canRouteToDetail = useMemo(
    () => appId && userInfo?.team.role !== TeamMemberRoleEnum.visitor,
    [appId, userInfo?.team.role]
  );

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
      whiteSpace={'nowrap'}
    >
      {isPc && (
        <MyTooltip label={canRouteToDetail ? t('app.App Detail') : ''} offset={[0, 0]}>
          <Flex
            pt={5}
            pb={2}
            px={[2, 5]}
            alignItems={'center'}
            cursor={canRouteToDetail ? 'pointer' : 'default'}
            onClick={() =>
              canRouteToDetail &&
              router.replace({
                pathname: '/app/detail',
                query: { appId }
              })
            }
          >
            <Avatar src={appAvatar} />
            <Box flex={'1 0 0'} w={0} ml={2} fontWeight={'bold'} className={'textEllipsis'}>
              {appName}
            </Box>
          </Flex>
        </MyTooltip>
      )}

      {/* menu */}
      <Flex w={'100%'} px={[2, 5]} h={'36px'} my={5} alignItems={'center'}>
        {!isPc && appId && (
          <Tabs
            w={'120px'}
            mr={2}
            list={[
              { label: 'App', id: TabEnum.app },
              { label: t('core.chat.History'), id: TabEnum.history }
            ]}
            activeId={currentTab}
            onChange={(e) => setCurrentTab(e as `${TabEnum}`)}
          />
        )}
        <Button
          variant={'whitePrimary'}
          flex={1}
          h={'100%'}
          color={'primary.600'}
          borderRadius={'xl'}
          leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
          overflow={'hidden'}
          onClick={() => onChangeChat()}
        >
          {t('core.chat.New Chat')}
        </Button>

        {(isPc || !showApps) && (
          <IconButton
            ml={3}
            h={'100%'}
            variant={'whiteDanger'}
            size={'mdSquare'}
            aria-label={''}
            borderRadius={'50%'}
            onClick={openConfirm(onClearHistory)}
          >
            <MyIcon name={'common/clearLight'} w={'16px'} />
          </IconButton>
        )}
      </Flex>

      <Box flex={'1 0 0'} h={0} px={[2, 5]} overflow={'overlay'}>
        {/* chat history */}
        {(currentTab === TabEnum.history || isPc) && (
          <>
            {concatHistory.map((item, i) => (
              <Flex
                position={'relative'}
                key={item.id || `${i}`}
                alignItems={'center'}
                py={3}
                px={4}
                cursor={'pointer'}
                userSelect={'none'}
                borderRadius={'md'}
                mb={2}
                _hover={{
                  bg: 'myGray.100',
                  '& .more': {
                    display: 'block'
                  }
                }}
                bg={item.top ? '#E6F6F6 !important' : ''}
                {...(item.id === activeChatId
                  ? {
                      backgroundColor: 'primary.50 !important',
                      color: 'primary.600'
                    }
                  : {
                      onClick: () => {
                        onChangeChat(item.id);
                      }
                    })}
              >
                <MyIcon
                  name={item.id === activeChatId ? 'core/chat/chatFill' : 'core/chat/chatLight'}
                  w={'16px'}
                />
                <Box flex={'1 0 0'} ml={3} className="textEllipsis">
                  {item.customTitle || item.title}
                </Box>
                {!!item.id && (
                  <Box className="more" display={['block', 'none']}>
                    <Menu autoSelect={false} isLazy offset={[0, 5]}>
                      <MenuButton
                        _hover={{ bg: 'white' }}
                        cursor={'pointer'}
                        borderRadius={'md'}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <MyIcon name={'more'} w={'14px'} p={1} />
                      </MenuButton>
                      <MenuList color={'myGray.700'} minW={`90px !important`}>
                        {onSetHistoryTop && (
                          <MenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetHistoryTop({ chatId: item.id, top: !item.top });
                            }}
                          >
                            <MyIcon mr={2} name={'core/chat/setTopLight'} w={'16px'}></MyIcon>
                            {item.top ? t('core.chat.Unpin') : t('core.chat.Pin')}
                          </MenuItem>
                        )}
                        {onSetCustomTitle && (
                          <MenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenModal({
                                defaultVal: item.customTitle || item.title,
                                onSuccess: (e) =>
                                  onSetCustomTitle({
                                    chatId: item.id,
                                    title: e
                                  })
                              });
                            }}
                          >
                            <MyIcon mr={2} name={'common/customTitleLight'} w={'16px'}></MyIcon>
                            {t('common.Custom Title')}
                          </MenuItem>
                        )}
                        <MenuItem
                          _hover={{ color: 'red.500' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelHistory({ chatId: item.id });
                            if (item.id === activeChatId) {
                              onChangeChat();
                            }
                          }}
                        >
                          <MyIcon mr={2} name={'delete'} w={'16px'}></MyIcon>
                          {t('common.Delete')}
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </Box>
                )}
              </Flex>
            ))}
          </>
        )}
        {currentTab === TabEnum.app && !isPc && (
          <>
            {Array.isArray(apps) &&
              apps.map((item) => (
                <Flex
                  key={item._id}
                  py={2}
                  px={3}
                  mb={3}
                  borderRadius={'md'}
                  alignItems={'center'}
                  {...(item._id === appId
                    ? {
                        backgroundColor: 'primary.50 !important',
                        color: 'primary.600'
                      }
                    : {
                        onClick: () => {
                          router.replace({
                            query: {
                              ...router.query,
                              appId: item._id
                            }
                          });
                          onClose();
                        }
                      })}
                >
                  <Avatar src={item.avatar} w={'24px'} />
                  <Box ml={2} className={'textEllipsis'}>
                    {item.name}
                  </Box>
                </Flex>
              ))}
          </>
        )}
      </Box>

      {!isPc && appId && (
        <Flex
          mt={2}
          borderTop={theme.borders.base}
          alignItems={'center'}
          cursor={'pointer'}
          p={3}
          onClick={() => router.push('/app/list')}
        >
          <IconButton
            mr={3}
            icon={<MyIcon name={'common/backFill'} w={'18px'} color={'primary.500'} />}
            bg={'white'}
            boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
            size={'smSquare'}
            borderRadius={'50%'}
            aria-label={''}
          />
          {t('core.chat.Exit Chat')}
        </Flex>
      )}
      <EditTitleModal />
      <ConfirmModal />
    </Flex>
  );
};

export default ChatHistorySlider;
