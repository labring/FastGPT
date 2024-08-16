import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Button, Flex, Box, Checkbox } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from './Context';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import {
  delDatasetCollectionTag,
  getDatasetCollectionTags,
  getScrollCollectionList,
  getTagUsage,
  postAddTagsToCollections,
  postCreateDatasetCollectionTag,
  updateDatasetCollectionTag
} from '@/web/core/dataset/api';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyInput from '@/components/MyInput';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';

const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetTags = useContextSelector(DatasetPageContext, (v) => v.loadDatasetTags);
  const loadAllDatasetTags = useContextSelector(DatasetPageContext, (v) => v.loadAllDatasetTags);
  const { getData, collections } = useContextSelector(CollectionPageContext, (v) => v);

  const tagInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [currentAddTag, setCurrentAddTag] = useState<
    (DatasetTagType & { collections: string[] }) | undefined
  >(undefined);

  const [newTag, setNewTag] = useState<string | undefined>(undefined);

  const [currentEditTagContent, setCurrentEditTagContent] = useState<string | undefined>(undefined);
  const [currentEditTag, setCurrentEditTag] = useState<DatasetTagType | undefined>(undefined);

  useEffect(() => {
    if (newTag !== undefined && tagInputRef.current) {
      tagInputRef.current?.focus();
    }
  }, [newTag]);

  useEffect(() => {
    if (currentEditTag !== undefined && editInputRef.current) {
      editInputRef.current?.focus();
    }
  }, [currentEditTag]);

  const { mutate: onCreateCollectionTag, isLoading: isCreateCollectionTagLoading } = useRequest({
    mutationFn: async (tag: string) => {
      const id = await postCreateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tag
      });
      return id;
    },

    onSuccess() {
      fetchData(1);
      loadDatasetTags({ id: datasetDetail._id, searchKey: '' });
      loadAllDatasetTags({ id: datasetDetail._id });
    },
    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed')
  });

  const { mutate: onDeleteCollectionTag, isLoading: isDeleteCollectionTagLoading } = useRequest({
    mutationFn: async (tag: string) => {
      const id = await delDatasetCollectionTag({
        datasetId: datasetDetail._id,
        id: tag
      });
      return id;
    },

    onSuccess() {
      fetchData(1);
      loadDatasetTags({ id: datasetDetail._id, searchKey: '' });
      loadAllDatasetTags({ id: datasetDetail._id });
    },
    successToast: t('common:common.Delete Success'),
    errorToast: t('common:common.Delete Failed')
  });

  const { mutate: onUpdateCollectionTag, isLoading: isUpdateCollectionTagLoading } = useRequest({
    mutationFn: async (tag: DatasetTagType) => {
      const id = await updateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tagId: tag._id,
        tag: tag.tag
      });
      return id;
    },
    onSuccess() {
      fetchData(1);
      loadDatasetTags({ id: datasetDetail._id, searchKey: '' });
      loadAllDatasetTags({ id: datasetDetail._id });
    }
  });

  const { mutate: onSaveCollectionTag, isLoading: isSaveCollectionTagLoading } = useRequest({
    mutationFn: async ({
      tag,
      originCollectionIds,
      collectionIds
    }: {
      tag: string;
      originCollectionIds: string[];
      collectionIds: string[];
    }) => {
      try {
        await postAddTagsToCollections({
          tag,
          originCollectionIds,
          collectionIds,
          datasetId: datasetDetail._id
        });
      } catch (error) {}
    },

    onSuccess() {
      getData(1);
    },
    successToast: t('common:common.Save Success'),
    errorToast: t('common:common.Save Failed')
  });

  const {
    list,
    ScrollList,
    isLoading: isRequesting,
    fetchData,
    total: tagsTotal
  } = useScrollPagination(getDatasetCollectionTags, {
    refreshDeps: [''],
    debounceWait: 300,

    itemHeight: 56,
    overscan: 10,

    pageSize: 10,
    defaultParams: {
      datasetId: datasetDetail._id,
      searchText: ''
    }
  });

  const { data: tagUsages } = useRequest2(() => getTagUsage(datasetDetail._id), {
    manual: false,
    refreshDeps: [collections]
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="core/dataset/tag"
      title={t('dataset:tag.manage')}
      w={'580px'}
      h={'600px'}
      isLoading={
        isRequesting ||
        isCreateCollectionTagLoading ||
        isDeleteCollectionTagLoading ||
        isUpdateCollectionTagLoading ||
        isSaveCollectionTagLoading
      }
      closeOnOverlayClick={false}
    >
      {currentAddTag === undefined ? (
        <>
          <Flex
            alignItems={'center'}
            color={'myGray.900'}
            pb={2}
            borderBottom={'1px solid #E8EBF0'}
            mx={8}
            pt={6}
          >
            <MyIcon name="menu" w={5} />
            <Box ml={2} fontWeight={'semibold'} flex={'1 0 0'}>{`共${tagsTotal}个标签`}</Box>
            <Button
              size={'sm'}
              leftIcon={<MyIcon name="common/addLight" w={4} />}
              variant={'outline'}
              fontSize={'xs'}
              onClick={() => {
                setNewTag('');
              }}
            >
              {t('dataset:tag.Add New')}
            </Button>
          </Flex>
          <ScrollList
            px={8}
            flex={'1 0 0'}
            fontSize={'sm'}
            EmptyChildren={<EmptyTip text={t('dataset:dataset.no_tags')} />}
          >
            {newTag !== undefined && (
              <Flex p={2} borderBottom={'1px solid #E8EBF0'}>
                <Input
                  placeholder={t('dataset:tag.Add_new_tag')}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  ref={tagInputRef}
                  w={'200px'}
                  onBlur={() => {
                    if (newTag && !list.map((item) => item.data.tag).includes(newTag)) {
                      onCreateCollectionTag(newTag);
                    }
                    setNewTag(undefined);
                  }}
                />
              </Flex>
            )}
            {list.map((listItem) => {
              const item = listItem.data;
              const tagUsage = tagUsages?.find((tagUsage) => tagUsage.tagId === item._id);
              const collections = tagUsage?.collections || [];
              const usage = collections.length;

              return (
                <Flex
                  py={2}
                  borderBottom={'1px solid #E8EBF0'}
                  sx={{
                    '&:hover .icon-box': {
                      display: 'flex'
                    }
                  }}
                  key={item._id}
                >
                  <Flex
                    px={2}
                    py={1}
                    flex={'1'}
                    _hover={{ bg: 'myGray.100' }}
                    alignItems={'center'}
                    borderRadius={'4px'}
                  >
                    <Flex
                      flex={'1 0 0'}
                      alignItems={'center'}
                      onClick={() => {
                        setCurrentAddTag({ ...item, collections });
                      }}
                      cursor={'pointer'}
                    >
                      {currentEditTag?._id !== item._id ? (
                        <Box
                          px={3}
                          py={1.5}
                          bg={'#DBF3FF'}
                          color={'#0884DD'}
                          fontSize={'xs'}
                          borderRadius={'6px'}
                        >
                          {item.tag}
                        </Box>
                      ) : (
                        <Input
                          placeholder={t('dataset:tag.Edit_tag')}
                          value={
                            currentEditTagContent !== undefined ? currentEditTagContent : item.tag
                          }
                          onChange={(e) => setCurrentEditTagContent(e.target.value)}
                          ref={editInputRef}
                          w={'200px'}
                          onBlur={() => {
                            if (
                              currentEditTagContent &&
                              !list.map((item) => item.data.tag).includes(currentEditTagContent)
                            ) {
                              onUpdateCollectionTag({
                                tag: currentEditTagContent,
                                _id: item._id
                              });
                            }
                            setCurrentEditTag(undefined);
                            setCurrentEditTagContent(undefined);
                          }}
                        />
                      )}
                      <Box as={'span'} color={'myGray.500'} ml={2}>{`(${usage})`}</Box>
                    </Flex>
                    <Box
                      className="icon-box"
                      display="none"
                      _hover={{ bg: '#1118240D' }}
                      mr={2}
                      p={1}
                      borderRadius={'6px'}
                      onClick={() => {
                        setCurrentAddTag({ ...item, collections });
                      }}
                      cursor={'pointer'}
                    >
                      <MyIcon name="common/add2" w={4} />
                    </Box>
                    <Box
                      className="icon-box"
                      display="none"
                      _hover={{ bg: '#1118240D' }}
                      mr={2}
                      p={1}
                      borderRadius={'6px'}
                      cursor={'pointer'}
                      onClick={(e) => {
                        setCurrentEditTag(item);
                        editInputRef.current?.focus();
                      }}
                    >
                      <MyIcon name="edit" w={4} />
                    </Box>
                    <PopoverConfirm
                      showCancel
                      content={t('dataset:tag.delete_tag_confirm')}
                      type="delete"
                      Trigger={
                        <Box
                          className="icon-box"
                          display="none"
                          _hover={{ bg: '#1118240D' }}
                          p={1}
                          borderRadius={'6px'}
                          cursor={'pointer'}
                        >
                          <MyIcon name="delete" w={4} />
                        </Box>
                      }
                      onConfirm={() => onDeleteCollectionTag(item._id)}
                    />
                  </Flex>
                </Flex>
              );
            })}
          </ScrollList>
        </>
      ) : (
        <AddTagToCollections
          currentAddTag={currentAddTag}
          setCurrentAddTag={setCurrentAddTag}
          onSaveCollectionTag={onSaveCollectionTag}
        />
      )}
    </MyModal>
  );
};

