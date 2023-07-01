import React from 'react';
import { Box, useTheme } from '@chakra-ui/react';
import { useRouter } from 'next/router';

const MyApps = () => {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Box>
      <Box
        className="textlg"
        borderBottom={theme.borders.base}
        letterSpacing={1}
        py={3}
        px={5}
        fontSize={'24px'}
        fontWeight={'bold'}
        onClick={() => router.push(`/app/detail?appId=642adec15f01d67d4613efdb`)}
      >
        我的应用
      </Box>
    </Box>
  );
};

export default MyApps;
