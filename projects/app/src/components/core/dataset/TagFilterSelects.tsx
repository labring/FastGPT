import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import {
  DatasetTagFilterFieldEnum,
  DatasetTagFilterValueModeEnum,
  formatTagOptionKey,
  parseTagOptionKey,
  type DatasetTagFilterCondition,
  type DatasetTagFilterField,
  type DatasetTagFilterValueMode,
  type WorkflowTagFilterOption
} from '@fastgpt/global/core/dataset/workflowTagFilter';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';

const FILE_TAGS = 'fileTags';
const FILE_ATTRS = 'fileAttrs';

type FieldSelectValue = {
  field: DatasetTagFilterField;
  tag?: string;
  tagType?: WorkflowTagFilterOption['tagType'];
  valueMode?: DatasetTagFilterValueMode;
  value?: unknown;
};

/** 选择标签：左侧文件标签 / 文件属性，右侧可搜索。选中后触发器只展示叶子名称。 */
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
  const selectedLabel = (() => {
    if (condition.field === DatasetTagFilterFieldEnum.createTime) {
      return t('common:core.dataset.collection.metadata.Createtime' as any);
    }
    if (condition.field === DatasetTagFilterFieldEnum.collectionId) {
      return t('common:core.dataset.collection.id' as any);
    }
    return condition.tag ?? '';
  })();
  const selectedValue =
    condition.field === DatasetTagFilterFieldEnum.createTime
      ? DatasetTagFilterFieldEnum.createTime
      : condition.field === DatasetTagFilterFieldEnum.collectionId
        ? DatasetTagFilterFieldEnum.collectionId
        : condition.tag && condition.tagType
          ? formatTagOptionKey(condition.tag, condition.tagType)
          : '';
  const activeGroup =
    condition.field === DatasetTagFilterFieldEnum.createTime ||
    condition.field === DatasetTagFilterFieldEnum.collectionId
      ? FILE_ATTRS
      : FILE_TAGS;

  const [group, setGroup] = useState(activeGroup);

  const rightItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (group === FILE_ATTRS) {
      return [
        {
          label: t('common:core.dataset.collection.metadata.Createtime'),
          value: DatasetTagFilterFieldEnum.createTime
        },
        {
          label: t('common:core.dataset.collection.id'),
          value: DatasetTagFilterFieldEnum.collectionId
        }
      ].filter((item) => !keyword || String(item.label).toLowerCase().includes(keyword));
    }
    return options
      .filter((item) => !keyword || item.tag.toLowerCase().includes(keyword))
      .map((item) => ({
        label: item.tag,
        value: formatTagOptionKey(item.tag, item.tagType)
      }));
  }, [group, options, search, t]);

  const handleOpen = () => {
    setGroup(activeGroup);
    setSearch('');
    onOpen();
  };

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
    } else {
      const parsed = parseTagOptionKey(value);
      onChange({
        field: DatasetTagFilterFieldEnum.tag,
        tag: parsed?.tag,
        tagType: parsed?.tagType,
        valueMode: DatasetTagFilterValueModeEnum.input,
        value: undefined
      });
    }
    onClose();
  };

  return (
    <Box flex={1} minW={'100px'}>
      <Popover
        isOpen={isOpen}
        onOpen={handleOpen}
        onClose={onClose}
        placement={'bottom-start'}
        isLazy
      >
        <PopoverTrigger>
          <Button
            type={'button'}
            className="nowheel"
            variant={'whitePrimaryOutline'}
            h={'36px'}
            w={'100%'}
            px={3}
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
                <Box
                  px={'4px'}
                  py={'2px'}
                  bg={'myGray.100'}
                  borderRadius={'xs'}
                  color={'myGray.900'}
                  noOfLines={1}
                >
                  {selectedLabel}
                </Box>
              ) : (
                <Box color={'myGray.500'} noOfLines={1}>
                  {t('workflow:tag_filter_select_tag')}
                </Box>
              )}
            </Flex>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          w={'320px'}
          p={'6px'}
          bg={'white'}
          borderRadius={'sm'}
          border={'1px solid #fff'}
          boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
          _focusVisible={{ outline: 'none' }}
          zIndex={1500}
        >
          <Flex gap={'4px'} alignItems={'stretch'}>
            <Flex w={'120px'} direction={'column'} gap={'4px'} flexShrink={0}>
              {[
                { value: FILE_TAGS, label: t('workflow:tag_filter_file_tags') },
                { value: FILE_ATTRS, label: t('workflow:tag_filter_file_attrs') }
              ].map((item) => {
                const selected = group === item.value;
                return (
                  <Flex
                    key={item.value}
                    alignItems={'center'}
                    justifyContent={'space-between'}
                    px={'4px'}
                    py={'6px'}
                    borderRadius={'xs'}
                    cursor={'pointer'}
                    bg={selected ? 'primary.50' : 'transparent'}
                    color={selected ? 'primary.700' : 'myGray.600'}
                    fontSize={'xs'}
                    fontWeight={'medium'}
                    onClick={() => {
                      setGroup(item.value);
                      setSearch('');
                    }}
                  >
                    <Box>{item.label}</Box>
                    <MyIcon
                      name={'core/chat/chevronDown'}
                      w={'16px'}
                      h={'16px'}
                      transform={'rotate(-90deg)'}
                      color={selected ? 'primary.700' : 'myGray.600'}
                    />
                  </Flex>
                );
              })}
            </Flex>
            <Box w={'1px'} bg={'myGray.200'} flexShrink={0} />
            <Flex flex={1} minW={0} direction={'column'} gap={'4px'} px={'4px'}>
              <Input
                h={'32px'}
                px={1}
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
                {rightItems.length === 0 ? (
                  <Box px={'4px'} py={'6px'} fontSize={'xs'} color={'myGray.500'}>
                    {t('common:no_select_data')}
                  </Box>
                ) : (
                  rightItems.map((item) => {
                    const selected = group === activeGroup && item.value === selectedValue;
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
                        {item.label}
                      </Flex>
                    );
                  })
                )}
              </Flex>
            </Flex>
          </Flex>
        </PopoverContent>
      </Popover>
    </Box>
  );
};

type OpItem = {
  labelKey: string;
  value: string;
  icon?: string;
  iconFlip?: boolean;
};

/** 条件操作符。数字类用稿上的 16px 符号图标 + 12px 文案。 */
export const TagFilterOpSelect = ({
  value,
  list,
  onChange
}: {
  value?: string;
  list: OpItem[];
  onChange: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const selected = list.find((item) => item.value === value);

  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement={'bottom-start'} isLazy>
      <PopoverTrigger>
        <Button
          type={'button'}
          className="nowheel"
          variant={'whitePrimaryOutline'}
          h={'36px'}
          w={'115px'}
          flexShrink={0}
          px={3}
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
            {selected ? t(selected.labelKey) : t('workflow:tag_filter_select_condition')}
          </Box>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        w={'115px'}
        minW={'115px'}
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
              <Box>{t(item.labelKey)}</Box>
            </Flex>
          ))}
        </Flex>
      </PopoverContent>
    </Popover>
  );
};
