import { useCopyData } from '../../../hooks/useCopyData';
import React from 'react';
import MyTooltip from '../MyTooltip';
import { useTranslation } from 'next-i18next';
import { Box, type BoxProps } from '@chakra-ui/react';

const CopyBox = ({
  value,
  children,
  ...props
}: { value: string; children: React.ReactNode } & BoxProps) => {
  const { copyData } = useCopyData();
  const { t } = useTranslation();

  return (
    <MyTooltip label={t('common:click_to_copy')}>
      <Box cursor={'pointer'} onClick={() => copyData(value)} {...props}>
        {children}
      </Box>
    </MyTooltip>
  );
};

export default CopyBox;
