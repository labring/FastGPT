import React from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  useDisclosure,
  PlacementWithLogical,
  PopoverArrow,
  PopoverContentProps
} from '@chakra-ui/react';

interface Props extends PopoverContentProps {
  Trigger: React.ReactNode;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  trigger?: 'hover' | 'click';
  hasArrow?: boolean;
  children: (e: { onClose: () => void }) => React.ReactNode;
  onCloseFunc?: () => void;
  onOpenFunc?: () => void;
  closeOnBlur?: boolean;
}

const MyPopover = ({
  Trigger,
  placement,
  offset,
  trigger,
  hasArrow = true,
  children,
  onOpenFunc,
  onCloseFunc,
  closeOnBlur = false,
  ...props
}: Props) => {
  const firstFieldRef = React.useRef(null);

  const { onOpen, onClose, isOpen } = useDisclosure();

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={() => {
        onOpen();
        onOpenFunc && onOpenFunc();
      }}
      onClose={() => {
        onClose();
        onCloseFunc && onCloseFunc();
      }}
      placement={placement}
      offset={offset}
      closeOnBlur={closeOnBlur}
      trigger={trigger}
      openDelay={100}
      closeDelay={100}
      isLazy
      lazyBehavior="keepMounted"
    >
      <PopoverTrigger>{Trigger}</PopoverTrigger>
      <PopoverContent {...props}>
        {hasArrow && <PopoverArrow />}
        {children({ onClose })}
      </PopoverContent>
    </Popover>
  );
};

export default MyPopover;
