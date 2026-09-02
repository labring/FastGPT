import type { WheelEvent } from 'react';
import type { SystemStyleObject } from '@chakra-ui/react';
import type { PlacementWithLogical } from '@chakra-ui/react';

export const FILTER_LIST_H = '168px';

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

export const filterPopoverProps = {
  placement: 'bottom-start' as PlacementWithLogical,
  hasArrow: false,
  offset: [0, 4] as [number, number],
  closeOnBlur: true,
  trigger: 'click' as const
};
