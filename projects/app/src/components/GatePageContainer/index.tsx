import React from 'react';
import { useTheme, type BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';

const GatePageContainer = ({
  children,
  isLoading,
  insertProps = {},
  ...props
}: BoxProps & { isLoading?: boolean; insertProps?: BoxProps }) => {
  const theme = useTheme();
  return (
    <MyBox h={'100%'} py={[0, '16px']} pr={[0, '16px']} {...props}>
      <MyBox
        isLoading={isLoading}
        h={'100%'}
        overflow={'overlay'}
        bg={'myGray.25'}
        borderRadius={[0, '12px']}
        overflowX={'visible'}
        {...insertProps}
      >
        {children}
      </MyBox>
    </MyBox>
  );
};

export default GatePageContainer;
