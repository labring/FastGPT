import React from 'react';
import { Button, type ButtonProps } from '@chakra-ui/react';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { UsageFilterController } from './useUsageFilterController';

const UsageExportButton = ({
  controller,
  total,
  ...props
}: { controller: UsageFilterController; total?: number } & ButtonProps) => {
  const { t } = useSafeTranslation();
  return (
    <PopoverConfirm
      Trigger={
        <Button size={'md'} isLoading={controller.exporting} {...props}>
          {t('common:Export')}
        </Button>
      }
      showCancel
      content={
        total === undefined
          ? t('account_usage:export_dashboard_confirm_tip')
          : t('account_usage:export_confirm_tip', { total })
      }
      onConfirm={() =>
        controller.exportUsage({
          appNameMap: {
            ['core.app.Question Guide']: t('common:core.app.Question Guide'),
            [i18nT('common:support.wallet.usage.Audio Speech')]: t(
              'common:support.wallet.usage.Audio Speech'
            ),
            ['support.wallet.usage.Whisper']: t('common:support.wallet.usage.Whisper'),
            [i18nT('account_usage:embedding_index')]: t('account_usage:embedding_index'),
            [i18nT('account_usage:qa')]: t('account_usage:qa'),
            ['core.dataset.training.Auto mode']: t('common:core.dataset.training.Auto mode'),
            [i18nT('common:core.module.template.ai_chat')]: t('common:core.module.template.ai_chat')
          },
          sourcesMap: Object.fromEntries(
            Object.entries(UsageSourceMap).map(([key, config]) => [
              key,
              { label: t(config.label as any) }
            ])
          ),
          title: t('account_usage:export_title')
        })
      }
    />
  );
};
export default React.memo(UsageExportButton);
