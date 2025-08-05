import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, useOutsideClick, Button } from '@chakra-ui/react';
import { addDays, format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import zhCN from 'date-fns/locale/zh-CN';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';

export type DateRangeType = {
  from: Date;
  to: Date;
};

const DateRangePicker = ({
  onChange,
  onSuccess,
  popPosition = 'bottom',
  defaultDate = {
    from: addDays(new Date(), -30),
    to: new Date()
  },
  dateRange,
  formLabel,
  ...props
}: {
  onChange?: (date: DateRangeType) => void;
  onSuccess?: (date: DateRangeType) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: DateRangeType;
  dateRange?: DateRangeType;
  formLabel?: string;
} & BoxProps) => {
  const { t } = useTranslation();
  const OutRangeRef = useRef(null);
  const [range, setRange] = useState<DateRangeType>(defaultDate);
  const [showSelected, setShowSelected] = useState(false);

  useEffect(() => {
    if (dateRange) {
      setRange(dateRange);
    }
  }, [dateRange]);

  const formatSelected = useMemo(() => {
    if (range?.from && range.to) {
      return `${format(range.from, 'y/MM/dd')} - ${format(range.to, 'y/MM/dd')}`;
    }
    return `${format(new Date(), 'y/MM/dd')} - ${format(new Date(), 'y/MM/dd')}`;
  }, [range]);

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
            id="test"
            mode="range"
            defaultMonth={defaultDate.to}
            selected={range}
            disabled={[
              { from: new Date(2022, 3, 1), to: addDays(new Date(), -180) },
              { from: addDays(new Date(), 1), to: new Date(2099, 1, 1) }
            ]}
            onSelect={(date) => {
              let typeDate = date as DateRangeType;
              if (!typeDate || typeDate?.from === undefined) {
                typeDate = {
                  from: range?.from,
                  to: range?.from
                };
              }
              if (typeDate?.to === undefined) {
                typeDate.to = typeDate.from;
              }

              if (typeDate?.from) {
                typeDate.from = new Date(typeDate.from.setHours(0, 0, 0, 0));
              }
              if (typeDate?.to) {
                typeDate.to = new Date(typeDate.to.setHours(23, 59, 59, 999));
              }

              setRange(typeDate);
              onChange?.(typeDate);
            }}
            footer={
              <Flex justifyContent={'flex-end'}>
                <Button
                  variant={'outline'}
                  size={'sm'}
                  mr={2}
                  onClick={() => setShowSelected(false)}
                >
                  {t('common:Close')}
                </Button>
                <Button
                  size={'sm'}
                  onClick={() => {
                    onSuccess?.(range || defaultDate);
                    setShowSelected(false);
                  }}
                >
                  {t('common:Confirm')}
                </Button>
              </Flex>
            }
          />
        </Card>
      )}
    </Box>
  );
};

export default DateRangePicker;
