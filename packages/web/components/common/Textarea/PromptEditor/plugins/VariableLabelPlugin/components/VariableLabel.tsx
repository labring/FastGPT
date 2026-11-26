import { ChevronRightIcon } from '@chakra-ui/icons';
import { Box, Flex } from '@chakra-ui/react';
import React, { useContext } from 'react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../../../../../components/common/Avatar';
import MyTooltip from '../../../../../MyTooltip';
import type { WorkflowReferenceStatus } from '@fastgpt/global/core/workflow/editor/types';
import { VariableLabelContext, useWorkflowReferenceScope } from '../../../context';
import { getVariableLabelData } from '../utils';

export default function VariableLabel({
  variableKey,
  ...fallback
}: {
  variableKey: string;
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: Exclude<WorkflowReferenceStatus['code'], 'empty' | 'valid'>;
}) {
  const { t } = useTranslation();
  const variables = useContext(VariableLabelContext);
  const references = useWorkflowReferenceScope();
  // 来源名称和状态只用于展示，不能写入 Lexical 的撤销历史。
  const { variableLabel, nodeAvatar, invalidReason } =
    variables || references
      ? getVariableLabelData({ variableKey, variables, references, t })
      : fallback;
  // avoid including '.' in the variable name.
  const [parentLabel, ...childLabels] = variableLabel.split('.');
  const childLabel = childLabels.join('.');
  const isInvalid = parentLabel === 'undefined' || !!invalidReason;
  const invalidReasonLabel =
    invalidReason === 'invalid_reference'
      ? t('common:core.workflow.check.invalid_reference_tooltip')
      : invalidReason === 'unreachable_reference'
        ? t('common:core.workflow.check.unreachable_reference_tooltip')
        : invalidReason === 'invalid_reference_type'
          ? t('common:core.workflow.check.invalid_reference_type_tooltip')
          : t('common:core.workflow.check.invalid_reference_tooltip');

  const label = (
    <>
      <Box
        display="inline-flex"
        alignItems="center"
        mx={'2px'}
        rounded={'4px'}
        px={1.5}
        bg={isInvalid ? 'red.50' : 'primary.50'}
        color={isInvalid ? 'red.600' : 'myGray.900'}
        transform={isInvalid ? '' : 'translateY(3px)'}
      >
        {parentLabel !== 'undefined' ? (
          <Flex alignItems={'center'} color={isInvalid ? 'red.600' : 'myGray.600'} fontSize={'sm'}>
            {nodeAvatar && <Avatar src={nodeAvatar as any} w={'1rem'} mr={1} borderRadius={'xs'} />}
            {parentLabel}
            <ChevronRightIcon color={'myGray.500'} />
            {childLabel}
          </Flex>
        ) : (
          <Flex alignItems={'center'} fontSize={'sm'}>
            {childLabel
              ? `${t('common:invalid_variable')}: ${childLabel}`
              : t('common:invalid_variable')}
          </Flex>
        )}
      </Box>
    </>
  );

  return isInvalid ? <MyTooltip label={invalidReasonLabel}>{label}</MyTooltip> : label;
}
