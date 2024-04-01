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
  Image
} from '@chakra-ui/react';
import { useLoading } from '../../../hooks/useLoading';

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
  maxW = ['90vw', '30vw'],
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
        <DrawerCloseButton />
        <DrawerHeader>
          <Flex alignItems={'center'} pr={2}>
            {iconSrc && (
              <>
                {iconSrc.startsWith('/') ? (
                  <Image mr={3} objectFit={'contain'} alt="" src={iconSrc} w={'20px'} />
                ) : (
                  <MyIcon mr={3} name={iconSrc as any} w={'20px'} />
                )}
              </>
            )}
            {title}
          </Flex>
          <DrawerCloseButton zIndex={1} />
        </DrawerHeader>

        <DrawerBody>
          {children}
          <Loading loading={isLoading} fixed={false} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default MyRightDrawer;
