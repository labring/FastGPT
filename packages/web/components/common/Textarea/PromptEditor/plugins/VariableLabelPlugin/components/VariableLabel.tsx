import { ChevronRightIcon } from '@chakra-ui/icons';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../../../../../components/common/Avatar';
import MyTooltip from '../../../../../MyTooltip';

export default function VariableLabel({
  variableLabel,
  nodeAvatar,
  invalidReason
}: {
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: 'invalid_reference' | 'unreachable_reference' | 'invalid_reference_type';
}) {
  const { t } = useTranslation();
  // avoid including '.' in the variable name.
  const [parentLabel, ...childLabels] = variableLabel.split('.');
  const childLabel = childLabels.join('.');
  const isInvalid = parentLabel === 'undefined' || !!invalidReason;
  const invalidReasonLabel =
    invalidReason === 'invalid_reference'
      ? t('common:core.workflow.check.reference_deleted')
      : invalidReason === 'unreachable_reference'
        ? t('common:core.workflow.check.reference_unreachable')
        : invalidReason === 'invalid_reference_type'
          ? t('common:core.workflow.check.reference_type_mismatch')
          : t('common:invalid_variable');
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
            {t('common:invalid_variable')}
          </Flex>
        )}
      </Box>
    </>
  );

  return isInvalid ? <MyTooltip label={invalidReasonLabel}>{label}</MyTooltip> : label;
}
