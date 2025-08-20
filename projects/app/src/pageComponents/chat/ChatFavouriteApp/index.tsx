import { getFavouriteApps } from '@/web/core/chat/api';
import {
  Box,
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
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import NextHead from '@/components/common/NextHead';
import MyBox from '@fastgpt/web/components/common/MyBox';

const ChatFavouriteApp = () => {
  const { t } = useTranslation();

  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);
  const homeTabTitle = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.homeTabTitle);

  const categories = useContextSelector(
    ChatSettingContext,
    (v) => v.chatSettings?.categories || []
  );
  const categoryCache = useMemo(() => {
    return categories.reduce(
      (acc, category) => {
        acc[category.id] = category;
        return acc;
      },
      {} as Record<string, (typeof categories)[number]>
    );
  }, [categories]);
  const categoryOptions = useMemo(
    () => [
      { label: t('chat:setting.favourite.category_all'), value: '' },
      ...categories.map((category) => ({
        label: category.name,
        value: category.id
      }))
    ],
    [categories, t]
  );

  const { register, watch, setValue } = useForm<{ name: string; category: string }>({
    defaultValues: {
      name: '',
      category: ''
    }
  });
  const searchAppName = watch('name');
  const selectedCategory = watch('category');

  // load all favourites for checked state and saving
  const { loading: isSearching, data: favouriteApps = [] } = useRequest2(
    async () => {
      return await getFavouriteApps({
        name: searchAppName,
        category: selectedCategory
      });
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppName, selectedCategory]
    }
  );

  const CategoryBox = ({ id }: { id: string }) => {
    const category = categoryCache[id];

    if (!category) return null;

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
        {category.name}
      </Box>
    );
  };

  return (
    <MyBox
      isLoading={isSearching}
      display="flex"
      flexDirection={'column'}
      h={'100%'}
      pt={['46px', 0]}
    >
      <NextHead title={homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      {/* header */}
      <Flex w="full" p="6" pb="0" justifyContent="space-between">
        {/* category tabs */}
        <Tabs variant="unstyled">
          <TabList gap={5}>
            {categoryOptions.map((option) => (
              <Tab
                px={0}
                key={option.value}
                value={option.value}
                fontWeight={500}
                color={selectedCategory === option.value ? 'primary.700' : 'myGray.500'}
                onClick={() => setValue('category', option.value)}
              >
                {option.label}
              </Tab>
            ))}
          </TabList>
          <TabIndicator mt="-1.5px" height="2px" bg="primary.600" borderRadius="1px" />
        </Tabs>

        {/* search input */}
        <InputGroup maxW="300px">
          <InputLeftElement h="36px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('chat:setting.favourite.search_placeholder')}
            {...register('name')}
          />
        </InputGroup>
      </Flex>

      {/* list */}
      <Grid templateColumns="repeat(3, 1fr)" gap={4} p={6}>
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
                {app.categories.slice(0, 3).map((id) => (
                  <CategoryBox key={id} id={id} />
                ))}

                {app.categories.length > 3 && (
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
                        +{app.categories.length - 3}
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
                        {app.categories.slice(3).map((id) => (
                          <CategoryBox key={id} id={id} />
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
    </MyBox>
  );
};

export default ChatFavouriteApp;
