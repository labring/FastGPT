import React from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  useDisclosure,
  PlacementWithLogical,
  PopoverArrow
} from '@chakra-ui/react';

const MyPopover = ({
  Trigger,
  placement,
  offset,
  trigger,
  children
}: {
  Trigger: React.ReactNode;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  trigger?: 'hover' | 'click';
  children: (e: { onClose: () => void }) => React.ReactNode;
}) => {
  const firstFieldRef = React.useRef(null);

  const { onOpen, onClose, isOpen } = useDisclosure();

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={onOpen}
      onClose={onClose}
      placement={placement}
      offset={offset}
      closeOnBlur={false}
      trigger={trigger}
      openDelay={100}
      closeDelay={100}
      isLazy
      lazyBehavior="keepMounted"
    >
      <PopoverTrigger>{Trigger}</PopoverTrigger>
      <PopoverContent p={4}>
        <PopoverArrow />
        {children({ onClose })}
      </PopoverContent>
    </Popover>
  );
};

export default MyPopover;
