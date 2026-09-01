import React, { useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dayjs from 'dayjs';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import {
  DatasetCollectionTagTypeEnum,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import {
  collectionTagValueKey,
  isUsableCollectionTagFilterValue,
  sortCollectionTagValues
} from '@fastgpt/global/core/dataset/tagUtils';

export type CollectionTagDisplayItem = string | { tag: string; value?: string | number | string[] };

export const OVERFLOW_CHIP_GAP_PX = 8;

/**
 * 根据测量宽度计算可见 chip 数量。空间不够时至少留 1 个，其余用 +n。
 */
export const countVisibleOverflowChips = ({
  chipWidths,
  overflowWidth,
  containerWidth,
  gapPx = OVERFLOW_CHIP_GAP_PX
}: {
  chipWidths: number[];
  overflowWidth: number;
  containerWidth: number;
  gapPx?: number;
}): number => {
  if (chipWidths.length === 0) return 0;

  let usedWidth = 0;
  let visibleCount = chipWidths.length;

  for (let i = 0; i < chipWidths.length; i++) {
    const isLast = i === chipWidths.length - 1;
    const gap = isLast ? 0 : gapPx;
    const reserved = isLast ? 0 : overflowWidth;

    if (usedWidth + chipWidths[i] + gap + reserved <= containerWidth) {
      usedWidth += chipWidths[i] + gap;
      continue;
    }

    visibleCount = i;
    break;
  }

  return visibleCount === 0 ? 1 : visibleCount;
};

/** 列表/选项输入共用的 chip 溢出测量。itemKey 变化时重新量。 */
export const useOverflowChipCount = ({
  itemKey,
  itemCount,
  gapPx = OVERFLOW_CHIP_GAP_PX
}: {
  itemKey: unknown;
  itemCount: number;
  gapPx?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      setVisibleCount(itemCount);
      return;
    }

    const calculate = () => {
      const chipEls = Array.from(measure.querySelectorAll('[data-tag-chip]')) as HTMLElement[];
      const overflowEl = measure.querySelector('[data-overflow-chip]') as HTMLElement | null;
      setVisibleCount(
        countVisibleOverflowChips({
          chipWidths: chipEls.map((el) => el.offsetWidth),
          overflowWidth: overflowEl?.offsetWidth ?? 0,
          containerWidth: container.offsetWidth,
          gapPx
        })
      );
    };

    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [gapPx, itemCount, itemKey]);

  return { containerRef, measureRef, visibleCount };
};

export const formatCollectionTagValueText = (
  value: string | number | string[] | undefined,
  tagType?: DatasetTagType['tagType']
): string => {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.filter(Boolean).join('、');
  if (tagType === 'datetime') {
    const d = dayjs(value);
    return d.isValid() ? formatTime2YMDHM(d.valueOf()) : String(value);
  }
  return String(value);
};

/**
 * 把列表返回的展示格式（名称或 { tag, value }）解析成标签定义和值。
 * 旧字符串按名称或 ID 找回定义；选项类旧字符串当作单个选项。
 */
export const resolveDisplayedCollectionTag = (
  item: CollectionTagDisplayItem,
  tags: DatasetTagType[]
) => {
  const tagNameOrId = typeof item === 'string' ? item : item.tag;
  const tagDoc = tags.find((tag) => tag.tag === tagNameOrId || String(tag._id) === tagNameOrId);
  if (!tagDoc) return;

  const value = (() => {
    if (typeof item !== 'string') {
      if (item.value != null && item.value !== '') return item.value;
      return tagDoc.tagType === DatasetCollectionTagTypeEnum.array ? [] : '';
    }
    return tagDoc.tagType === DatasetCollectionTagTypeEnum.array ? [item] : item;
  })();

  return { tagDoc, value };
};

/**
 * 组装筛选弹窗右侧的值列表。
 * 选项类用标签管理里的预设 options，并与文件上已用但不在预设里的值取并集；
 * 文本/数字/日期没有预设列表，只展示已用值。
 */
export const buildTagFilterValues = (
  tag: Pick<DatasetTagType, 'tagType' | 'options'>,
  usedValues: Array<string | number> = []
): Array<string | number> => {
  const values = new Map<string, string | number>();
  const addValue = (value: string | number) => {
    if (!isUsableCollectionTagFilterValue(value)) return;
    values.set(collectionTagValueKey(value), value);
  };

  if (tag.tagType === DatasetCollectionTagTypeEnum.array) {
    for (const option of tag.options ?? []) addValue(option);
  }
  for (const value of usedValues) addValue(value);

  return sortCollectionTagValues(Array.from(values.values()));
};

/** 新格式展示「名称：值」；旧字符串标签只展示名称。 */
export const formatCollectionTagChipText = (
  item: CollectionTagDisplayItem,
  tagDefs: DatasetTagType[] = []
): string => {
  if (typeof item === 'string') return item;

  const tagType = tagDefs.find((def) => def.tag === item.tag)?.tagType;
  const valueText = formatCollectionTagValueText(item.value, tagType);
  return valueText ? `${item.tag}：${valueText}` : item.tag;
};

export const TAG_TOOLTIP_PROPS = {
  placement: 'bottom' as const,
  offset: [0, 10] as [number, number],
  hasArrow: true,
  arrowSize: 10,
  px: 3,
  py: 2,
  borderRadius: 'sm',
  fontSize: 'xs',
  lineHeight: '18px',
  color: 'myGray.800',
  arrowShadowColor: 'rgba(19, 51, 107, 0.1)',
  boxShadow: '0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'
};

export const SaveActionIcon = ({ isEnabled }: { isEnabled: boolean }) => {
  if (!isEnabled) {
    return <MyIcon name={'common/checkSquareBroken'} w={'16px'} h={'16px'} />;
  }

  return (
    <Box position={'relative'} w={'16px'} h={'16px'}>
      <MyIcon
        name={'common/checkSquareBrokenPrimary'}
        w={'16px'}
        h={'16px'}
        position={'absolute'}
        inset={0}
      />
      <MyIcon
        name={'common/checkSquareBrokenPrimaryHover'}
        w={'16px'}
        h={'16px'}
        position={'absolute'}
        inset={0}
        opacity={0}
        className={'tag-save-icon-hover'}
      />
    </Box>
  );
};

export type TagActionButtonProps = {
  label: string;
  icon: React.ReactElement;
  onClick?: () => void;
  isDisabled?: boolean;
  color?: string;
  hoverColor?: string;
  hoverIconClassName?: string;
};

export const TagActionButton = ({
  label,
  icon,
  onClick,
  isDisabled = false,
  color = 'myGray.500',
  hoverColor,
  hoverIconClassName
}: TagActionButtonProps) => (
  <MyTooltip label={label} shouldWrapChildren={false} {...TAG_TOOLTIP_PROPS}>
    <Flex
      as={'button'}
      type={'button'}
      aria-label={label}
      alignItems={'center'}
      justifyContent={'center'}
      p={1}
      borderRadius={'sm'}
      color={color}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      aria-disabled={isDisabled}
      _hover={
        isDisabled
          ? undefined
          : {
              bg: 'myGray.05',
              ...(hoverColor ? { color: hoverColor } : {}),
              ...(hoverIconClassName ? { [`& .${hoverIconClassName}`]: { opacity: 1 } } : {})
            }
      }
      onClick={isDisabled ? undefined : onClick}
    >
      {icon}
    </Flex>
  </MyTooltip>
);

export const TagTableContainer = ({ children, ...props }: FlexProps) => (
  <Flex
    direction={'column'}
    flex={1}
    minH={0}
    border={'1px solid'}
    borderColor={'myGray.200'}
    borderRadius={'lg'}
    p={2}
    overflow={'hidden'}
    {...props}
  >
    {children}
  </Flex>
);

export const TagTableHeader = ({
  columns,
  children
}: {
  columns: string;
  children: React.ReactNode;
}) => (
  <Box
    display={'grid'}
    gridTemplateColumns={columns}
    h={'40px'}
    flexShrink={0}
    alignItems={'center'}
    bg={'myGray.100'}
    borderRadius={'sm'}
    color={'myGray.600'}
    fontSize={'xs'}
    fontWeight={'bold'}
    letterSpacing={'0.58px'}
    lineHeight={'16px'}
  >
    {children}
  </Box>
);
