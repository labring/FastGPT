import React from 'react';
import {
  Popover,
  PopoverAnchor,
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
  usePortal?: boolean;
  flip?: boolean;
  /** hover 模式下仅由 Trigger 控制开关；鼠标进入浮层不会保持打开。 */
  closeOnTriggerLeave?: boolean;
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
  usePortal = true,
  flip = true,
  closeOnTriggerLeave = false,
  onBackdropClick,
  ...props
}: Props) => {
  const firstFieldRef = React.useRef(null);

  const { onOpen, onClose, isOpen } = useDisclosure();

  const popoverContent = (
    <PopoverContent zIndex={1001} {...props}>
      {hasArrow && <PopoverArrow />}
      {children({ onClose })}
    </PopoverContent>
  );

  const triggerOnlyHover = trigger === 'hover' && closeOnTriggerLeave;
  const handleOpen = () => {
    onOpen();
    onOpenFunc?.();
  };
  const handleClose = () => {
    onClose();
    onCloseFunc?.();
  };

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={handleOpen}
      onClose={handleClose}
      placement={placement}
      offset={offset}
      flip={flip}
      closeOnBlur={closeOnBlur}
      trigger={triggerOnlyHover ? undefined : trigger}
      openDelay={100}
      closeDelay={100}
      isLazy
      lazyBehavior="unmount"
      autoFocus={false}
    >
      {triggerOnlyHover ? (
        <PopoverAnchor>
          <Box display="inline-block" onMouseEnter={handleOpen} onMouseLeave={handleClose}>
            {Trigger}
          </Box>
        </PopoverAnchor>
      ) : (
        <PopoverTrigger>{Trigger}</PopoverTrigger>
      )}
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
