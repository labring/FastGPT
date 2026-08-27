import type { BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type React from 'react';

const BoxCard = ({
  children,
  ...props
}: BoxProps & {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  return (
    <MyBox
      px={[4, 6]}
      py={[4, 6]}
      borderRadius={['md', 'lg']}
      boxShadow={'2'}
      bg={'white'}
      {...props}
    >
      {children}
    </MyBox>
  );
};

export default BoxCard;
