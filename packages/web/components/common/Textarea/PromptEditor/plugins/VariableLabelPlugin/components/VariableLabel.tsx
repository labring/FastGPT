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
  const isInvalid = parentLabel === 'undefined';

  return (
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
        {!isInvalid ? (
          <Flex alignItems={'center'} color={'myGray.600'} fontSize={'sm'}>
            <Avatar src={nodeAvatar as any} w={'1rem'} mr={1} borderRadius={'xs'} />
            {parentLabel}
            <ChevronRightIcon color={'myGray.500'} />
            {childLabel}
          </Flex>
        ) : (
          <Box fontSize={'sm'}>{t('common:invalid_variable')}</Box>
        )}
      </Box>
    </>
  );
}
