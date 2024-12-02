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
import { AppListItemType } from '@fastgpt/global/core/app/type';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const ChatHeader = ({
  history,
  showHistory,
  apps,
  onRouteToAppDetail,
  totalRecordsCount
}: {
  history: ChatItemType[];
  showHistory?: boolean;
  apps?: AppListItemType[];
  onRouteToAppDetail?: () => void;
  totalRecordsCount: number;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const isPlugin = chatData.app.type === AppTypeEnum.plugin;

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
          />
          <Box flex={1} />
        </>
      ) : (
        <MobileHeader
          apps={apps}
          appId={chatData.appId}
          name={chatData.app.name}
          avatar={chatData.app.avatar}
          showHistory={showHistory}
        />
      )}

      {/* control */}
      {!isPlugin && <ToolMenu history={history} onRouteToAppDetail={onRouteToAppDetail} />}
    </Flex>
  );
};

const MobileDrawer = ({
  onCloseDrawer,
  appId,
  apps
}: {
  onCloseDrawer: () => void;
  appId: string;
  apps?: AppListItemType[];
}) => {
  enum TabEnum {
    recently = 'recently',
    app = 'app'
  }
  const { t } = useTranslation();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';
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
  const { onChangeAppId } = useContextSelector(ChatContext, (v) => v);

  const onclickApp = (id: string) => {
    onChangeAppId(id);
    onCloseDrawer();
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
            ...(isTeamChat
              ? [{ label: t('app:all_apps'), value: TabEnum.recently }]
              : [
                  { label: t('common:core.chat.Recent use'), value: TabEnum.recently },
                  { label: t('app:all_apps'), value: TabEnum.app }
                ])
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
            {Array.isArray(apps) &&
              apps.map((item) => (
                <Flex justify={'center'} key={item._id}>
                  <Flex
                    py={2.5}
                    px={2}
                    width={'100%'}
                    borderRadius={'md'}
                    alignItems={'center'}
                    {...(item._id === appId
                      ? {
                          backgroundColor: 'primary.50 !important',
                          color: 'primary.600'
                        }
                      : {
                          onClick: () => onclickApp(item._id)
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
            onSelect={(id) => {
              if (!id) return;
              onclickApp(id);
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
  appId,
  apps
}: {
  showHistory?: boolean;
  avatar: string;
  name: string;
  apps?: AppListItemType[];
  appId: string;
}) => {
  const router = useRouter();
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);
  const { isOpen: isOpenDrawer, onToggle: toggleDrawer, onClose: onCloseDrawer } = useDisclosure();
  const isShareChat = router.pathname === '/chat/share';

  return (
    <>
      {showHistory && (
        <MyIcon name={'menu'} w={'20px'} h={'20px'} color={'myGray.900'} onClick={onOpenSlider} />
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
      {isOpenDrawer && !isShareChat && (
        <MobileDrawer apps={apps} appId={appId} onCloseDrawer={onCloseDrawer} />
      )}
    </>
  );
};

export const PcHeader = ({
  title,
  chatModels,
  totalRecordsCount
}: {
  title: string;
  chatModels?: string[];
  totalRecordsCount: number;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Box mr={3} maxW={'200px'} className="textEllipsis" color={'myGray.1000'}>
        {title}
      </Box>
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
