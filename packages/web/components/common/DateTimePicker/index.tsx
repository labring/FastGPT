import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InputProps } from '@chakra-ui/react';
import { Box, Card, Flex, Button, Input, HStack, Text } from '@chakra-ui/react';
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import zhCN from 'date-fns/locale/zh-CN';
import zhTW from 'date-fns/locale/zh-TW';
import enUS from 'date-fns/locale/en-US';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';
import MySelect from '../MySelect';

export interface DateTimePickerProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  formatString?: string;
  showTime?: boolean;
  minuteStep?: number;
  disabled?: boolean;
}

const DateTimePicker = ({
  value,
  onChange,
  placeholder,
  formatString = 'yyyy-MM-dd HH:mm',
  showTime = true,
  minuteStep = 1,
  disabled = false,
  ...props
}: DateTimePickerProps) => {
  const { t, i18n } = useTranslation();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(value || null);
  const [hours, setHours] = useState(value?.getHours() || 0);
  const [minutes, setMinutes] = useState(value?.getMinutes() || 0);

  // 根据当前语言配置获取对应的 locale
  const getLocale = () => {
    switch (i18n.language) {
      case 'zh-TW':
      case 'zh-Hant':
        return zhTW;
      case 'en':
        return enUS;
      case 'zh-CN':
      default:
        return zhCN;
    }
  };

  // 根据语言获取月份和星期名称
  const getLocalizedText = () => {
    const locale = getLocale();

    // 生成小时选项
    const hoursOptions = Array.from({ length: 24 }, (_, i) => ({
      value: i,
      label: i.toString().padStart(2, '0')
    }));

    // 生成分钟选项
    const minutesOptions = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => ({
      value: i * minuteStep,
      label: (i * minuteStep).toString().padStart(2, '0')
    }));

    return {
      hoursOptions,
      minutesOptions,
      locale
    };
  };

  const { hoursOptions, minutesOptions, locale } = getLocalizedText();

  // 格式化显示文本
  const displayValue = useMemo(() => {
    if (!selectedDate) {
      // 如果没有选中日期，尝试使用外部传入的值
      if (value) {
        return format(value, formatString, { locale });
      }
      return '';
    }

    if (showTime) {
      const dateWithTime = new Date(selectedDate);
      dateWithTime.setHours(hours, minutes, 0, 0);
      return format(dateWithTime, formatString, { locale });
    }

    return format(selectedDate, 'yyyy-MM-dd', { locale });
  }, [selectedDate, hours, minutes, formatString, showTime, locale, value]);

  // 同步外部 value 变化
  useEffect(() => {
    if (value && value !== selectedDate) {
      setSelectedDate(value);
      setHours(value.getHours());
      setMinutes(value.getMinutes());
    } else if (!value && selectedDate) {
      setSelectedDate(null);
      setHours(0);
      setMinutes(0);
    }
  }, [value]);

  // 监听 selectedDate 变化，确保时间状态正确同步
  useEffect(() => {
    if (selectedDate && hours === 0 && minutes === 0 && !value) {
      // 只有在没有外部值且时间为默认值时才更新时间
      const currentTime = new Date();
      setHours(currentTime.getHours());
      setMinutes(currentTime.getMinutes());
    }
  }, [selectedDate, value, hours, minutes]);

  // 处理日期选择
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      // 确保时间状态不为空，使用当前时间或之前选择的时间
      if (hours === 0 && minutes === 0) {
        const currentHours = value?.getHours() ?? new Date().getHours();
        const currentMinutes = value?.getMinutes() ?? new Date().getMinutes();
        setHours(currentHours);
        setMinutes(currentMinutes);
      }
    } else {
      setSelectedDate(null);
    }
  };

  // 处理时间变化
  const handleTimeChange = (newHours: number, newMinutes: number) => {
    setHours(newHours);
    setMinutes(newMinutes);
  };

  // 确认选择
  const handleConfirm = () => {
    if (selectedDate) {
      const finalDate = new Date(selectedDate);
      if (showTime) {
        finalDate.setHours(hours, minutes, 0, 0);
      } else {
        // 如果不显示时间，设置为当天的开始
        finalDate.setHours(0, 0, 0, 0);
      }
      onChange?.(finalDate);
    } else {
      onChange?.(null);
    }
    setIsOpen(false);
  };

  // 清除选择
  const handleClear = () => {
    setSelectedDate(null);
    setHours(0);
    setMinutes(0);
    onChange?.(null);
    setIsOpen(false);
  };

  // 获取输入框位置用于定位弹窗
  const getInputPosition = () => {
    if (typeof window === 'undefined') return { top: '50%', left: '50%' };

    const rect = pickerRef.current?.getBoundingClientRect();
    if (!rect) return { top: '50%', left: '50%' };

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const modalHeight = 400; // 预估弹窗高度
    const modalWidth = 320; // 预估弹窗宽度

    let top = rect.bottom + 8;
    let left = rect.left;

    // 如果下方空间不足，显示在上方
    if (rect.bottom + modalHeight > viewportHeight) {
      top = rect.top - modalHeight - 8;
    }

    // 如果右侧空间不足，向左调整
    if (rect.left + modalWidth > viewportWidth) {
      left = viewportWidth - modalWidth - 16;
    }

    // 确保不超出左边界
    if (left < 16) {
      left = 16;
    }

    return { top: `${top}px`, left: `${left}px` };
  };

  const modalPosition = getInputPosition();

  return (
    <Box position="relative" ref={pickerRef} width="100%">
      <Input
        {...props}
        value={displayValue}
        placeholder={placeholder || t('common:select_time')}
        readOnly
        cursor={disabled ? 'not-allowed' : 'pointer'}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        width="100%"
      />

      {!disabled && (
        <Box
          position="absolute"
          right="8px"
          top="60%"
          transform="translateY(-50%)"
          pointerEvents="none"
        >
          <MyIcon name="date" w="16px" color="myGray.600" />
        </Box>
      )}

      {isOpen && !disabled && (
        <>
          {/* 背景遮罩 */}
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 0, 0, 0.1)"
            zIndex={9998}
            onClick={() => setIsOpen(false)}
          />

          {/* 弹窗内容 */}
          <Card
            position="fixed"
            zIndex={9999}
            top={modalPosition.top}
            left={modalPosition.left}
            p={0}
            minWidth="320px"
            maxWidth="90vw"
            maxHeight="80vh"
            overflowY="auto"
            boxShadow="2xl"
            bg="white"
            borderRadius="md"
            border="1px solid"
            borderColor="gray.200"
          >
            {/* 日期选择器 */}
            <Box p={3} borderBottom="1px solid" borderColor="gray.200">
              <DayPicker
                locale={locale}
                mode="single"
                selected={selectedDate || undefined}
                onSelect={handleDateSelect}
                defaultMonth={selectedDate || new Date()}
                disabled={[{ before: new Date(2000, 0, 1) }, { after: new Date(2100, 11, 31) }]}
                required={false}
                styles={{
                  caption: { color: 'var(--chakra-colors-gray-800)' },
                  head: { color: 'var(--chakra-colors-gray-600)' },
                  nav: { color: 'var(--chakra-colors-gray-700)' }
                }}
              />
            </Box>

            {/* 时间选择器 */}
            {showTime && (
              <Box p={3} pl={7} borderBottom="1px solid" borderColor="gray.200">
                <HStack spacing={2}>
                  <MySelect
                    value={hours}
                    onChange={(newHours) => handleTimeChange(newHours, minutes)}
                    width="80px"
                    list={hoursOptions.map((option) => ({
                      label: option.label,
                      value: option.value
                    }))}
                    size="sm"
                  />
                  <Text>:</Text>
                  <MySelect
                    value={minutes}
                    onChange={(newMinutes) => handleTimeChange(hours, newMinutes)}
                    width="80px"
                    list={minutesOptions.map((option) => ({
                      label: option.label,
                      value: option.value
                    }))}
                    size="sm"
                  />
                </HStack>
              </Box>
            )}

            {/* 操作按钮 */}
            <Flex p={3} justifyContent="flex-end" gap={2}>
              <Button variant="outline" size="sm" onClick={handleClear}>
                {t('common:Clear')}
              </Button>
              <Button
                colorScheme="blue"
                size="sm"
                onClick={handleConfirm}
                isDisabled={!selectedDate}
              >
                {t('common:Confirm')}
              </Button>
            </Flex>
          </Card>
        </>
      )}
    </Box>
  );
};

export default React.memo(DateTimePicker);
