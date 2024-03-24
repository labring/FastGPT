import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode, useFlowProviderStore } from '../../../../FlowProvider';
import { Box, Button, Flex, useDisclosure, useTheme } from '@chakra-ui/react';
import { SelectAppItemType } from '@fastgpt/global/core/module/type';
import Avatar from '@/components/Avatar';
import SelectAppModal from '../../../../SelectAppModal';
import { useTranslation } from 'next-i18next';

const SelectAppRender = ({ item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { filterAppIds } = useFlowProviderStore();

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = item.value as SelectAppItemType | undefined;

  const filterAppString = useMemo(() => filterAppIds.join(','), [filterAppIds]);

  const Render = useMemo(() => {
    return (
      <>
        <Box onClick={onOpenSelectApp}>
          {!value ? (
            <Button variant={'whitePrimary'} w={'100%'}>
              {t('core.module.Select app')}
            </Button>
          ) : (
            <Flex
              alignItems={'center'}
              border={theme.borders.base}
              borderRadius={'md'}
              px={3}
              py={2}
            >
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
            filterAppIds={filterAppString.split(',')}
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
  }, [
    filterAppString,
    isOpenSelectApp,
    item,
    moduleId,
    onCloseSelectApp,
    onOpenSelectApp,
    t,
    theme.borders.base,
    value
  ]);

  return Render;
};

export default React.memo(SelectAppRender);
