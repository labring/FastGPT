import { ChevronRightIcon } from '@chakra-ui/icons';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../../../../../components/common/Avatar';

export default function VariableLabel({
  variableLabel,
  nodeAvatar
}: {
  variableLabel: string;
  nodeAvatar: string;
}) {
  const { t } = useTranslation();
  // avoid including '.' in the variable name.
  const [parentLabel, ...childLabels] = variableLabel.split('.');
  const childLabel = childLabels.join('.');

  return (
    <>
      <Box
        display="inline-flex"
        alignItems="center"
        mx={'2px'}
        rounded={'4px'}
        px={1.5}
        bg={parentLabel !== 'undefined' ? 'primary.50' : 'red.50'}
        color={parentLabel !== 'undefined' ? 'myGray.900' : 'red.600'}
        transform={parentLabel !== 'undefined' ? 'translateY(3px)' : ''}
      >
        {parentLabel !== 'undefined' ? (
          <Flex alignItems={'center'} color={'myGray.600'} fontSize={'sm'}>
            <Avatar src={nodeAvatar as any} w={'1rem'} mr={1} borderRadius={'xs'} />
            {parentLabel}
            <ChevronRightIcon color={'myGray.500'} />
            {childLabel}
          </Flex>
        ) : (
          <Box>{t('common:invalid_variable')}</Box>
        )}
      </Box>
    </>
  );
}
