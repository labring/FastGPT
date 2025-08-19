import {
  Flex,
  Box,
  Button,
  HStack,
  VStack,
  Grid,
  GridItem,
  InputGroup,
  InputLeftElement,
  Input,
  Checkbox
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getMyApps } from '@/web/core/app/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { ChatFavouriteAppSchema } from '@fastgpt/global/core/chat/favouriteApp/type';
import { updateAllFavouriteApp } from '@/web/core/chat/api';

type App = Awaited<ReturnType<typeof getMyApps>>[number];

export const TreeItem = ({
  app,
  depth,
  folder,
  checked,
  expanded,
  onCheck,
  onCollapse
}: {
  app: App;
  depth: number;
  folder: boolean;
  checked: boolean;
  expanded: boolean;
  onCheck: (id: string) => void;
  onCollapse: (id: string) => void;
}) => {
  return (
    <Flex
      py="2"
      gap={2}
      w="100%"
      key={app._id}
      alignItems="center"
      color="myGray.700"
      cursor="pointer"
      flexShrink="0"
      borderRadius="sm"
      pl={depth === 0 ? '0.5rem' : `${1.75 * (depth - 1) + 2.3}rem`}
      _hover={{
        bg: 'myGray.50'
      }}
      onClick={() => (folder ? onCollapse(app._id) : onCheck(app._id))}
    >
      {folder ? (
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          visibility={folder ? 'visible' : 'hidden'}
          w={'1.25rem'}
          h={'1.25rem'}
          cursor={'pointer'}
          borderRadius={'xs'}
          _hover={{
            bg: 'rgba(31, 35, 41, 0.08)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (folder) onCollapse(app._id);
          }}
        >
          <MyIcon
            w={'14px'}
            color={'myGray.500'}
            name={'common/rightArrowFill'}
            transform={expanded ? 'rotate(90deg)' : 'none'}
          />
        </Flex>
      ) : (
        <Checkbox isChecked={checked} onChange={() => onCheck(app._id)} size="sm" />
      )}

      <Flex alignItems="center" gap={1} flex="1" userSelect="none">
        <Avatar src={app.avatar} borderRadius={'md'} w="1.5rem" />
        <Box className="textEllipsis" flex="1" pr="1">
          {app.name}
        </Box>
      </Flex>
    </Flex>
  );
};

