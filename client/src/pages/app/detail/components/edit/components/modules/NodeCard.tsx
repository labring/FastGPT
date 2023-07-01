import React from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import type { FlowModuleItemType } from '@/types/flow';

type Props = {
  children: React.ReactNode | React.ReactNode[] | string;
  logo?: string;
  name?: string;
  intro?: string;
  minW?: string | number;
  moduleId: string;
  onDelNode: FlowModuleItemType['onDelNode'];
};

const NodeCard = ({
  children,
  logo = '/icon/logo.png',
  name = '未知模块',
  minW = '300px',
  onDelNode,
  moduleId
}: Props) => {
  const theme = useTheme();

  return (
    <Box minW={minW} bg={'white'} border={theme.borders.md} borderRadius={'md'} boxShadow={'sm'}>
      <Flex className="custom-drag-handle" px={4} py={3} alignItems={'center'}>
        <Avatar src={logo} borderRadius={'md'} w={'30px'} h={'30px'} />
        <Box ml={3} flex={1} fontSize={'lg'} color={'myGray.600'}>
          {name}
        </Box>
        <MyIcon
          className={'nodrag'}
          name="delete"
          cursor={'pointer'}
          color={'myGray.600'}
          w={'16px'}
          _hover={{ color: 'red.600' }}
          onClick={() => onDelNode(moduleId)}
        />
      </Flex>
      {children}
    </Box>
  );
};

export default React.memo(NodeCard);
