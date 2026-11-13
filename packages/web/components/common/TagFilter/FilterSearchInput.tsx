import React, { forwardRef, useEffect, useRef, useState } from 'react';
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

/** TagFilter 下拉里 32px 搜索框，有内容时显示清空，并在中文输入法组合结束后再触发搜索。 */
const FilterSearchInput = forwardRef<HTMLInputElement, Props>(function FilterSearchInput(
  { value, placeholder, onChange },
  ref
) {
  const [inputValue, setInputValue] = useState(value);
  const isComposingRef = useRef(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  return (
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
      onKeyDown={(e) => {
        // 组合输入期间按键均交给输入法候选框；非组合状态下方向键和 Escape 交给外层菜单。
        if (e.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) {
          e.stopPropagation();
        }
      }}
    >
      <Input
        ref={ref}
        flex={'1 1 0'}
        w={0}
        minW={0}
        h={'100%'}
        px={0}
        variant={'unstyled'}
        fontSize={'xs'}
        lineHeight={'16px'}
        value={inputValue}
        placeholder={placeholder}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          const next = e.currentTarget.value;
          setInputValue(next);
          onChange(next);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setInputValue(next);
          if (!isComposingRef.current) {
            onChange(next);
          }
        }}
      />
      {!!inputValue && (
        <MyIconButton
          icon={'common/closeLight'}
          flex={'0 0 auto'}
          position={'relative'}
          zIndex={1}
          size={'14px'}
          hoverColor={'myGray.700'}
          onClick={() => {
            isComposingRef.current = false;
            setInputValue('');
            onChange('');
          }}
        />
      )}
    </Flex>
  );
});

export default FilterSearchInput;
