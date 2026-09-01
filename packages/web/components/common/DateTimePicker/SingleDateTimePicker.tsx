import React, { useState } from 'react';
import type { FlexProps } from '@chakra-ui/react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Portal,
  useDisclosure
} from '@chakra-ui/react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { zhCN } from 'date-fns/locale/zh-CN';
import type { Locale } from 'date-fns';
import { addMonths, format, isValid, parse } from 'date-fns';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';

const DATE_INPUT_FORMAT = 'yyyy-MM-dd';
const TIME_INPUT_FORMAT = 'HH:mm';

export type SingleDateTimePickerProps = {
  value?: Date | number;
  onChange?: (val: number) => void;
  placeholder?: string;
  isDisabled?: boolean;
  locale?: Locale;
} & Omit<FlexProps, 'onChange' | 'value'>;

/** 将时间戳或 Date 转为有效 Date；空值或非法日期返回 undefined。 */
const toValidDate = (value?: Date | number) => {
  if (value == null) return undefined;
  const date = typeof value === 'number' ? new Date(value) : value;
  return isValid(date) ? date : undefined;
};

/** 仅在输入完整且合法的 yyyy-MM-dd 时解析为 Date，避免半成品输入把日历跳走。 */
const parseYmdInput = (text: string) => {
  if (text.length !== 10) return undefined;
  const parsed = parse(text, DATE_INPUT_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
};

/**
 * 单日期时间选择器：基于 react-day-picker 二次封装。
 * 打开弹窗时用当前 value 初始化草稿；确认时把日期输入与时间输入合并成时间戳。
 */
export const SingleDateTimePicker = ({
  value,
  onChange,
  placeholder,
  isDisabled,
  locale = zhCN,
  ...triggerProps
}: SingleDateTimePickerProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const selectedDate = toValidDate(value);
  const [tempDate, setTempDate] = useState(() => selectedDate ?? new Date());
  const [tempMonth, setTempMonth] = useState(() => selectedDate ?? new Date());
  const [dateInputText, setDateInputText] = useState(() =>
    format(selectedDate ?? new Date(), DATE_INPUT_FORMAT)
  );
  const [timeInputText, setTimeInputText] = useState(() =>
    format(selectedDate ?? new Date(), TIME_INPUT_FORMAT)
  );

  const displayText = selectedDate
    ? format(selectedDate, `${DATE_INPUT_FORMAT} ${TIME_INPUT_FORMAT}`)
    : '';

  const applyDraftDate = (date: Date) => {
    setTempDate(date);
    setTempMonth(date);
    setDateInputText(format(date, DATE_INPUT_FORMAT));
  };

  const handleOpen = () => {
    if (isDisabled) return;
    const date = toValidDate(value) ?? new Date();
    applyDraftDate(date);
    setTimeInputText(format(date, TIME_INPUT_FORMAT));
    onOpen();
  };

  const handleConfirm = () => {
    const result = new Date(parseYmdInput(dateInputText) ?? tempDate);
    const [hours = '0', minutes = '0'] = timeInputText.split(':');
    result.setHours(Number(hours), Number(minutes), 0, 0);
    onChange?.(result.getTime());
    onClose();
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={handleOpen}
      onClose={onClose}
      placement={'bottom-start'}
      closeOnBlur
      isLazy
    >
      <PopoverTrigger>
        <Flex
          h={'36px'}
          borderRadius={'sm'}
          border={'1px solid'}
          borderColor={isOpen ? 'primary.600' : 'myGray.200'}
          boxShadow={isOpen ? 'focus' : 'none'}
          bg={'white'}
          fontSize={'sm'}
          color={'myGray.900'}
          alignItems={'center'}
          justifyContent={'space-between'}
          px={3}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.6 : 1}
          _hover={isDisabled ? undefined : { borderColor: 'primary.300' }}
          {...triggerProps}
        >
          <Box color={displayText ? 'myGray.900' : 'myGray.500'} noOfLines={1}>
            {displayText || placeholder || t('common:datetime_picker.placeholder')}
          </Box>
          <MyIcon
            name={'common/calendar'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            flexShrink={0}
          />
        </Flex>
      </PopoverTrigger>

      <Portal>
        <PopoverContent
          w={'242px'}
          p={0}
          bg={'white'}
          borderRadius={'12px'}
          boxShadow={
            '0px 24px 48px -12px rgba(19, 51, 107, 0.2), 0px 0px 1px rgba(19, 51, 107, 0.2)'
          }
          border={'1px solid'}
          borderColor={'myGray.200'}
          _focusVisible={{ outline: 'none' }}
          overflow={'hidden'}
          zIndex={1500}
        >
          <Flex
            h={'40px'}
            pt={'12px'}
            pb={'4px'}
            px={'16px'}
            alignItems={'center'}
            justifyContent={'space-between'}
            w={'100%'}
          >
            <Flex
              as={'button'}
              type={'button'}
              w={'24px'}
              h={'24px'}
              borderRadius={'6px'}
              alignItems={'center'}
              justifyContent={'center'}
              cursor={'pointer'}
              color={'myGray.600'}
              _hover={{ bg: 'myGray.100' }}
              onClick={() => setTempMonth((prev) => addMonths(prev, -1))}
            >
              <MyIcon
                name={'core/chat/chevronRight'}
                w={'16px'}
                h={'16px'}
                transform={'rotate(180deg)'}
              />
            </Flex>

            <Box fontSize={'14px'} fontWeight={'500'} color={'#111824'} textAlign={'center'}>
              {format(tempMonth, 'LLLL  yyyy', { locale })}
            </Box>

            <Flex
              as={'button'}
              type={'button'}
              w={'24px'}
              h={'24px'}
              borderRadius={'6px'}
              alignItems={'center'}
              justifyContent={'center'}
              cursor={'pointer'}
              color={'myGray.600'}
              _hover={{ bg: 'myGray.100' }}
              onClick={() => setTempMonth((prev) => addMonths(prev, 1))}
            >
              <MyIcon name={'core/chat/chevronRight'} w={'16px'} h={'16px'} />
            </Flex>
          </Flex>

          <Box
            userSelect={'none'}
            sx={{
              '.rdp-root': {
                '--rdp-accent-color': '#3370FF',
                '--rdp-accent-background-color': '#E1EAFF',
                margin: 0,
                width: '242px'
              },
              '.rdp-months': {
                width: '100%'
              },
              '.rdp-month': {
                width: '100%'
              },
              '.rdp-month_grid': {
                width: '210px',
                margin: '0 16px 8px 16px',
                borderCollapse: 'separate',
                borderSpacing: '0 4px'
              },
              '.rdp-weekdays': {
                height: '30px'
              },
              '.rdp-weekday': {
                width: '30px',
                height: '28px',
                fontSize: '12px',
                fontWeight: '500',
                color: '#111824',
                textAlign: 'center',
                padding: 0,
                opacity: 1
              },
              '.rdp-weeks': {
                paddingBottom: '8px'
              },
              '.rdp-week': {
                height: '30px'
              },
              '.rdp-day': {
                width: '30px',
                height: '30px',
                padding: 0,
                textAlign: 'center'
              },
              '.rdp-day.rdp-outside, .rdp-day.rdp-hidden': {
                visibility: 'hidden'
              },
              '.rdp-day_button': {
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#111824',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'none',
                cursor: 'pointer'
              },
              '.rdp-day_button:hover:not(:disabled)': {
                backgroundColor: '#E1EAFF'
              },
              '.rdp-selected .rdp-day_button, .rdp-day.rdp-selected .rdp-day_button': {
                backgroundColor: '#3370FF !important',
                color: 'white !important',
                fontWeight: '500'
              },
              '.rdp-today:not(.rdp-selected) .rdp-day_button': {
                backgroundColor: '#E1EAFF',
                color: '#3370FF',
                fontWeight: '500'
              }
            }}
          >
            <DayPicker
              locale={locale}
              weekStartsOn={0}
              mode={'single'}
              month={tempMonth}
              onMonthChange={setTempMonth}
              selected={tempDate}
              onSelect={(date) => {
                if (date) applyDraftDate(date);
              }}
              components={{
                Nav: () => <></>,
                MonthCaption: () => <></>
              }}
              formatters={{
                formatWeekdayName: (date) => format(date, 'EEEEEE', { locale })
              }}
            />
          </Box>

          <Box
            borderTop={'1px solid'}
            borderColor={'myGray.150'}
            px={'16px'}
            pt={'8px'}
            pb={'12px'}
          >
            <HStack spacing={'4px'} w={'100%'}>
              <Input
                h={'32px'}
                px={3}
                fontSize={'xs'}
                borderRadius={'6px'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                color={'#24282C'}
                bg={'white'}
                value={dateInputText}
                placeholder={'YYYY-MM-DD'}
                onChange={(e) => {
                  const text = e.target.value;
                  setDateInputText(text);
                  const parsed = parseYmdInput(text);
                  if (parsed) {
                    setTempDate(parsed);
                    setTempMonth(parsed);
                  }
                }}
                _focus={{ borderColor: 'primary.600', boxShadow: 'focus' }}
              />
              <Input
                type={'time'}
                h={'32px'}
                px={3}
                fontSize={'xs'}
                sx={{
                  '::-webkit-calendar-picker-indicator': {
                    display: 'none'
                  }
                }}
                borderRadius={'6px'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                color={'#24282C'}
                bg={'white'}
                value={timeInputText}
                onChange={(e) => setTimeInputText(e.target.value)}
                _focus={{ borderColor: 'primary.600', boxShadow: 'focus' }}
              />
            </HStack>
          </Box>

          <Flex
            h={'52px'}
            borderTop={'1px solid'}
            borderColor={'myGray.150'}
            px={'16px'}
            pt={'8px'}
            pb={'12px'}
            alignItems={'center'}
            justifyContent={'flex-end'}
            gap={'8px'}
          >
            <Button
              h={'32px'}
              px={'14px'}
              py={'8px'}
              borderRadius={'6px'}
              border={'1px solid'}
              borderColor={'myGray.250'}
              bg={'white'}
              color={'myGray.600'}
              fontSize={'12px'}
              fontWeight={'medium'}
              _hover={{ bg: 'myGray.50' }}
              onClick={onClose}
            >
              {t('common:Cancel')}
            </Button>
            <Button
              h={'32px'}
              minW={'53px'}
              px={'14px'}
              py={'8px'}
              borderRadius={'6px'}
              bg={'primary.600'}
              color={'white'}
              fontSize={'12px'}
              fontWeight={'medium'}
              boxShadow={'0px 1px 2px rgba(19, 51, 107, 0.05)'}
              _hover={{ bg: 'primary.700' }}
              onClick={handleConfirm}
            >
              {t('common:Confirm')}
            </Button>
          </Flex>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

export default SingleDateTimePicker;
