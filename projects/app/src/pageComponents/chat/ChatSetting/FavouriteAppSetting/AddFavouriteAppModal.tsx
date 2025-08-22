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
  Input
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getMyApps } from '@/web/core/app/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { ChatFavouriteAppSchema } from '@fastgpt/global/core/chat/favouriteApp/type';
import { updateFavouriteApps } from '@/web/core/chat/api';
import AppTree, { type App } from '@/pageComponents/chat/ChatSetting/AppTree';

type Props = {
  favourites: ChatFavouriteAppSchema[];
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const AddFavouriteAppModal = ({ favourites, onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const { register, watch: watchSearchValue } = useForm<{ name: string }>({
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
        .sort((a, b) => a.order - b.order),
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
      await updateFavouriteApps(
        checkedFavouriteApps.map((item) => ({ appId: item.appId, order: item.order }))
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
      w={['auto', '680px']}
      maxW={['auto', '680px']}
      isOpen={true}
      onClose={onClose}
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
                <AppTree apps={availableApps} checkedIds={checkedIds} onCheck={handleCheck} />
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
                <VStack spacing={2} alignItems="stretch" maxH={['50vh', '400px']} overflowY="auto">
                  {checkedFavouriteApps.map((fav) => {
                    const app = availableAppMap.get(fav.appId);
                    if (!app) return null;
                    return (
                      <Flex key={fav.appId} alignItems="center" p={2} gap={2}>
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
                            onClick={() => handleCheck(fav.appId)}
                          />
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
      </VStack>
    </MyModal>
  );
};

export default React.memo(AddFavouriteAppModal);
