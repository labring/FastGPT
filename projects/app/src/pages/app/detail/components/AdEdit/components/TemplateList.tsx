import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ModuleTemplates } from '@/constants/flow/ModuleTemplate';
import { FlowModuleItemType, FlowModuleTemplateType } from '@/types/core/app/flow';
import type { Node } from 'reactflow';
import { useGlobalStore } from '@/store/global';
import Avatar from '@/components/Avatar';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { useFlowStore } from './Provider';

const ModuleTemplateList = ({
  nodes,
  isOpen,
  onClose
}: {
  nodes?: Node<FlowModuleItemType>[];
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { onAddNode } = useFlowStore();
  const { isPc } = useGlobalStore();

  const filterTemplates = useMemo(() => {
    const guideModulesIndex = ModuleTemplates.findIndex((item) => item.label === '引导模块');
    const guideModule: {
      label: string;
      list: FlowModuleTemplateType[];
    } = JSON.parse(JSON.stringify(ModuleTemplates[guideModulesIndex]));

    if (nodes?.find((item) => item.type === FlowModuleTypeEnum.userGuide)) {
      const index = guideModule.list.findIndex(
        (item) => item.flowType === FlowModuleTypeEnum.userGuide
      );
      guideModule.list.splice(index, 1);
    }
    if (nodes?.find((item) => item.type === FlowModuleTypeEnum.variable)) {
      const index = guideModule.list.findIndex(
        (item) => item.flowType === FlowModuleTypeEnum.variable
      );
      guideModule.list.splice(index, 1);
    }

    return [
      ...ModuleTemplates.slice(0, guideModulesIndex),
      guideModule,
      ...ModuleTemplates.slice(guideModulesIndex + 1)
    ];
  }, [nodes]);

  return (
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'absolute'}
        top={0}
        left={0}
        bottom={0}
        w={'360px'}
        onClick={onClose}
      />
      <Flex
        zIndex={3}
        flexDirection={'column'}
        position={'absolute'}
        top={'65px'}
        left={0}
        pb={4}
        h={isOpen ? 'calc(100% - 100px)' : '0'}
        w={isOpen ? ['100%', '360px'] : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'20px'}
        overflow={'hidden'}
        transition={'.2s ease'}
        userSelect={'none'}
      >
        <Box w={['100%', '330px']} py={4} px={5} fontSize={'xl'} fontWeight={'bold'}>
          系统模块
        </Box>
        <Box flex={'1 0 0'} overflow={'overlay'}>
          <Box w={['100%', '330px']} mx={'auto'}>
            {filterTemplates.map((item) =>
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
                    if (e.clientX < 360) return;
                    onAddNode({
                      template: item,
                      position: { x: e.clientX, y: e.clientY }
                    });
                  }}
                  onClick={(e) => {
                    if (isPc) return;
                    onClose();
                    onAddNode({
                      template: item,
                      position: { x: e.clientX, y: e.clientY }
                    });
                  }}
                >
                  <Avatar src={item.logo} w={'34px'} objectFit={'contain'} borderRadius={'0'} />
                  <Box ml={5} flex={'1 0 0'}>
                    <Box color={'black'}>{item.name}</Box>
                    <Box className="textEllipsis3" color={'myGray.500'} fontSize={'sm'}>
                      {item.intro}
                    </Box>
                  </Box>
                </Flex>
              ))
            )}
          </Box>
        </Box>
      </Flex>
    </>
  );
};

export default React.memo(ModuleTemplateList);
