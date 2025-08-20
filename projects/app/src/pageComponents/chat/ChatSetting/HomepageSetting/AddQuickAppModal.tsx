import { getMyApps } from '@/web/core/app/api';
import { updateChatSetting } from '@/web/core/chat/api';
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
import type { QuickApp } from '@fastgpt/global/core/chat/setting/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';

type Props = {
  quickApps: QuickApp[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const AddQuickAppModal = ({ quickApps, isOpen, onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const [checkedIds, setCheckedIds] = useState<string[]>(quickApps.map((item) => item.id));
  const [localQuickApps, setLocalQuickApps] = useState(quickApps);

  const checkedQuickApps = useMemo(
    () =>
      localQuickApps
        .filter((item) => checkedIds.includes(item.id))
        .sort((a, b) => a.order - b.order),
    [localQuickApps, checkedIds]
  );

  const handleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const willAdd = !prev.includes(id);
      if (willAdd) {
        if (prev.length >= 4) return prev;

        setLocalQuickApps((prevQuickApps) => {
          const exists = prevQuickApps.some((q) => q.id === id);
          if (exists) return prevQuickApps;
          const maxOrder =
            prevQuickApps.length > 0 ? Math.max(...prevQuickApps.map((q: any) => q.order ?? 0)) : 0;
          const newQuickApp = {
            id,
            order: (maxOrder ?? 0) + 1
          } as unknown as QuickApp;
          return [...prevQuickApps, newQuickApp];
        });
        return [...prev, id];
      } else {
        setLocalQuickApps((prevQuickApps) => prevQuickApps.filter((q) => q.id !== id));
        return prev.filter((v) => v !== id);
      }
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

  const { loading: isUpdating, runAsync: updateQuickApps } = useRequest2(
    async () => {
      await updateChatSetting({
        quickApps: localQuickApps.map((q) => ({ id: q.id, order: q.order }))
      });
      await onRefresh();
      onClose();
    },
    {
      manual: true
    }
  );

  const handleClose = useCallback(() => {
    setValue('name', '');
    setCheckedIds(quickApps.map((item) => item.id));
    setLocalQuickApps(quickApps);
    onClose();
  }, [onClose, quickApps, setValue]);

  // keep checked state in sync with current quick apps
  useEffect(() => {
    setCheckedIds(quickApps.map((item) => item.id));
    setLocalQuickApps(quickApps);
  }, [quickApps]);

  return (
    <MyModal
      w={['auto', '680px']}
      maxW={['auto', '680px']}
      isOpen={isOpen}
      onClose={handleClose}
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
                <AppTree apps={availableApps} checkedIds={checkedIds} onCheck={handleCheck} />
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
                <DndDrag<QuickApp>
                  dataList={checkedQuickApps}
                  renderInnerPlaceholder={false}
                  onDragEndCb={(list) =>
                    setLocalQuickApps(list.map((item, idx) => ({ ...item, order: idx })))
                  }
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
                        const app = availableAppsMap.get(q.id);
                        if (!app) return null;
                        return (
                          <Draggable key={q.id} draggableId={q.id} index={index}>
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
                                <Box
                                  color="myGray.400"
                                  fontSize="xs"
                                  cursor="pointer"
                                  onClick={() => handleCheck(q.id)}
                                >
                                  <MyIcon name="common/closeLight" w="16px" />
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
          <Button variant="whitePrimary" isDisabled={isUpdating} onClick={handleClose}>
            取消
          </Button>
          <Button
            variant="primary"
            isLoading={isUpdating}
            isDisabled={checkedIds.length === 0}
            onClick={updateQuickApps}
          >
            确定
          </Button>
        </HStack>
      </VStack>
    </MyModal>
  );
};

export default AddQuickAppModal;
