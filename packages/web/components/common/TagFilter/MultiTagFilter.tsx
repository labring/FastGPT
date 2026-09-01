import React, { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, Flex, Input, type PlacementWithLogical } from '@chakra-ui/react';
import { collectionTagValueKey } from '@fastgpt/global/core/dataset/tagUtils';
import { type CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';
import MyIcon from '../Icon';
import MyBox from '../MyBox';
import MyPopover from '../MyPopover';
import FilterButton from './FilterButton';

export type MultiTagFilterValue = string | number;

export type MultiTagFilterGroup = {
  tagId: string;
  label: string;
  values: Array<{
    value: MultiTagFilterValue;
    label: string;
  }>;
};

export type MultiTagFilterLabels = {
  title: ReactNode;
  all: ReactNode;
  searchPlaceholder: string;
  selected: ReactNode;
  item: ReactNode;
  clear: ReactNode;
  noValues: ReactNode;
  noMatch: ReactNode;
};

export type MultiTagFilterProps = {
  groups: MultiTagFilterGroup[];
  selected: CollectionTagFilterItem[];
  onSelectedChange: (next: CollectionTagFilterItem[]) => void;
  isLoading?: boolean;
  isLoadingValues?: boolean;
  labels: MultiTagFilterLabels;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  onOpen?: () => void;
};

const FILTER_LIST_H = '168px';
const filterListScrollSx = {
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--chakra-colors-myGray-200) transparent',
  '&::-webkit-scrollbar': { w: '4px' },
  '&::-webkit-scrollbar-thumb': {
    bg: 'myGray.200',
    borderRadius: 'full'
  }
};
const stopWheelPropagation = (e: React.WheelEvent) => e.stopPropagation();

/**
 * 双栏标签值筛选：左侧分组、右侧勾选值即生效。同一标签多值为 OR，不同标签由调用方按 AND 解释。
 */
export const toggleMultiTagFilterValue = (
  selected: CollectionTagFilterItem[],
  tagId: string,
  value: MultiTagFilterValue
): CollectionTagFilterItem[] => {
  const current = selected.find((item) => item.tagId === tagId);
  if (!current) {
    return [...selected, { tagId, values: [value] }];
  }

  const exists = current.values.some((item) => item === value);
  const nextValues = exists
    ? current.values.filter((item) => item !== value)
    : [...current.values, value];

  if (nextValues.length === 0) {
    return selected.filter((item) => item.tagId !== tagId);
  }

  return selected.map((item) => (item.tagId === tagId ? { ...item, values: nextValues } : item));
};

