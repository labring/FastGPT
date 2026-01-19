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
  ...props
}: {
  onChange?: (dateTime: Date | undefined) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: Date;
  selectedDateTime?: Date;
  disabled?: Matcher[];
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
    if (showSelected && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (popPosition === 'top') {
        setPosition({
          top: rect.top - 4,
          left: rect.left
        });
      } else {
        setPosition({
          top: rect.bottom + 4,
          left: rect.left
        });
      }
    }
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
        cursor={'pointer'}
        bg={'myGray.50'}
        fontSize={'sm'}
        onClick={() => setShowSelected((state) => !state)}
        alignItems={'center'}
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
            top={popPosition === 'top' ? 'auto' : `${position.top}px`}
            bottom={popPosition === 'top' ? `${window.innerHeight - position.top}px` : 'auto'}
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
