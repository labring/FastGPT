import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, useDisclosure, useTheme } from '@chakra-ui/react';
import { SelectAppItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Avatar from '@/components/Avatar';
import SelectAppModal from '../../../../SelectAppModal';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/components/core/workflow/context';

const SelectAppRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const filterAppIds = useContextSelector(WorkflowContext, (ctx) => ctx.filterAppIds);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = item.value as SelectAppItemType | undefined;

  const filterAppString = useMemo(() => filterAppIds?.join(',') || '', [filterAppIds]);

  const Render = useMemo(() => {
    return (
      <>
        <Box onClick={onOpenSelectApp}>
          {!value ? (
            <Button variant={'whiteFlow'} w={'100%'}>
              {t('core.module.Select app')}
            </Button>
          ) : (
            <Flex
              alignItems={'center'}
              border={theme.borders.base}
              borderRadius={'md'}
              bg={'white'}
              px={3}
              py={2}
            >
              <Avatar src={value?.logo} w={6} />
              <Box fontWeight={'medium'} ml={2}>
                {value?.name}
              </Box>
            </Flex>
          )}
        </Box>

        {isOpenSelectApp && (
          <SelectAppModal
            defaultApps={item.value?.id ? [item.value.id] : []}
            filterAppIds={filterAppString.split(',')}
            onClose={onCloseSelectApp}
            onSuccess={(e) => {
              onChangeNode({
                nodeId,
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
  }, [
    filterAppString,
    isOpenSelectApp,
    item,
    nodeId,
    onChangeNode,
    onCloseSelectApp,
    onOpenSelectApp,
    t,
    theme.borders.base,
    value
  ]);

  return Render;
};

export default React.memo(SelectAppRender);
