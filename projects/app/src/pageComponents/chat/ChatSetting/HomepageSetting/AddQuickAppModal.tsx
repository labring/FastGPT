import { getMyApps, getAppBasicInfoByIds } from '@/web/core/app/api';
import { Box, Button, Grid, GridItem, HStack, VStack, Flex, Checkbox } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { App } from '@/pageComponents/chat/ChatSetting/AppTree';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { ChatQuickAppType } from '@fastgpt/global/core/chat/setting/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FolderPath from '@/components/common/folder/Path';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ChevronRightIcon } from '@chakra-ui/icons';

type Props = {
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (list: ChatQuickAppType[]) => void;
};

const AddQuickAppModal = ({ selectedIds, onClose, onConfirm }: Props) => {
  const { t } = useTranslation();

  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);

  const [selectedInfo, setSelectedInfo] = useState<Record<string, ChatQuickAppType>>({});

  const { watch, setValue } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppName = watch('name');

  const [parentId, setParentId] = useState('');

  const {
    data: appData = { apps: [], paths: [] as { parentId: string; parentName: string }[] },
    loading: isFetching
  } = useRequest2(
    async () => {
      const [apps, paths] = await Promise.all([
        getMyApps({
          parentId,
          searchKey: searchAppName,
          type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
        }),
        searchAppName.trim()
          ? Promise.resolve([])
          : getAppFolderPath({ sourceId: parentId, type: 'current' })
      ]);
      return { apps, paths };
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [parentId, searchAppName]
    }
  );
  const availableApps = appData.apps;
  const paths = appData.paths;

  const availableAppsMap = useMemo(() => {
    const map = new Map<string, App>();
    availableApps.forEach((app) => map.set(app._id, app));
    return map;
  }, [availableApps]);

  const handleCheck = useCallback(
    (id: string) => {
      setLocalSelectedIds((prev) => {
        const exists = prev.includes(id);
        if (exists) {
          // remove id and its cached info
          setSelectedInfo((old) => {
            const next: Record<string, ChatQuickAppType> = { ...old };
            delete next[id];
            return next;
          });
          return prev.filter((v) => v !== id);
        }
        if (prev.length >= 4) return prev;
        // add id and cache its info if available from current list
        const app = availableAppsMap.get(id);
        if (app) {
          setSelectedInfo((old) => ({
            ...old,
            [id]: { _id: id, name: app.name, avatar: app.avatar }
          }));
        }
        return [...prev, id];
      });
    },
    [availableAppsMap]
  );

  const checkedQuickApps = useMemo<ChatQuickAppType[]>(() => {
    return localSelectedIds
      .map((id) => {
        const cached = selectedInfo[id];
        if (cached) return cached;

        const app = availableAppsMap.get(id);
        if (app) return { _id: app._id, name: app.name, avatar: app.avatar };
      })
      .filter(Boolean) as ChatQuickAppType[];
  }, [localSelectedIds, selectedInfo, availableAppsMap]);

  useEffect(() => {
    const missing = localSelectedIds.filter((id) => !selectedInfo[id]);
    if (missing.length === 0) return;
    getAppBasicInfoByIds(missing)
      .then((list) => {
        setSelectedInfo((old) => {
          const next: Record<string, ChatQuickAppType> = { ...old };
          list.forEach((item) => {
            next[item.id] = { _id: item.id, name: item.name, avatar: item.avatar };
          });
          return next;
        });
      })
      .catch(() => {});
  }, [localSelectedIds, selectedInfo]);

  const { loading: isUpdating, runAsync: confirmSelect } = useRequest2(
    async () => {
      onConfirm(checkedQuickApps);
    },
    {
      refreshDeps: [checkedQuickApps],
      manual: true,
      onSuccess: onClose
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
      title={t('chat:setting.home.quick_apps.add')}
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
                    value={searchAppName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setValue('name', v);
                    }}
                    size="md"
                  />
                </Box>

                <Box mb={2} py={1} px={4} fontSize="sm" minH={8} display="flex" alignItems="center">
                  {searchAppName && (
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
                  {!searchAppName && paths.length === 0 && (
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
                  {!searchAppName && paths.length > 0 && (
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
                            if (searchAppName) {
                              setValue('name', '');
                            }
                            setParentId(String(item._id));
                          } else {
                            handleCheck(String(item._id));
                          }
                        }}
                      >
                        <Box w={'5'} onClick={(e) => e.stopPropagation()}>
                          {item.type !== AppTypeEnum.folder && (
                            <Checkbox
                              isChecked={localSelectedIds.includes(String(item._id))}
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
                    num: `${checkedQuickApps.length} / 4`
                  })}
                </Box>

                <VStack align="stretch" spacing={1} flex={1} px={4} overflowY="auto" h={0} minH={0}>
                  {checkedQuickApps.length === 0 && !isFetching && (
                    <EmptyTip text={t('chat:setting.home.no_selected_app')} />
                  )}
                  <DndDrag<ChatQuickAppType>
                    dataList={checkedQuickApps}
                    renderInnerPlaceholder={false}
                    onDragEndCb={(list) => {
                      const newOrderIds = list.map((item) => item._id);
                      setLocalSelectedIds(newOrderIds);
                    }}
                  >
                    {({ provided }) => (
                      <VStack
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        spacing={0}
                        alignItems="stretch"
                        maxH={['50vh', '400px']}
                        overflowY="auto"
                      >
                        {checkedQuickApps.map((q, index) => {
                          const app = selectedInfo[q._id] || {
                            _id: q._id,
                            name: q.name,
                            avatar: q.avatar
                          };
                          return (
                            <Draggable key={q._id} draggableId={q._id} index={index}>
                              {(provided, snapshot) => (
                                <Flex
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  alignItems="center"
                                  gap={2}
                                  px={2}
                                  py={1.5}
                                  borderRadius="md"
                                  bg={snapshot.isDragging ? 'myGray.50' : 'transparent'}
                                >
                                  <Box {...provided.dragHandleProps}>
                                    <MyIcon
                                      name={'drag'}
                                      cursor={'pointer'}
                                      p={2}
                                      borderRadius={'md'}
                                      color={'myGray.500'}
                                      _hover={{ bg: 'myGray.50' }}
                                      w={'16px'}
                                    />
                                  </Box>
                                  <Flex alignItems="center" flex={1}>
                                    <Avatar src={app.avatar} borderRadius={'sm'} w="1.25rem" />
                                    <Box flex={1} className="textEllipsis" userSelect="none" ml={2}>
                                      {app.name}
                                    </Box>
                                  </Flex>
                                  <Box color="myGray.400" fontSize="xs">
                                    <MyIcon
                                      name="common/closeLight"
                                      w="16px"
                                      color="myGray.400"
                                      cursor="pointer"
                                      _hover={{ color: 'red.500' }}
                                      onClick={() => handleCheck(q._id)}
                                    />
                                  </Box>
                                </Flex>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </VStack>
                    )}
                  </DndDrag>
                </VStack>
              </VStack>
            </GridItem>
          </Grid>
        </Box>

        <HStack spacing={2} alignSelf="flex-end" px={4} pb={4}>
          <Button variant="whitePrimary" isDisabled={isUpdating} onClick={onClose}>
            {t('chat:setting.home.cancel_button')}
          </Button>
          <Button variant="primary" isLoading={isUpdating} onClick={confirmSelect}>
            {t('chat:setting.home.confirm_button')}
          </Button>
        </HStack>
      </Flex>
    </MyModal>
  );
};

export default AddQuickAppModal;
