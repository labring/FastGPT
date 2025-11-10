import React, { useMemo } from 'react';
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
};

const TimeInput: React.FC<TimeInputProps> = ({
  value: initialValue,
  onDateTimeChange,
  popPosition = 'bottom',
  timeGranularity = 'second',
  minDate,
  maxDate
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

  const handleDateChange = (date: Date | undefined) => {
    if (!date) {
      onDateTimeChange(undefined);
      return;
    }

    const newDate = new Date(date);
    newDate.setHours(hour, minute, second);
    validateAndSetDateTime(newDate);
  };

  const handleHourChange = (newHour?: number) => {
    const newDate = formatValue ? formatValue : new Date();
    newDate.setHours(newHour || 0);
    validateAndSetDateTime(newDate);
  };

  const handleMinuteChange = (newMinute?: number) => {
    const newDate = formatValue ? formatValue : new Date();
    newDate.setMinutes(newMinute || 0);
    validateAndSetDateTime(newDate);
  };

  const handleSecondChange = (newSecond?: number) => {
    const newDate = formatValue ? formatValue : new Date();
    newDate.setSeconds(newSecond || 0);
    validateAndSetDateTime(newDate);
  };

  const enableHour = ['hour', 'minute', 'second'].includes(timeGranularity);
  const enableMinute = ['minute', 'second'].includes(timeGranularity);
  const enableSecond = timeGranularity === 'second';

  return (
    <Flex alignItems={'center'} gap={2}>
      <DateTimePicker
        selectedDateTime={formatValue}
        onChange={handleDateChange}
        popPosition={popPosition}
        disabled={[
          ...(minDate ? [{ before: minDate }] : []),
          ...(maxDate ? [{ after: maxDate }] : [])
        ]}
        w={'168px'}
        h={8}
        borderColor={'myGray.200'}
        bg={'white'}
      />
      <Box position={'relative'}>
        <MyNumberInput
          value={hour}
          onChange={handleHourChange}
          min={0}
          max={23}
          w={'48px'}
          size={'sm'}
          hideStepper
          isDisabled={!enableHour}
          inputFieldProps={{
            pr: '20px',
            pl: '8px',
            bg: enableHour ? 'white' : 'myGray.100',
            color: enableHour ? 'inherit' : 'myGray.400'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={enableHour ? 'myGray.500' : 'myGray.300'}
          pointerEvents={'none'}
          zIndex={1}
        >
          {t('common:hour_unit')}
        </Box>
      </Box>
      <Box position={'relative'}>
        <MyNumberInput
          value={minute}
          onChange={handleMinuteChange}
          min={0}
          max={59}
          w={'48px'}
          size={'sm'}
          hideStepper
          isDisabled={!enableMinute}
          inputFieldProps={{
            pr: '20px',
            pl: '8px',
            bg: enableMinute ? 'white' : 'myGray.100',
            color: enableMinute ? 'inherit' : 'myGray.400'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={enableMinute ? 'myGray.500' : 'myGray.300'}
          pointerEvents={'none'}
          zIndex={1}
        >
          {t('common:minute_unit')}
        </Box>
      </Box>
      <Box position={'relative'}>
        <MyNumberInput
          value={second}
          onChange={handleSecondChange}
          min={0}
          max={59}
          w={'48px'}
          size={'sm'}
          hideStepper
          isDisabled={!enableSecond}
          inputFieldProps={{
            pr: '20px',
            pl: '8px',
            bg: enableSecond ? 'white' : 'myGray.100',
            color: enableSecond ? 'inherit' : 'myGray.400'
          }}
        />
        <Box
          position={'absolute'}
          right={'2'}
          top={'50%'}
          transform={'translateY(-50%)'}
          fontSize={'12px'}
          color={enableSecond ? 'myGray.500' : 'myGray.300'}
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
