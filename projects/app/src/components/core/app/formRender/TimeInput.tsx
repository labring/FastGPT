import React, { useMemo, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useTranslation } from 'next-i18next';

type TimeInputProps = {
  value?: Date;
  onDateTimeChange: (date: Date | undefined) => void;
  popPosition?: 'top' | 'bottom';
  timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
  minDate?: Date;
  maxDate?: Date;
  isDisabled?: boolean;
};

type TimePartName = 'hour' | 'minute' | 'second';

const TimeInput: React.FC<TimeInputProps> = ({
  value: initialValue,
  onDateTimeChange,
  popPosition = 'bottom',
  timeGranularity = 'second',
  minDate,
  maxDate,
  isDisabled
}) => {
  const formatValue = useMemo(() => {
    const val = initialValue ? new Date(initialValue) : undefined;
    // 判断有效性
    if (!val) return undefined;
    if (isNaN(val.getTime())) return undefined;
    return val;
  }, [initialValue]);

  const { t } = useTranslation();
  const hour = formatValue ? formatValue.getHours() : 0;
  const minute = formatValue ? formatValue.getMinutes() : 0;
  const second = formatValue ? formatValue.getSeconds() : 0;
  const [timePartDraft, setTimePartDraft] = useState<
    { part: TimePartName; value: number | string } | undefined
  >();
  const ignoreChangeAfterBlurRef = useRef(false);

  const validateAndSetDateTime = (newDate: Date) => {
    if (minDate && newDate < minDate) {
      onDateTimeChange(new Date(minDate));
      return;
    }
    if (maxDate && newDate > maxDate) {
      onDateTimeChange(new Date(maxDate));
      return;
    }
    onDateTimeChange(newDate);
  };

  const normalizeTimePart = (value: number | string | undefined, max: number) => {
    const numericValue = Number(value ?? 0);
    return Math.min(max, Math.max(0, Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0));
  };

  const getTimePartInputValue = (part: TimePartName, value: number) =>
    timePartDraft?.part === part ? timePartDraft.value : value;

  const handleTimePartChange = (part: TimePartName, value?: number) => {
    if (ignoreChangeAfterBlurRef.current) {
      ignoreChangeAfterBlurRef.current = false;
      return;
    }
    setTimePartDraft({
      part,
      value: value !== undefined && !Number.isFinite(value) ? 0 : (value ?? '')
    });
  };

  const handleTimePartBlur = (
    value: number | undefined,
    max: number,
    setDatePart: (date: Date, value: number) => void
  ) => {
    const normalizedValue = normalizeTimePart(value, max);
    setTimePartDraft(undefined);
    ignoreChangeAfterBlurRef.current = true;

    const newDate = formatValue ? new Date(formatValue) : new Date();
    setDatePart(newDate, normalizedValue);
    validateAndSetDateTime(newDate);
  };

  const handleDateChange = (date: Date | undefined) => {
    if (!date) {
      onDateTimeChange(undefined);
      return;
    }

    const nextHour = normalizeTimePart(getTimePartInputValue('hour', hour), 23);
    const nextMinute = normalizeTimePart(getTimePartInputValue('minute', minute), 59);
    const nextSecond = normalizeTimePart(getTimePartInputValue('second', second), 59);
    setTimePartDraft(undefined);

    const newDate = new Date(date);
    newDate.setHours(nextHour, nextMinute, nextSecond);
    validateAndSetDateTime(newDate);
  };

  const enableHour = ['hour', 'minute', 'second'].includes(timeGranularity);
  const enableMinute = ['minute', 'second'].includes(timeGranularity);
  const enableSecond = timeGranularity === 'second';

  return (
    <Flex alignItems={'center'} gap={2} w={'100%'} minW={0}>
      <Box flex={'1 1 0'} minW={0}>
        <DateTimePicker
          selectedDateTime={formatValue}
          onChange={handleDateChange}
          popPosition={popPosition}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : [])
          ]}
          isDisabled={isDisabled}
          w={'100%'}
          h={8}
          borderColor={'myGray.200'}
          bg={'white'}
        />
      </Box>
      <Box position={'relative'} flex={'0 0 56px'} minW={0}>
        <MyNumberInput
          value={getTimePartInputValue('hour', hour)}
          onChange={(value) => handleTimePartChange('hour', value)}
          onBlur={(value) => handleTimePartBlur(value, 23, (date, hour) => date.setHours(hour))}
          min={0}
          max={23}
          w={'100%'}
          size={'sm'}
          hideStepper
          isDisabled={isDisabled || !enableHour}
          inputFieldProps={{
            pr: '18px',
            pl: '8px',
            bg: isDisabled || !enableHour ? 'myGray.100' : 'white',
            color: isDisabled || !enableHour ? 'myGray.400' : 'inherit'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={isDisabled || !enableHour ? 'myGray.300' : 'myGray.500'}
          pointerEvents={'none'}
          zIndex={1}
        >
          {t('common:hour_unit')}
        </Box>
      </Box>
      <Box position={'relative'} flex={'0 0 56px'} minW={0}>
        <MyNumberInput
          value={getTimePartInputValue('minute', minute)}
          onChange={(value) => handleTimePartChange('minute', value)}
          onBlur={(value) =>
            handleTimePartBlur(value, 59, (date, minute) => date.setMinutes(minute))
          }
          min={0}
          max={59}
          w={'100%'}
          size={'sm'}
          hideStepper
          isDisabled={isDisabled || !enableMinute}
          inputFieldProps={{
            pr: '18px',
            pl: '8px',
            bg: isDisabled || !enableMinute ? 'myGray.100' : 'white',
            color: isDisabled || !enableMinute ? 'myGray.400' : 'inherit'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={isDisabled || !enableMinute ? 'myGray.300' : 'myGray.500'}
          pointerEvents={'none'}
          zIndex={1}
        >
          {t('common:minute_unit')}
        </Box>
      </Box>
      <Box position={'relative'} flex={'0 0 56px'} minW={0}>
        <MyNumberInput
          value={getTimePartInputValue('second', second)}
          onChange={(value) => handleTimePartChange('second', value)}
          onBlur={(value) =>
            handleTimePartBlur(value, 59, (date, second) => date.setSeconds(second))
          }
          min={0}
          max={59}
          w={'100%'}
          size={'sm'}
          hideStepper
          isDisabled={isDisabled || !enableSecond}
          inputFieldProps={{
            pr: '18px',
            pl: '8px',
            bg: isDisabled || !enableSecond ? 'myGray.100' : 'white',
            color: isDisabled || !enableSecond ? 'myGray.400' : 'inherit'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={isDisabled || !enableSecond ? 'myGray.300' : 'myGray.500'}
          pointerEvents={'none'}
          zIndex={1}
        >
          {t('common:second_unit')}
        </Box>
      </Box>
    </Flex>
  );
};

export default TimeInput;
