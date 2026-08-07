import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '../../../common/MyTooltip';

type BatchOperationBarProps = {
  selectedCount: number;
  isAllSelected: boolean;
  isIndeterminate?: boolean;
  actionLabel: string;
  onToggleSelectAll: () => void;
  onAction: () => void | Promise<void>;
  isActionLoading?: boolean;
  isActionDisabled?: boolean;
};

/**
 * 插件市场卡片批量选择后的固定操作栏。
 * 只负责呈现选择计数、全选入口和当前页面注入的批量动作。
 */
const BatchOperationBar = ({
  selectedCount,
  isAllSelected,
  isIndeterminate,
  actionLabel,
  onToggleSelectAll,
  onAction,
  isActionLoading,
  isActionDisabled
}: BatchOperationBarProps) => {
  const { t } = useTranslation();

  return (
    <Flex
      position={'absolute'}
      left={0}
      right={0}
      bottom={0}
      zIndex={20}
      h={'64px'}
      px={8}
      alignItems={'center'}
      gap={6}
      borderTop={'1px solid'}
      borderColor={'myGray.200'}
      bg={'rgba(255,255,255,0.96)'}
      backdropFilter={'blur(8px)'}
      boxShadow={'0 -4px 12px rgba(19, 51, 107, 0.06)'}
    >
      <Flex alignItems={'center'} gap={2}>
        <MyTooltip label={t('common:Select_all')}>
          <Checkbox
            size={'lg'}
            isChecked={isAllSelected}
            isIndeterminate={isIndeterminate}
            onChange={onToggleSelectAll}
          />
        </MyTooltip>
        <Box fontSize={'sm'} color={'myGray.700'}>
          {t('common:select_count_num', { num: selectedCount })}
        </Box>
      </Flex>
      <Button
        size={'sm'}
        variant={'primary'}
        isLoading={isActionLoading}
        isDisabled={isActionDisabled}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </Flex>
  );
};

export default BatchOperationBar;
