import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, Portal, useOutsideClick } from '@chakra-ui/react';
import { format } from 'date-fns';
import type { Matcher } from 'react-day-picker';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import zhCN from 'date-fns/locale/zh-CN';
import MyIcon from '../Icon';

const DateTimePicker = ({
  onChange,
  popPosition = 'bottom',
  defaultDate,
  selectedDateTime,
  disabled,
  isDisabled,
  ...props
}: {
  onChange?: (dateTime: Date | undefined) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: Date;
  selectedDateTime?: Date;
  disabled?: Matcher[];
  isDisabled?: boolean;
} & Omit<BoxProps, 'onChange'>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    selectedDateTime || defaultDate
  );
  const [showSelected, setShowSelected] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setSelectedDate(selectedDateTime);
  }, [selectedDateTime]);

  useEffect(() => {
    if (!showSelected) return;
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      if (!rect || !popoverRect) return;

      const padding = 8;
      const topBottom = rect.bottom + 4;
      const topTop = rect.top - 4 - popoverRect.height;
      const maxTop = window.innerHeight - popoverRect.height - padding;
      const maxLeft = window.innerWidth - popoverRect.width - padding;

      let top = popPosition === 'top' ? topTop : topBottom;
      if (
        popPosition === 'bottom' &&
        topBottom + popoverRect.height > window.innerHeight - padding &&
        topTop >= padding
      ) {
        top = topTop;
      }
      if (
        popPosition === 'top' &&
        topTop < padding &&
        topBottom + popoverRect.height <= window.innerHeight - padding
      ) {
        top = topBottom;
      }
      top = Math.min(Math.max(top, padding), Math.max(padding, maxTop));

      let left = rect.left;
      left = Math.min(Math.max(left, padding), Math.max(padding, maxLeft));

      setPosition({ top, left });
    };

    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showSelected, popPosition]);

  // 点击外部关闭
  useEffect(() => {
    if (!showSelected) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setShowSelected(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSelected]);

  const formatSelected = useMemo(() => {
    if (selectedDate) {
      return format(selectedDate, 'y/MM/dd');
    }
    return '';
  }, [selectedDate]);

  return (
    <Box position={'relative'} ref={containerRef}>
      <Flex
        border={'base'}
        px={3}
        pr={3}
        py={1}
        borderRadius={'sm'}
        fontSize={'sm'}
        alignItems={'center'}
        {...(isDisabled
          ? { cursor: 'not-allowed', bg: 'myGray.100', opacity: 0.6 }
          : {
              cursor: 'pointer',
              bg: 'myGray.50',
              onClick: () => setShowSelected((state) => !state)
            })}
        {...props}
      >
        <Box color={'myGray.600'} fontWeight={'400'} flex={1}>
          {formatSelected}
        </Box>
        <MyIcon ml={2} name={'date'} w={'16px'} color={'myGray.600'} />
      </Flex>
      {showSelected && (
        <Portal>
          <Card
            ref={popoverRef}
            position={'fixed'}
            top={`${position.top}px`}
            left={`${position.left}px`}
            zIndex={1500}
            css={{
              '--rdp-background-color': '#d6e8ff',
              '--rdp-accent-color': '#0000ff'
            }}
          >
            <DayPicker
              locale={zhCN}
              mode="single"
              defaultMonth={selectedDate}
              selected={selectedDate}
              disabled={disabled}
              onSelect={(date) => {
                setSelectedDate(date);
                onChange?.(date);
                setShowSelected(false);
              }}
            />
          </Card>
        </Portal>
      )}
    </Box>
  );
};

export default DateTimePicker;
