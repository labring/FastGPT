import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, useOutsideClick } from '@chakra-ui/react';
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
  const OutRangeRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    selectedDateTime || defaultDate
  );
  const [showSelected, setShowSelected] = useState(false);

  useEffect(() => {
    setSelectedDate(selectedDateTime);
  }, [selectedDateTime]);

  const formatSelected = useMemo(() => {
    if (selectedDate) {
      const dateStr = format(selectedDate, 'y/MM/dd');
      return dateStr;
    }
    return '';
  }, [selectedDate]);

  useOutsideClick({
    ref: OutRangeRef,
    handler: () => {
      setShowSelected(false);
    }
  });

  return (
    <Box position={'relative'} ref={OutRangeRef}>
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
        <Card
          position={'absolute'}
          zIndex={10}
          css={{
            '--rdp-background-color': '#d6e8ff',
            '--rdp-accent-color': '#0000ff'
          }}
          {...(popPosition === 'top'
            ? {
                bottom: '40px'
              }
            : {})}
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
      )}
    </Box>
  );
};

export default DateTimePicker;
