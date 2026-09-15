import React from 'react';
import { Box, Button, Checkbox, Flex, HStack } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';

/**
 * 批量管理悬浮操作栏（Floating Action Bar）：
 * 1. 位于列表底部居中悬浮。
 * 2. 支持「全选筛选项」（具备三态 Checkbox 联动）。
 * 3. 统计已选项数。
 * 4. 提供「批量移动」和「批量删除」操作按钮。
 */
const BatchActionBar = () => {
  const { t } = useTranslation();
  const {
    isAllSelected,
    isIndeterminate,
    selectedAppIds,
    onSelectAllApps,
    setIsBatchMoving,
    setIsBatchDeleting
  } = useContextSelector(AppListContext, (v) => v);

  const selectedCount = selectedAppIds.length;

  return (
    <Flex
      position={'fixed'}
      bottom={'32px'}
      left={'50%'}
      transform={'translateX(-50%)'}
      zIndex={100}
      bg={'white'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      boxShadow={'2'}
      borderRadius={'md'}
      px={4}
      py={2}
      alignItems={'center'}
    >
      <HStack spacing={4} alignItems={'center'}>
        {/* 全选筛选项与三态复选框 */}
        <HStack spacing={2} fontSize={'sm'}>
          <Checkbox
            size={'sm'}
            isChecked={isAllSelected}
            isIndeterminate={isIndeterminate}
            onChange={(e) => onSelectAllApps(e.target.checked)}
          >
            <Box color={'myGray.900'} userSelect={'none'}>
              {t('app:select_all_filtered')}
            </Box>
          </Checkbox>

          {/* 已选计数 */}
          <Box color={'myGray.700'} userSelect={'none'}>
            <Trans
              i18nKey={'app:selected_items'}
              values={{ count: selectedCount }}
              components={{
                bold: <Box as={'span'} color={'primary.600'} fontWeight={'medium'} />
              }}
            />
          </Box>
        </HStack>

        {/* 操作按钮组 */}
        <HStack spacing={2} alignItems={'center'}>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            isDisabled={selectedCount === 0}
            onClick={() => setIsBatchMoving(true)}
          >
            {t('app:batch_move')}
          </Button>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            isDisabled={selectedCount === 0}
            onClick={() => setIsBatchDeleting(true)}
          >
            {t('app:batch_delete')}
          </Button>
        </HStack>
      </HStack>
    </Flex>
  );
};

export default React.memo(BatchActionBar);
