import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, useDisclosure } from '@chakra-ui/react';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import SelectAppModal from '../../../../SelectAppModal';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById } from '@/web/core/app/api';
import { useField } from '@/web/core/workflow/editor';
import { AppContext } from '@/pageComponents/app/detail/context';

const SelectAppRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const currentAppId = useContextSelector(AppContext, (ctx) => ctx.appDetail._id);
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = currentInput.value as SelectAppItemType | undefined;
  const { data: appDetail, loading } = useRequest(
    () => {
      if (value?.id) return getAppDetailById(value.id);
      return Promise.resolve(null);
    },
    {
      manual: false,
      refreshDeps: [value?.id],
      errorToast: 'Error',
      onError() {
        field?.setValue(undefined);
      }
    }
  );

  const Render = useMemo(() => {
    return (
      <>
        <Box onClick={onOpenSelectApp}>
          {!value ? (
            <Button variant={'whiteBase'} w={'100%'}>
              {t('common:core.module.Select app')}
            </Button>
          ) : (
            <Button
              isLoading={loading}
              w={'100%'}
              justifyContent={loading ? 'center' : 'flex-start'}
              variant={'whiteBase'}
              leftIcon={<Avatar src={appDetail?.avatar} w={6} />}
            >
              {appDetail?.name}
            </Button>
          )}
        </Box>

        {isOpenSelectApp && (
          <SelectAppModal
            value={currentInput.value}
            filterAppIds={[currentAppId]}
            onClose={onCloseSelectApp}
            onSuccess={(e) => {
              field?.setValue(e);
            }}
          />
        )}
      </>
    );
  }, [
    appDetail?.avatar,
    appDetail?.name,
    currentAppId,
    field,
    isOpenSelectApp,
    item,
    loading,
    onCloseSelectApp,
    onOpenSelectApp,
    t,
    value
  ]);

  return Render;
};

export default React.memo(SelectAppRender);
