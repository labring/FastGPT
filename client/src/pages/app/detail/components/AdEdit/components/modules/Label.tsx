import React from 'react';
import { Box } from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyTooltip from '@/components/MyTooltip';

const Label = ({
  required = false,
  children,
  description
}: {
  required?: boolean;
  children: React.ReactNode | string;
  description?: string;
}) => (
  <Box as={'label'} display={'inline-block'} position={'relative'}>
    {children}
    {required && (
      <Box position={'absolute'} top={'-2px'} right={'-10px'} color={'red.500'} fontWeight={'bold'}>
        *
      </Box>
    )}
    {description && (
      <MyTooltip label={description} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} fontSize={'12px'} mb={1} ml={1} />
      </MyTooltip>
    )}
  </Box>
);

export default React.memo(Label);
