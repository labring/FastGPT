import React, { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Flex,
  Input,
  type InputProps,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Portal,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SingleDateTimePicker } from '@fastgpt/web/components/common/DateTimePicker';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import {
  DatasetCollectionTagTypeEnum,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import { OVERFLOW_CHIP_GAP_PX, useOverflowChipCount } from './TagCommon';

export const tagInputBaseStyles: InputProps = {
  h: '36px',
  borderRadius: 'sm',
  border: '1px solid',
  borderColor: 'myGray.200',
  bg: 'white',
  fontSize: 'sm',
  color: 'myGray.900',
  _hover: {
    borderColor: 'primary.300'
  },
  _focus: {
    borderColor: 'primary.600',
    boxShadow: 'focus'
  },
  _placeholder: {
    color: 'myGray.500'
  }
};
export const StringTagInput = ({
  value,
  onChange,
  placeholder
}: {
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) => {
  const { t } = useTranslation();

  return (
    <Input
      {...tagInputBaseStyles}
      value={value ?? ''}
      placeholder={placeholder || t('dataset:tag.fill_value')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

export const NumberTagInput = ({
  value,
  onChange,
  placeholder,
  showStepper
}: {
  value?: number | string;
  onChange: (val: number | '') => void;
  placeholder?: string;
  showStepper?: boolean;
}) => {
  const { t } = useTranslation();
  const placeholderText = placeholder || t('dataset:tag.fill_number');

  if (showStepper) {
    return (
      <MyNumberInput
        variant={'whiteOutline'}
        h={'36px'}
        w={'100%'}
        fontSize={'sm'}
        inputFieldProps={{
          h: '36px',
          bg: 'white',
          fontSize: 'sm',
          color: 'myGray.900'
        }}
        value={value === undefined || value === '' ? '' : Number(value)}
        placeholder={placeholderText}
        onChange={(val) => onChange(val === undefined ? '' : val)}
      />
    );
  }

  return (
    <Input
      {...tagInputBaseStyles}
      type={'number'}
      value={value === undefined ? '' : value}
      placeholder={placeholderText}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '') {
          onChange('');
        } else {
          const num = Number(val);
          if (!Number.isNaN(num)) {
            onChange(num);
          }
        }
      }}
    />
  );
};

export const DateTimeTagInput = ({
  value,
  onChange,
  placeholder
}: {
  value?: number | string;
  onChange: (val: number) => void;
  placeholder?: string;
}) => (
  <SingleDateTimePicker
    value={value ? Number(value) : undefined}
    onChange={onChange}
    placeholder={placeholder}
    w={'100%'}
  />
);

/** 设置标签弹窗里的标签名称下拉：搜索已有标签并单选，底部「标签管理」打开标签管理弹窗。 */
export const TagNameSelect = ({
  value,
  options,
  onChange,
  onManage
}: {
  value?: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  onManage: () => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');

  const selected = options.find((opt) => opt.value === value);
  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(trimmed));
  }, [options, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={handleClose}
      placement={'bottom-start'}
      closeOnBlur
      matchWidth
      gutter={4}
    >
      <PopoverTrigger>
        <Flex
          {...tagInputBaseStyles}
          w={'152px'}
          alignItems={'center'}
          justifyContent={'space-between'}
          px={3}
          cursor={'pointer'}
          overflow={'hidden'}
          borderColor={isOpen ? 'primary.600' : 'myGray.200'}
          boxShadow={isOpen ? 'focus' : 'none'}
        >
          <Box color={selected ? 'myGray.900' : 'myGray.500'} noOfLines={1}>
            {selected?.label || t('dataset:tag.select_tag')}
          </Box>
          <MyIcon
            name={'core/chat/chevronDown'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            flexShrink={0}
            ml={2}
          />
        </Flex>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w={'152px'}
          p={'6px'}
          bg={'white'}
          borderRadius={'sm'}
          borderWidth={0}
          boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
          _focusVisible={{ outline: 'none' }}
        >
          <Flex direction={'column'} w={'full'} gap={'2px'}>
            <Input
              value={search}
              placeholder={t('common:Search')}
              h={'32px'}
              px={1}
              fontSize={'xs'}
              borderRadius={'sm'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              _placeholder={{ color: 'myGray.500' }}
              _focus={{
                borderColor: 'primary.600',
                boxShadow: 'focus'
              }}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Flex maxH={'160px'} overflowY={'auto'} direction={'column'} gap={'2px'}>
              {filteredOptions.length === 0 ? (
                <Box px={1} py={2} fontSize={'xs'} color={'myGray.500'} textAlign={'center'}>
                  {t('common:no_select_data')}
                </Box>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <Flex
                      key={opt.value}
                      alignItems={'center'}
                      h={'28px'}
                      px={1}
                      py={'6px'}
                      borderRadius={'xs'}
                      cursor={'pointer'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={isSelected ? 'primary.700' : 'myGray.600'}
                      bg={isSelected ? 'primary.50' : 'transparent'}
                      _hover={{ bg: 'primary.50', color: 'primary.700' }}
                      onClick={() => {
                        if (opt.value !== value) onChange(opt.value);
                        handleClose();
                      }}
                    >
                      <Box noOfLines={1}>{opt.label}</Box>
                    </Flex>
                  );
                })
              )}
            </Flex>
            <Box borderTop={'1px solid'} borderColor={'myGray.200'} />
            <Flex
              alignItems={'center'}
              gap={2}
              h={'28px'}
              px={1}
              py={'6px'}
              borderRadius={'xs'}
              cursor={'pointer'}
              color={'primary.700'}
              _hover={{ bg: 'primary.50' }}
              onClick={() => {
                handleClose();
                onManage();
              }}
            >
              <MyIcon name={'core/dataset/tag'} w={'16px'} h={'16px'} color={'primary.700'} />
              <Box fontSize={'xs'} fontWeight={'medium'}>
                {t('dataset:tag.manage')}
              </Box>
            </Flex>
          </Flex>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

const ARRAY_OPTION_HOVER_BG = 'rgba(17, 24, 36, 0.05)';

const ArraySelectedChip = ({
  opt,
  onRemove
}: {
  opt: string;
  onRemove?: (opt: string, e: React.MouseEvent) => void;
}) => (
  <Flex
    data-tag-chip
    alignItems={'center'}
    gap={1}
    h={'24px'}
    bg={'myGray.100'}
    color={'myGray.900'}
    px={1.5}
    borderRadius={'xs'}
    fontSize={'xs'}
    lineHeight={'16px'}
    flexShrink={0}
  >
    <Box maxW={'120px'} noOfLines={1}>
      {opt}
    </Box>
    {onRemove && (
      <Flex
        as={'button'}
        type={'button'}
        alignItems={'center'}
        justifyContent={'center'}
        w={'14px'}
        h={'14px'}
        cursor={'pointer'}
        color={'myGray.500'}
        _hover={{ color: 'myGray.700' }}
        onClick={(e) => onRemove(opt, e)}
      >
        <MyIcon name={'close'} w={'12px'} h={'12px'} />
      </Flex>
    )}
  </Flex>
);

const ArrayOverflowChip = ({ count }: { count: number }) => (
  <Flex
    data-overflow-chip
    alignItems={'center'}
    h={'24px'}
    px={1.5}
    bg={'myGray.100'}
    color={'myGray.600'}
    borderRadius={'xs'}
    fontSize={'xs'}
    lineHeight={'16px'}
    flexShrink={0}
  >
    {`+${count}`}
  </Flex>
);

export const ArrayTagSelect = ({
  options,
  value = [],
  onChange,
  onCreateOption,
  placeholder
}: {
  options: string[];
  value?: string[];
  onChange: (val: string[]) => void;
  onCreateOption?: (option: string) => void;
  placeholder?: string;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');
  const { containerRef, measureRef, visibleCount } = useOverflowChipCount({
    itemKey: value,
    itemCount: value.length
  });

  const allOptions = useMemo(() => {
    const list = [...options];
    for (const v of value) {
      if (v && !list.includes(v)) {
        list.push(v);
      }
    }
    return list.filter(Boolean);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return allOptions;
    return allOptions.filter((opt) => opt.toLowerCase().includes(trimmed));
  }, [search, allOptions]);

  const canCreate = Boolean(
    search.trim() && !allOptions.some((opt) => opt.toLowerCase() === search.trim().toLowerCase())
  );

  const handleCreateOption = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    onCreateOption?.(trimmed);
    setSearch('');
  };

  const handleToggleOption = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const handleToggleAll = () => {
    if (allOptions.length === 0) return;
    const isAllSelected = allOptions.every((opt) => value.includes(opt));
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(allOptions);
    }
  };

  const handleRemoveOption = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== opt));
  };

  const visibleValues = value.slice(0, visibleCount);
  const overflowCount = Math.max(value.length - visibleCount, 0);

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={() => {
        setSearch('');
        onClose();
      }}
      placement={'bottom-start'}
      closeOnBlur
      matchWidth
    >
      <PopoverTrigger>
        <Flex
          {...tagInputBaseStyles}
          alignItems={'center'}
          justifyContent={'space-between'}
          px={3}
          cursor={'pointer'}
          overflow={'hidden'}
          borderColor={isOpen ? 'primary.600' : 'myGray.200'}
          boxShadow={isOpen ? 'focus' : 'none'}
        >
          <Flex position={'relative'} flex={'1 1 auto'} minW={0} h={'24px'} alignItems={'center'}>
            {value.length === 0 ? (
              <Box color={'myGray.500'} fontSize={'sm'}>
                {placeholder || t('dataset:tag.select_options')}
              </Box>
            ) : (
              <>
                <Flex
                  ref={measureRef}
                  position={'absolute'}
                  visibility={'hidden'}
                  pointerEvents={'none'}
                  alignItems={'center'}
                  gap={`${OVERFLOW_CHIP_GAP_PX}px`}
                  whiteSpace={'nowrap'}
                  h={0}
                  overflow={'hidden'}
                >
                  {value.map((opt) => (
                    <ArraySelectedChip key={opt} opt={opt} onRemove={handleRemoveOption} />
                  ))}
                  <ArrayOverflowChip count={value.length} />
                </Flex>
                <Flex
                  ref={containerRef}
                  alignItems={'center'}
                  gap={`${OVERFLOW_CHIP_GAP_PX}px`}
                  w={'100%'}
                  minW={0}
                  h={'24px'}
                  overflow={'hidden'}
                >
                  {visibleValues.map((opt) => (
                    <ArraySelectedChip key={opt} opt={opt} onRemove={handleRemoveOption} />
                  ))}
                  {overflowCount > 0 && <ArrayOverflowChip count={overflowCount} />}
                </Flex>
              </>
            )}
          </Flex>
          <MyIcon
            name={'core/chat/chevronDown'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            flexShrink={0}
            ml={2}
          />
        </Flex>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w={'370px'}
          p={1.5}
          bg={'white'}
          borderRadius={'sm'}
          boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          _focusVisible={{ outline: 'none' }}
        >
          <Flex direction={'column'} w={'full'} gap={1}>
            <Input
              value={search}
              placeholder={t('dataset:tag.search_or_create_option')}
              h={'32px'}
              px={2}
              fontSize={'xs'}
              borderRadius={'sm'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              _focus={{
                borderColor: 'primary.600',
                boxShadow: 'focus'
              }}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateOption();
                }
              }}
            />

            {canCreate && (
              <Flex
                alignItems={'center'}
                gap={2}
                h={'28px'}
                px={1}
                borderRadius={'xs'}
                bg={ARRAY_OPTION_HOVER_BG}
                cursor={'pointer'}
                _hover={{ bg: 'myGray.100' }}
                onClick={handleCreateOption}
              >
                <Box fontSize={'xs'} color={'myGray.500'} flexShrink={0}>
                  {t('dataset:tag.create_option')}
                </Box>
                <Box fontSize={'xs'} fontWeight={'medium'} color={'myGray.600'} noOfLines={1}>
                  {search.trim()}
                </Box>
              </Flex>
            )}

            {!search.trim() && allOptions.length > 0 && (
              <>
                <Flex
                  alignItems={'center'}
                  h={'28px'}
                  px={1}
                  borderRadius={'xs'}
                  cursor={'pointer'}
                  _hover={{ bg: ARRAY_OPTION_HOVER_BG }}
                  onClick={handleToggleAll}
                >
                  <Box fontSize={'xs'} fontWeight={'medium'} color={'myGray.600'}>
                    {t('common:All')}
                  </Box>
                </Flex>
                <Box borderBottom={'1px solid'} borderColor={'myGray.200'} my={0.5} />
              </>
            )}

            <Flex maxH={'160px'} overflowY={'auto'} direction={'column'} gap={'2px'}>
              {filteredOptions.length === 0 && !canCreate ? (
                <Box px={1} py={2} fontSize={'xs'} color={'myGray.500'} textAlign={'center'}>
                  {t('common:no_select_data')}
                </Box>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = value.includes(opt);
                  return (
                    <Flex
                      key={opt}
                      alignItems={'center'}
                      gap={2}
                      h={'28px'}
                      px={1}
                      borderRadius={'xs'}
                      cursor={'pointer'}
                      _hover={{ bg: ARRAY_OPTION_HOVER_BG }}
                      onClick={() => handleToggleOption(opt)}
                    >
                      <Checkbox
                        isChecked={isChecked}
                        onChange={() => handleToggleOption(opt)}
                        onClick={(e) => e.stopPropagation()}
                        size={'sm'}
                        icon={<MyIcon name={'common/check'} w={'10px'} />}
                      />
                      <Box fontSize={'xs'} color={'myGray.600'} noOfLines={1}>
                        {opt}
                      </Box>
                    </Flex>
                  );
                })
              )}
            </Flex>
          </Flex>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

