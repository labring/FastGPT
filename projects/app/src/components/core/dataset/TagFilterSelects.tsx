import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Portal,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import {
  formatTagOptionKey,
  parseTagOptionKey,
  type DatasetTagFilterCondition,
  type DatasetTagFilterField,
  type DatasetTagFilterValueMode,
  type WorkflowTagFilterOption
} from '@fastgpt/global/core/dataset/search/tagFilter';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterFieldEnum,
  DatasetTagFilterValueModeEnum,
  type TagFilterOperator
} from '@fastgpt/global/core/dataset/constants';

type FieldSelectValue = {
  field: DatasetTagFilterField;
  tag?: string;
  tagType?: WorkflowTagFilterOption['tagType'];
  valueMode?: DatasetTagFilterValueMode;
  value?: unknown;
};

/**
 * 自定义标签选择器：展示知识库自定义标签列表，支持关键词搜索。
 */
export const TagFilterFieldSelect = ({
  condition,
  options,
  onChange
}: {
  condition: DatasetTagFilterCondition;
  options: WorkflowTagFilterOption[];
  onChange: (value: FieldSelectValue) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');

  const selectedLabel = condition.tag ?? '';
  const selectedValue =
    condition.tag && condition.tagType ? formatTagOptionKey(condition.tag, condition.tagType) : '';

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return options
      .filter((item) => !keyword || item.tag.toLowerCase().includes(keyword))
      .map((item) => ({
        label: item.tag,
        value: formatTagOptionKey(item.tag, item.tagType)
      }));
  }, [options, search]);

  const handleOpen = () => {
    setSearch('');
    onOpen();
  };

  const handleSelect = (value: string) => {
    const parsed = parseTagOptionKey(value);
    onChange({
      field: DatasetTagFilterFieldEnum.tag,
      tag: parsed?.tag,
      tagType: parsed?.tagType,
      valueMode: DatasetTagFilterValueModeEnum.input,
      value: undefined
    });
    onClose();
  };

  return (
    <Box w={'110px'} flexShrink={0}>
      <Popover
        isOpen={isOpen}
        onOpen={handleOpen}
        onClose={onClose}
        placement={'bottom-start'}
        autoFocus={false}
        isLazy
      >
        <PopoverTrigger>
          <Button
            type={'button'}
            className="nowheel"
            variant={'whitePrimaryOutline'}
            h={'36px'}
            w={'100%'}
            px={2}
            fontSize={'sm'}
            fontWeight={'normal'}
            textAlign={'left'}
            borderColor={isOpen ? 'primary.300' : 'myGray.200'}
            boxShadow={isOpen ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
            color={isOpen ? 'primary.700' : 'myGray.700'}
            bg={'white'}
            _active={{ transform: 'none' }}
            rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          >
            <Flex w={'100%'} minW={0} alignItems={'center'}>
              {selectedLabel ? (
                <MyTooltip label={selectedLabel} showOnlyWhenOverflow shouldWrapChildren={false}>
                  <Box
                    px={'4px'}
                    py={'2px'}
                    bg={'myGray.100'}
                    borderRadius={'xs'}
                    color={'myGray.900'}
                    maxW={'100%'}
                    minW={0}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {selectedLabel}
                  </Box>
                </MyTooltip>
              ) : (
                <Box color={'myGray.500'} noOfLines={1}>
                  {t('workflow:tag_filter_select_tag')}
                </Box>
              )}
            </Flex>
          </Button>
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            className="nowheel"
            w={'200px'}
            p={'6px'}
            bg={'white'}
            borderRadius={'sm'}
            border={'1px solid #fff'}
            boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
            _focusVisible={{ outline: 'none' }}
            zIndex={1500}
          >
            <Flex direction={'column'} gap={'4px'}>
              <Input
                h={'32px'}
                px={2}
                fontSize={'xs'}
                borderRadius={'sm'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                placeholder={t('common:Search')}
                _placeholder={{ color: 'myGray.500' }}
                _focus={{
                  borderColor: 'primary.600',
                  boxShadow: 'focus'
                }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Flex direction={'column'} maxH={'160px'} overflowY={'auto'}>
                {filteredItems.length === 0 ? (
                  <Box px={'4px'} py={'6px'} fontSize={'xs'} color={'myGray.500'}>
                    {t('common:no_select_data')}
                  </Box>
                ) : (
                  filteredItems.map((item) => {
                    const selected = item.value === selectedValue;
                    return (
                      <Flex
                        key={item.value}
                        alignItems={'center'}
                        px={'4px'}
                        py={'6px'}
                        borderRadius={'xs'}
                        cursor={'pointer'}
                        fontSize={'xs'}
                        fontWeight={'medium'}
                        bg={selected ? 'primary.50' : 'transparent'}
                        color={selected ? 'primary.700' : 'myGray.600'}
                        _hover={{ bg: selected ? 'primary.50' : 'myGray.50' }}
                        onClick={() => handleSelect(item.value)}
                      >
                        <MyTooltip
                          label={item.label}
                          showOnlyWhenOverflow
                          shouldWrapChildren={false}
                        >
                          <Box
                            flex={1}
                            minW={0}
                            overflow={'hidden'}
                            textOverflow={'ellipsis'}
                            whiteSpace={'nowrap'}
                          >
                            {item.label}
                          </Box>
                        </MyTooltip>
                      </Flex>
                    );
                  })
                )}
              </Flex>
            </Flex>
          </PopoverContent>
        </Portal>
      </Popover>
    </Box>
  );
};

/**
 * 系统标签属性选择器：支持选择创建时间或集合 ID。
 */
export const TagFilterAttrSelect = ({
  condition,
  onChange
}: {
  condition: DatasetTagFilterCondition;
  onChange: (value: FieldSelectValue) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const attrItems = useMemo(
    () => [
      {
        label: t('common:core.dataset.collection.metadata.Createtime'),
        value: DatasetTagFilterFieldEnum.createTime
      },
      {
        label: t('common:core.dataset.collection.id'),
        value: DatasetTagFilterFieldEnum.collectionId
      }
    ],
    [t]
  );

  const selectedLabel = (() => {
    if (condition.field === DatasetTagFilterFieldEnum.createTime) {
      return t('common:core.dataset.collection.metadata.Createtime');
    }
    if (condition.field === DatasetTagFilterFieldEnum.collectionId) {
      return t('common:core.dataset.collection.id');
    }
    return '';
  })();

  const handleSelect = (value: string) => {
    if (value === DatasetTagFilterFieldEnum.createTime) {
      onChange({
        field: DatasetTagFilterFieldEnum.createTime,
        tagType: DatasetCollectionTagTypeEnum.datetime,
        valueMode: DatasetTagFilterValueModeEnum.input,
        value: undefined
      });
    } else if (value === DatasetTagFilterFieldEnum.collectionId) {
      onChange({
        field: DatasetTagFilterFieldEnum.collectionId,
        tagType: DatasetCollectionTagTypeEnum.array,
        valueMode: DatasetTagFilterValueModeEnum.reference,
        value: ['', undefined]
      });
    }
    onClose();
  };

  return (
    <Box w={'110px'} flexShrink={0}>
      <Popover
        isOpen={isOpen}
        onOpen={onOpen}
        onClose={onClose}
        placement={'bottom-start'}
        autoFocus={false}
        isLazy
      >
        <PopoverTrigger>
          <Button
            type={'button'}
            className="nowheel"
            variant={'whitePrimaryOutline'}
            h={'36px'}
            w={'100%'}
            px={2}
            fontSize={'sm'}
            fontWeight={'normal'}
            textAlign={'left'}
            borderColor={isOpen ? 'primary.300' : 'myGray.200'}
            boxShadow={isOpen ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
            color={isOpen ? 'primary.700' : 'myGray.700'}
            bg={'white'}
            _active={{ transform: 'none' }}
            rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          >
            <Flex w={'100%'} minW={0} alignItems={'center'}>
              {selectedLabel ? (
                <MyTooltip label={selectedLabel} showOnlyWhenOverflow shouldWrapChildren={false}>
                  <Box
                    px={'4px'}
                    py={'2px'}
                    bg={'myGray.100'}
                    borderRadius={'xs'}
                    color={'myGray.900'}
                    maxW={'100%'}
                    minW={0}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {selectedLabel}
                  </Box>
                </MyTooltip>
              ) : (
                <Box color={'myGray.500'} noOfLines={1}>
                  {t('workflow:tag_filter_select_attr')}
                </Box>
              )}
            </Flex>
          </Button>
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            className="nowheel"
            w={'140px'}
            minW={'110px'}
            p={'6px'}
            bg={'white'}
            borderRadius={'sm'}
            border={'1px solid #fff'}
            boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
            _focusVisible={{ outline: 'none' }}
            zIndex={1500}
          >
            <Flex direction={'column'} gap={'2px'}>
              {attrItems.map((item) => {
                const selected = condition.field === item.value;
                return (
                  <Flex
                    key={item.value}
                    alignItems={'center'}
                    px={'4px'}
                    py={'6px'}
                    borderRadius={'xs'}
                    cursor={'pointer'}
                    fontSize={'xs'}
                    fontWeight={'medium'}
                    bg={selected ? 'primary.50' : 'transparent'}
                    color={selected ? 'primary.700' : 'myGray.600'}
                    _hover={{ bg: selected ? 'primary.50' : 'myGray.50' }}
                    onClick={() => handleSelect(item.value)}
                  >
                    <MyTooltip label={item.label} showOnlyWhenOverflow shouldWrapChildren={false}>
                      <Box
                        flex={1}
                        minW={0}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {item.label}
                      </Box>
                    </MyTooltip>
                  </Flex>
                );
              })}
            </Flex>
          </PopoverContent>
        </Portal>
      </Popover>
    </Box>
  );
};

/** 条件操作符。数字类用稿上的 16px 符号图标 + 12px 文案。 */
export const TagFilterOpSelect = ({
  value,
  list,
  onChange
}: {
  value?: string;
  list: TagFilterOperator[];
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const selected = list.find((item) => item.value === value);

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement={'bottom-start'}
      autoFocus={false}
      isLazy
    >
      <PopoverTrigger>
        <Button
          type={'button'}
          className="nowheel"
          variant={'whitePrimaryOutline'}
          h={'36px'}
          w={'100px'}
          flexShrink={0}
          px={2}
          fontSize={'sm'}
          fontWeight={'normal'}
          textAlign={'left'}
          borderColor={isOpen ? 'primary.300' : 'myGray.200'}
          boxShadow={isOpen ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
          color={isOpen ? 'primary.700' : 'myGray.700'}
          bg={'white'}
          isDisabled={list.length === 0}
          _active={{ transform: 'none' }}
          rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
        >
          <Box w={'100%'} minW={0} noOfLines={1} color={selected ? 'myGray.700' : 'myGray.500'}>
            {selected ? t(selected.label) : t('workflow:tag_filter_select_condition')}
          </Box>
        </Button>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          className="nowheel"
          w={'115px'}
          minW={'100px'}
          p={'6px'}
          bg={'white'}
          borderRadius={'sm'}
          border={'1px solid #fff'}
          boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
          _focusVisible={{ outline: 'none' }}
          zIndex={1500}
        >
          <Flex direction={'column'} gap={'2px'}>
            {list.map((item) => (
              <Flex
                key={item.value}
                alignItems={'center'}
                gap={2}
                px={'4px'}
                py={'6px'}
                minH={'28px'}
                borderRadius={'xs'}
                cursor={'pointer'}
                fontSize={'xs'}
                fontWeight={'medium'}
                color={'myGray.600'}
                bg={item.value === value ? 'myGray.50' : 'transparent'}
                _hover={{ bg: 'myGray.50' }}
                onClick={() => {
                  onChange(item.value);
                  onClose();
                }}
              >
                {item.icon && (
                  <MyIcon
                    name={item.icon as IconNameType}
                    w={'16px'}
                    h={'16px'}
                    flexShrink={0}
                    transform={item.iconFlip ? 'scaleX(-1)' : undefined}
                  />
                )}
                <Box>{t(item.label)}</Box>
              </Flex>
            ))}
          </Flex>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};
