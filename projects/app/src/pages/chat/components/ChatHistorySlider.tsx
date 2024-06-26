import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Flex, useTheme, IconButton } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useRouter } from 'next/router';
import Avatar from '@/components/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useUserStore } from '@/web/support/user/useUserStore';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useI18n } from '@/web/context/I18n';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import MyBox from '@fastgpt/web/components/common/MyBox';

type HistoryItemType = {
  id: string;
  title: string;
  customTitle?: string;
  top?: boolean;
};

enum TabEnum {
  recently = 'recently',
  'app' = 'app',
  'history' = 'history'
}

const ChatHistorySlider = ({
  appId,
  appName,
  appAvatar,
  apps = [],
  confirmClearText,
  onDelHistory,
  onClearHistory,
  onSetHistoryTop,
  onSetCustomTitle
}: {
  appId?: string;
  appName: string;
  appAvatar: string;
  apps?: AppListItemType[];
  confirmClearText: string;
  onDelHistory: (e: { chatId: string }) => void;
  onClearHistory: () => void;
  onSetHistoryTop?: (e: { chatId: string; top: boolean }) => void;
  onSetCustomTitle?: (e: { chatId: string; title: string }) => void;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';

  const { t } = useTranslation();
  const { appT } = useI18n();

  const { isPc } = useSystemStore();
  const { userInfo } = useUserStore();

  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.history);

  const {
    histories,
    onChangeChatId,
    onChangeAppId,
    chatId: activeChatId,
    isLoading
  } = useContextSelector(ChatContext, (v) => v);

  const concatHistory = useMemo(() => {
    const formatHistories: HistoryItemType[] = histories.map((item) => ({
      id: item.chatId,
      title: item.title,
      customTitle: item.customTitle,
      top: item.top
    }));
    const newChat: HistoryItemType = { id: activeChatId, title: t('core.chat.New Chat') };
    const activeChat = histories.find((item) => item.chatId === activeChatId);

    return !activeChat ? [newChat].concat(formatHistories) : formatHistories;
  }, [activeChatId, histories, t]);

  const showApps = apps?.length > 0;

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('core.chat.Custom History Title'),
    placeholder: t('core.chat.Custom History Title Description')
  });
  const { openConfirm, ConfirmModal } = useConfirm({
    content: confirmClearText
  });

  const canRouteToDetail = useMemo(
    () => appId && userInfo?.team.permission.hasWritePer,
    [appId, userInfo?.team.permission.hasWritePer]
  );

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

  return (
    <MyBox
      isLoading={isLoading}
      display={'flex'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
      whiteSpace={'nowrap'}
    >
      {isPc && (
        <MyTooltip label={canRouteToDetail ? appT('App Detail') : ''} offset={[0, 0]}>
          <Flex
            pt={5}
            pb={2}
            px={[2, 5]}
            alignItems={'center'}
            cursor={canRouteToDetail ? 'pointer' : 'default'}
            fontSize={'sm'}
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
          <LightRowTabs<TabEnum>
            flex={'1 0 0'}
            mr={1}
            inlineStyles={{
              px: 1
            }}
            list={[
              { label: t('core.chat.Recent use'), value: TabEnum.recently },
              ...(!isTeamChat ? [{ label: t('App'), value: TabEnum.app }] : []),
              { label: t('core.chat.History'), value: TabEnum.history }
            ]}
            value={currentTab}
            onChange={setCurrentTab}
          />
        )}
        <Button
          variant={'whitePrimary'}
          flex={['0 0 auto', 1]}
          h={'100%'}
          color={'primary.600'}
          borderRadius={'xl'}
          leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
          overflow={'hidden'}
          onClick={() => onChangeChatId()}
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
            onClick={() =>
              openConfirm(() => {
                onClearHistory();
              })()
            }
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
                py={2.5}
                px={4}
                cursor={'pointer'}
                userSelect={'none'}
                borderRadius={'md'}
                mb={2}
                fontSize={'sm'}
                _hover={{
                  bg: 'myGray.50',
                  '& .more': {
                    visibility: 'visible'
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
                        onChangeChatId(item.id);
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
                  <Box className="more" visibility={['visible', 'hidden']}>
                    <MyMenu
                      Button={
                        <IconButton
                          size={'xs'}
                          variant={'whiteBase'}
                          icon={<MyIcon name={'more'} w={'14px'} p={1} />}
                          aria-label={''}
                        />
                      }
                      menuList={[
                        {
                          children: [
                            ...(onSetHistoryTop
                              ? [
                                  {
                                    label: item.top ? t('core.chat.Unpin') : t('core.chat.Pin'),
                                    icon: 'core/chat/setTopLight',
                                    onClick: () => {
                                      onSetHistoryTop({ chatId: item.id, top: !item.top });
                                    }
                                  }
                                ]
                              : []),
                            ...(onSetCustomTitle
                              ? [
                                  {
                                    label: t('common.Custom Title'),
                                    icon: 'common/customTitleLight',
                                    onClick: () => {
                                      onOpenModal({
                                        defaultVal: item.customTitle || item.title,
                                        onSuccess: (e) =>
                                          onSetCustomTitle({
                                            chatId: item.id,
                                            title: e
                                          })
                                      });
                                    }
                                  }
                                ]
                              : []),
                            {
                              label: t('common.Delete'),
                              icon: 'delete',
                              onClick: () => {
                                onDelHistory({ chatId: item.id });
                                if (item.id === activeChatId) {
                                  onChangeChatId();
                                }
                              },
                              type: 'danger'
                            }
                          ]
                        }
                      ]}
                    />
                  </Box>
                )}
              </Flex>
            ))}
          </>
        )}
        {currentTab === TabEnum.recently && !isPc && (
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
                        onClick: () => onChangeAppId(item._id)
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
        {currentTab === TabEnum.app && !isPc && (
          <>
            <SelectOneResource
              value={appId}
              onSelect={(id) => {
                if (!id) return;
                onChangeAppId(id);
              }}
              server={getAppList}
            />
          </>
        )}
      </Box>

      {/* exec */}
      {!isPc && appId && !isTeamChat && (
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
    </MyBox>
  );
};

export default ChatHistorySlider;
