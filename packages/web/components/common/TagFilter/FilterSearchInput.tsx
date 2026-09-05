import React from 'react';
import { Flex, Input } from '@chakra-ui/react';
import MyIconButton from '../Icon/button';
import { shadowLight } from '../../../styles/theme';

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
  <Flex
    w={'100%'}
    h={'32px'}
    alignItems={'center'}
    px={1}
    border={'1px solid'}
    borderColor={'borderColor.low'}
    borderRadius={'sm'}
    _hover={{ borderColor: 'primary.300' }}
    _focusWithin={{
      borderColor: 'primary.500',
      boxShadow: shadowLight,
      bg: 'white'
    }}
  >
    <Input
      flex={'1 1 0'}
      w={0}
      minW={0}
      h={'100%'}
      px={1}
      variant={'unstyled'}
      fontSize={'sm'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
    {!!value && (
      <MyIconButton
        icon={'common/closeLight'}
        flex={'0 0 auto'}
        position={'relative'}
        zIndex={1}
        size={'14px'}
        hoverColor={'myGray.700'}
        onClick={() => onChange('')}
      />
    )}
  </Flex>
);

export default FilterSearchInput;
