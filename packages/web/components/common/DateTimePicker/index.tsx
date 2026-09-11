import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, Portal } from '@chakra-ui/react';
import { format } from 'date-fns';
import { DayPicker, type Matcher } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { zhCN } from 'date-fns/locale/zh-CN';
import MyIcon from '../Icon';

export * from './SingleDateTimePicker';

type DateTimePickerProps = {
  onChange?: (dateTime: Date | undefined) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: Date;
  selectedDateTime?: Date;
  disabled?: Matcher[];
  isDisabled?: boolean;
  'data-testid'?: string;
} & Omit<BoxProps, 'onChange'>;

/**
 * 日期选择器组件
 *
 * 支持受控模式（传入 selectedDateTime）与非受控模式（传入 defaultDate 或未传入 selectedDateTime）。
 * - 受控模式下（'selectedDateTime' in rawProps）：以 selectedDateTime 为单一真实数据源，
 *   当外部将其重置为 undefined 时，如实展示为空，不会回退至内部状态。
 * - 非受控模式下：内部维护选中日期，支持 defaultDate 初始化，用户选择后更新内部状态。
 */
const DateTimePicker = (rawProps: DateTimePickerProps) => {
  const isControlled = 'selectedDateTime' in rawProps;
  const {
    onChange,
    popPosition = 'bottom',
    defaultDate,
    selectedDateTime,
    disabled,
    isDisabled,
    ...props
  } = rawProps;

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [internalSelectedDate, setInternalSelectedDate] = useState<Date | undefined>(defaultDate);
  const selectedDate = isControlled ? selectedDateTime : internalSelectedDate;
  const [showSelected, setShowSelected] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

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
            p={3}
          >
            <Box
              sx={{
                '.rdp-day_button:hover:not(:disabled)': {
                  backgroundColor: '#E1EAFF'
                },
                '.rdp-selected .rdp-day_button': {
                  backgroundColor: '#3370FF',
                  color: 'white',
                  border: 'none'
                },
                '.rdp-selected .rdp-day_button:hover': {
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
                mode="single"
                style={
                  {
                    '--rdp-accent-color': '#3370FF'
                  } as React.CSSProperties
                }
                defaultMonth={selectedDate}
                selected={selectedDate}
                disabled={disabled}
                onSelect={(date) => {
                  if (!isControlled) {
                    setInternalSelectedDate(date);
                  }
                  onChange?.(date);
                  setShowSelected(false);
                }}
              />
            </Box>
          </Card>
        </Portal>
      )}
    </Box>
  );
};

export default DateTimePicker;
