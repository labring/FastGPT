import { Box, Button, Checkbox, Flex, Input, useDisclosure } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { postCreateDatasetCollectionTag } from '@/web/core/dataset/api';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { CollectionPageContext } from './Context';
import { debounce, isEqual } from 'lodash';
import TagManageModal from './TagManageModal';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';

const HeaderTagPopOver = () => {
  const { t } = useTranslation();
  const [searchTag, setSearchTag] = useState('');
  const [checkedTags, setCheckedTags] = useState<string[]>([]);

  const { datasetDetail, datasetTags, loadDatasetTags, checkedDatasetTag, setCheckedDatasetTag } =
    useContextSelector(DatasetPageContext, (v) => v);

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

  const { filterTags, setFilterTags, getData } = useContextSelector(
    CollectionPageContext,
    (v) => v
  );
  const debounceRefetch = useCallback(
    debounce(() => {
      getData(1);
    }, 300),
    []
  );

  useEffect(() => {
    loadDatasetTags({ id: datasetDetail._id, searchKey: searchTag });
  }, [searchTag]);

  const {
    isOpen: isTagManageModalOpen,
    onOpen: onOpenTagManageModal,
    onClose: onCloseTagManageModal
  } = useDisclosure();

  const checkTags = (tag: DatasetTagType) => {
    if (checkedTags.includes(tag._id)) {
      setCheckedTags(checkedTags.filter((t) => t !== tag._id));
      setCheckedDatasetTag(checkedDatasetTag.filter((t) => t._id !== tag._id));
    } else {
      setCheckedTags([...checkedTags, tag._id]);
      setCheckedDatasetTag([...checkedDatasetTag, tag]);
    }
  };

  return (
    <>
      <MyPopover
        placement="bottom"
        hasArrow={false}
        offset={[2, 2]}
        w={'180px'}
        trigger={'hover'}
        Trigger={
          <Flex
            alignItems={'center'}
            px={3}
            py={2}
            w={'180px'}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            cursor={'pointer'}
            overflow={'hidden'}
            h={['36px', '36px']}
            fontSize={'sm'}
          >
            <Flex flex={'1 0 0'}>
              {t('dataset:tag.tags')}
              <Box as={'span'}>
                {checkedTags.length > 0 && (
                  <Box ml={1} fontSize={'xs'} color={'myGray.600'}>
                    {`(${checkedTags.length})`}
                  </Box>
                )}
              </Box>
            </Flex>
            <MyIcon name={'core/chat/chevronDown'} w={'14px'} />
          </Flex>
        }
        onCloseFunc={() => {
          if (isEqual(checkedTags, filterTags)) return;
          setFilterTags(checkedTags);
          debounceRefetch();
        }}
      >
        {({ onClose }) => (
          <MyBox isLoading={isCreateCollectionTagLoading} onClick={(e) => e.stopPropagation()}>
            <Box px={1.5} pt={1.5}>
              <Input
                pl={2}
                h={9}
                borderRadius={'4px'}
                value={searchTag}
                placeholder={t('dataset:tag.searchOrAddTag')}
                onChange={(e) => setSearchTag(e.target.value)}
              />
              <Box my={1} maxH={'400px'} overflow={'auto'}>
                {searchTag && !datasetTags.map((item) => item.tag).includes(searchTag) && (
                  <Flex
                    alignItems={'center'}
                    fontSize={'sm'}
                    px={1}
                    cursor={'pointer'}
                    _hover={{ bg: '#1118240D', color: 'primary.700' }}
                    borderRadius={'xs'}
                    onClick={() => {
                      onCreateCollectionTag(searchTag);
                    }}
                  >
                    <MyIcon name={'common/addLight'} w={'16px'} />
                    <Box ml={2} py={2}>
                      {t('dataset:tag.add') + ` "${searchTag}"`}
                    </Box>
                  </Flex>
                )}

                {[
                  ...new Map(
                    [...checkedDatasetTag, ...datasetTags].map((item) => [item._id, item])
                  ).values()
                ].map((item) => {
                  const checked = checkedTags.includes(item._id);
                  return (
                    <Flex
                      alignItems={'center'}
                      fontSize={'sm'}
                      px={1}
                      py={2}
                      cursor={'pointer'}
                      bg={checked ? '#1118240D' : 'transparent'}
                      color={checked ? 'primary.700' : 'myGray.600'}
                      _hover={{ bg: '#1118240D', color: 'primary.700' }}
                      borderRadius={'xs'}
                      key={item._id}
                      onClick={(e) => {
                        e.preventDefault();
                        checkTags(item);
                      }}
                    >
                      <Checkbox
                        isChecked={checkedTags.includes(item._id)}
                        onChange={(e) => {
                          checkTags(item);
                        }}
                        size={'md'}
                      />
                      <Box ml={2}>{item.tag}</Box>
                    </Flex>
                  );
                })}
              </Box>
            </Box>
            <Flex borderTop={'1px solid #E8EBF0'} color={'myGray.600'}>
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                variant={'unstyled'}
                onClick={() => setCheckedTags([])}
              >
                {t('dataset:tag.cancel')}
              </Button>
              <Box w={'1px'} bg={'myGray.200'}></Box>
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                variant={'unstyled'}
                onClick={() => {
                  onOpenTagManageModal();
                  setCheckedTags([]);
                }}
              >
                {t('dataset:tag.manage')}
              </Button>
            </Flex>
          </MyBox>
        )}
      </MyPopover>
      {isTagManageModalOpen && (
        <TagManageModal
          onClose={() => {
            onCloseTagManageModal();
            debounceRefetch();
          }}
        />
      )}
    </>
  );
};

export default HeaderTagPopOver;
