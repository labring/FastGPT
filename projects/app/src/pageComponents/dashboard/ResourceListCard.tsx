import React from 'react';
import { type BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';

const paddingKeys = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl'] as const;

export type ResourceListCardProps = {
  /** 批量选择模式。该模式下关闭拖拽，避免和多选点击冲突。 */
  isBatchMode?: boolean;
  isSelected?: boolean;
  /** 批量模式下是否允许选中。无管理权限时卡片不可点。 */
  canSelect?: boolean;
  /**
   * `useFolderDrag().getBoxProps` 的返回值。
   * 批量模式下不会挂到 DOM 上。
   */
  dragProps?: BoxProps;
  onClick?: BoxProps['onClick'];
  children: React.ReactNode;
} & Omit<BoxProps, 'onClick' | 'children'>;

/**
 * 工作台资源列表卡片外壳，Agent / 工具 / 知识库 / 技能共用。
 *
 * 统一批量选中样式、hover 时操作区显隐，以及把卡片拖到文件夹上移动。
 * 各列表的内边距、阴影、边框等视觉差异通过其余 BoxProps 覆盖。
 * 拖拽高亮（dragProps.borderColor）必须最后展开，才能盖过默认边框。
 */
const ResourceListCard = ({
  isBatchMode = false,
  isSelected = false,
  canSelect = true,
  dragProps,
  onClick,
  children,
  ...boxProps
}: ResourceListCardProps) => {
  const showSelected = isBatchMode && isSelected && canSelect;
  const hasCustomPadding = paddingKeys.some((key) => boxProps[key] !== undefined);
  const borderColor = showSelected
    ? 'primary.600 !important'
    : boxProps.borderColor !== undefined
      ? boxProps.borderColor
      : boxProps.border
        ? undefined
        : 'myGray.200';

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      position={'relative'}
      minW={0}
      border={'1px solid'}
      borderRadius={'10px'}
      {...(!hasCustomPadding && { py: 4, px: 5 })}
      {...boxProps}
      data-virtual-item=""
      cursor={isBatchMode ? (canSelect ? 'pointer' : 'not-allowed') : 'pointer'}
      bg={showSelected ? 'primary.50' : (boxProps.bg ?? 'white')}
      {...(borderColor !== undefined ? { borderColor } : {})}
      _hover={
        isBatchMode
          ? {
              borderColor: canSelect
                ? showSelected
                  ? 'primary.600'
                  : 'primary.300'
                : 'myGray.200',
              boxShadow: canSelect ? '1.5' : undefined,
              '& .time': {
                display: 'flex !important'
              },
              '& .more': {
                display: 'none !important'
              }
            }
          : {
              borderColor: 'primary.300',
              boxShadow: '1.5',
              '& .delete': {
                display: 'block'
              },
              '& .more': {
                display: 'flex'
              },
              '& .time': {
                display: ['flex', 'none']
              }
            }
      }
      onClick={onClick}
      {...(!isBatchMode ? dragProps : undefined)}
    >
      {children}
    </MyBox>
  );
};

export default React.memo(ResourceListCard);
