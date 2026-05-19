import {
  Box,
  Checkbox,
  Flex,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useTranslation } from 'next-i18next';
import { CollectionPageContext } from '../CollectionCard/Context';
import { type CollectionTagValueType } from '@fastgpt/global/core/dataset/type';
import { useState, useMemo } from 'react';
import { formatTime2YMDHMUtc } from '@fastgpt/global/common/string/time';

const TagFilter = () => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { allDatasetTags } = useContextSelector(DatasetPageContext, (v) => v);

  const { setFilterTags, filterTagValues, setFilterTagValues, collections } = useContextSelector(
    CollectionPageContext,
    (v) => v
  );

  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const isActive = Object.values(filterTagValues).some((v) => v.length > 0);

  const currentTagId = selectedTagId ?? allDatasetTags[0]?._id ?? null;

  const availableValues = useMemo(() => {
    if (!currentTagId) return [];
    const valSet = new Set<string>();
    collections.forEach((col) => {
      (col.tags || [])
        .filter((t): t is CollectionTagValueType => typeof t === 'object' && t !== null)
        .forEach((t) => {
          if (t.tagId === currentTagId) valSet.add(String(t.value));
        });
    });
    return [...valSet].sort();
  }, [currentTagId, collections]);

  const currentTagType = useMemo(
    () => allDatasetTags.find((t) => t._id === currentTagId)?.tagType,
    [allDatasetTags, currentTagId]
  );

  const formatValue = (val: string) => {
    if (currentTagType === 'datetime') {
      const ts = Number(val);
      return isNaN(ts) ? val : formatTime2YMDHMUtc(ts);
    }
    return val;
  };

  const toggleValue = (tagId: string, value: string) => {
    setFilterTagValues((prev) => {
      const current = prev[tagId] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const updated = { ...prev, [tagId]: next };
      setFilterTags(
        Object.entries(updated)
          .filter(([, vals]) => vals.length > 0)
          .map(([id]) => id)
      );
      return updated;
    });
  };

  const clearAll = () => {
    setFilterTags([]);
    setFilterTagValues({});
    onClose();
  };

  return (
    <Popover placement="bottom-start" isLazy isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <PopoverTrigger>
        <Box as="span" cursor="pointer" display="inline-flex" alignItems="center">
          <MyIcon
            name={'common/table/filter'}
            w={'12px'}
            color={isActive ? '#1770E6' : undefined}
            _hover={{ color: '#1770E6' }}
          />
        </Box>
      </PopoverTrigger>
      <PopoverContent
        w={allDatasetTags.length === 0 ? 'fit-content' : '360px'}
        borderRadius="6px"
        _focus={{ outline: 'none', boxShadow: 'none' }}
        boxShadow="lg"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverArrow />
        <PopoverBody p={0}>
          {allDatasetTags.length === 0 ? (
            <Flex fontSize={'xs'} color={'myGray.500'} p={4}>
              {t('dataset:dataset.no_tags')}
            </Flex>
          ) : (
            <>
              <Flex maxH={'260px'}>
                <Box
                  flex={'0 0 140px'}
                  borderRight={'1px solid'}
                  borderColor={'myGray.100'}
                  overflowY={'auto'}
                  py={1}
                  px={1.5}
                >
                  {allDatasetTags.map((tag) => {
                    const selectedCount = filterTagValues[tag._id]?.length ?? 0;
                    const isSelected = currentTagId === tag._id;
                    const hasValue = selectedCount > 0;
                    return (
                      <Flex
                        key={tag._id}
                        alignItems={'center'}
                        fontSize={'sm'}
                        px={2}
                        py={1.5}
                        my={0.5}
                        cursor={'pointer'}
                        color={isSelected || hasValue ? '#1770E6' : '#333'}
                        bg={isSelected ? 'rgba(50, 136, 250, 0.06)' : undefined}
                        _hover={{
                          bg: isSelected ? 'rgba(50, 136, 250, 0.06)' : 'myGray.50',
                          color: isSelected || hasValue ? '#1770E6' : '#333'
                        }}
                        borderRadius={'xs'}
                        onClick={() => setSelectedTagId(tag._id)}
                      >
                        <Box
                          flex={1}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          whiteSpace={'nowrap'}
                        >
                          {tag.tag}
                        </Box>
                        {hasValue && (
                          <Box
                            fontSize={'xs'}
                            color={'primary.500'}
                            ml={1}
                            flexShrink={0}
                            fontWeight={'medium'}
                          >
                            {selectedCount}
                          </Box>
                        )}
                        <MyIcon
                          name={'core/chat/chevronRight'}
                          w={'12px'}
                          flexShrink={0}
                          ml={1}
                          color={isSelected || hasValue ? '#1770E6' : 'myGray.300'}
                        />
                      </Flex>
                    );
                  })}
                </Box>

                <Box flex={1} overflowY={'auto'} py={1} px={1.5}>
                  {availableValues.length === 0 ? (
                    <Flex
                      h={'full'}
                      minH={'60px'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'myGray.400'}
                      fontSize={'sm'}
                    >
                      {t('common:no_data')}
                    </Flex>
                  ) : (
                    availableValues.map((val) => {
                      const checked = (filterTagValues[currentTagId] || []).includes(val);
                      return (
                        <Flex
                          key={val}
                          alignItems={'center'}
                          fontSize={'sm'}
                          px={1}
                          py={1.5}
                          my={0.5}
                          cursor={'pointer'}
                          color={checked ? 'primary.700' : 'myGray.600'}
                          _hover={{ bg: '#1118240D', color: 'primary.700' }}
                          borderRadius={'xs'}
                          onClick={() => toggleValue(currentTagId, val)}
                        >
                          <Checkbox
                            isChecked={checked}
                            onChange={() => toggleValue(currentTagId, val)}
                            size={'md'}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Box
                            ml={2}
                            flex={1}
                            overflow={'hidden'}
                            textOverflow={'ellipsis'}
                            whiteSpace={'nowrap'}
                          >
                            {formatValue(val)}
                          </Box>
                        </Flex>
                      );
                    })
                  )}
                </Box>
              </Flex>

              {isActive && (
                <Flex borderTop={'1px solid #E8EBF0'} px={3} py={1.5} justifyContent={'flex-end'}>
                  <Box
                    fontSize={'sm'}
                    color={'myGray.500'}
                    cursor={'pointer'}
                    _hover={{ color: 'primary.600' }}
                    onClick={clearAll}
                  >
                    {t('dataset:tag.cancel')}
                  </Box>
                </Flex>
              )}
            </>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default TagFilter;
