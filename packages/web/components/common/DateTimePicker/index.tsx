import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, useOutsideClick, Button, Input, HStack } from '@chakra-ui/react';
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import zhCN from 'date-fns/locale/zh-CN';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';

const DateTimePicker = ({
  onChange,
  onSuccess,
  popPosition = 'bottom',
  defaultDate = new Date(),
  selectedDateTime,
  formLabel,
  disabled,
  ...props
}: {
  onChange?: (dateTime: Date) => void;
  onSuccess?: (dateTime: Date) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: Date;
  selectedDateTime?: Date;
  formLabel?: string;
  disabled?: Date[] | ((date: Date) => boolean);
} & Omit<BoxProps, 'onChange'>) => {
  const { t } = useTranslation();
  const OutRangeRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    selectedDateTime || defaultDate
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    selectedDateTime ? format(selectedDateTime, 'HH:mm') : '12:00'
  );
  const [showSelected, setShowSelected] = useState(false);

  useEffect(() => {
    if (selectedDateTime) {
      setSelectedDate(selectedDateTime);
      setSelectedTime(format(selectedDateTime, 'HH:mm'));
    }
  }, [selectedDateTime]);

  const formatSelected = useMemo(() => {
    if (selectedDate) {
      const dateStr = format(selectedDate, 'y/MM/dd');
      return dateStr;
    }
    return format(new Date(), 'y/MM/dd');
  }, [selectedDate, selectedTime]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleConfirm = () => {
    if (selectedDate) {
      let finalDate = new Date(selectedDate);

      onChange?.(finalDate);
      onSuccess?.(finalDate);
      setShowSelected(false);
    }
  };

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
        onClick={() => setShowSelected(true)}
        alignItems={'center'}
        {...props}
      >
        {formLabel && (
          <>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {formLabel}
            </Box>
            <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
          </>
        )}
        <Box color={'myGray.600'} fontWeight={'400'} flex={1}>
          {formatSelected}
        </Box>
        {!formLabel && <MyIcon ml={2} name={'date'} w={'16px'} color={'myGray.600'} />}
      </Flex>
      {showSelected && (
        <Card
          position={'absolute'}
          zIndex={1}
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
            onSelect={handleDateSelect}
          />

          <Flex justifyContent={'flex-end'} px={3} pb={3}>
            <Button variant={'outline'} size={'sm'} mr={2} onClick={() => setShowSelected(false)}>
              {t('common:Close')}
            </Button>
            <Button size={'sm'} onClick={handleConfirm} isDisabled={!selectedDate}>
              {t('common:Confirm')}
            </Button>
          </Flex>
        </Card>
      )}
    </Box>
  );
};

export default DateTimePicker;
