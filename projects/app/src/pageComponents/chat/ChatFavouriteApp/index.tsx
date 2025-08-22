import { getFavouriteApps } from '@/web/core/chat/api';
import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Input,
  InputGroup,
  InputLeftElement,
  Tab,
  TabIndicator,
  TabList,
  Tabs
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { useMemo } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { ChatSettingTabOptionEnum, ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import NextHead from '@/components/common/NextHead';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const ChatFavouriteApp = () => {
  const { isPc } = useSystem();
  const { t } = useTranslation();

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);
  const wideLogoUrl = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.wideLogoUrl);
  const homeTabTitle = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.homeTabTitle);

  const tags = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.favouriteTags || []);
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

  const { register, watch, setValue } = useForm<{ name: string; tag: string }>({
    defaultValues: {
      name: '',
      tag: ''
    }
  });
  const searchAppName = watch('name');
  const selectedTag = watch('tag');

  // load all favourites for checked state and saving
  const { loading: isSearching, data: favouriteApps = [] } = useRequest2(
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
      <Box
        key={id}
        fontSize="xs"
        borderRadius={8}
        bg="myGray.100"
        px="1.5"
        py="0.5"
        cursor="text"
        onClick={(e) => e.stopPropagation()}
      >
        {tag.name}
      </Box>
    );
  };

  return (
    <MyBox isLoading={isSearching} display="flex" flexDirection={'column'} h={'100%'}>
      <NextHead title={homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      {!isPc && (
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
            <InputGroup w="100%">
              <InputLeftElement h="36px">
                <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
              </InputLeftElement>
              <Input
                placeholder={t('chat:setting.favourite.search_placeholder')}
                {...register('name')}
              />
            </InputGroup>
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
        p={['0 16px 0 16px', '24px 24px 0 24px']}
        gap={4}
        justifyContent="space-between"
      >
        {/* tag tabs */}
        <Tabs variant="unstyled">
          <TabList
            gap={5}
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
            <TabIndicator mt="36px" height="2px" bg="primary.600" borderRadius="1px" />
          </TabList>
        </Tabs>

        {/* search input */}
        {isPc && (
          <InputGroup maxW="300px">
            <InputLeftElement h="36px">
              <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
            </InputLeftElement>
            <Input
              placeholder={t('chat:setting.favourite.search_placeholder')}
              {...register('name')}
            />
          </InputGroup>
        )}
      </Flex>

      {/* list */}
      {favouriteApps.length > 0 ? (
        <Grid templateColumns={['1fr', 'repeat(3, 1fr)']} gap={4} p={['4', '6']} overflowY="auto">
          {favouriteApps.map((app) => (
            <GridItem key={app.appId} cursor="pointer">
              <Flex
                flexDirection={'column'}
                justifyContent="space-between"
                gap={2}
                p={4}
                borderRadius={8}
                border="sm"
                borderColor="myGray.200"
                boxShadow="sm"
                minH="140px"
                transition="all 0.1s ease-in-out"
                _hover={{
                  borderColor: 'primary.300'
                }}
                onClick={() => handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, app.appId)}
              >
                <Box>
                  <Flex fontSize="16px" fontWeight="500" alignItems="center" gap={2}>
                    <Avatar src={app.avatar} borderRadius={8} />
                    <Flex>{app.name}</Flex>
                  </Flex>

                  <Box fontSize="sm">{app.intro}</Box>
                </Box>

                <Flex gap="2" flexWrap="wrap">
                  {app.favouriteTags.slice(0, 3).map((id) => (
                    <TagBox key={id} id={id} />
                  ))}

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
                </Flex>
              </Flex>
            </GridItem>
          ))}
        </Grid>
      ) : (
        <Flex flexDir="column" flex="1" justifyContent="center" alignItems="center" gap={4}>
          <EmptyTip p="0" text={t('chat:setting.favourite.category.no_data')} />

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
        </Flex>
      )}
    </MyBox>
  );
};

export default ChatFavouriteApp;
