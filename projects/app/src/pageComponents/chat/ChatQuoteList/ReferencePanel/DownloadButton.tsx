import { Flex, Menu, MenuButton, MenuList, MenuItem } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const ReferencePanelDownloadButton = ({
  label,
  iconName,
  onClick
}: {
  label: string;
  iconName: string;
  onClick: () => void;
}) => {
  return (
    <Menu autoSelect={false} placement="bottom-end" offset={[0, 4]}>
      <MenuButton
        w={'24px'}
        h={'24px'}
        minW={'24px'}
        cursor={'pointer'}
        borderRadius={'sm'}
        bg={'transparent'}
        border={'none'}
        p={0}
        _hover={{ bg: 'myGray.100' }}
      >
        <Flex w={'100%'} h={'100%'} alignItems={'center'} justifyContent={'center'}>
          <MyIcon name={'common/ellipsis'} w={'16px'} color={'myGray.700'} display={'block'} />
        </Flex>
      </MenuButton>
      <MenuList p={'6px'} border={'1px solid #fff'} boxShadow={'3'} minW={'120px'}>
        <MenuItem onClick={onClick} fontSize={'sm'} borderRadius={'sm'}>
          <Flex alignItems={'center'}>
            <MyIcon name={iconName as any} w={'0.9rem'} mr={2} />
            {label}
          </Flex>
        </MenuItem>
      </MenuList>
    </Menu>
  );
};

export default ReferencePanelDownloadButton;
