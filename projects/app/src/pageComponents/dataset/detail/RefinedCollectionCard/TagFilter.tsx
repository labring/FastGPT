import {
  Box,
  Checkbox,
  Flex,
  Popover,
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

  const { filterTags, setFilterTags, filterTagValues, setFilterTagValues, collections } =
    useContextSelector(CollectionPageContext, (v) => v);

  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);

  const isActive =
    filterTags.length > 0 || Object.values(filterTagValues).some((v) => v.length > 0);

  // 从当前 collections 中提取悬停 tag 的可用 value 列表
  const availableValues = useMemo(() => {
    if (!hoveredTagId) return [];
    const valSet = new Set<string>();
    collections.forEach((col) => {
      (col.tags || []).forEach((t) => {
        if (
          typeof t === 'object' &&
          t !== null &&
          (t as CollectionTagValueType).tagId === hoveredTagId
        ) {
          valSet.add(String((t as CollectionTagValueType).value));
        }
      });
    });
    return [...valSet].sort();
  }, [hoveredTagId, collections]);

  const hoveredTagType = useMemo(
    () => allDatasetTags.find((t) => t._id === hoveredTagId)?.tagType,
    [allDatasetTags, hoveredTagId]
  );

  const formatValue = (val: string) => {
    if (hoveredTagType === 'datetime') {
      const ts = Number(val);
      return isNaN(ts) ? val : formatTime2YMDHMUtc(ts);
    }
    return val;
  };

  const toggleTag = (tagId: string) => {
    const next = filterTags.includes(tagId)
      ? filterTags.filter((id) => id !== tagId)
      : [...filterTags, tagId];
    setFilterTags(next);
    // 取消一级时清除对应二级
    if (filterTags.includes(tagId)) {
      setFilterTagValues((prev) => {
        const updated = { ...prev };
        delete updated[tagId];
        return updated;
      });
      if (hoveredTagId === tagId) setHoveredTagId(null);
    }
  };

  const toggleValue = (tagId: string, value: string) => {
    setFilterTagValues((prev) => {
      const current = prev[tagId] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [tagId]: next };
    });
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
        w="360px"
        borderRadius="6px"
        _focus={{ outline: 'none', boxShadow: 'none' }}
        boxShadow="lg"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverBody p={0}>
          <Flex maxH={'260px'}>
            {/* 左栏：一级 tag */}
            <Box
              flex={'0 0 160px'}
              borderRight={'1px solid'}
              borderColor={'myGray.100'}
              overflowY={'auto'}
              py={1}
              px={1.5}
            >
              {allDatasetTags.length === 0 ? (
                <Flex
                  h={'60px'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  color={'myGray.400'}
                  fontSize={'sm'}
                >
                  {t('dataset:dataset.no_tags')}
                </Flex>
              ) : (
                allDatasetTags.map((tag) => {
                  const checked = filterTags.includes(tag._id);
                  const isHovered = hoveredTagId === tag._id;
                  return (
                    <Flex
                      key={tag._id}
                      alignItems={'center'}
                      fontSize={'sm'}
                      px={1}
                      py={1}
                      my={0.5}
                      cursor={'pointer'}
                      color={checked ? 'primary.700' : 'myGray.600'}
                      bg={isHovered ? '#1118240D' : undefined}
                      _hover={{ bg: '#1118240D', color: 'primary.700' }}
                      borderRadius={'xs'}
                      onMouseEnter={() => setHoveredTagId(tag._id)}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleTag(tag._id);
                      }}
                    >
                      <Checkbox
                        isChecked={checked}
                        onChange={() => toggleTag(tag._id)}
                        size={'md'}
                      />
                      <Box
                        ml={2}
                        flex={1}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {tag.tag}
                      </Box>
                      {filterTagValues[tag._id]?.length > 0 && (
                        <Box fontSize={'xs'} color={'primary.500'} ml={1} flexShrink={0}>
                          {filterTagValues[tag._id].length}
                        </Box>
                      )}
                      <MyIcon name={'core/chat/chevronRight'} w={'12px'} flexShrink={0} />
                    </Flex>
                  );
                })
              )}
            </Box>

            {/* 右栏：二级 value */}
            <Box flex={1} overflowY={'auto'} py={1} px={1.5}>
              {!hoveredTagId ? (
                <Flex
                  h={'full'}
                  minH={'60px'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  color={'myGray.400'}
                  fontSize={'sm'}
                >
                  {t('dataset:tag.hoverTagToFilter')}
                </Flex>
              ) : availableValues.length === 0 ? null : (
                availableValues.map((val) => {
                  const tagSelected = filterTags.includes(hoveredTagId);
                  const checked = (filterTagValues[hoveredTagId] || []).includes(val);
                  return (
                    <Flex
                      key={val}
                      alignItems={'center'}
                      fontSize={'sm'}
                      px={1}
                      py={1}
                      my={0.5}
                      cursor={tagSelected ? 'pointer' : 'not-allowed'}
                      color={checked ? 'primary.700' : tagSelected ? 'myGray.600' : 'myGray.300'}
                      opacity={tagSelected ? 1 : 0.5}
                      _hover={tagSelected ? { bg: '#1118240D', color: 'primary.700' } : undefined}
                      borderRadius={'xs'}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!tagSelected) return;
                        toggleValue(hoveredTagId, val);
                      }}
                    >
                      <Checkbox
                        isChecked={checked}
                        isDisabled={!tagSelected}
                        onChange={() => {
                          if (!tagSelected) return;
                          toggleValue(hoveredTagId, val);
                        }}
                        size={'md'}
                      />
                      <Box
                        ml={2}
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

          {/* 清除按钮 */}
          {isActive && (
            <Flex borderTop={'1px solid #E8EBF0'} px={3} py={1.5} justifyContent={'flex-end'}>
              <Box
                fontSize={'sm'}
                color={'myGray.500'}
                cursor={'pointer'}
                _hover={{ color: 'primary.600' }}
                onClick={() => {
                  setFilterTags([]);
                  setFilterTagValues({});
                  onClose();
                }}
              >
                {t('dataset:tag.cancel')}
              </Box>
            </Flex>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default TagFilter;
