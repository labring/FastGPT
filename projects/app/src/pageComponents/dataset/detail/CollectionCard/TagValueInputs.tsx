import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  placeholder
}: {
  value?: number | string;
  onChange: (val: number | '') => void;
  placeholder?: string;
}) => {
  const { t } = useTranslation();

  return (
    <Input
      {...tagInputBaseStyles}
      type={'number'}
      value={value === undefined ? '' : value}
      placeholder={placeholder || t('dataset:tag.fill_number')}
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
  onChange
}: {
  value?: number | string;
  onChange: (val: number) => void;
}) => (
  <SingleDateTimePicker value={value ? Number(value) : undefined} onChange={onChange} w={'100%'} />
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

const ARRAY_CHIP_GAP_PX = 8;
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
  onCreateOption
}: {
  options: string[];
  value?: string[];
  onChange: (val: string[]) => void;
  onCreateOption?: (option: string) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(value.length);

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

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      setVisibleCount(value.length);
      return;
    }

    const calculateChips = () => {
      const chipEls = Array.from(measure.querySelectorAll('[data-tag-chip]')) as HTMLElement[];
      const overflowEl = measure.querySelector('[data-overflow-chip]') as HTMLElement | null;
      const overflowWidth = overflowEl?.offsetWidth ?? 0;
      const containerWidth = container.offsetWidth;
      let usedWidth = 0;
      let nextVisibleCount = chipEls.length;

      for (let i = 0; i < chipEls.length; i++) {
        const chipWidth = chipEls[i].offsetWidth;
        const isLast = i === chipEls.length - 1;
        const gap = isLast ? 0 : ARRAY_CHIP_GAP_PX;
        const reserved = isLast ? 0 : overflowWidth;

        if (usedWidth + chipWidth + gap + reserved <= containerWidth) {
          usedWidth += chipWidth + gap;
          continue;
        }

        nextVisibleCount = i;
        break;
      }

      if (nextVisibleCount === 0 && chipEls.length > 0) {
        nextVisibleCount = 1;
      }

      setVisibleCount(nextVisibleCount);
    };

    calculateChips();
    const observer = new ResizeObserver(calculateChips);
    observer.observe(container);

    return () => observer.disconnect();
  }, [value]);

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
                {t('dataset:tag.select_options')}
              </Box>
            ) : (
              <>
                <Flex
                  ref={measureRef}
                  position={'absolute'}
                  visibility={'hidden'}
                  pointerEvents={'none'}
                  alignItems={'center'}
                  gap={`${ARRAY_CHIP_GAP_PX}px`}
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
                  gap={`${ARRAY_CHIP_GAP_PX}px`}
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