const MultiTagFilter = ({
  groups,
  selected,
  onSelectedChange,
  isLoading = false,
  isLoadingValues = false,
  labels,
  placement = 'bottom-start',
  offset = [0, 4],
  onOpen
}: MultiTagFilterProps) => {
  const [activeTagId, setActiveTagId] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const resolvedActiveTagId = groups.some((group) => group.tagId === activeTagId)
    ? activeTagId
    : (groups[0]?.tagId ?? '');

  const selectedCountByTagId = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const item of selected) {
      countMap.set(item.tagId, item.values.length);
    }
    return countMap;
  }, [selected]);

  const selectedCount = useMemo(
    () => selected.reduce((sum, item) => sum + item.values.length, 0),
    [selected]
  );

  const summary = useMemo(() => {
    if (selectedCount === 0) {
      return (
        <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
          {labels.all}
        </Box>
      );
    }

    const firstSelected = selected[0];
    const firstGroup = groups.find((group) => group.tagId === firstSelected.tagId);
    const firstValue = firstSelected.values[0];
    const firstValueLabel =
      firstGroup?.values.find((item) => item.value === firstValue)?.label ?? String(firstValue);
    const firstText = firstGroup ? `${firstGroup.label}：${firstValueLabel}` : firstValueLabel;
    const extraCount = selectedCount - 1;

    return (
      <Flex alignItems={'center'} gap={1} minW={0}>
        <Box
          minW={0}
          px={1}
          py={'2px'}
          bg={'myGray.100'}
          borderRadius={'xs'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          whiteSpace={'nowrap'}
        >
          {firstText}
        </Box>
        {extraCount > 0 && (
          <Box
            flexShrink={0}
            px={1}
            py={'2px'}
            bg={'myGray.100'}
            borderRadius={'full'}
            whiteSpace={'nowrap'}
          >
            +{extraCount}
          </Box>
        )}
      </Flex>
    );
  }, [groups, labels.all, selected, selectedCount]);

  const activeGroup = groups.find((group) => group.tagId === resolvedActiveTagId);
  const filteredValues = useMemo(() => {
    if (!activeGroup) return [];
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return activeGroup.values;
    return activeGroup.values.filter((item) => item.label.toLowerCase().includes(keyword));
  }, [activeGroup, searchValue]);

  const isValueChecked = (tagId: string, value: MultiTagFilterValue) =>
    selected.find((item) => item.tagId === tagId)?.values.some((item) => item === value) ?? false;

  const emptyRightText = (() => {
    if (!activeGroup) return '';
    if (isLoadingValues) return '';
    if (activeGroup.values.length === 0) return labels.noValues;
    if (filteredValues.length === 0) return labels.noMatch;
    return '';
  })();

  return (
    <MyPopover
      placement={placement}
      hasArrow={false}
      offset={offset}
      w={'320px'}
      closeOnBlur={true}
      trigger={'click'}
      onOpenFunc={onOpen}
      Trigger={<FilterButton title={labels.title} value={summary} />}
    >
      {() => (
        <MyBox isLoading={isLoading} p={'6px'} onClick={(e) => e.stopPropagation()}>
          <Flex gap={'4px'} alignItems={'stretch'}>
            <Box
              w={'120px'}
              flexShrink={0}
              h={FILTER_LIST_H}
              overflowY={'auto'}
              sx={filterListScrollSx}
              onWheel={stopWheelPropagation}
            >
              {groups.map((group) => {
                const isActive = group.tagId === resolvedActiveTagId;
                const selectedGroupCount = selectedCountByTagId.get(group.tagId) ?? 0;

                return (
                  <Flex
                    key={group.tagId}
                    alignItems={'center'}
                    justifyContent={'space-between'}
                    px={1}
                    py={'6px'}
                    mb={'4px'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    bg={isActive ? 'primary.50' : 'transparent'}
                    color={isActive ? 'primary.700' : 'myGray.600'}
                    fontSize={'xs'}
                    fontWeight={'medium'}
                    _hover={{ bg: isActive ? 'primary.50' : 'myGray.05' }}
                    onClick={() => {
                      setActiveTagId(group.tagId);
                      setSearchValue('');
                    }}
                  >
                    <Box
                      minW={0}
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                    >
                      {group.label}
                    </Box>
                    <Flex alignItems={'center'} gap={1} flexShrink={0} ml={1}>
                      {selectedGroupCount > 0 && (
                        <Flex
                          w={'16px'}
                          h={'16px'}
                          alignItems={'center'}
                          justifyContent={'center'}
                          borderRadius={'full'}
                          bg={'rgba(17, 24, 36, 0.05)'}
                          color={'myGray.600'}
                          fontSize={'xs'}
                        >
                          {selectedGroupCount}
                        </Flex>
                      )}
                      <MyIcon
                        name={'core/chat/chevronRight'}
                        w={'16px'}
                        h={'16px'}
                        color={isActive ? 'primary.700' : 'myGray.400'}
                      />
                    </Flex>
                  </Flex>
                );
              })}
            </Box>

            <Box w={'1px'} bg={'myGray.200'} alignSelf={'stretch'} />

            <Flex flex={1} minW={0} h={FILTER_LIST_H} direction={'column'} px={1}>
              <Box position={'relative'} mb={'4px'}>
                <Input
                  h={'32px'}
                  px={1}
                  pr={searchValue ? 7 : 1}
                  borderRadius={'sm'}
                  fontSize={'xs'}
                  value={searchValue}
                  placeholder={labels.searchPlaceholder}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
                {searchValue && (
                  <Flex
                    position={'absolute'}
                    right={1}
                    top={0}
                    h={'32px'}
                    alignItems={'center'}
                    cursor={'pointer'}
                    onClick={() => setSearchValue('')}
                  >
                    <MyIcon name={'common/closeLight'} w={'14px'} h={'14px'} color={'myGray.500'} />
                  </Flex>
                )}
              </Box>
              <Box
                flex={1}
                minH={0}
                overflowY={'auto'}
                sx={filterListScrollSx}
                onWheel={stopWheelPropagation}
              >
                {emptyRightText ? (
                  <Box px={1} py={'6px'} fontSize={'xs'} color={'myGray.500'}>
                    {emptyRightText}
                  </Box>
                ) : (
                  filteredValues.map((item) => {
                    const checked = isValueChecked(resolvedActiveTagId, item.value);
                    return (
                      <Flex
                        key={collectionTagValueKey(item.value)}
                        alignItems={'center'}
                        gap={2}
                        px={1}
                        py={'6px'}
                        cursor={'pointer'}
                        borderRadius={'xs'}
                        fontSize={'xs'}
                        color={'myGray.600'}
                        _hover={{ bg: 'myGray.05' }}
                        onClick={() =>
                          onSelectedChange(
                            toggleMultiTagFilterValue(selected, resolvedActiveTagId, item.value)
                          )
                        }
                      >
                        <Checkbox
                          isChecked={checked}
                          pointerEvents={'none'}
                          size={'sm'}
                          icon={<MyIcon name={'common/check'} w={'12px'} />}
                        />
                        <Box
                          minW={0}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          whiteSpace={'nowrap'}
                        >
                          {item.label}
                        </Box>
                      </Flex>
                    );
                  })
                )}
              </Box>
            </Flex>
          </Flex>

          <Box h={'1px'} bg={'myGray.200'} my={'4px'} />

          <Flex alignItems={'center'} justifyContent={'space-between'}>
            <Flex gap={2} fontSize={'xs'} color={'myGray.600'} alignItems={'center'}>
              <Box>{labels.selected}</Box>
              <Box fontWeight={'medium'}>{selectedCount}</Box>
              <Box>{labels.item}</Box>
            </Flex>
            <Button
              h={'32px'}
              px={'14px'}
              variant={'primaryOutline'}
              fontSize={'xs'}
              isDisabled={selectedCount === 0}
              onClick={() => {
                onSelectedChange([]);
                setSearchValue('');
              }}
            >
              {labels.clear}
            </Button>
          </Flex>
        </MyBox>
      )}
    </MyPopover>
  );
};

export default React.memo(MultiTagFilter);