export const Tree = ({
  apps,
  checkedIds,
  onCheck
}: {
  apps: App[];
  checkedIds: string[];
  onCheck: (id: string) => void;
}) => {
  const children = useMemo(() => {
    const map = new Map<string, App[]>();
    apps.forEach((item) => {
      const key = item.parentId ? String(item.parentId) : '__root__';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [apps]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const handleExpand = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const RenderNodes = useCallback(
    ({ parent, depth }: { parent: string; depth: number }) => {
      const list = children.get(parent) || [];
      return (
        <>
          {list.map((node) => {
            const nodeId = String(node._id);
            const isExpanded = !!expanded[nodeId];
            const folder = node.type === AppTypeEnum.folder;

            return (
              <Box key={nodeId} w="100%">
                <TreeItem
                  app={node}
                  depth={depth}
                  folder={folder}
                  onCheck={onCheck}
                  expanded={isExpanded}
                  checked={checkedIds.includes(nodeId)}
                  onCollapse={handleExpand}
                />

                {folder && isExpanded && (
                  <Box mt={0.5}>
                    <RenderNodes parent={nodeId} depth={depth + 1} />
                  </Box>
                )}
              </Box>
            );
          })}
        </>
      );
    },
    [children, checkedIds, expanded, onCheck, handleExpand]
  );

  return <RenderNodes parent="__root__" depth={0} />;
};

type Props = {
  isOpen: boolean;
  favourites: ChatFavouriteAppSchema[];
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const AddFavouriteAppModal = ({ isOpen, favourites, onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const {
    register,
    watch: watchSearchValue,
    setValue: setSearchValue
  } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppNameValue = watchSearchValue('name');
  // search for app list
  const { data: availableApps = [] } = useRequest2(
    async () => {
      return await getMyApps({ searchKey: searchAppNameValue });
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppNameValue]
    }
  );

  const [checkedIds, setCheckedIds] = useState<string[]>(favourites.map((item) => item.appId));

  const [localFavourites, setLocalFavourites] = useState<ChatFavouriteAppSchema[]>(favourites);
  const checkedFavouriteApps = useMemo(
    () =>
      localFavourites
        .filter((item) => checkedIds.includes(item.appId))
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)),
    [localFavourites, checkedIds]
  );

  const handleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const willAdd = !prev.includes(id);
      setLocalFavourites((prevFavs) => {
        const exists = prevFavs.some((f) => f.appId === id);
        if (willAdd) {
          if (exists) return prevFavs;
          const maxOrder =
            prevFavs.length > 0 ? Math.max(...prevFavs.map((f: any) => f.order ?? 0)) : 0;
          const newFav = {
            appId: id,
            categories: [],
            order: (maxOrder ?? 0) + 1
          } as unknown as ChatFavouriteAppSchema;
          return [...prevFavs, newFav];
        } else {
          return prevFavs.filter((f) => f.appId !== id);
        }
      });

      return willAdd ? [...prev, id] : prev.filter((v) => v !== id);
    });
  }, []);

  const availableAppMap = useMemo(() => {
    const map = new Map<string, App>();
    availableApps.forEach((app) => map.set(app._id, app));
    return map;
  }, [availableApps]);

  const { run: updateFavourites, loading: isUpdating } = useRequest2(
    async () => {
      await updateAllFavouriteApp(
        checkedFavouriteApps.map((item) => ({
          appId: item.appId,
          order: item.order,
          categories: item.categories
        }))
      );
      await onRefresh();
      handleClose();
    },
    {
      manual: true
    }
  );

  const handleClose = useCallback(() => {
    // reset search and checked list to original favourites when closing
    setSearchValue('name', '');
    setCheckedIds(favourites.map((item) => item.appId));
    setLocalFavourites(favourites);
    onClose();
  }, [favourites, onClose, setSearchValue]);

  // keep checked state in sync with current favourite apps
  useEffect(() => {
    setCheckedIds(favourites.map((item) => item.appId));
    setLocalFavourites(favourites);
  }, [favourites]);

  return (
    <MyModal
      w={['auto', '680px']}
      maxW={['auto', '680px']}
      isOpen={isOpen}
      onClose={handleClose}
      title={t('chat:setting.favourite.add_new_app')}
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
                <Tree apps={availableApps} checkedIds={checkedIds} onCheck={handleCheck} />
              </VStack>
            </VStack>
          </GridItem>

          <GridItem p={2}>
            <VStack spacing={2} alignItems="stretch">
              <Box px={1} color={'myGray.600'} userSelect="none">
                {t('chat:setting.favourite.selected_list', {
                  num: checkedFavouriteApps.length
                })}
              </Box>

              <Box>
                <VStack spacing={0} alignItems="stretch" maxH={['50vh', '400px']} overflowY="auto">
                  {checkedFavouriteApps.map((fav) => {
                    const app = availableAppMap.get(fav.appId);
                    if (!app) return null;
                    return (
                      <Flex
                        key={fav.appId}
                        alignItems="center"
                        p={2}
                        gap={2}
                        _notLast={{ borderBottom: 'sm', borderColor: 'myGray.100' }}
                      >
                        <Avatar src={app.avatar} borderRadius={'md'} w="1.25rem" />
                        <Box flex={1} className="textEllipsis" userSelect="none">
                          {app.name}
                        </Box>
                        <Box
                          color="myGray.400"
                          fontSize="xs"
                          cursor="pointer"
                          onClick={() => handleCheck(fav.appId)}
                        >
                          <MyIcon name="common/closeLight" w="16px" />
                        </Box>
                      </Flex>
                    );
                  })}
                </VStack>
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
            onClick={updateFavourites}
          >
            确定
          </Button>
        </HStack>
      </VStack>
    </MyModal>
  );
};

export default React.memo(AddFavouriteAppModal);
