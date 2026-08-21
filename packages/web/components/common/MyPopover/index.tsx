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

type Props = PopoverContentProps & {
  Trigger: React.ReactNode;
  /** 传入时由调用方控制显隐；省略时保持原有 useDisclosure 行为。 */
  isOpen?: boolean;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  trigger?: 'hover' | 'click';
  hasArrow?: boolean;
  onBackdropClick?: () => void;
  children: (e: { onClose: () => void }) => React.ReactNode;
  onCloseFunc?: () => void;
  onOpenFunc?: () => void;
  closeOnBlur?: boolean;
  usePortal?: boolean;
  flip?: boolean;
};

const MyPopover = ({
  Trigger,
  isOpen: controlledIsOpen,
  placement,
  offset,
  trigger,
  hasArrow = true,
  children,
  onOpenFunc,
  onCloseFunc,
  closeOnBlur = false,
  usePortal = true,
  flip = true,
  onBackdropClick,
  ...props
}: Props) => {
  const firstFieldRef = React.useRef(null);

  const {
    onOpen: onInternalOpen,
    onClose: onInternalClose,
    isOpen: internalIsOpen
  } = useDisclosure();
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const onOpen = () => {
    if (!isControlled) onInternalOpen();
    onOpenFunc?.();
  };
  const onClose = () => {
    if (!isControlled) onInternalClose();
    onCloseFunc?.();
  };

  const popoverContent = (
    <PopoverContent zIndex={1001} {...props}>
      {hasArrow && <PopoverArrow />}
      {children({ onClose })}
    </PopoverContent>
  );

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={onOpen}
      onClose={onClose}
      placement={placement}
      offset={offset}
      flip={flip}
      closeOnBlur={closeOnBlur}
      trigger={trigger}
      openDelay={100}
      closeDelay={100}
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
      {usePortal ? <Portal>{popoverContent}</Portal> : popoverContent}
    </Popover>
  );
};

export default MyPopover;