/** 按标签类型渲染对应输入。未选标签时展示禁用占位。 */
export const TagValueField = ({
  tag,
  value,
  onChange,
  onCreateOption,
  disabledPlaceholder,
  numberShowStepper,
  numberPlaceholder,
  arrayPlaceholder
}: {
  tag?: DatasetTagType;
  value: string | number | string[];
  onChange: (val: string | number | string[]) => void;
  onCreateOption?: (option: string) => void;
  disabledPlaceholder?: string;
  numberShowStepper?: boolean;
  numberPlaceholder?: string;
  arrayPlaceholder?: string;
}) => {
  const { t } = useTranslation();

  if (!tag) {
    return (
      <Input
        {...tagInputBaseStyles}
        isDisabled
        placeholder={disabledPlaceholder || t('dataset:tag.fill_value')}
      />
    );
  }

  if (tag.tagType === DatasetCollectionTagTypeEnum.number) {
    return (
      <NumberTagInput
        showStepper={numberShowStepper}
        value={value as number}
        placeholder={numberPlaceholder}
        onChange={(val) => onChange(val)}
      />
    );
  }

  if (tag.tagType === DatasetCollectionTagTypeEnum.datetime) {
    return <DateTimeTagInput value={value as number} onChange={(val) => onChange(val)} />;
  }

  if (tag.tagType === DatasetCollectionTagTypeEnum.array) {
    return (
      <ArrayTagSelect
        options={tag.options ?? []}
        placeholder={arrayPlaceholder}
        value={Array.isArray(value) ? value : value ? [String(value)] : []}
        onChange={(val) => onChange(val)}
        onCreateOption={onCreateOption}
      />
    );
  }

  return (
    <StringTagInput
      value={typeof value === 'string' ? value : String(value ?? '')}
      onChange={(val) => onChange(val)}
    />
  );
};
