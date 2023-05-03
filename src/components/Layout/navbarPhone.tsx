import React from 'react';
import { useRouter } from 'next/router';
import MyIcon from '../Icon';
import {
  Flex,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerOverlay,
  DrawerContent,
  Box,
  useDisclosure,
  Button,
  Image
} from '@chakra-ui/react';

const NavbarPhone = ({
  navbarList
}: {
  navbarList: {
    label: string;
    icon: string;
    link: string;
    activeLink: string[];
  }[];
}) => {
  const router = useRouter();

  const { isOpen, onClose, onOpen } = useDisclosure();

  return (
    <>
      <Flex
        alignItems={'center'}
        h={'100%'}
        justifyContent={'space-between'}
        backgroundColor={'white'}
        position={'relative'}
        px={7}
      >
        <Box onClick={onOpen}>
          <MyIcon name="menu" width={'20px'} height={'20px'} color={'blackAlpha.700'}></MyIcon>
        </Box>
      </Flex>
      <Drawer isOpen={isOpen} placement="left" size={'xs'} onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent maxWidth={'50vw'}>
          <DrawerBody p={4}>
            <Box py={4}>
              <Image src={'/icon/logo.png'} margin={'auto'} w={'35'} h={'35'} alt=""></Image>
            </Box>
            {navbarList.map((item) => (
              <Flex
                key={item.label}
                mb={5}
                alignItems={'center'}
                justifyContent={'center'}
                onClick={() => {
                  if (item.link === router.pathname) return;
                  router.push(item.link);
                  onClose();
                }}
                cursor={'pointer'}
                h={'60px'}
                borderRadius={'md'}
                {...(item.activeLink.includes(router.pathname)
                  ? {
                      color: '#2B6CB0',
                      backgroundColor: '#BEE3F8'
                    }
                  : {
                      color: '#4A5568',
                      backgroundColor: 'transparent'
                    })}
              >
                <MyIcon
                  name={item.icon as any}
                  width={'24px'}
                  height={'24px'}
                  fill={item.activeLink.includes(router.pathname) ? '#2B6CB0' : '#4A5568'}
                />
                <Box ml={5}>{item.label}</Box>
              </Flex>
            ))}
          </DrawerBody>

          <DrawerFooter px={2}>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default NavbarPhone;
