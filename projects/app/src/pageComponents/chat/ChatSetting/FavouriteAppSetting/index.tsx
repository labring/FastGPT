import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import {
  Button,
  ButtonGroup,
  Checkbox,
  CheckboxGroup,
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
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AddIcon } from '@chakra-ui/icons';
import CategoryManageModal from '@/pageComponents/chat/ChatSetting/FavouriteAppSetting/CategoryManageModal';
import { getFavouriteApps, updateAllFavouriteApp } from '@/web/core/chat/api';
import AddFavouriteAppModal from '@/pageComponents/chat/ChatSetting/FavouriteAppSetting/AddFavouriteAppModal';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { Box, Wrap } from '@chakra-ui/react';
import type { ChatFavouriteAppSchema } from '@fastgpt/global/core/chat/favouriteApp/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

type FavouriteRow = ChatFavouriteAppSchema & {
  name?: string;
  avatar?: string;
  intro?: string;
};

type Props = {
  Header: React.FC<{ children?: React.ReactNode }>;
};

const FavouriteAppSetting = ({ Header }: Props) => {
  const { t } = useTranslation();

  // checkbox for select table rows
  const [checkedApps, setCheckedApps] = useState<boolean[]>([]);
  const allAppsChecked = checkedApps.every(Boolean);
  const isIndeterminate = checkedApps.some(Boolean) && !allAppsChecked;

  // search apps input
  const {
    register,
    setValue: setSearchValue,
    watch: watchSearchValue
  } = useForm<{ search: string; category: string }>({
    defaultValues: {
      search: '',
      category: ''
    }
  });
  const searchAppNameValue = watchSearchValue('search');
  const searchAppCategoryValue = watchSearchValue('category');
  // apps' categories options
  const categoryOptions = useContextSelector(ChatSettingContext, (v) => {
    const categories = v.chatSettings?.categories || [];
    return [
      { label: t('chat:setting.favourite.category_all'), value: '' },
      ...categories.map((c) => ({ label: c.name, value: c.id }))
    ];
  });
  // app's categories cache map
  const categoryCache = useContextSelector(ChatSettingContext, (v) => {
    const categories = v.chatSettings?.categories || [];
    return categories.reduce(
      (acc, category) => {
        acc[category.id] = category;
        return acc;
      },
      {} as Record<string, (typeof categories)[number]>
    );
  });

  const [localFavourites, setLocalFavourites] = useState<FavouriteRow[]>([]);
  const allFavourites = useRef<FavouriteRow[]>([]);

  // search favourite apps by apps' name and category
  const {
    data: favouriteApps,
    loading: isSearching,
    runAsync: runGetFavouriteApps
  } = useRequest2(
    async () => {
      const apps = await getFavouriteApps({
        name: searchAppNameValue,
        category: searchAppCategoryValue
      });

      if (!searchAppNameValue && !searchAppCategoryValue) {
        allFavourites.current = apps;
      }

      return apps;
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppNameValue, searchAppCategoryValue]
    }
  );

  useEffect(() => {
    const list = (favouriteApps || []) as unknown as FavouriteRow[];
    setLocalFavourites(list);
    setCheckedApps(new Array(list.length).fill(false));
  }, [favouriteApps]);

  // persist favourites
  const { run: runUpdateAll, loading: isUpdatingAll } = useRequest2(
    async (list: FavouriteRow[]) => {
      await updateAllFavouriteApp(
        list.map((item, idx) => ({
          order: idx,
          appId: item.appId,
          categories: item.categories
        }))
      );
    },
    {
      manual: true
    }
  );

  // open category manage modal
  const {
    isOpen: isOpenCategoryManageModal,
    onOpen: onOpenCategoryManageModal,
    onClose: onCloseCategoryManageModal
  } = useDisclosure();

  // open add app modal
  const {
    isOpen: isOpenAddAppModal,
    onOpen: onOpenAddAppModal,
    onClose: onCloseAddAppModal
  } = useDisclosure();

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
    <>
      <MyBox
        py={5}
        pl={6}
        pr={[0, 6]}
        gap={['13px', '26px']}
        display="flex"
        flexDir="column"
        isLoading={isSearching}
        mt={['46px', 0]}
        h={['calc(100vh - 46px)', 'full']}
      >
        <Header>
          <HStack spacing="3" flexWrap="wrap">
            <InputGroup w={['auto', '200px']}>
              <InputLeftElement w="36px" h="36px">
                <MyIcon name="common/searchLight" w="4" color="myGray.500" />
              </InputLeftElement>
              <Input
                pl="8"
                isDisabled={isSearching}
                placeholder={t('chat:setting.favourite.search_placeholder')}
                {...register('search')}
              />
            </InputGroup>

            <MySelect
              fontWeight="400"
              minW={['auto', '120px']}
              isDisabled={isSearching}
              list={categoryOptions}
              placeholder={t('chat:setting.favourite.category_placeholder')}
              value={searchAppCategoryValue}
              onChange={(category) => setSearchValue('category', category)}
            />

            <Button
              variant="whitePrimary"
              w={'auto'}
              fontWeight="400"
              onClick={onOpenCategoryManageModal}
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

        <CheckboxGroup>
          <TableContainer overflowY="auto" flex="1 0 0">
            <Table variant="simple" fontSize="sm" position="relative">
              <Thead position="sticky" top="0" zIndex="1">
                <Tr>
                  <Th p="0" px="2" w="0">
                    <Checkbox
                      isChecked={allAppsChecked}
                      isIndeterminate={isIndeterminate}
                      onChange={(e) =>
                        setCheckedApps(new Array(localFavourites.length).fill(e.target.checked))
                      }
                      isDisabled={isUpdatingAll}
                    />
                  </Th>
                  <Th p="0" w="0"></Th>
                  <Th>{t('chat:setting.favourite.table_column_name')}</Th>
                  <Th>{t('chat:setting.favourite.table_column_intro')}</Th>
                  <Th>{t('chat:setting.favourite.table_column_category')}</Th>
                  <Th p="0" textAlign="center">
                    {t('chat:setting.favourite.table_column_action')}
                  </Th>
                </Tr>
              </Thead>

              <DndDrag<FavouriteRow>
                dataList={localFavourites}
                renderInnerPlaceholder={false}
                onDragEndCb={(list) => {
                  // keep checkbox state by item id
                  const checkedById = new Map<string, boolean>();
                  localFavourites.forEach((item, idx) =>
                    checkedById.set(item._id, checkedApps[idx])
                  );
                  const next = list.map((item, idx) => ({ ...item, order: idx }));
                  setLocalFavourites(next);
                  setCheckedApps(next.map((item) => checkedById.get(item._id) || false));
                  runUpdateAll(next);
                }}
              >
                {({ provided }) => (
                  <Tbody ref={provided.innerRef} {...provided.droppableProps}>
                    {localFavourites.map((row, index) => (
                      <Draggable key={row._id} draggableId={row._id} index={index}>
                        {(provided, snapshot) => (
                          <Tr
                            ref={provided.innerRef as any}
                            {...provided.draggableProps}
                            bg={snapshot.isDragging ? 'myGray.50' : 'transparent'}
                            _hover={{ bg: 'myGray.50' }}
                          >
                            {/* checkbox */}
                            <Td p="0" px="2" w="0">
                              <Checkbox
                                pt="0.5"
                                isChecked={checkedApps[index] || false}
                                onChange={() =>
                                  setCheckedApps((prev) =>
                                    prev.map((v, i) => (i === index ? !v : v))
                                  )
                                }
                              />
                            </Td>

                            {/* drag handle */}
                            <Td p="0">
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
                                <Avatar src={row.avatar} borderRadius={'md'} w="1.25rem" />
                                <Flex className="textEllipsis">{row.name || ''}</Flex>
                              </HStack>
                            </Td>

                            {/* intro */}
                            <Td maxW="520px">
                              <Flex className="textEllipsis" color={'myGray.600'}>
                                {row.intro || ''}
                              </Flex>
                            </Td>

                            {/* category */}
                            <Td>
                              <Wrap>
                                {row.categories.slice(0, 3).map((id) => (
                                  <CategoryBox key={id} id={id} />
                                ))}

                                {row.categories.length > 3 && (
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
                                        +{row.categories.length - 3}
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
                                        {row.categories.slice(3).map((id) => (
                                          <CategoryBox key={id} id={id} />
                                        ))}
                                      </Flex>
                                    )}
                                  </MyPopover>
                                )}
                              </Wrap>
                            </Td>

                            {/* action */}
                            <Td p="0" textAlign="center">
                              <MyPopover
                                w="180px"
                                placement="bottom-start"
                                trigger="click"
                                Trigger={
                                  <IconButton
                                    size="sm"
                                    aria-label="delete"
                                    variant="grayGhost"
                                    color="myGray.500"
                                    icon={
                                      <MyIcon name="common/trash" w="20px" color="myGray.400" />
                                    }
                                  />
                                }
                              >
                                {({ onClose }) => (
                                  <Flex flexDir="column" gap="2" alignItems="flex-start" p="2">
                                    <Flex fontWeight="500" alignItems="center" gap="1">
                                      <MyIcon name="common/errorFill" w="16px" />
                                      <Box fontSize="sm">
                                        {t('chat:setting.favourite.delete_app_title')}
                                      </Box>
                                    </Flex>

                                    <Box fontSize="xs">
                                      {t('chat:setting.favourite.delete_app_confirm')}
                                    </Box>

                                    <ButtonGroup size="xs" alignSelf="flex-end">
                                      <Button variant="whitePrimary" onClick={onClose}>
                                        {t('chat:setting.favourite.delete_app_cancel_button')}
                                      </Button>

                                      <Button
                                        variant="dangerFill"
                                        onClick={() => {
                                          setLocalFavourites((prev) => {
                                            const next = prev.filter((_, i) => i !== index);
                                            // reset order
                                            const ordered = next.map((item, idx) => ({
                                              ...item,
                                              order: idx
                                            }));
                                            runUpdateAll(ordered);
                                            return ordered;
                                          });
                                          setCheckedApps((prev) =>
                                            prev.filter((_, i) => i !== index)
                                          );
                                        }}
                                      >
                                        {t('chat:setting.favourite.delete_app_confirm_button')}
                                      </Button>
                                    </ButtonGroup>
                                  </Flex>
                                )}
                              </MyPopover>
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
          </TableContainer>
        </CheckboxGroup>
      </MyBox>

      <CategoryManageModal
        isOpen={isOpenCategoryManageModal}
        onClose={onCloseCategoryManageModal}
        onRefresh={runGetFavouriteApps}
      />

      <AddFavouriteAppModal
        isOpen={isOpenAddAppModal}
        favourites={allFavourites.current || []}
        onClose={onCloseAddAppModal}
        onRefresh={runGetFavouriteApps}
      />
    </>
  );
};

export default FavouriteAppSetting;
