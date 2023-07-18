import React from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import type { FlowModuleItemType } from '@/types/flow';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';

type Props = {
  children: React.ReactNode | React.ReactNode[] | string;
  logo: string;
  name: string;
  description?: string;
  intro: string;
  minW?: string | number;
  moduleId: string;
  onDelNode: FlowModuleItemType['onDelNode'];
};

const NodeCard = ({
  children,
  logo = '/icon/logo.png',
  name = '未知模块',
  description,
  minW = '300px',
  onDelNode,
  moduleId
}: Props) => {
  const theme = useTheme();

  return (
    <Box minW={minW} bg={'white'} border={theme.borders.md} borderRadius={'md'} boxShadow={'sm'}>
      <Flex className="custom-drag-handle" px={4} py={3} alignItems={'center'}>
        <Avatar src={logo} borderRadius={'md'} objectFit={'contain'} w={'30px'} h={'30px'} />
        <Box ml={3} fontSize={'lg'} color={'myGray.600'}>
          {name}
        </Box>
        {description && (
          <MyTooltip label={description}>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </MyTooltip>
        )}
        <Box flex={1} />
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
