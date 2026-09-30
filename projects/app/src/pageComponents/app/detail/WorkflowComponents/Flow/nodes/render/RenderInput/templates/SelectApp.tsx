import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, useDisclosure } from '@chakra-ui/react';
import { getErrText, ToastHandledError } from '@fastgpt/global/common/error/utils';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SelectAppModal from '../../../../SelectAppModal';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useQuery } from '@tanstack/react-query';
import { getAppDetailById } from '@/web/core/app/api';
import { useField } from '@/web/core/workflow/editor';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowCanvasContext } from '../../../../context/workflowCanvasContext';

const SelectAppRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const currentAppId = useContextSelector(AppContext, (ctx) => ctx.appDetail._id);
  const isMeasuring = useContextSelector(WorkflowCanvasContext, (ctx) =>
    ctx.measurementNodeIds.includes(nodeId)
  );
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;

  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const value = currentInput.value as SelectAppItemType | undefined;
  const { data: appDetail, isLoading } = useQuery({
    queryKey: ['workflow', 'app-detail', value?.id],
    queryFn: () => (value?.id ? getAppDetailById(value.id) : Promise.resolve(null)),
    enabled: !!value?.id && !isMeasuring,
    staleTime: 5 * 60 * 1000,
    cacheTime: 5 * 60 * 1000,
    onError(error: any) {
      field?.setValue(undefined);
      if (error instanceof ToastHandledError) return;
      const errorText = t(getErrText(error, 'Error') as any);
      if (errorText) toast({ title: errorText, status: 'error' });
    }
  });
  const loading = !!value?.id && !isMeasuring && isLoading;

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
    value,
    currentInput.value
  ]);

  return Render;
};

export default React.memo(SelectAppRender);
