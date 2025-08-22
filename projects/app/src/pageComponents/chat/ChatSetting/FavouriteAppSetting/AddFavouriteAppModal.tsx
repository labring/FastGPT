import { Flex, Box, Button, HStack, VStack, Grid, GridItem, Checkbox } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getMyApps, getAppBasicInfoByIds } from '@/web/core/app/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { ChatFavouriteAppSchema } from '@fastgpt/global/core/chat/favouriteApp/type';
import { updateFavouriteApps } from '@/web/core/chat/api';
import type { App } from '@/pageComponents/chat/ChatSetting/AppTree';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FolderPath from '@/components/common/folder/Path';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type Props = {
  favourites: ChatFavouriteAppSchema[];
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const AddFavouriteAppModal = ({ favourites, onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const { watch: watchSearchValue, setValue } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppNameValue = watchSearchValue('name');
  const [parentId, setParentId] = useState('');
  const {
    data: appData = { apps: [], paths: [] as { parentId: string; parentName: string }[] },
    loading: isFetching
  } = useRequest2(
    async () => {
      const [apps, paths] = await Promise.all([
        getMyApps({ parentId, searchKey: searchAppNameValue }),
        searchAppNameValue.trim()
          ? Promise.resolve([])
          : getAppFolderPath({ sourceId: parentId, type: 'current' })
      ]);
      return { apps, paths };
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [parentId, searchAppNameValue]
    }
  );
  const availableApps = appData.apps;
  const paths = appData.paths;

  const [checkedIds, setCheckedIds] = useState<string[]>(favourites.map((item) => item.appId));
  const [selectedInfo, setSelectedInfo] = useState<
    Record<string, { id: string; name: string; avatar: string }>
  >({});

  const handleCheck = useCallback(
    (id: string) => {
      setCheckedIds((prev) => {
        const exists = prev.includes(id);
        if (exists) {
          setSelectedInfo((old) => {
            const next = { ...old };
            delete next[id];
            return next;
          });
          return prev.filter((v) => v !== id);
        }
        const app = availableApps.find((a) => a._id === id);
        if (app) {
          setSelectedInfo((old) => ({ ...old, [id]: { id, name: app.name, avatar: app.avatar } }));
        }
        return [...prev, id];
      });
    },
    [availableApps]
  );

  const availableAppMap = useMemo(() => {
    const map = new Map<string, App>();
    availableApps.forEach((app) => map.set(app._id, app));
    return map;
  }, [availableApps]);

  useEffect(() => {
    const missing = checkedIds.filter((id) => !selectedInfo[id]);
    if (missing.length === 0) return;
    getAppBasicInfoByIds(missing)
      .then((list) => {
        setSelectedInfo((old) => {
          const next: Record<string, { id: string; name: string; avatar: string }> = { ...old };
          list.forEach((item) => {
            next[item.id] = { id: item.id, name: item.name, avatar: item.avatar };
          });
          return next;
        });
      })
      .catch(() => {});
  }, [checkedIds, selectedInfo]);

  const { run: updateFavourites, loading: isUpdating } = useRequest2(
    async () => {
      await updateFavouriteApps(checkedIds.map((appId, index) => ({ appId, order: index + 1 })));
    },
    {
      manual: true,
      onSuccess: async () => {
        await onRefresh();
        onClose();
      }
    }
  );

  return (
    <MyModal
      minW="800px"
      maxW={'800px'}
      h={'100%'}
      minH={'496px'}
      maxH={'90vh'}
      isCentered
      isOpen={true}
      onClose={onClose}
      title={t('chat:setting.favourite.add_new_app')}
      iconSrc="/imgs/modal/add.svg"
      isLoading={isFetching}
    >
      <Flex h={'100%'} direction="column" flex={1} overflow={'hidden'} minH={0}>
        <Box flex={1} overflow={'hidden'} minH={0} p={4} pt={4}>
          <Grid
            w="100%"
            color={'myGray.900'}
            fontSize={'sm'}
            templateColumns={['1fr', 'repeat(2, 1fr)']}
            border="1px solid"
            borderColor="myGray.200"
            borderRadius="md"
            h={'100%'}
            overflow={'hidden'}
            minH={0}
          >
            <GridItem
              borderRight={['none', '1px solid']}
              borderBottom={['1px solid', 'none']}
              sx={{ borderColor: 'myGray.200 !important' }}
              minH={0}
            >
              <Flex h="100%" direction="column" minH={0} py={4} overflow="hidden">
                <Box mb={2} px={4}>
                  <SearchInput
                    placeholder={t('chat:setting.favourite.search_placeholder')}
                    value={searchAppNameValue}
                    onChange={(e) => setValue('name', e.target.value)}
                    size="md"
                  />
                </Box>

                <Box mb={2} py={1} px={4} fontSize="sm" minH={8} display="flex" alignItems="center">
                  {searchAppNameValue && (
                    <Box
                      w="100%"
                      minH={6}
                      display="flex"
                      alignItems="center"
                      fontSize="sm"
                      color="myGray.500"
                    >
                      {t('chat:search_results')}
                    </Box>
                  )}
                  {!searchAppNameValue && paths.length === 0 && (
                    <Flex flex={1} alignItems="center">
                      <Box
                        fontSize={['xs', 'sm']}
                        py={0.5}
                        px={1.5}
                        borderRadius="sm"
                        maxW={['45vw', '250px']}
                        className="textEllipsis"
                        color="myGray.700"
                        fontWeight="bold"
                        cursor="pointer"
                        _hover={{ bg: 'myGray.100' }}
                        onClick={() => setParentId('')}
                      >
                        {t('common:root_folder')}
                      </Box>
                      <MyIcon name="common/line" color="myGray.500" mx={1} w="5px" />
                    </Flex>
                  )}
                  {!searchAppNameValue && paths.length > 0 && (
                    <FolderPath
                      paths={paths.map((p) => ({ parentId: p.parentId, parentName: p.parentName }))}
                      FirstPathDom={t('common:root_folder')}
                      onClick={(e) => setParentId(e)}
                    />
                  )}
                </Box>

                <VStack
                  align="stretch"
                  spacing={1.5}
                  flex={1}
                  pl={4}
                  pr={3}
                  mr={1}
                  overflowY="auto"
                  h={0}
                  minH={0}
                >
                  {availableApps.length === 0 && !isFetching && (
                    <EmptyTip text={t('common:folder.empty')} />
                  )}
                  {availableApps.map((item: App) => (
                    <Box key={item._id} userSelect={'none'}>
                      <Flex
                        align="center"
                        pr={2}
                        pl={4}
                        py={1.5}
                        borderRadius="md"
                        _hover={{ bg: 'myGray.50' }}
                        cursor="pointer"
                        onClick={() => {
                          if (item.type === AppTypeEnum.folder) {
                            if (searchAppNameValue) setValue('name', '');
                            setParentId(String(item._id));
                          } else {
                            handleCheck(String(item._id));
                          }
                        }}
                      >
                        <Box w={'5'} onClick={(e) => e.stopPropagation()}>
                          {item.type !== AppTypeEnum.folder && (
                            <Checkbox
                              isChecked={checkedIds.includes(String(item._id))}
                              onChange={() => handleCheck(String(item._id))}
                              colorScheme="blue"
                              size="sm"
                            />
                          )}
                        </Box>

                        <Avatar src={item.avatar} w={7} h={7} borderRadius="sm" ml={3} mr={2.5} />

                        <Box flex={1} minW={0}>
                          <Box fontSize="sm" color={'myGray.900'} lineHeight={1}>
                            {item.name}
                          </Box>
                          <Box fontSize="xs" color="myGray.500">
                            {item.type === AppTypeEnum.folder ? t('common:Folder') : ''}
                          </Box>
                        </Box>

                        {item.type === AppTypeEnum.folder && (
                          <Box mr={10}>
                            <ChevronRightIcon w={5} h={5} color="myGray.500" strokeWidth="1px" />
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  ))}
                </VStack>
              </Flex>
            </GridItem>

            <GridItem minH={0}>
              <VStack spacing={2} alignItems="stretch">
                <Box mb={3} px={4} pt={4} fontSize="sm" color="myGray.600">
                  {t('chat:setting.favourite.selected_list', {
                    num: checkedIds.length
                  })}
                </Box>

                <VStack align="stretch" spacing={1} flex={1} px={4} overflowY="auto" h={0} minH={0}>
                  {checkedIds.length === 0 && !isFetching && (
                    <EmptyTip text={t('chat:setting.home.no_selected_app')} />
                  )}
                  <VStack
                    spacing={0}
                    alignItems="stretch"
                    maxH={['50vh', '400px']}
                    overflowY="auto"
                  >
                    {checkedIds.map((id) => {
                      const app = selectedInfo[id] || {
                        id,
                        name: availableAppMap.get(id)?.name || '',
                        avatar: availableAppMap.get(id)?.avatar || ''
                      };
                      return (
                        <Flex key={id} alignItems="center" p={2} borderRadius="md" gap={2}>
                          <Avatar src={app.avatar} borderRadius={'sm'} w="6" />
                          <Box flex={1} className="textEllipsis" userSelect="none">
                            {app.name}
                          </Box>
                          <Box color="myGray.400" fontSize="xs">
                            <MyIcon
                              name="common/closeLight"
                              w="16px"
                              color="myGray.400"
                              cursor="pointer"
                              _hover={{ color: 'red.500' }}
                              onClick={() => handleCheck(id)}
                            />
                          </Box>
                        </Flex>
                      );
                    })}
                  </VStack>
                </VStack>
              </VStack>
            </GridItem>
          </Grid>
        </Box>

        <HStack spacing={2} alignSelf="flex-end" px={4} pb={4}>
          <Button variant="whitePrimary" isDisabled={isUpdating} onClick={onClose}>
            {t('chat:setting.favourite.cancel_button')}
          </Button>
          <Button
            variant="primary"
            isLoading={isUpdating}
            isDisabled={checkedIds.length === 0}
            onClick={updateFavourites}
          >
            {t('chat:setting.favourite.confirm_button')}
          </Button>
        </HStack>
      </Flex>
    </MyModal>
  );
};

export default React.memo(AddFavouriteAppModal);
