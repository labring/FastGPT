import React from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import MyIcon from '../Icon';

export const FILTER_SEARCH_THRESHOLD = 8;

const getSelectOptionSearchText = (option: { label: unknown; searchText?: string }): string => {
  if (option.searchText) return option.searchText;
  return typeof option.label === 'string' ? option.label : '';
};

/**
 * 按下拉搜索关键字过滤选项。空关键字原样返回；label 不是字符串且没给 searchText 的项搜不到。
 */
export const filterSelectOptionsBySearch = <T extends { label: unknown; searchText?: string }>(
  options: T[],
  searchKey: string
): T[] => {
  const key = searchKey.trim().toLowerCase();
  if (!key) return options;
  return options.filter((item) => getSelectOptionSearchText(item).toLowerCase().includes(key));
};

type Props = {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
};

/** TagFilter 下拉里 32px 搜索框，有内容时显示清空。 */
const FilterSearchInput = ({ value, placeholder, onChange }: Props) => (
  <Box position={'relative'}>
    <Input
      w={'100%'}
      minW={0}
      h={'32px'}
      px={1}
      pr={value ? 7 : 1}
      borderRadius={'sm'}
      fontSize={'xs'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
    {!!value && (
      <Flex
        position={'absolute'}
        right={1}
        top={0}
        h={'32px'}
        alignItems={'center'}
        cursor={'pointer'}
        onClick={() => onChange('')}
      >
        <MyIcon name={'common/closeLight'} w={'14px'} h={'14px'} color={'myGray.500'} />
      </Flex>
    )}
  </Box>
);

export default FilterSearchInput;
