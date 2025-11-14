import { Flex, Box, Button, HStack, VStack, Grid, GridItem, Checkbox } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getMyApps } from '@/web/core/app/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getFavouriteApps, updateFavouriteApps } from '@/web/core/chat/api';
import type { App } from '@/pageComponents/chat/ChatSetting/AppTree';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FolderPath from '@/components/common/folder/Path';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type Props = {
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const AddFavouriteAppModal = ({ onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const { watch: watchSearchValue, setValue } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppNameValue = watchSearchValue('name');

  const [parentId, setParentId] = useState('');
  const { data: appData = { apps: [], paths: [] }, loading: isFetching } = useRequest2(
    async () => {
      const [apps, paths] = await Promise.all([
        getMyApps({
          parentId,
          searchKey: searchAppNameValue,
          type: [
            AppTypeEnum.folder,
            AppTypeEnum.simple,
            AppTypeEnum.workflow,
            AppTypeEnum.workflowTool
          ]
        }),
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

  const [selectedApps, setSelectedApps] = useState<{ id: string; name: string; avatar: string }[]>(
    []
  );

  useRequest2(getFavouriteApps, {
    manual: false,
    onSuccess(res) {
      setSelectedApps(
        res.map((item) => ({ id: item.appId, name: item.name, avatar: item.avatar || '' }))
      );
    }
  });

  const handleCheck = useCallback((app: { id: string; name: string; avatar: string }) => {
    setSelectedApps((prev) => {
      const exists = prev.some((item) => item.id === app.id);
      if (exists) {
        return prev.filter((item) => item.id !== app.id);
      }
      return [{ id: app.id, name: app.name, avatar: app.avatar }, ...prev];
    });
  }, []);

  const { run: updateFavourites, loading: isUpdating } = useRequest2(
    async () => {
      await updateFavouriteApps(
        selectedApps.map((app, order) => ({ appId: app.id, order: order + 1 }))
      );
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
                  px={4}
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
                            handleCheck({ id: item._id, name: item.name, avatar: item.avatar });
                          }
                        }}
                      >
                        <Box w={'5'} onClick={(e) => e.stopPropagation()}>
                          {item.type !== AppTypeEnum.folder && (
                            <Checkbox
                              isChecked={selectedApps.some((app) => app.id === item._id)}
                              onChange={() =>
                                handleCheck({ id: item._id, name: item.name, avatar: item.avatar })
                              }
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
                    num: selectedApps.length
                  })}
                </Box>

                <VStack align="stretch" spacing={1} flex={1} px={4} overflowY="auto" h={0} minH={0}>
                  {selectedApps.length === 0 && !isFetching && (
                    <EmptyTip text={t('chat:setting.home.no_selected_app')} />
                  )}
                  <VStack
                    spacing={0}
                    alignItems="stretch"
                    maxH={['50vh', '400px']}
                    overflowY="auto"
                  >
                    {selectedApps.map((app) => {
                      return (
                        <Flex key={app.id} alignItems="center" p={2} borderRadius="md" gap={2}>
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
                              onClick={() => handleCheck(app)}
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
          <Button variant="primary" isLoading={isUpdating} onClick={updateFavourites}>
            {t('chat:setting.favourite.confirm_button')}
          </Button>
        </HStack>
      </Flex>
    </MyModal>
  );
};

export default React.memo(AddFavouriteAppModal);
