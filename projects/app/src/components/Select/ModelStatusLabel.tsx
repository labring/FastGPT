import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import type { ModelSummary } from '@fastgpt/global/openapi/core/ai/model/summary';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';

/** 选择器与摘要共用状态展示；只消费详情，不推断默认模型或把网络错误当作下架。 */
export const ModelStatusLabel = ({
  modelId,
  detail,
  loading,
  error,
  emptyLabel,
  avatarSize = '1rem'
}: {
  modelId?: string;
  detail?: ModelSummary;
  loading?: boolean;
  error?: boolean;
  emptyLabel?: string;
  avatarSize?: string;
}) => {
  const { t } = useTranslation();
  if (isEmptyModelValue(modelId)) return <>{emptyLabel ?? t('common:not_model_config')}</>;
  if (error) return <Box color="red.500">{t('common:model_detail_load_failed')}</Box>;
  if (loading || !detail) return <>{t('common:model_loading_label')}</>;
  if (detail.status === 'deleted') return <Box color="red.500">{t('common:model_delisted')}</Box>;
  const text =
    detail.status === 'forbidden'
      ? t('common:model_forbidden', { model: detail.name })
      : detail.status === 'disabled'
        ? t('common:model_disabled', { model: detail.name })
        : detail.name;
  return (
    <Flex
      alignItems="center"
      minW={0}
      gap={2}
      color={detail.status === 'active' ? undefined : 'red.500'}
    >
      <Avatar src={detail.avatar ?? HUGGING_FACE_ICON} w={avatarSize} borderRadius={0} />
      <Box data-preserve-width minW={0} noOfLines={1} title={text}>
        {text}
      </Box>
    </Flex>
  );
};
