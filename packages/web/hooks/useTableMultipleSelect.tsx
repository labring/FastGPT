import type { ReactNode } from 'react';
import React, { useState, useCallback, useMemo } from 'react';
import type { FlexProps } from '@chakra-ui/react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

export type TableMultipleSelectHookProps<T = any> = {
  list: T[];
  getItemId: (item: T) => string | number;
};

export type TableMultipleSelectRowOptions = {
  /** 未进入多选状态时，保留表格原有的行点击行为。 */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** 禁止当前行通过行点击切换选中状态。 */
  isDisabled?: boolean;
  /** 追加需要保留原交互、不触发行选择的热区选择器。 */
  additionalInteractiveSelector?: string;
};

const rowInteractiveSelector = [
  'button',
  'a',
  'input',
  'label',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
  '[data-row-action]'
].join(', ');

export const useTableMultipleSelect = <T = any,>({
  list,
  getItemId
}: TableMultipleSelectHookProps<T>) => {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<T[]>([]);

  // Toggle single item selection
  const toggleSelect = useCallback(
    (item: T) => {
      const itemId = getItemId(item);
      setSelectedItems((prev) => {
        const isSelected = prev.some((selected) => getItemId(selected) === itemId);
        if (isSelected) {
          return prev.filter((selected) => getItemId(selected) !== itemId);
        } else {
          return [...prev, item];
        }
      });
    },
    [getItemId]
  );

  // Check if item is selected
  const isSelected = useCallback(
    (item: T) => {
      const itemId = getItemId(item);
      return selectedItems.some((selected) => getItemId(selected) === itemId);
    },
    [selectedItems, getItemId]
  );

  const isSelecteAll = useMemo(() => {
    return list.length > 0 && list.every((item) => isSelected(item));
  }, [list, isSelected]);

  // Select all items
  const selectAllTrigger = useCallback(() => {
    if (isSelecteAll) {
      setSelectedItems([]);
    } else {
      setSelectedItems((pre) => [...pre, ...list.filter((item) => !isSelected(item))]);
    }
  }, [isSelecteAll, list, isSelected]);

  const selectedCount = selectedItems.length;
  // Check if has selections
  const hasSelections = selectedCount > 0;

  /**
   * 为列表行提供统一的多选交互：进入多选后点击非交互区域切换选择，
   * 未进入多选时继续执行调用方原有的行点击行为。
   */
  const getRowSelectionProps = useCallback(
    (item: T, options: TableMultipleSelectRowOptions = {}) => {
      const { onClick, isDisabled = false, additionalInteractiveSelector } = options;
      const interactiveSelector = additionalInteractiveSelector
        ? `${rowInteractiveSelector}, ${additionalInteractiveSelector}`
        : rowInteractiveSelector;

      return {
        cursor: !isDisabled && (hasSelections || onClick) ? ('pointer' as const) : undefined,
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          if (isDisabled) return;

          const target = event.target as HTMLElement;
          if (target.closest?.(interactiveSelector)) return;

          if (hasSelections) {
            toggleSelect(item);
            return;
          }

          onClick?.(event);
        }
      };
    },
    [hasSelections, toggleSelect]
  );

  // Floating Action Bar component
  const FloatingActionBar = useCallback(
    ({
      children,
      Controler,
      activedStyles,
      activeBg,
      ...props
    }: {
      children?: ReactNode;
      activeBg?: string;
      activedStyles?: FlexProps;
      Controler: ReactNode;
    } & FlexProps) => {
      return hasSelections || !!children ? (
        <Flex
          w={'100%'}
          bg={selectedCount > 0 ? activeBg : 'transparent'}
          px={6}
          py={2}
          alignItems="center"
          {...props}
          {...activedStyles}
        >
          {hasSelections && (
            <>
              <Checkbox size="sm" isChecked={isSelecteAll} onChange={selectAllTrigger} />
              <Box ml={2} fontSize="sm" color="gray.600">
                {t('common:select_count_num', { num: selectedCount })}
              </Box>
              <Box flex={'1 0 0'} ml={4}>
                {Controler}
              </Box>
            </>
          )}
          <Box flex={hasSelections ? '' : '1 0 0'}>{children}</Box>
        </Flex>
      ) : null;
    },
    [hasSelections, isSelecteAll, selectAllTrigger, selectedCount, t]
  );

  return {
    selectedItems,
    isSelecteAll,
    selectAllTrigger,
    hasSelections,
    toggleSelect,
    isSelected,
    getRowSelectionProps,
    FloatingActionBar,
    setSelectedItems
  };
};
