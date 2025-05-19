import React from 'react';
import MyIcon from '../Icon';
import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerContentProps,
  Flex,
  Image,
  Box
} from '@chakra-ui/react';
import { useLoading } from '../../../hooks/useLoading';
import Avatar from '../Avatar';

type Props = DrawerContentProps & {
  onClose: () => void;
  iconSrc?: string;
  title?: any;
  isLoading?: boolean;
};

const MyRightDrawer = ({
  onClose,
  iconSrc,
  title,
  maxW = ['90vw', '500px'],
  children,
  isLoading,
  ...props
}: Props) => {
  const { Loading } = useLoading();
  return (
    <Drawer isOpen placement="right" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent
        maxW={maxW}
        {...props}
        h={'94%'}
        mt={'2%'}
        borderLeftRadius={'lg'}
        overflow={'hidden'}
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
          {iconSrc && <Avatar mr={3} w={'20px'} src={iconSrc} />}
          <Box flex={'1'} fontSize={'md'}>
            {title}
          </Box>
          <DrawerCloseButton position={'relative'} fontSize={'sm'} top={0} right={0} />
        </Flex>

        <DrawerBody
          overflowY={props?.overflowY || 'auto'}
          display={'flex'}
          flexDirection={'column'}
          px={props?.px ?? 4}
        >
          {children}
          <Loading loading={isLoading} fixed={false} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default MyRightDrawer;
