import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';

interface Props {
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  onResize?: (width: number) => void;
  direction?: 'left' | 'right';
}

const ResizableDivider = ({
  minWidth = 300,
  maxWidth = 900,
  defaultWidth = 580,
  onResize,
  direction = 'right'
}: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(defaultWidth);
  const startXRef = useRef(0);
  const startWidthRef = useRef(defaultWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    e.preventDefault();
  }, [currentWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === 'right' ? startXRef.current - e.clientX : e.clientX - startXRef.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setCurrentWidth(newWidth);
      onResize?.(newWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minWidth, maxWidth, onResize, direction]);

  return (
    <Box
      w="1px"
      h="100%"
      cursor="col-resize"
      bg={isDragging ? 'primary.300' : 'myGray.150'}
      _hover={{ bg: 'primary.200' }}
      onMouseDown={handleMouseDown}
      flexShrink={0}
      userSelect="none"
    />
  );
};

export default React.memo(ResizableDivider);
