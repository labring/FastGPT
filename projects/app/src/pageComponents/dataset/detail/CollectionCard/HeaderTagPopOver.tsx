import { Box, Button, Checkbox, Flex, Input, useDisclosure } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useTranslation } from 'next-i18next';
import { CollectionPageContext } from './Context';
import { isEqual } from 'lodash';
import TagManageModal from './TagManageModal';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';

const HeaderTagPopOver = () => {
  const { t } = useTranslation();

  const {
    searchDatasetTagsResult,
    searchTagKey,
    setSearchTagKey,
    checkedDatasetTag,
    setCheckedDatasetTag,
    onCreateCollectionTag,
    isCreateCollectionTagLoading
  } = useContextSelector(DatasetPageContext, (v) => v);

  const { filterTags, setFilterTags, getData } = useContextSelector(
    CollectionPageContext,
    (v) => v
  );

  const checkedTags = filterTags;

  const {
    isOpen: isTagManageModalOpen,
    onOpen: onOpenTagManageModal,
    onClose: onCloseTagManageModal
  } = useDisclosure();

  const checkTags = (tag: DatasetTagType) => {
    let currentCheckedTags = [];
    if (checkedTags.includes(tag._id)) {
      currentCheckedTags = checkedTags.filter((t) => t !== tag._id);
      setCheckedDatasetTag(checkedDatasetTag.filter((t) => t._id !== tag._id));
    } else {
      currentCheckedTags = [...checkedTags, tag._id];
      setCheckedDatasetTag([...checkedDatasetTag, tag]);
    }
    if (isEqual(currentCheckedTags, filterTags)) return;
    setFilterTags(currentCheckedTags);
  };

  return (
    <>
      <MyPopover
        placement="bottom"
        hasArrow={false}
        offset={[2, 2]}
        w={'180px'}
        closeOnBlur={true}
        trigger={'click'}
        Trigger={
          <Flex
            alignItems={'center'}
            px={3}
            py={2}
            w={['140px', '180px']}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            cursor={'pointer'}
            overflow={'hidden'}
            h={['28px', '36px']}
            fontSize={'sm'}
            _hover={{
              boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
              borderColor: 'primary.300'
            }}
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
      >
        {({ onClose }) => (
          <MyBox isLoading={isCreateCollectionTagLoading} onClick={(e) => e.stopPropagation()}>
            <Box px={1.5} pt={1.5}>
              <Input
                pl={2}
                h={8}
                borderRadius={'xs'}
                value={searchTagKey}
                placeholder={t('dataset:tag.searchOrAddTag')}
                onChange={(e) => setSearchTagKey(e.target.value)}
              />
            </Box>

            <Box my={1} px={1.5} maxH={'240px'} overflow={'auto'}>
              {searchTagKey &&
                !searchDatasetTagsResult.map((item) => item.tag).includes(searchTagKey) && (
                  <Flex
                    alignItems={'center'}
                    fontSize={'sm'}
                    px={1}
                    cursor={'pointer'}
                    _hover={{ bg: '#1118240D', color: 'primary.700' }}
                    borderRadius={'xs'}
                    onClick={() => onCreateCollectionTag(searchTagKey)}
                  >
                    <MyIcon name={'common/addLight'} w={'16px'} />
                    <Box ml={2} py={2}>
                      {t('dataset:tag.add') + ` "${searchTagKey}"`}
                    </Box>
                  </Flex>
                )}

              {[
                ...new Map(
                  [...checkedDatasetTag, ...searchDatasetTagsResult].map((item) => [item._id, item])
                ).values()
              ].map((item) => {
                const checked = checkedTags.includes(item._id);
                return (
                  <Flex
                    alignItems={'center'}
                    fontSize={'sm'}
                    px={1}
                    py={1}
                    my={1}
                    cursor={'pointer'}
                    color={checked ? 'primary.700' : 'myGray.600'}
                    _hover={{
                      bg: '#1118240D',
                      color: 'primary.700',
                      ...(checked ? {} : { svg: { color: '#F3F3F4' } })
                    }}
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
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                    />
                    <Box ml={2}>{item.tag}</Box>
                  </Flex>
                );
              })}
            </Box>
            <Flex borderTop={'1px solid #E8EBF0'} color={'myGray.600'}>
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                borderBottomLeftRadius={'md'}
                variant={'unstyled'}
                onClick={() => {
                  setSearchTagKey('');
                  setFilterTags([]);
                  onClose();
                }}
              >
                {t('dataset:tag.cancel')}
              </Button>
              <Box w={'1px'} bg={'myGray.200'}></Box>
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                borderBottomRightRadius={'md'}
                variant={'unstyled'}
                onClick={() => {
                  onOpenTagManageModal();
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
            getData(1);
          }}
        />
      )}
    </>
  );
};

export default HeaderTagPopOver;
