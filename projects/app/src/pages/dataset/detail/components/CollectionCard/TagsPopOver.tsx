import { Box, Checkbox, Flex, Input } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { postCreateDatasetCollectionTag, putDatasetCollectionById } from '@/web/core/dataset/api';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { CollectionPageContext } from './Context';
import { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import { useDeepCompareEffect } from 'ahooks';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';

const TagsPopOver = ({
  currentCollection
}: {
  currentCollection: DatasetCollectionsListItemType;
}) => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const datasetTags = useContextSelector(DatasetPageContext, (v) => v.datasetTags);
  const loadDatasetTags = useContextSelector(DatasetPageContext, (v) => v.loadDatasetTags);

  const { getData } = useContextSelector(CollectionPageContext, (v) => v);

  const [searchTag, setSearchTag] = useState('');
  const [checkedTags, setCheckedTags] = useState<DatasetTagType[]>(currentCollection.tags || []);

  const [showTagManage, setShowTagManage] = useState(false);

  useEffect(() => {
    loadDatasetTags({ id: datasetDetail._id, searchKey: searchTag });
  }, [searchTag]);

  const [visibleTags, setVisibleTags] = useState<DatasetTagType[]>(currentCollection.tags || []);
  const [overflowTags, setOverflowTags] = useState<DatasetTagType[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overflowRef = useRef<HTMLDivElement>(null);

  useDeepCompareEffect(() => {
    const calculateTags = () => {
      if (!containerRef.current || !currentCollection.tags) return;

      const containerWidth = containerRef.current.offsetWidth;
      let totalWidth = overflowRef.current?.offsetWidth || 30;
      let visibleCount = 0;

      for (let i = 0; i < currentCollection.tags.length; i++) {
        const tagWidth = tagRefs.current[i]?.offsetWidth || 0;
        if (totalWidth + tagWidth <= containerWidth) {
          totalWidth += tagWidth;
          visibleCount++;
        } else {
          break;
        }
      }

      setVisibleTags(currentCollection.tags.slice(0, visibleCount));
      setOverflowTags(currentCollection.tags.slice(visibleCount));
    };

    setTimeout(calculateTags, 100);

    window.addEventListener('resize', calculateTags);

    return () => {
      window.removeEventListener('resize', calculateTags);
    };
  }, [currentCollection, containerRef]);

  const { mutate: onCreateCollectionTag, isLoading: isCreateCollectionTagLoading } = useRequest({
    mutationFn: async (tag: string) => {
      const id = await postCreateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tag
      });
      return id;
    },

    onSuccess() {
      setSearchTag('');
    },
    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed')
  });

  return (
    <MyPopover
      placement={showTagManage ? 'bottom' : 'bottom-end'}
      hasArrow={false}
      offset={[2, 2]}
      w={'180px'}
      trigger={'hover'}
      Trigger={
        <Flex
          ref={containerRef}
          mt={1}
          py={0.5}
          px={0.25}
          _hover={{
            bg: 'myGray.50',
            borderRadius: '3px'
          }}
          onMouseEnter={(e) => {
            e.stopPropagation();
            if (!e.currentTarget.parentElement || !e.currentTarget.parentElement.parentElement)
              return;
            e.currentTarget.parentElement.parentElement.style.backgroundColor = 'white';
          }}
          onMouseLeave={(e) => {
            if (!e.currentTarget.parentElement || !e.currentTarget.parentElement.parentElement)
              return;
            e.currentTarget.parentElement.parentElement.style.backgroundColor = '';
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowTagManage(true);
          }}
        >
          <Flex>
            {visibleTags.map((item, index) => (
              <Box
                key={index}
                ref={(el) => (tagRefs.current[index] = el) as any}
                h={5}
                mr={1}
                px={2}
                fontSize={'11px'}
                bg={'#F0FBFF'}
                color={'#0884DD'}
                borderRadius={'4px'}
              >
                {item.tag}
              </Box>
            ))}
          </Flex>
          {overflowTags.length > 0 && (
            <Box
              h={5}
              px={2}
              bg={'#1118240D'}
              borderRadius={'33px'}
              fontSize={'11px'}
              ref={overflowRef}
            >
              {`+${overflowTags.length}`}
            </Box>
          )}
        </Flex>
      }
      onCloseFunc={async () => {
        setShowTagManage(false);
        if (checkedTags === currentCollection.tags || !showTagManage) return;
        await putDatasetCollectionById({
          id: currentCollection._id,
          tags: checkedTags.map((tag) => tag._id)
        });
        getData(1);
      }}
      display={showTagManage || overflowTags.length > 0 ? 'block' : 'none'}
    >
      {({ onClose }) => (
        <>
          {showTagManage ? (
            <MyBox isLoading={isCreateCollectionTagLoading} onClick={(e) => e.stopPropagation()}>
              <Box px={1.5} pt={1.5}>
                <Input
                  pl={2}
                  h={7}
                  borderRadius={'4px'}
                  value={searchTag}
                  placeholder={t('dataset:tag.searchOrAddTag')}
                  onChange={(e) => setSearchTag(e.target.value)}
                />
                <Box my={1}>
                  {searchTag && !datasetTags.map((item) => item.tag).includes(searchTag) && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      px={1}
                      cursor={'pointer'}
                      _hover={{ bg: '#1118240D', color: '#2B5FD9' }}
                      borderRadius={'xs'}
                      onClick={() => {
                        onCreateCollectionTag(searchTag);
                      }}
                    >
                      <MyIcon name={'common/addLight'} w={'14px'} />
                      <Box ml={1} py={1}>
                        {t('dataset:tag.add') + ` "${searchTag}"`}
                      </Box>
                    </Flex>
                  )}
                  {datasetTags?.map((item) => {
                    const tagsList = checkedTags.map((tag) => tag.tag);
                    return (
                      <Flex
                        alignItems={'center'}
                        fontSize={'xs'}
                        px={1}
                        py={1}
                        key={item._id}
                        cursor={'pointer'}
                        bg={tagsList.includes(item.tag) ? '#1118240D' : 'transparent'}
                        color={tagsList.includes(item.tag) ? '#2B5FD9' : 'myGray.600'}
                        _hover={{ bg: '#1118240D', color: '#2B5FD9' }}
                        borderRadius={'xs'}
                      >
                        <Checkbox
                          isChecked={tagsList.includes(item.tag)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedTags([...checkedTags, item]);
                            } else {
                              setCheckedTags(checkedTags.filter((t) => t._id !== item._id));
                            }
                          }}
                        />
                        <Box ml={1}>{item.tag}</Box>
                      </Flex>
                    );
                  })}
                </Box>
              </Box>
            </MyBox>
          ) : (
            <Flex gap={1} p={3} flexWrap={'wrap'}>
              {overflowTags.map((tag, index) => (
                <Box
                  key={index}
                  ref={(el) => (tagRefs.current[index] = el) as any}
                  h={5}
                  px={2}
                  fontSize={'11px'}
                  bg={'#F0FBFF'}
                  color={'#0884DD'}
                  borderRadius={'4px'}
                >
                  {tag.tag}
                </Box>
              ))}
            </Flex>
          )}
        </>
      )}
    </MyPopover>
  );
};

export default TagsPopOver;
