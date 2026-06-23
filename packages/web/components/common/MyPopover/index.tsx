import React from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  useDisclosure,
  type PlacementWithLogical,
  PopoverArrow,
  type PopoverContentProps,
  Box,
  Portal
} from '@chakra-ui/react';

interface Props extends PopoverContentProps {
  Trigger: React.ReactNode;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  trigger?: 'hover' | 'click';
  hasArrow?: boolean;
  onBackdropClick?: () => void;
  children: (e: { onClose: () => void }) => React.ReactNode;
  onCloseFunc?: () => void;
  onOpenFunc?: () => void;
  closeOnBlur?: boolean;
  closeDelay?: number;
  openDelay?: number;
  disablePortal?: boolean;
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
  closeDelay = 100,
  openDelay = 100,
  disablePortal = false,
  onBackdropClick,
  ...props
}: Props) => {
  const firstFieldRef = React.useRef(null);

  const { onOpen, onClose, isOpen } = useDisclosure();

  const { zIndex: zIndexProp = 1001, ...restProps } = props;

  const content = (
    <PopoverContent {...restProps} zIndex={disablePortal ? 100 : zIndexProp}>
      {hasArrow && <PopoverArrow />}
      {children({ onClose })}
    </PopoverContent>
  );

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={() => {
        onOpen();
        onOpenFunc?.();
      }}
      onClose={() => {
        onClose();
        onCloseFunc?.();
      }}
      placement={placement}
      offset={offset}
      closeOnBlur={closeOnBlur}
      trigger={trigger}
      openDelay={openDelay}
      closeDelay={closeDelay}
      isLazy
      lazyBehavior="unmount"
      autoFocus={false}
    >
      <PopoverTrigger>{Trigger}</PopoverTrigger>
      {isOpen && onBackdropClick && (
        <Portal>
          <Box position="fixed" zIndex={1000} inset={0} onClick={() => onBackdropClick()} />
        </Portal>
      )}
      {disablePortal ? content : <Portal>{content}</Portal>}
    </Popover>
  );
};

export default MyPopover;
