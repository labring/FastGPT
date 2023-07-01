import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ModuleTemplates } from '@/constants/flow/ModuleTemplate';
import type { AppModuleTemplateItemType } from '@/types/app';
import type { XYPosition } from 'reactflow';
import Avatar from '@/components/Avatar';

const ModuleStoreList = ({
  isOpen,
  onAddNode
}: {
  isOpen: boolean;
  onAddNode: (e: { template: AppModuleTemplateItemType; position: XYPosition }) => void;
}) => {
  return (
    <Flex
      flexDirection={'column'}
      position={'absolute'}
      top={'65px'}
      left={0}
      h={isOpen ? '90%' : '0'}
      w={isOpen ? '360px' : '0'}
      bg={'white'}
      zIndex={1}
      boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
      borderRadius={'20px'}
      overflow={'hidden'}
      transition={'.2s ease'}
      px={'15px'}
      userSelect={'none'}
    >
      <Box w={'330px'} py={4} fontSize={'xl'} fontWeight={'bold'}>
        添加模块
      </Box>
      <Box w={'330px'} flex={'1 0 0'} overflow={'overlay'}>
        {ModuleTemplates.map((item) =>
          item.list.map((item) => (
            <Flex
              key={item.name}
              alignItems={'center'}
              p={5}
              cursor={'pointer'}
              _hover={{ bg: 'myWhite.600' }}
              borderRadius={'md'}
              draggable
              onDragEnd={(e) => {
                if (e.clientX < 400) return;
                onAddNode({
                  template: item,
                  position: { x: e.clientX, y: e.clientY }
                });
              }}
            >
              <Avatar src={item.logo} w={'34px'} />
              <Box ml={5} flex={'1 0 0'}>
                <Box color={'black'}>{item.name}</Box>
                <Box color={'myGray.500'} fontSize={'sm'}>
                  {item.intro}
                </Box>
              </Box>
            </Flex>
          ))
        )}
      </Box>
    </Flex>
  );
};

export default ModuleStoreList;
