import type { ReactNode } from 'react';
import React, { useState, useCallback, useMemo } from 'react';
import type { FlexProps } from '@chakra-ui/react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

export type TableMultipleSelectHookProps<T = any> = {
  list: T[];
  getItemId: (item: T) => string | number;
};

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
    FloatingActionBar,
    setSelectedItems
  };
};
