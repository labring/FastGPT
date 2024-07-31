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
  getTagUsage,
  postAddTagsToCollections,
  postCreateDatasetCollectionTag,
  updateDatasetCollectionTag
} from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { debounce } from 'lodash';
import MyInput from '@/components/MyInput';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useQuery } from '@tanstack/react-query';
import EmptyCollectionTip from './EmptyCollectionTip';

const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const { collections, getData } = useContextSelector(CollectionPageContext, (v) => v);

  const tagInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [currentAddTag, setCurrentAddTag] = useState<
    (DatasetTagType & { collections: string[] }) | undefined
  >(undefined);

  const [newTag, setNewTag] = useState<string | undefined>(undefined);

  const [currentEditTagContent, setCurrentEditTagContent] = useState<string | undefined>(undefined);
  const [currentEditTag, setCurrentEditTag] = useState<DatasetTagType | undefined>(undefined);

  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

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
    }
  });

  const { mutate: onSaveCollectionTag, isLoading: isSaveCollectionTagLoading } = useRequest({
    mutationFn: async (tag: string) => {
      try {
        await postAddTagsToCollections({
          tag,
          collectionIds: selectedCollections,
          datasetId: datasetDetail._id
        });
      } catch (error) {}
    },

    onSuccess() {
      getData(1);
    }
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

  const { data: tagUsages } = useQuery(
    [datasetDetail._id, collections],
    () => getTagUsage(datasetDetail._id),
    {}
  );

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
              const usage = tagUsage?.usage || 0;
              const collections = tagUsage?.collections || [];

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
                        value={currentEditTagContent || item.tag}
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
                    <Box flex={'1 0 0'}></Box>
                    <Box
                      className="icon-box"
                      display="none"
                      _hover={{ bg: '#1118240D' }}
                      mr={2}
                      p={1}
                      borderRadius={'6px'}
                      cursor={'pointer'}
                    >
                      <MyIcon name="common/addLight" w={4} />
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
                        e.stopPropagation();
                        setCurrentEditTag(item);
                        editInputRef.current?.focus();
                      }}
                    >
                      <MyIcon name="edit" w={4} />
                    </Box>
                    <Box
                      className="icon-box"
                      display="none"
                      _hover={{ bg: '#1118240D' }}
                      p={1}
                      borderRadius={'6px'}
                      cursor={'pointer'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCollectionTag(item._id);
                      }}
                    >
                      <MyIcon name="delete" w={4} />
                    </Box>
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
          selectedCollections={selectedCollections}
          setSelectedCollections={setSelectedCollections}
        />
      )}
    </MyModal>
  );
};

export default TagManageModal;

const AddTagToCollections = ({
  currentAddTag,
  setCurrentAddTag,
  onSaveCollectionTag,
  selectedCollections,
  setSelectedCollections
}: {
  currentAddTag: DatasetTagType & { collections: string[] };
  setCurrentAddTag: (tag: (DatasetTagType & { collections: string[] }) | undefined) => void;
  onSaveCollectionTag: (tag: string) => void;
  selectedCollections: string[];
  setSelectedCollections: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  const { t } = useTranslation();

  const { collections, getData, searchText, setSearchText, Pagination, total, pageSize } =
    useContextSelector(CollectionPageContext, (v) => v);

  const formatCollections = useMemo(
    () =>
      collections.map((collection) => {
        const icon = getCollectionIcon(collection.type, collection.name);
        return {
          id: collection._id,
          tags: collection.tags,
          name: collection.name,
          icon
        };
      }),
    [collections]
  );

  useEffect(() => {
    setSelectedCollections(currentAddTag.collections);
  }, []);

  const lastSearch = useRef('');
  const debounceRefetch = useCallback(
    debounce(() => {
      getData(1);
      lastSearch.current = searchText;
    }, 300),
    []
  );

  return (
    <>
      <Flex alignItems={'center'} pb={2} mx={8} pt={6} borderBottom={'1px solid #E8EBF0'}>
        <MyIcon
          name="common/backFill"
          w={4}
          cursor={'pointer'}
          onClick={() => {
            setCurrentAddTag(undefined);
            setSearchText('');
            getData(1);
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
            debounceRefetch();
          }}
        />
        <Button
          leftIcon={<MyIcon name="save" w={4} />}
          onClick={() => {
            onSaveCollectionTag(currentAddTag._id);
          }}
        >
          {t('common:common.Save')}
        </Button>
      </Flex>
      <Box px={8} mt={2} overflow={'auto'}>
        {formatCollections.map((collection) => {
          return (
            <Flex
              px={2}
              py={1}
              flex={'1'}
              _hover={{ bg: 'myGray.100' }}
              alignItems={'center'}
              borderRadius={'4px'}
              key={collection.id}
            >
              <Checkbox
                size={'md'}
                mr={2}
                onChange={() => {
                  setSelectedCollections((prev) => {
                    if (prev.includes(collection.id)) {
                      setSelectedCollections((prev) => prev.filter((id) => id !== collection.id));
                      return prev.filter((id) => id !== collection.id);
                    } else {
                      setSelectedCollections((prev) => [...prev, collection.id]);
                      return [...prev, collection.id];
                    }
                  });
                }}
                isChecked={selectedCollections.includes(collection.id)}
              />
              <MyIcon name={collection.icon as any} w={'16px'} mr={2} />
              <Box fontSize={'14px'} borderRadius={'6px'}>
                {collection.name}
              </Box>
            </Flex>
          );
        })}
      </Box>
      {total > pageSize && (
        <Flex justifyContent={'center'} pb={2}>
          <Pagination />
        </Flex>
      )}
      {total === 0 && <EmptyCollectionTip />}
    </>
  );
};
