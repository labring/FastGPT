import React from 'react';
import MyIcon from '../Icon';
import { Flex, Image, Box, CloseButton, FlexProps } from '@chakra-ui/react';
import { useLoading } from '../../../hooks/useLoading';

type Props = FlexProps & {
  onClose: () => void;
  iconSrc?: string;
  title?: any;
  isLoading?: boolean;
  showMask?: boolean;
};

const CustomRightDrawer = ({
  onClose,
  iconSrc,
  title,
  maxW = ['90vw', '30vw'],
  children,
  isLoading,
  showMask = true,
  ...props
}: Props) => {
  const { Loading } = useLoading();
  return (
    <Flex
      flexDirection={'column'}
      position={'fixed'}
      right={0}
      bg={'white'}
      zIndex={100}
      maxW={maxW}
      w={'100%'}
      top={'60px'}
      bottom={0}
      borderLeftRadius={'lg'}
      border={'base'}
      boxShadow={'2'}
      {...props}
    >
      <Flex
        display={'flex'}
        alignItems={'center'}
        fontWeight={500}
        background={'#FBFBFC'}
        borderBottom={'1px solid #F4F6F8'}
        roundedTop={'lg'}
        py={'10px'}
        px={5}
      >
        {iconSrc && (
          <>
            {iconSrc.startsWith('/') ? (
              <Image mr={3} objectFit={'contain'} alt="" src={iconSrc} w={'20px'} />
            ) : (
              <MyIcon mr={3} name={iconSrc as any} w={'20px'} />
            )}
          </>
        )}
        <Box flex={'1'} fontSize={'md'}>
          {title}
        </Box>
        <CloseButton position={'relative'} fontSize={'sm'} top={0} right={0} onClick={onClose} />
      </Flex>

      <Box
        flex={'1 0 0'}
        py={props.py ?? 3}
        px={props.px ?? 5}
        overflow={props?.overflow ?? 'auto'}
        display={'flex'}
        flexDirection={'column'}
      >
        {children}
      </Box>
      <Loading loading={isLoading} fixed={false} />
    </Flex>
  );
};

export default React.memo(CustomRightDrawer);
