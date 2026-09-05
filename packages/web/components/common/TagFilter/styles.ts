import type { WheelEvent } from 'react';
import type { SystemStyleObject } from '@chakra-ui/react';
import type { PlacementWithLogical } from '@chakra-ui/react';

export const FILTER_LIST_HEIGHTS = {
  sm: '168px',
  md: '240px',
  lg: '320px'
} as const;

export type FilterListSize = keyof typeof FILTER_LIST_HEIGHTS;

export const FILTER_LIST_H = FILTER_LIST_HEIGHTS.sm;

export const filterListScrollSx: SystemStyleObject = {
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--chakra-colors-myGray-200) transparent',
  '&::-webkit-scrollbar': { w: '4px' },
  '&::-webkit-scrollbar-thumb': {
    bg: 'myGray.200',
    borderRadius: 'full'
  }
};

export const stopFilterListWheel = (e: WheelEvent) => e.stopPropagation();

/** 选项超过阈值才按预设尺寸锁定最大高度并滚动，短列表跟随内容撑开。 */
export const getFilterListBoxProps = (scrollable: boolean, listSize: FilterListSize = 'sm') => ({
  h: 'auto' as const,
  maxH: scrollable ? FILTER_LIST_HEIGHTS[listSize] : undefined,
  overflowY: scrollable ? ('auto' as const) : undefined,
  sx: scrollable ? filterListScrollSx : undefined,
  onWheel: scrollable ? stopFilterListWheel : undefined
});

export const filterPopoverProps = {
  placement: 'bottom-start' as PlacementWithLogical,
  hasArrow: false,
  offset: [0, 4] as [number, number],
  closeOnBlur: true,
  trigger: 'click' as const
};
