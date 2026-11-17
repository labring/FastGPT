import React, { useRef, useState } from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear
} from 'date-fns';
import type { Locale } from 'date-fns';
import { dateMatchModifiers, type Matcher } from 'react-day-picker';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';

/** 年月浏览不改变已选日期；只有周期内没有可选日期时才禁用该项。 */
export const CalendarNavigation = ({
  month,
  onMonthChange,
  disabled,
  selected,
  locale,
  children
}: {
  month: Date;
  onMonthChange: (date: Date) => void;
  disabled?: Matcher[];
  selected?: Date;
  locale: Locale;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'day' | 'month' | 'year'>('day');
  const [editing, setEditing] = useState(false);
  const [yearText, setYearText] = useState('');
  const [yearPageOffset, setYearPageOffset] = useState(0);
  const year = month.getFullYear();
  const firstYear = year - 7 + yearPageOffset;
  // 只有单侧日期匹配器能确定全局边界；任意函数或区间可能只禁用部分日期。
  const bounds = disabled?.reduce<{ min?: Date; max?: Date }>((result, matcher) => {
    if (typeof matcher !== 'object' || matcher === null || matcher instanceof Date) return result;
    if ('before' in matcher && !('after' in matcher)) {
      const min = startOfDay(matcher.before);
      if (!result.min || min > result.min) result.min = min;
    }
    if ('after' in matcher && !('before' in matcher)) {
      const max = startOfDay(matcher.after);
      if (!result.max || max < result.max) result.max = max;
    }
    return result;
  }, {});
  const available = (start: Date, end: Date) =>
    !disabled ||
    eachDayOfInterval({ start, end }).some((date) => !dateMatchModifiers(date, disabled));
  const yearAvailable = (value: number) => {
    if (value < 1 || value > 9999) return false;
    const date = new Date(0);
    date.setFullYear(value, 0, 1);
    return available(startOfYear(date), endOfYear(date));
  };
  const chooseYear = (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 9999 || !yearAvailable(value))
      return false;
    const next = new Date(month);
    next.setDate(1);
    next.setFullYear(value);
    onMonthChange(next);
    setEditing(false);
    setView('month');
    return true;
  };
  const buttonStyle = {
    borderRadius: '6px',
    px: '4px',
    py: '2px',
    _hover: { bg: 'myGray.100' },
    _disabled: { color: 'myGray.400', cursor: 'not-allowed' }
  };

  return (
    <Box px={'1.5rem'} py={'1.25rem'}>
      <Flex
        ref={headerRef}
        tabIndex={-1}
        outline={'none'}
        alignItems={'center'}
        justifyContent={'space-between'}
      >
        <Flex
          gap={'4px'}
          alignItems={'center'}
          fontSize={'18px'}
          fontWeight={'500'}
          flex={1}
          minW={0}
        >
          {view === 'day' ? (
            <>
              <Box
                as={'button'}
                type={'button'}
                {...buttonStyle}
                borderRadius={'4px'}
                fontWeight={'500'}
                _hover={{ color: 'primary.700', bg: 'rgba(17, 24, 36, 0.05)' }}
                onClick={() => {
                  // 面板切换会移除当前按钮，先保留焦点以免弹窗焦点锁跳到年份输入框。
                  headerRef.current?.focus({ preventScroll: true });
                  setYearPageOffset(0);
                  setView('year');
                }}
              >
                {format(month, locale.code?.startsWith('zh') ? 'yyyy 年' : 'yyyy', { locale })}
              </Box>
              <Box
                as={'button'}
                type={'button'}
                {...buttonStyle}
                borderRadius={'4px'}
                fontWeight={'500'}
                _hover={{ color: 'primary.700', bg: 'rgba(17, 24, 36, 0.05)' }}
                onClick={() => {
                  headerRef.current?.focus({ preventScroll: true });
                  setView('month');
                }}
              >
                {format(month, locale.code?.startsWith('zh') ? 'M 月' : 'LLLL', { locale })}
              </Box>
            </>
          ) : (
            <Flex
              as={'form'}
              flex={1}
              minW={0}
              alignItems={'center'}
              gap={'4px'}
              onSubmit={(event: React.FormEvent) => {
                event.preventDefault();
                chooseYear(Number(yearText));
                event.currentTarget.querySelector('input')?.blur();
              }}
            >
              <Input
                type={'number'}
                aria-label={t('common:date_picker.year')}
                value={editing ? yearText : String(year)}
                w={editing ? '100%' : 'calc(4ch + 18px)'}
                minW={'calc(4ch + 18px)'}
                h={'32px'}
                px={'8px'}
                fontSize={'18px'}
                fontWeight={'500'}
                transition={'width 0.2s ease'}
                onFocus={() => {
                  setYearText(String(year));
                  setEditing(true);
                }}
                onChange={(event) => setYearText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setEditing(false);
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => setEditing(false)}
              />
              {locale.code?.startsWith('zh') && <Box flexShrink={0}>年</Box>}
            </Flex>
          )}
        </Flex>
        <Flex gap={'12px'}>
          {([-1, 1] as const).map((direction) => {
            const bound = direction < 0 ? bounds?.min : bounds?.max;
            const pageEdge = view === 'year' ? firstYear + (direction > 0 ? 11 : 0) : year;
            const isDisabled =
              bound &&
              (view === 'day'
                ? direction < 0
                  ? startOfMonth(month) <= startOfMonth(bound)
                  : startOfMonth(month) >= startOfMonth(bound)
                : direction < 0
                  ? pageEdge <= bound.getFullYear()
                  : pageEdge >= bound.getFullYear());
            return (
              <Box
                key={direction}
                as={'button'}
                type={'button'}
                aria-label={t(
                  direction < 0 ? 'common:date_picker.previous' : 'common:date_picker.next'
                )}
                p={'6px'}
                color={'myGray.900'}
                disabled={isDisabled}
                _disabled={{ color: 'myGray.400', cursor: 'not-allowed' }}
                _hover={isDisabled ? undefined : { color: 'primary.600' }}
                onClick={() => {
                  if (view === 'year') {
                    setYearPageOffset((offset) => offset + direction * 12);
                    return;
                  }
                  onMonthChange(
                    view === 'day'
                      ? addMonths(startOfMonth(month), direction)
                      : addYears(startOfMonth(month), direction)
                  );
                }}
              >
                <MyIcon
                  name={'core/chat/chevronRight'}
                  w={'24px'}
                  h={'24px'}
                  transform={direction < 0 ? 'rotate(180deg)' : undefined}
                />
              </Box>
            );
          })}
        </Flex>
      </Flex>
      {view === 'day' ? (
        children
      ) : (
        <Box display={'grid'} gridTemplateColumns={'repeat(3, 1fr)'} gap={'16px'} pt={'12px'}>
          {Array.from({ length: 12 }, (_, index) => {
            const value = view === 'year' ? firstYear + index : index;
            const date = new Date(month);
            date.setDate(1);
            if (view === 'year') date.setFullYear(value, 0, 1);
            else date.setMonth(value);
            const isDisabled =
              view === 'year'
                ? !yearAvailable(value)
                : !available(startOfMonth(date), endOfMonth(date));
            const isSelected =
              selected &&
              (view === 'year'
                ? value === selected.getFullYear()
                : year === selected.getFullYear() && value === selected.getMonth());
            return (
              <Box
                as={'button'}
                type={'button'}
                key={value}
                {...buttonStyle}
                disabled={isDisabled}
                w={'100%'}
                _hover={isSelected ? { bg: 'primary.600', color: 'white' } : buttonStyle._hover}
                bg={isSelected ? 'primary.600' : undefined}
                color={isSelected ? 'white' : 'myGray.900'}
                fontSize={'18px'}
                fontWeight={'500'}
                onClick={() => {
                  if (view === 'year') chooseYear(value);
                  else {
                    onMonthChange(date);
                    setView('day');
                  }
                }}
              >
                {view === 'year' ? value : format(date, 'LLL', { locale })}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
