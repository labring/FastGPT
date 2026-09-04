import React, { useState, useMemo } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import {
  Box,
  Flex,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Portal
} from '@chakra-ui/react';
import { addDays, format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { zhCN } from 'date-fns/locale/zh-CN';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';
import PhoneDrawer from '../PhoneDrawer';
import { useSystem } from '../../../hooks/useSystem';

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
  const { isPc } = useSystem();
  const [range, setRange] = useState<DateRangeType>(defaultDate);
  const [showSelected, setShowSelected] = useState(false);

  const formatSelected = useMemo(() => {
    const displayedRange = dateRange ?? range;
    if (displayedRange?.from && displayedRange.to) {
      return `${format(displayedRange.from, 'y/MM/dd')} - ${format(displayedRange.to, 'y/MM/dd')}`;
    }
    return `${format(new Date(), 'y/MM/dd')} - ${format(new Date(), 'y/MM/dd')}`;
  }, [dateRange, range]);

  const renderCalendar = (onClose: () => void) => (
    <Box
      w={'100%'}
      sx={{
        ...(!isPc
          ? {
              '.rdp-root': {
                width: '100%'
              },
              '.rdp-months, .rdp-month, .rdp-month_grid': {
                width: '100%',
                maxWidth: '100%'
              },
              '.rdp-month_grid': {
                tableLayout: 'fixed'
              },
              '.rdp-day': {
                width: 'auto'
              }
            }
          : {}),
        '.rdp-day_button:hover:not(:disabled)': {
          backgroundColor: '#E1EAFF'
        },
        '.rdp-range_start .rdp-day_button, .rdp-range_end .rdp-day_button': {
          backgroundColor: '#3370FF',
          color: 'white',
          border: 'none'
        },
        '.rdp-range_start .rdp-day_button:hover, .rdp-range_end .rdp-day_button:hover': {
          backgroundColor: '#2860E0'
        },
        '.rdp-button_previous:hover, .rdp-button_next:hover': {
          backgroundColor: '#F0F4FF',
          borderRadius: '6px'
        }
      }}
    >
      <DayPicker
        locale={zhCN}
        id="test"
        mode="range"
        fixedWeeks
        style={
          {
            '--rdp-accent-color': '#3370FF',
            '--rdp-accent-background-color': '#E1EAFF'
          } as React.CSSProperties
        }
        defaultMonth={range.to}
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
          <Flex gap={2} pt={2} justifyContent={'flex-end'}>
            <Button
              flex={['1 1 0', '0 0 auto']}
              variant={'whitePrimary'}
              size={'sm'}
              onClick={onClose}
            >
              {t('common:Close')}
            </Button>
            <Button
              flex={['1 1 0', '0 0 auto']}
              size={'sm'}
              onClick={() => {
                onSuccess?.(range || defaultDate);
                onClose();
              }}
            >
              {t('common:Confirm')}
            </Button>
          </Flex>
        }
      />
    </Box>
  );

  const trigger = (
    <Flex
      border={'base'}
      px={3}
      h={formLabel ? '36px' : undefined}
      py={formLabel ? 0 : 1}
      borderRadius={'sm'}
      cursor={'pointer'}
      userSelect={'none'}
      bg={formLabel ? 'white' : 'myGray.50'}
      fontSize={formLabel ? 'mini' : 'sm'}
      lineHeight={formLabel ? '16px' : undefined}
      _hover={formLabel ? { boxShadow: 'focus', borderColor: 'primary.300' } : undefined}
      onClick={
        !isPc
          ? () => {
              if (showSelected) {
                setShowSelected(false);
                return;
              }

              setRange(dateRange ?? defaultDate);
              setShowSelected(true);
            }
          : undefined
      }
      alignItems={'center'}
      {...props}
    >
      {formLabel && (
        <>
          <Box flexShrink={0} color={'myGray.900'}>
            {formLabel}
          </Box>
          <Box w={'1px'} h={'16px'} flexShrink={0} bg={'myGray.200'} mx={2} />
        </>
      )}
      <Box color={'myGray.900'} fontWeight={'400'} whiteSpace={'nowrap'}>
        {formatSelected}
      </Box>
      {!formLabel && <MyIcon ml={2} name={'date'} w={'16px'} color={'myGray.600'} />}
    </Flex>
  );

  if (isPc) {
    return (
      <Popover
        placement={popPosition === 'top' ? 'top-start' : 'bottom-start'}
        strategy={'fixed'}
        flip
        closeOnBlur
        isLazy
        lazyBehavior={'unmount'}
        autoFocus={false}
        computePositionOnMount
        onOpen={() => {
          setRange(dateRange ?? defaultDate);
        }}
      >
        {({ onClose }) => (
          <>
            <PopoverTrigger>{trigger}</PopoverTrigger>
            <Portal>
              <PopoverContent
                w={'auto'}
                maxW={'calc(100vw - 16px)'}
                maxH={'calc(100dvh - 16px)'}
                overflowY={'auto'}
                zIndex={1001}
                p={3}
              >
                {renderCalendar(onClose)}
              </PopoverContent>
            </Portal>
          </>
        )}
      </Popover>
    );
  }

  return (
    <Box position={'relative'}>
      {trigger}
      <PhoneDrawer
        isOpen={showSelected}
        onClose={() => setShowSelected(false)}
        contentProps={{
          h: 'auto',
          maxH: 'min(90dvh, 560px)',
          pb: 'calc(16px + env(safe-area-inset-bottom))'
        }}
        bodyProps={{ overflowY: 'auto' }}
      >
        {renderCalendar(() => setShowSelected(false))}
      </PhoneDrawer>
    </Box>
  );
};

export default DateRangePicker;
