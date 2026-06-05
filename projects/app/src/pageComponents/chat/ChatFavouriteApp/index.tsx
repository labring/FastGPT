import { getFavouriteApps } from '@/web/core/chat/api';
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Tab,
  TabIndicator,
  TabList,
  Tabs
} from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useEffect, useMemo } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { ChatSettingTabOptionEnum, ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import NextHead from '@/components/common/NextHead';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type Props = {
  hideMobileHeader?: boolean;
  mobileSearchKey?: string;
};

const ChatFavouriteApp = ({ hideMobileHeader = false, mobileSearchKey }: Props) => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const wideLogoUrl = useContextSelector(ChatPageContext, (v) => v.chatSettings?.wideLogoUrl);
  const homeTabTitle = useContextSelector(ChatPageContext, (v) => v.chatSettings?.homeTabTitle);

  const tags = useContextSelector(ChatPageContext, (v) => v.chatSettings?.favouriteTags || []);
  const tagCache = useMemo(() => {
    return tags.reduce(
      (acc, tag) => {
        acc[tag.id] = tag;
        return acc;
      },
      {} as Record<string, (typeof tags)[number]>
    );
  }, [tags]);
  const tagOptions = useMemo(
    () => [
      { label: t('chat:setting.favourite.category_tab.all'), value: '' },
      ...tags.map((tag) => ({
        label: tag.name,
        value: tag.id
      }))
    ],
    [tags, t]
  );

  const { watch, setValue } = useForm<{ name: string; tag: string }>({
    defaultValues: {
      name: '',
      tag: ''
    }
  });
  const searchAppName = watch('name');
  const selectedTag = watch('tag');

  useEffect(() => {
    if (mobileSearchKey === undefined) return;
    setValue('name', mobileSearchKey);
  }, [mobileSearchKey, setValue]);

  // load all favourites for checked state and saving
  const { loading: isSearching, data: favouriteApps = [] } = useRequest(
    async () => {
      return await getFavouriteApps({
        name: searchAppName,
        tag: selectedTag
      });
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppName, selectedTag]
    }
  );

  const TagBox = ({ id }: { id: string }) => {
    const tag = tagCache[id];

    if (!tag) return null;

    return (
      <Flex
        key={id}
        fontSize="xs"
        borderRadius="sm"
        bg="myGray.100"
        px="1.5"
        py="0.5"
        cursor="text"
        flex="0 1 auto"
        minW="40px"
        maxW="32%"
        overflow="hidden"
        justifyContent="center"
        onClick={(e) => e.stopPropagation()}
      >
        <Box minW={0} className="textEllipsis">
          {tag.name}
        </Box>
      </Flex>
    );
  };

  return (
    <MyBox isLoading={isSearching} display="flex" flexDirection={'column'} h={'100%'}>
      <NextHead title={homeTabTitle} icon={getWebReqUrl(feConfigs?.favicon)} />

      {!isPc && !hideMobileHeader && (
        <Flex
          py={4}
          color="myGray.900"
          gap={2}
          alignItems={'center'}
          px={4}
          justifyContent={'space-between'}
        >
          <MyIcon
            w="20px"
            color="myGray.500"
            name="core/chat/sidebar/menu"
            onClick={onOpenSlider}
          />

          <Box w="70%">
            <SearchInput
              h="36px"
              lineHeight="36px"
              py={0}
              onChange={(e) => setValue('name', e.target.value)}
              placeholder={t('chat:setting.favourite.search_placeholder')}
              maxLength={30}
            />
          </Box>

          <ChatSliderMobileDrawer
            showList={false}
            showMenu={false}
            banner={wideLogoUrl}
            menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
          />
        </Flex>
      )}

      {/* header */}
      <Flex
        w="full"
        px={isPc ? 6 : 4}
        pt={isPc ? '20px' : 2}
        pb={isPc ? 0 : 2}
        gap={4}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* tag tabs */}
        <Tabs variant="unstyled" w={['100%', 'auto']}>
          <TabList
            gap={5}
            p="4px"
            h="40px"
            overflowX="auto"
            overflowY="hidden"
            flexWrap="nowrap"
            position="relative"
            css={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              '&::-webkit-scrollbar': { display: 'none' }
            }}
          >
            {tagOptions.map((option) => (
              <Tab
                px={0}
                h="32px"
                flexShrink="0"
                key={option.value}
                value={option.value}
                fontWeight={500}
                color={selectedTag === option.value ? 'primary.700' : 'myGray.500'}
                onClick={() => setValue('tag', option.value)}
              >
                {option.label}
              </Tab>
            ))}
            <TabIndicator bottom="0" height="2px" bg="primary.600" borderRadius="1px" />
          </TabList>
        </Tabs>

        {/* search input */}
        {isPc && (
          <SearchInput
            maxW={['auto', '250px']}
            h="36px"
            lineHeight="36px"
            py={0}
            onChange={(e) => setValue('name', e.target.value)}
            placeholder={t('chat:setting.favourite.search_placeholder')}
            maxLength={30}
          />
        )}
      </Flex>

      {/* list */}
      {favouriteApps.length > 0 ? (
        <Grid
          templateColumns={['minmax(0,1fr)', 'repeat(2,minmax(0,1fr))', 'repeat(3,minmax(0,1fr))']}
          gap={5}
          px={[4, 6]}
          pt="16px"
          pb={['4', '6']}
          overflowY="auto"
          alignItems={'stretch'}
        >
          {favouriteApps.map((app) => (
            <MyTooltip key={app.appId} h="100%" label={t('app:go_to_chat')}>
              <MyBox
                lineHeight={1.5}
                h="100%"
                pt={5}
                pb={3}
                px={5}
                cursor={'pointer'}
                border={'base'}
                bg={'white'}
                borderRadius={'lg'}
                position={'relative'}
                display={'flex'}
                flexDirection={'column'}
                minW={0}
                _hover={{
                  borderColor: 'primary.300'
                }}
                onClick={() => handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, app.appId)}
              >
                <HStack minW={0}>
                  <Avatar src={app.avatar} borderRadius={'sm'} w={'1.5rem'} />
                  <Box flex={'1 0 0'} color={'myGray.900'} className="textEllipsis">
                    {app.name}
                  </Box>
                </HStack>

                <Box
                  flex={['1 0 60px', '1 0 72px']}
                  mt={3}
                  pr={8}
                  textAlign={'justify'}
                  wordBreak={'break-all'}
                  fontSize={'xs'}
                  color={'myGray.500'}
                >
                  <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'}>
                    {app.intro || t('common:no_intro')}
                  </Box>
                </Box>

                <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full" minW={0}>
                  <Flex flex="1 1 auto" gap="2" minW={0}>
                    {app.favouriteTags.slice(0, 3).map((id) => (
                      <TagBox key={id} id={id} />
                    ))}
                  </Flex>

                  {app.favouriteTags.length > 3 && (
                    <MyPopover
                      placement="bottom"
                      trigger="hover"
                      width="fit-content"
                      Trigger={
                        <Box
                          fontSize="xs"
                          borderRadius={8}
                          bg="myGray.100"
                          px="1.5"
                          py="0.5"
                          flexShrink={0}
                          onClick={(e) => e.stopPropagation()}
                        >
                          +{app.favouriteTags.length - 3}
                        </Box>
                      }
                    >
                      {() => (
                        <Flex
                          p="2"
                          gap="2"
                          flexWrap="wrap"
                          maxW="200px"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {app.favouriteTags.slice(3).map((id) => (
                            <TagBox key={id} id={id} />
                          ))}
                        </Flex>
                      )}
                    </MyPopover>
                  )}
                </HStack>
              </MyBox>
            </MyTooltip>
          ))}
        </Grid>
      ) : (
        <Flex flexDir="column" flex="1" justifyContent="center" alignItems="center" gap={4}>
          <EmptyTip p="0" text={t('chat:setting.favourite.category.no_data')} />

          {userInfo?.permission.hasManagePer && (
            <Button
              variant="primary"
              leftIcon={<MyIcon name="common/settingLight" w="16px" />}
              onClick={() =>
                handlePaneChange(
                  ChatSidebarPaneEnum.SETTING,
                  undefined,
                  ChatSettingTabOptionEnum.FAVOURITE_APPS
                )
              }
            >
              {t('chat:setting.favourite.goto_add')}
            </Button>
          )}
        </Flex>
      )}
    </MyBox>
  );
};

export default ChatFavouriteApp;
