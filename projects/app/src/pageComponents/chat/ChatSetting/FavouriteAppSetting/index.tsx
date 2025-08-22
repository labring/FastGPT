import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import {
  Button,
  ButtonGroup,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
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
import type { ChatFavouriteApp } from '@fastgpt/global/core/chat/favouriteApp/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import type { ChatFavouriteTagType } from '@fastgpt/global/core/chat/setting/type';
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
  const tagOptions = useContextSelector(ChatSettingContext, (v) => {
    const tags = v.chatSettings?.favouriteTags || [];
    return [
      { label: t('chat:setting.favourite.category_all'), value: '' },
      ...tags.map((c) => ({ label: c.name, value: c.id }))
    ];
  });
  // app's tags cache map
  const tagMap = useContextSelector(ChatSettingContext, (v) =>
    (v.chatSettings?.favouriteTags || []).reduce<Record<string, ChatFavouriteTagType>>(
      (acc, tag) => {
        acc[tag.id] = { ...tag };
        return acc;
      },
      {}
    )
  );

  const [localFavourites, setLocalFavourites] = useState<ChatFavouriteApp[]>([]);

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
    async (list: ChatFavouriteApp[]) => {
      await updateFavouriteAppOrder(
        list.map((item, idx) => ({
          id: item._id,
          order: idx
        }))
      );
      getApps();
    },
    { manual: true }
  );

  // delete app
  const { runAsync: deleteApp } = useRequest2(
    async (id: string) => {
      await deleteFavouriteApp(id);
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
    <>
      <MyBox
        gap={['13px', '26px']}
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

        <TableContainer flex="1 0 0" h={0} px={[2, 0]} overflowY="auto">
          <Table variant="simple" fontSize="sm" position="relative">
            <Thead position="sticky" top="0" zIndex="1">
              <Tr>
                <Th p="0" w="0"></Th>
                <Th>{t('chat:setting.favourite.table_column_name')}</Th>
                <Th>{t('chat:setting.favourite.table_column_intro')}</Th>
                <Th>{t('chat:setting.favourite.table_column_category')}</Th>
                <Th p="0" textAlign="center">
                  {t('chat:setting.favourite.table_column_action')}
                </Th>
              </Tr>
            </Thead>

            <DndDrag<ChatFavouriteApp>
              dataList={localFavourites}
              renderInnerPlaceholder={false}
              onDragEndCb={(list) => {
                const next = list.map((item, idx) => ({ ...item, order: idx }));
                setLocalFavourites(next);
                orderApp(next);
              }}
            >
              {({ provided }) => (
                <Tbody ref={provided.innerRef} {...provided.droppableProps}>
                  {localFavourites.map((row, index) => (
                    <Draggable key={row._id} draggableId={row._id} index={index}>
                      {(provided, snapshot) => (
                        <Tr
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          bg={snapshot.isDragging ? 'myGray.50' : 'transparent'}
                          _hover={{ bg: 'myGray.50' }}
                        >
                          {/* drag handle */}
                          <Td p="0" pl="2">
                            <Box {...provided.dragHandleProps}>
                              <MyIcon
                                name={'drag'}
                                cursor={'grab'}
                                borderRadius={'md'}
                                color={'myGray.500'}
                                _hover={{ bg: 'myGray.50' }}
                                w={'16px'}
                              />
                            </Box>
                          </Td>

                          {/* name */}
                          <Td>
                            <HStack spacing={2} maxW="520px">
                              <Avatar src={row.avatar} borderRadius={'sm'} w="20px" />
                              <Flex className="textEllipsis">{row.name || ''}</Flex>
                            </HStack>
                          </Td>

                          {/* intro */}
                          <Td maxW="520px">
                            <Flex className="textEllipsis" color={'myGray.600'}>
                              {row.intro || ''}
                            </Flex>
                          </Td>

                          {/* tags */}
                          <Td>
                            <Wrap>
                              {row.favouriteTags.slice(0, 3).map((id) => (
                                <TagBox key={id} id={id} />
                              ))}

                              {row.favouriteTags.length > 3 && (
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
                                      cursor="pointer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      +{row.favouriteTags.length - 3}
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
                                      {row.favouriteTags.slice(3).map((id) => (
                                        <TagBox key={id} id={id} />
                                      ))}
                                    </Flex>
                                  )}
                                </MyPopover>
                              )}
                            </Wrap>
                          </Td>

                          {/* action */}
                          <Td p="0" textAlign="center">
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
                                  icon={<MyIcon name="common/trash" w="20px" color="myGray.400" />}
                                />
                              }
                            />
                          </Td>
                        </Tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Tbody>
              )}
            </DndDrag>
          </Table>
          {localFavourites.length === 0 && <EmptyTip />}
        </TableContainer>
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