export default TagManageModal;

const AddTagToCollections = ({
  currentAddTag,
  setCurrentAddTag,
  onSaveCollectionTag
}: {
  currentAddTag: DatasetTagType & { collections: string[] };
  setCurrentAddTag: (tag: (DatasetTagType & { collections: string[] }) | undefined) => void;
  onSaveCollectionTag: ({
    tag,
    originCollectionIds,
    collectionIds
  }: {
    tag: string;
    originCollectionIds: string[];
    collectionIds: string[];
  }) => void;
}) => {
  const { t } = useTranslation();

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  useEffect(() => {
    setSelectedCollections(currentAddTag.collections);
  }, []);

  const [searchText, setSearchText] = useState('');

  const {
    list: collectionsList,
    ScrollList: ScrollListCollections,
    isLoading: isCollectionLoading
  } = useScrollPagination(getScrollCollectionList, {
    refreshDeps: [searchText],
    debounceWait: 300,

    itemHeight: 29,
    overscan: 10,

    pageSize: 30,
    defaultParams: {
      datasetId: datasetDetail._id,
      searchText
    }
  });

  const formatCollections = useMemo(
    () =>
      collectionsList.map((item) => {
        const collection = item.data;
        const icon = getCollectionIcon(collection.type, collection.name);
        return {
          id: collection._id,
          tags: collection.tags,
          name: collection.name,
          icon
        };
      }),
    [collectionsList]
  );

  return (
    <MyBox flex={'1 0 0'} isLoading={isCollectionLoading}>
      <Flex alignItems={'center'} pb={2} mx={8} pt={6} borderBottom={'1px solid #E8EBF0'}>
        <MyIcon
          name="common/backFill"
          w={4}
          cursor={'pointer'}
          onClick={() => {
            setCurrentAddTag(undefined);
            setSearchText('');
          }}
        />
        {
          <Flex alignItems={'center'}>
            <Box
              ml={2}
              px={3}
              py={1.5}
              bg={'#DBF3FF'}
              color={'#0884DD'}
              fontSize={'sm'}
              borderRadius={'6px'}
            >
              {currentAddTag.tag}
            </Box>
            <Box
              as={'span'}
              fontSize={'sm'}
              color={'myGray.500'}
              ml={2}
            >{`(${selectedCollections.length})`}</Box>
          </Flex>
        }
        <Box flex={'1 0 0'}></Box>
        <MyInput
          placeholder={t('common:common.Search')}
          w={'200px'}
          mr={2}
          onChange={(e) => {
            setSearchText(e.target.value);
          }}
        />
        <Button
          leftIcon={<MyIcon name="save" w={4} />}
          onClick={() => {
            onSaveCollectionTag({
              tag: currentAddTag._id,
              originCollectionIds: currentAddTag.collections,
              collectionIds: selectedCollections
            });
          }}
        >
          {t('common:common.Save')}
        </Button>
      </Flex>
      <ScrollListCollections
        px={8}
        mt={2}
        flex={'1 0 0'}
        fontSize={'sm'}
        EmptyChildren={<EmptyTip text={t('dataset:dataset.no_collections')} />}
      >
        {formatCollections.map((collection) => {
          return (
            <Flex
              px={2}
              py={1}
              mb={2}
              flex={'1'}
              _hover={{
                bg: 'myGray.100',
                ...(!selectedCollections.includes(collection.id)
                  ? { svg: { color: 'myGray.100' } }
                  : {})
              }}
              alignItems={'center'}
              borderRadius={'4px'}
              key={collection.id}
              cursor={'pointer'}
              onClick={() => {
                setSelectedCollections((prev) => {
                  if (prev.includes(collection.id)) {
                    return prev.filter((id) => id !== collection.id);
                  } else {
                    return [...prev, collection.id];
                  }
                });
              }}
            >
              <Checkbox
                size={'md'}
                mr={2}
                icon={<MyIcon name="common/check" w={'12px'} />}
                onChange={() => {
                  setSelectedCollections((prev) => {
                    if (prev.includes(collection.id)) {
                      return prev.filter((id) => id !== collection.id);
                    } else {
                      return [...prev, collection.id];
                    }
                  });
                }}
                isChecked={selectedCollections.includes(collection.id)}
              />
              <MyIcon name={collection.icon as any} w={'20px'} mr={2} />
              <Box fontSize={'14px'} borderRadius={'6px'} color={'myGray.900'}>
                {collection.name}
              </Box>
            </Flex>
          );
        })}
      </ScrollListCollections>
    </MyBox>
  );
};
