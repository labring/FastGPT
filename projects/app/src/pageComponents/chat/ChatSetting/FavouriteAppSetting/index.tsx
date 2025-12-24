import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import {
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure
} from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AddIcon } from '@chakra-ui/icons';
import { deleteFavouriteApp, getFavouriteApps, updateFavouriteAppOrder } from '@/web/core/chat/api';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { Box, Wrap } from '@chakra-ui/react';
import type { ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import type { ChatFavouriteTagType } from '@fastgpt/global/core/chat/favouriteApp/type';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const TagManageModal = dynamic(
  () => import('@/pageComponents/chat/ChatSetting/FavouriteAppSetting/TagManageModal')
);
const AddFavouriteAppModal = dynamic(
  () => import('@/pageComponents/chat/ChatSetting/FavouriteAppSetting/AddFavouriteAppModal')
);

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const FavouriteAppSetting = ({ Header }: Props) => {
  const { t } = useTranslation();

  // search apps input
  const {
    register,
    setValue: setSearchValue,
    watch: watchSearchValue
  } = useForm<{ search: string; tag: string }>({
    defaultValues: {
      search: '',
      tag: ''
    }
  });

  const searchAppNameValue = watchSearchValue('search');

  const searchAppTagValue = watchSearchValue('tag');
  // apps' tags options
  const tagOptions = useContextSelector(ChatPageContext, (v) => {
    const tags = v.chatSettings?.favouriteTags || [];
    return [
      { label: t('chat:setting.favourite.category_all'), value: '' },
      ...tags.map((c) => ({ label: c.name, value: c.id }))
    ];
  });
  // app's tags cache map
  const tagMap = useContextSelector(ChatPageContext, (v) =>
    (v.chatSettings?.favouriteTags || []).reduce<Record<string, ChatFavouriteTagType>>(
      (acc, tag) => {
        acc[tag.id] = { ...tag };
        return acc;
      },
      {}
    )
  );

  const [localFavourites, setLocalFavourites] = useState<ChatFavouriteAppType[]>([]);

  // search favourite apps by apps' name and tag
  const { loading: isSearching, runAsync: getApps } = useRequest2(
    async () => {
      const apps = await getFavouriteApps({
        name: searchAppNameValue,
        tag: searchAppTagValue
      });

      setLocalFavourites(apps);
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppNameValue, searchAppTagValue]
    }
  );

  // update app order
  const { runAsync: orderApp } = useRequest2(
    async (list: ChatFavouriteAppType[]) => {
      await updateFavouriteAppOrder(list.map((item, idx) => ({ id: item._id, order: idx })));
      getApps();
    },
    { manual: true }
  );

  // delete app
  const { runAsync: deleteApp } = useRequest2(
    async (id: string) => {
      await deleteFavouriteApp({ id });
      getApps();
    },
    { manual: true }
  );

  // open tag manage modal
  const {
    isOpen: isOpenTagManageModal,
    onOpen: onOpenTagManageModal,
    onClose: onCloseTagManageModal
  } = useDisclosure();

  // open add app modal
  const {
    isOpen: isOpenAddAppModal,
    onOpen: onOpenAddAppModal,
    onClose: onCloseAddAppModal
  } = useDisclosure();

  const TagBox = ({ id }: { id: string }) => {
    const tag = tagMap[id];

    if (!tag) return null;

    return (
      <Box
        maxW={['120px', '160px']}
        key={id}
        fontSize="xs"
        borderRadius="sm"
        bg="myGray.100"
        px="1.5"
        py="0.5"
        cursor="text"
        minW="40px"
        textAlign="center"
        overflow="hidden"
        whiteSpace="nowrap"
        textOverflow="ellipsis"
        onClick={(e) => e.stopPropagation()}
      >
        {tag.name}
      </Box>
    );
  };

  return (
    <>
      <MyBox
        display="flex"
        flexDir="column"
        isLoading={isSearching}
        h={['calc(100vh - 69px)', 'full']}
      >
        <Header>
          <HStack spacing="3" flexWrap="wrap">
            <InputGroup w={['auto', '200px']}>
              <InputLeftElement w="36px" h="36px">
                <MyIcon name="common/searchLight" w="4" color="myGray.500" />
              </InputLeftElement>
              <Input
                pl="8"
                placeholder={t('chat:setting.favourite.search_placeholder')}
                {...register('search')}
              />
            </InputGroup>

            <MySelect
              fontWeight="400"
              minW={['auto', '120px']}
              list={tagOptions}
              placeholder={t('chat:setting.favourite.category_placeholder')}
              value={searchAppTagValue}
              onChange={(tag) => setSearchValue('tag', tag)}
            />

            <Button
              variant="whitePrimary"
              w={'auto'}
              fontWeight="400"
              onClick={onOpenTagManageModal}
            >
              {t('chat:setting.favourite.manage_categories_button')}
            </Button>

            <Button
              leftIcon={<AddIcon fontSize={'xs'} />}
              variant="primary"
              fontWeight="400"
              w={'auto'}
              onClick={onOpenAddAppModal}
            >
              {t('chat:setting.favourite.add_new_app')}
            </Button>
          </HStack>
        </Header>

        {/* 表头 */}
        <Flex
          bg={'myGray.100'}
          my={['13px', '26px']}
          pl={2}
          pr={[2, 0]}
          py={2}
          rounded={'md'}
          alignItems={'center'}
          fontSize={'sm'}
          fontWeight={'medium'}
          color="myGray.600"
          position="sticky"
          top="0"
          zIndex="1"
        >
          <Box w="40px"></Box>
          <Box w={[3 / 10, 2.5 / 10]}>{t('chat:setting.favourite.table_column_name')}</Box>
          <Box w={3.5 / 10} display={['none', 'block']}>
            {t('chat:setting.favourite.table_column_intro')}
          </Box>
          <Box w={[2.5 / 10, 2 / 10]} flexShrink={0} pl={[2, 4]}>
            {t('chat:setting.favourite.table_column_category')}
          </Box>
          <Box w={[1.5 / 10, 2 / 10]} textAlign="center" ml="auto">
            {t('chat:setting.favourite.table_column_action')}
          </Box>
        </Flex>

        {/* 表格内容 */}
        <Box overflow={'auto'} flex="1 0 0" h={0} px={[2, 0]}>
          {localFavourites.length > 0 ? (
            <DndDrag<ChatFavouriteAppType>
              dataList={localFavourites}
              renderInnerPlaceholder={false}
              onDragEndCb={(list) => {
                const next = list.map((item, idx) => ({ ...item, order: idx }));
                setLocalFavourites(next);
                orderApp(next);
              }}
            >
              {({ provided }) => (
                <Flex
                  gap={1}
                  flexDirection={'column'}
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {localFavourites.map((row, index) => (
                    <Draggable key={row._id} draggableId={row._id} index={index}>
                      {(provided, snapshot) => (
                        <MyBox
                          py="1"
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1
                          }}
                          display={'flex'}
                          pl={2}
                          bg={snapshot.isDragging ? 'myGray.50' : 'white'}
                          borderRadius={'md'}
                          // h={12}
                          w={'full'}
                          border={'1px solid transparent'}
                          _hover={{
                            borderColor: 'rgba(51, 112, 255, 0.10)',
                            bg: 'myGray.50'
                          }}
                          fontSize={'sm'}
                          alignItems={'center'}
                        >
                          {/* 拖拽手柄 */}
                          <Box w="40px" display="flex" alignItems="center" justifyContent="center">
                            <Flex
                              {...provided.dragHandleProps}
                              align="center"
                              justify="center"
                              h="full"
                              rounded="xs"
                              _hover={{ bg: 'myGray.05' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MyIcon name={'drag'} cursor={'grab'} color={'myGray.500'} w="14px" />
                            </Flex>
                          </Box>

                          {/* 名称列 */}
                          <Box w={[3 / 10, 2.5 / 10]} display="flex" alignItems="center" pr={4}>
                            <Avatar src={row.avatar} borderRadius={'xs'} w={'20px'} mr={2} />
                            <Box
                              fontWeight={'medium'}
                              whiteSpace={'nowrap'}
                              overflow={'hidden'}
                              textOverflow={'ellipsis'}
                              cursor="default"
                              flex="1"
                            >
                              {row.name || ''}
                            </Box>
                          </Box>

                          {/* 介绍列 */}
                          <Box w={3.5 / 10} display={['none', 'block']} pr={4} flexShrink={0}>
                            <Box color={'myGray.600'} cursor="default">
                              <MyPopover
                                placement="top"
                                trigger="hover"
                                width="fit-content"
                                Trigger={
                                  <Box
                                    as="span"
                                    maxW="100%"
                                    cursor="help"
                                    overflow="hidden"
                                    whiteSpace="nowrap"
                                    verticalAlign="middle"
                                    display="inline-block"
                                    textOverflow="ellipsis"
                                  >
                                    {row.intro || t('common:no_intro')}
                                  </Box>
                                }
                              >
                                {() => (
                                  <Box
                                    p="3"
                                    maxW="400px"
                                    wordBreak="break-word"
                                    lineHeight="1.5"
                                    fontSize="sm"
                                  >
                                    {row.intro || t('common:no_intro')}
                                  </Box>
                                )}
                              </MyPopover>
                            </Box>
                          </Box>

                          {/* 标签列 */}
                          <Box w={[2.5 / 10, 2 / 10]} pr={3} flexShrink={0}>
                            <Wrap spacing={1} overflow="hidden">
                              {row.favouriteTags.slice(0, 2).map((id) => (
                                <TagBox key={id} id={id} />
                              ))}

                              {row.favouriteTags.length > 2 && (
                                <MyPopover
                                  placement="bottom"
                                  trigger="hover"
                                  width="fit-content"
                                  Trigger={
                                    <Box
                                      fontSize="xs"
                                      borderRadius="sm"
                                      bg="myGray.100"
                                      px="1.5"
                                      py="0.5"
                                      cursor="pointer"
                                      minW="30px"
                                      textAlign="center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      +{row.favouriteTags.length - 2}
                                    </Box>
                                  }
                                >
                                  {() => (
                                    <Flex
                                      p="2"
                                      gap="2"
                                      flexWrap="wrap"
                                      maxW="300px"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {row.favouriteTags.slice(2).map((id) => (
                                        <TagBox key={id} id={id} />
                                      ))}
                                    </Flex>
                                  )}
                                </MyPopover>
                              )}
                            </Wrap>
                          </Box>

                          {/* 操作列 */}
                          <Flex
                            w={[1.5 / 10, 2 / 10]}
                            alignItems="center"
                            justifyContent="center"
                            ml="auto"
                          >
                            <PopoverConfirm
                              type="delete"
                              content={t('chat:setting.favourite.delete_app_confirm')}
                              onConfirm={() => {
                                setLocalFavourites((prev) => {
                                  const next = prev.filter((_, i) => i !== index);
                                  // reset order
                                  const ordered = next.map((item, idx) => ({
                                    ...item,
                                    order: idx
                                  }));
                                  deleteApp(row._id);
                                  return ordered;
                                });
                              }}
                              Trigger={
                                <IconButton
                                  size="sm"
                                  aria-label="delete"
                                  variant="grayGhost"
                                  color="myGray.500"
                                  onClick={(e) => e.stopPropagation()}
                                  icon={<MyIcon name="common/trash" w="16px" color="myGray.400" />}
                                />
                              }
                            />
                          </Flex>
                        </MyBox>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Flex>
              )}
            </DndDrag>
          ) : (
            <EmptyTip />
          )}
        </Box>
      </MyBox>

      {isOpenTagManageModal && (
        <TagManageModal onClose={onCloseTagManageModal} onRefresh={getApps} />
      )}

      {isOpenAddAppModal && (
        <AddFavouriteAppModal onClose={onCloseAddAppModal} onRefresh={getApps} />
      )}
    </>
  );
};

export default FavouriteAppSetting;
