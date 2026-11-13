'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
  type FlexProps
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { evaluateAdminSearchInput, isSameAdminSearchParams, type AdminSearchOption } from './utils';

const DEFAULT_SEARCH_WAIT_MS = 400;

/**
 * 管理端组合搜索状态 Hook：支持搜索维度切换清空、输入防抖限流，以及精确 ObjectId 输入校验。
 */
export const useAdminCompositeSearch = <TField extends string>({
  options,
  wait = DEFAULT_SEARCH_WAIT_MS
}: {
  options: readonly AdminSearchOption<TField>[];
  wait?: number;
}) => {
  const [searchField, setSearchField] = useState<TField>(options[0].value);
  const [inputValue, setInputValue] = useState('');
  const [searchParams, setSearchParams] = useState<Partial<Record<TField, string>>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const commitParams = useCallback((nextParams: Partial<Record<TField, string>>) => {
    setSearchParams((prev) => (isSameAdminSearchParams(prev, nextParams) ? prev : nextParams));
  }, []);

  const handleFieldChange = useCallback(
    (nextField: TField) => {
      if (nextField === searchField) return;
      clearPendingTimer();
      setSearchField(nextField);
      setInputValue('');
      // 切换字段时立即清空输入并恢复无条件查询，避免把旧字段输入误当新字段值发请求。
      commitParams({});
    },
    [clearPendingTimer, commitParams, searchField]
  );

  const handleInputChange = useCallback(
    (nextValue: string) => {
      setInputValue(nextValue);
      clearPendingTimer();

      const evaluation = evaluateAdminSearchInput({
        field: searchField,
        value: nextValue,
        options
      });
      if (!evaluation.shouldFetch) return;

      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        commitParams(evaluation.params);
      }, wait);
    },
    [clearPendingTimer, commitParams, options, searchField, wait]
  );

  const { isInvalid } = useMemo(
    () => evaluateAdminSearchInput({ field: searchField, value: inputValue, options }),
    [inputValue, options, searchField]
  );

  return {
    searchField,
    inputValue,
    isInvalid,
    searchParams,
    onFieldChange: handleFieldChange,
    onInputChange: handleInputChange
  };
};

type AdminCompositeSearchProps<TField extends string> = Omit<FlexProps, 'onChange'> & {
  options: readonly AdminSearchOption<TField>[];
  field: TField;
  value: string;
  triggerW?: string;
  isInvalid?: boolean;
  invalidTip?: string;
  onFieldChange: (field: TField) => void;
  onValueChange: (value: string) => void;
};

/**
 * 管理员后台组合搜索框：左侧固定宽度下拉切换搜索字段，右侧输入实时防抖搜索（不响应回车提交）。
 */
const AdminCompositeSearch = <TField extends string>({
  options,
  field,
  value,
  triggerW = '96px',
  isInvalid = false,
  invalidTip = '请输入有效的 24 位 ID',
  onFieldChange,
  onValueChange,
  w = ['100%', '295px'],
  ...props
}: AdminCompositeSearchProps<TField>) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isFocused, setIsFocused] = useState(false);

  const activeOption = useMemo(
    () => options.find((item) => item.value === field) ?? options[0],
    [field, options]
  );

  return (
    <Flex h={'36px'} w={w} alignItems={'stretch'} flexShrink={0} {...props}>
      <Menu
        isOpen={isOpen}
        onOpen={onOpen}
        onClose={onClose}
        strategy={'fixed'}
        placement={'bottom-start'}
        gutter={4}
      >
        <MenuButton
          as={Button}
          variant={'whitePrimaryOutline'}
          w={triggerW}
          minW={triggerW}
          h={'full'}
          px={3}
          flexShrink={0}
          bg={'white'}
          fontSize={'sm'}
          fontWeight={'normal'}
          textAlign={'left'}
          color={'myGray.900'}
          borderLeftRadius={'sm'}
          borderRightRadius={0}
          borderColor={isOpen ? 'primary.600' : 'myGray.200'}
          boxShadow={isOpen ? 'focus' : 'none'}
          zIndex={isOpen ? 2 : 0}
          _hover={{
            borderColor: isOpen ? 'primary.600' : 'primary.300',
            color: 'myGray.900',
            zIndex: 1
          }}
          _active={{ transform: 'none' }}
          rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          sx={{
            '& > span': {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              w: '100%'
            }
          }}
        >
          <Box whiteSpace={'nowrap'}>{activeOption?.label}</Box>
        </MenuButton>
        <MenuList
          minW={triggerW}
          w={triggerW}
          p={'6px'}
          display={'flex'}
          flexDirection={'column'}
          gap={'4px'}
          border={'none'}
          borderRadius={'sm'}
          boxShadow={'3.5'}
          zIndex={99}
        >
          {options.map((option) => {
            const isActive = option.value === field;
            return (
              <MenuItem
                key={option.value}
                m={0}
                h={'28px'}
                borderRadius={'xs'}
                px={1}
                py={'6px'}
                fontSize={'mini'}
                lineHeight={'16px'}
                letterSpacing={'0.5px'}
                fontWeight={'medium'}
                bg={isActive ? 'myGray.05' : 'transparent'}
                color={isActive ? 'primary.700' : 'myGray.600'}
                _hover={{ bg: 'myGray.05' }}
                _focus={{ bg: 'myGray.05' }}
                onClick={() => {
                  onFieldChange(option.value);
                  onClose();
                }}
              >
                <Box whiteSpace={'nowrap'}>{option.label}</Box>
              </MenuItem>
            );
          })}
        </MenuList>
      </Menu>

      <MyTooltip
        label={invalidTip}
        isDisabled={!isInvalid}
        isOpen={isInvalid && isFocused ? true : undefined}
        shouldWrapChildren={false}
      >
        <InputGroup flex={1} h={'full'} ml={'-1px'}>
          <InputLeftElement w={'36px'} h={'full'} pointerEvents={'none'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.500'} />
          </InputLeftElement>
          <Input
            h={'full'}
            bg={'white'}
            fontSize={'sm'}
            color={'myGray.900'}
            borderLeftRadius={0}
            borderRightRadius={'sm'}
            pl={'36px'}
            pr={value ? 8 : 3}
            value={value}
            placeholder={activeOption?.placeholder ?? `搜索${activeOption?.label ?? ''}`}
            _placeholder={{ color: 'myGray.500', fontSize: 'sm' }}
            isInvalid={isInvalid}
            borderColor={isInvalid ? 'red.500' : 'myGray.200'}
            zIndex={isInvalid ? 1 : 0}
            _hover={{
              borderColor: isInvalid ? 'red.400' : 'primary.300',
              zIndex: 1
            }}
            _focus={{
              borderColor: isInvalid ? 'red.500' : 'primary.600',
              boxShadow: isInvalid ? '0px 0px 0px 2.4px rgba(240, 68, 56, 0.15)' : 'focus',
              bg: 'white',
              zIndex: 2
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => onValueChange(e.target.value)}
          />
          {value !== '' && (
            <InputRightElement h={'full'}>
              <Box
                as={'button'}
                type={'button'}
                aria-label={'清空搜索'}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                color={'myGray.400'}
                _hover={{ color: 'myGray.600' }}
                onClick={() => onValueChange('')}
              >
                <MyIcon name="common/closeLight" w={3.5} />
              </Box>
            </InputRightElement>
          )}
        </InputGroup>
      </MyTooltip>
    </Flex>
  );
};

export default AdminCompositeSearch;
