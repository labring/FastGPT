import React from 'react';
import { Box } from '@chakra-ui/react';

/** 可通过键盘聚焦并触发的引用移除按钮；点击不会冒泡到外层菜单触发器。 */
const ReferenceRemoveButton = ({ onRemove, label }: { onRemove: () => void; label: string }) => (
  <Box
    as="span"
    role="button"
    tabIndex={0}
    aria-label={label}
    display="inline-flex"
    alignItems="center"
    justifyContent="center"
    w="1rem"
    h="1rem"
    ml={1}
    flexShrink={0}
    className="array-select-label-action"
    opacity={0}
    pointerEvents="none"
    cursor="pointer"
    userSelect="none"
    _focusVisible={{
      opacity: 1,
      pointerEvents: 'auto',
      outline: '2px solid',
      outlineColor: 'blue.500'
    }}
    _hover={{ color: 'red.600' }}
    onPointerDown={(event: React.PointerEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      event.preventDefault();
    }}
    onClick={(event: React.MouseEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      event.preventDefault();
      onRemove();
    }}
    onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.stopPropagation();
        event.preventDefault();
        onRemove();
      }
    }}
  >
    ×
  </Box>
);

export default ReferenceRemoveButton;
