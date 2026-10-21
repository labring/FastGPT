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
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
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

type DropdownOptionItem = {
  label: string;
  value: string;
  icon?: IconNameType;
  iconFlip?: boolean;
};

/**
 * 标签、系统属性与条件操作符共用的下拉选择底座，统一触发按钮省略、悬浮提示、可选搜索框与前缀图标。
 */
const TagFilterDropdownSelect = ({
  items,
  selectedValue,
  selectedLabel,
  placeholder,
  width = '110px',
  highlightSelected = true,
  searchable = false,
  popoverWidth = '140px',
  popoverMinWidth,
  onSelect
}: {
  items: DropdownOptionItem[];
  selectedValue: string;
  selectedLabel: string;
  placeholder: string;
  width?: string;
  highlightSelected?: boolean;
  searchable?: boolean;
  popoverWidth?: string;
  popoverMinWidth?: string;
  onSelect: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchable) return items;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => item.label.toLowerCase().includes(keyword));
  }, [items, search, searchable]);

  const handleOpen = () => {
    if (searchable) {
      setSearch('');
    }
    onOpen();
  };

  return (
    <Box w={width} flexShrink={0}>
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
            _hover={{ borderColor: 'primary.300', color: 'primary.600' }}
            _active={{ transform: 'none' }}
            rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          >
            {selectedLabel ? (
              <MyTooltip label={selectedLabel} showOnlyWhenOverflow shouldWrapChildren={false}>
                <Box
                  w={'100%'}
                  minW={0}
                  color={'myGray.900'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {selectedLabel}
                </Box>
              </MyTooltip>
            ) : (
              <Box w={'100%'} minW={0} noOfLines={1} color={'myGray.500'}>
                {placeholder}
              </Box>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="nowheel"
          w={popoverWidth}
          minW={popoverMinWidth}
          p={'6px'}
          bg={'white'}
          borderRadius={'sm'}
          border={'1px solid #fff'}
          boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
          _focusVisible={{ outline: 'none' }}
          zIndex={1500}
        >
          <Flex direction={'column'} gap={searchable ? '4px' : '2px'}>
            {searchable && (
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
            )}
            <Flex
              direction={'column'}
              gap={searchable ? undefined : '2px'}
              maxH={searchable ? '160px' : undefined}
              overflowY={searchable ? 'auto' : undefined}
            >
              {filteredItems.length === 0 ? (
                <EmptyTip py={0} text={t('common:no_select_data')} />
              ) : (
                filteredItems.map((item) => {
                  const selected = item.value === selectedValue;
                  return (
                    <Flex
                      key={item.value}
                      alignItems={'center'}
                      gap={item.icon ? 2 : undefined}
                      px={'4px'}
                      py={'6px'}
                      minH={'28px'}
                      borderRadius={'xs'}
                      cursor={'pointer'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      bg={
                        selected ? (highlightSelected ? 'primary.50' : 'myGray.50') : 'transparent'
                      }
                      color={selected && highlightSelected ? 'primary.700' : 'myGray.600'}
                      _hover={{ bg: selected && highlightSelected ? 'primary.50' : 'myGray.50' }}
                      onClick={() => {
                        onSelect(item.value);
                        onClose();
                      }}
                    >
                      {item.icon && (
                        <MyIcon
                          name={item.icon}
                          w={'16px'}
                          h={'16px'}
                          flexShrink={0}
                          transform={item.iconFlip ? 'scaleX(-1)' : undefined}
                        />
                      )}
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
                })
              )}
            </Flex>
          </Flex>
        </PopoverContent>
      </Popover>
    </Box>
  );
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
  const selectedLabel = condition.tag ?? '';
  const selectedValue =
    condition.tag && condition.tagType ? formatTagOptionKey(condition.tag, condition.tagType) : '';

  const items = useMemo(
    () =>
      options.map((item) => ({
        label: item.tag,
        value: formatTagOptionKey(item.tag, item.tagType)
      })),
    [options]
  );

  return (
    <TagFilterDropdownSelect
      items={items}
      selectedValue={selectedValue}
      selectedLabel={selectedLabel}
      placeholder={t('workflow:tag_filter_select_tag')}
      searchable
      popoverWidth={'200px'}
      onSelect={(value) => {
        const parsed = parseTagOptionKey(value);
        onChange({
          field: DatasetTagFilterFieldEnum.tag,
          tag: parsed?.tag,
          tagType: parsed?.tagType,
          valueMode: DatasetTagFilterValueModeEnum.input,
          value: undefined
        });
      }}
    />
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

  return (
    <TagFilterDropdownSelect
      items={attrItems}
      selectedValue={condition.field ?? ''}
      selectedLabel={attrItems.find((item) => item.value === condition.field)?.label ?? ''}
      placeholder={t('workflow:tag_filter_select_attr')}
      popoverWidth={'140px'}
      popoverMinWidth={'110px'}
      onSelect={(value) => {
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
      }}
    />
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
  const items = useMemo(() => {
    // 同一操作符在数字、时间和选项标签下文案不同，按声明的 label 映射，保留现有语义。
    const labels: Record<string, string> = {
      'workflow:tag_filter_op_empty': t('workflow:tag_filter_op_empty'),
      'workflow:tag_filter_op_not_empty': t('workflow:tag_filter_op_not_empty'),
      'workflow:tag_filter_op_contains': t('workflow:tag_filter_op_contains'),
      'workflow:tag_filter_op_not_contains': t('workflow:tag_filter_op_not_contains'),
      'workflow:tag_filter_op_starts_with': t('workflow:tag_filter_op_starts_with'),
      'workflow:tag_filter_op_ends_with': t('workflow:tag_filter_op_ends_with'),
      'workflow:tag_filter_op_regex': t('workflow:tag_filter_op_regex'),
      'workflow:tag_filter_op_eq': t('workflow:tag_filter_op_eq'),
      'workflow:tag_filter_op_ne': t('workflow:tag_filter_op_ne'),
      'workflow:tag_filter_op_gt': t('workflow:tag_filter_op_gt'),
      'workflow:tag_filter_op_lt': t('workflow:tag_filter_op_lt'),
      'workflow:tag_filter_op_gte': t('workflow:tag_filter_op_gte'),
      'workflow:tag_filter_op_lte': t('workflow:tag_filter_op_lte'),
      'workflow:tag_filter_op_after': t('workflow:tag_filter_op_after'),
      'workflow:tag_filter_op_before': t('workflow:tag_filter_op_before'),
      'workflow:tag_filter_op_in': t('workflow:tag_filter_op_in'),
      'workflow:tag_filter_op_not_in': t('workflow:tag_filter_op_not_in')
    };

    return list.map((item) => ({
      label: labels[item.label] ?? item.label,
      value: item.value,
      icon: item.icon as IconNameType | undefined,
      iconFlip: item.iconFlip
    }));
  }, [list, t]);
  const selected = items.find((item) => item.value === value);

  return (
    <TagFilterDropdownSelect
      items={items}
      selectedValue={value ?? ''}
      selectedLabel={selected?.label ?? ''}
      placeholder={t('workflow:tag_filter_select_condition')}
      width={'100px'}
      highlightSelected={false}
      popoverWidth={'115px'}
      popoverMinWidth={'100px'}
      onSelect={onChange}
    />
  );
};
