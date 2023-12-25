import React from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode, useFlowProviderStore } from '../../../../FlowProvider';
import { Box, Button, Flex, useDisclosure, useTheme } from '@chakra-ui/react';
import { SelectAppItemType } from '@fastgpt/global/core/module/type';
import Avatar from '@/components/Avatar';
import SelectAppModal from '../../../../SelectAppModal';

const SelectAppRender = ({ item, moduleId }: RenderInputProps) => {
  const theme = useTheme();
  const { filterAppIds } = useFlowProviderStore();

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = item.value as SelectAppItemType | undefined;

  return (
    <>
      <Box onClick={onOpenSelectApp}>
        {!value ? (
          <Button variant={'solidWhite'} w={'100%'}>
            选择应用
          </Button>
        ) : (
          <Flex alignItems={'center'} border={theme.borders.base} borderRadius={'md'} px={3} py={2}>
            <Avatar src={value?.logo} />
            <Box fontWeight={'bold'} ml={1}>
              {value?.name}
            </Box>
          </Flex>
        )}
      </Box>

      {isOpenSelectApp && (
        <SelectAppModal
          defaultApps={item.value?.id ? [item.value.id] : []}
          filterAppIds={filterAppIds}
          onClose={onCloseSelectApp}
          onSuccess={(e) => {
            onChangeNode({
              moduleId,
              type: 'updateInput',
              key: 'app',
              value: {
                ...item,
                value: e[0]
              }
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectAppRender);
