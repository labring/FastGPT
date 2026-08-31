import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dayjs from 'dayjs';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { type DatasetTagType } from '@fastgpt/global/core/dataset/type';

export type CollectionTagDisplayItem = string | { tag: string; value?: string | number | string[] };

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
