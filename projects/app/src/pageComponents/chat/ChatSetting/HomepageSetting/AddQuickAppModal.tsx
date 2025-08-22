import { getMyApps } from '@/web/core/app/api';
import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  InputGroup,
  Input,
  InputLeftElement,
  VStack,
  Flex
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import AppTree, { type App } from '@/pageComponents/chat/ChatSetting/AppTree';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { QuickAppType } from '@fastgpt/global/core/chat/setting/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';

type Props = {
  // currently selected quick app ids (ordered)
  selectedIds: string[];
  onClose: () => void;
  // confirm selection (ordered quick app list for display)
  onConfirm: (list: QuickAppType[]) => void;
};

const AddQuickAppModal = ({ selectedIds, onClose, onConfirm }: Props) => {
  const { t } = useTranslation();

  // ordered selected ids
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);

  const checkedQuickApps = useMemo<QuickAppType[]>(() => {
    // map ids to QuickApp objects with only id, other fields filled when rendering
    return localSelectedIds.map((_id) => ({ _id, name: '', avatar: '' }));
  }, [localSelectedIds]);

  const handleCheck = useCallback((id: string) => {
    setLocalSelectedIds((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }, []);

  const { register, watch, setValue } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppName = watch('name');

  const { data: availableApps = [] } = useRequest2(
    async () => {
      return await getMyApps({ searchKey: searchAppName });
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppName]
    }
  );
  const availableAppsMap = useMemo(() => {
    const map = new Map<string, App>();
    availableApps.forEach((app) => map.set(app._id, app));
    return map;
  }, [availableApps]);

  const { loading: isUpdating, runAsync: confirmSelect } = useRequest2(
    async () => {
      const list: QuickAppType[] = localSelectedIds
        .map((id) => availableAppsMap.get(id)!)
        .filter(Boolean)
        .map((app) => ({ _id: app._id, name: app.name, avatar: app.avatar }));
      onConfirm(list);
    },
    {
      manual: true,
      onSuccess: onClose
    }
  );

  return (
    <MyModal
      w={['auto', '680px']}
      maxW={['auto', '680px']}
      isOpen={true}
      onClose={onClose}
      title={t('chat:setting.home.quick_apps.add')}
      iconSrc="/imgs/modal/add.svg"
    >
      <VStack p={4} spacing={4}>
        <Grid
          w="100%"
          color={'myGray.900'}
          fontSize={'sm'}
          templateColumns={['1fr', 'repeat(2, 1fr)']}
          border="sm"
          borderColor="myGray.100"
          rounded="sm"
        >
          <GridItem
            p={2}
            borderRight={['none', 'sm']}
            borderBottom={['sm', 'none']}
            borderColor="myGray.100"
          >
            <VStack spacing={4} position="relative">
              <InputGroup w="100%" position="sticky" top="2" zIndex="1" bg="white">
                <InputLeftElement w="36px" h="36px">
                  <MyIcon name="common/searchLight" w="4" color="myGray.500" />
                </InputLeftElement>
                <Input
                  pl="8"
                  placeholder={t('chat:setting.favourite.search_placeholder')}
                  {...register('name')}
                />
              </InputGroup>

              <VStack
                w="100%"
                maxH={['70vh', '500px']}
                minH={['50vh', '200px']}
                overflowY="auto"
                spacing={1}
                alignItems="flex-start"
              >
                <AppTree apps={availableApps} checkedIds={localSelectedIds} onCheck={handleCheck} />
              </VStack>
            </VStack>
          </GridItem>

          <GridItem p={2}>
            <VStack spacing={2} alignItems="stretch">
              <Box px={1} color={'myGray.600'} userSelect="none">
                {t('chat:setting.favourite.selected_list', {
                  num: `${checkedQuickApps.length}/4`
                })}
              </Box>

              <Box>
                <DndDrag<QuickAppType>
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
                        const app = availableAppsMap.get(q._id);
                        if (!app) return null;
                        return (
                          <Draggable key={q._id} draggableId={q._id} index={index}>
                            {(provided, snapshot) => (
                              <Flex
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                alignItems="center"
                                p={2}
                                gap={2}
                                bg={snapshot.isDragging ? 'myGray.50' : 'transparent'}
                                _notLast={{ borderBottom: 'sm', borderColor: 'myGray.100' }}
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
                                <Avatar src={app.avatar} borderRadius={'md'} w="1.25rem" />
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
              </Box>
            </VStack>
          </GridItem>
        </Grid>

        <HStack spacing={2} alignSelf="flex-end">
          <Button variant="whitePrimary" isDisabled={isUpdating} onClick={onClose}>
            {t('chat:setting.home.cancel_button')}
          </Button>
          <Button variant="primary" isLoading={isUpdating} onClick={confirmSelect}>
            {t('chat:setting.home.confirm_button')}
          </Button>
        </HStack>
      </VStack>
    </MyModal>
  );
};

export default AddQuickAppModal;
