import React, { useMemo } from 'react';
import { Box, Flex, Button, Textarea, IconButton, BoxProps } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import {
  postData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById
} from '@/web/core/dataset/api';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyIcon from '@/components/Icon';
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { getFileAndOpen } from '@/web/common/file/utils';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SetOneDatasetDataProps } from '@/global/core/api/datasetReq';
import { useRequest } from '@/web/common/hooks/useRequest';
import { countPromptTokens } from '@/global/common/tiktoken';
import { useConfirm } from '@/web/common/hooks/useConfirm';

export type RawSourceType = {
  sourceName?: string;
  sourceId?: string;
};
export type RawSourceTextProps = BoxProps & RawSourceType;
export type InputDataType = SetOneDatasetDataProps & RawSourceType;

const InputDataModal = ({
  onClose,
  onSuccess,
  onDelete,
  datasetId,
  defaultValues = {
    datasetId: '',
    collectionId: '',
    sourceId: '',
    sourceName: ''
  }
}: {
  onClose: () => void;
  onSuccess: (data: SetOneDatasetDataProps) => void;
  onDelete?: () => void;
  datasetId: string;
  defaultValues: InputDataType;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { datasetDetail, loadDatasetDetail } = useDatasetStore();

  const { register, handleSubmit, reset } = useForm<InputDataType>({
    defaultValues
  });

  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('dataset.data.Delete Tip')
  });

  const maxToken = datasetDetail.vectorModel?.maxToken || 2000;

  /**
   * 确认导入新数据
   */
  const { mutate: sureImportData, isLoading: isImporting } = useRequest({
    mutationFn: async (e: InputDataType) => {
      if (!e.q) {
        return toast({
          title: '匹配的知识点不能为空',
          status: 'warning'
        });
      }
      if (countPromptTokens(e.q) >= maxToken) {
        return toast({
          title: '总长度超长了',
          status: 'warning'
        });
      }

      const data = { ...e };
      delete data.sourceName;
      delete data.sourceId;

      data.id = await postData2Dataset(data);

      return data;
    },
    successToast: t('dataset.data.Input Success Tip'),
    onSuccess(e) {
      reset({
        ...e,
        q: '',
        a: ''
      });

      onSuccess(e);
    },
    errorToast: t('common.error.unKnow')
  });

  const { mutate: onUpdateData, isLoading: isUpdating } = useRequest({
    mutationFn: async (e: SetOneDatasetDataProps) => {
      if (!e.id) return e;

      // not exactly same
      if (e.q !== defaultValues.q || e.a !== defaultValues.a) {
        await putDatasetDataById({
          ...e,
          q: e.q === defaultValues.q ? '' : e.q
        });
        return e;
      }

      return e;
    },
    successToast: t('dataset.data.Update Success Tip'),
    errorToast: t('common.error.unKnow'),
    onSuccess(data) {
      onSuccess(data);
      onClose();
    }
  });

  const loading = useMemo(() => isImporting || isUpdating, [isImporting, isUpdating]);

  useQuery(['loadDatasetDetail'], () => {
    if (datasetDetail._id === datasetId) return null;
    return loadDatasetDetail(datasetId);
  });

  return (
    <MyModal
      isOpen={true}
      isCentered
      title={defaultValues.id ? t('dataset.data.Update Data') : t('dataset.data.Input Data')}
      w={'90vw'}
      maxW={'90vw'}
      h={'90vh'}
    >
      <Flex flexDirection={'column'} h={'100%'}>
        <Box
          display={'flex'}
          flexDirection={['column', 'row']}
          flex={'1 0 0'}
          h={['100%', 0]}
          overflow={'overlay'}
          px={6}
          pb={2}
        >
          <Box flex={1} mr={[0, 4]} mb={[4, 0]} h={['50%', '100%']}>
            <Flex>
              <Box h={'30px'}>{'匹配的知识点'}</Box>
              <MyTooltip label={'被向量化的部分，通常是问题，也可以是一段陈述描述'}>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Flex>
            <Textarea
              placeholder={`匹配的知识点。这部分内容会被搜索，请把控内容的质量，最多 ${maxToken} 字。`}
              maxLength={maxToken}
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register(`q`, {
                required: true
              })}
            />
          </Box>
          <Box flex={1} h={['50%', '100%']}>
            <Flex>
              <Box h={'30px'}>{'补充内容'}</Box>
              <MyTooltip
                label={'匹配的知识点被命中后，这部分内容会随匹配知识点一起注入模型，引导模型回答'}
              >
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Flex>
            <Textarea
              placeholder={
                '这部分内容不会被搜索，但会作为"匹配的知识点"的内容补充，通常是问题的答案。'
              }
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register('a')}
            />
          </Box>
        </Box>

        <Flex px={6} pt={['34px', 2]} pb={4} alignItems={'center'} position={'relative'}>
          <RawSourceText
            sourceName={defaultValues.sourceName}
            sourceId={defaultValues.sourceId}
            position={'absolute'}
            left={'50%'}
            top={['16px', '50%']}
            transform={'translate(-50%,-50%)'}
          />

          <Box flex={1}>
            {defaultValues.id && onDelete && (
              <IconButton
                variant={'outline'}
                icon={<MyIcon name={'delete'} w={'16px'} h={'16px'} />}
                aria-label={''}
                isLoading={loading}
                size={'sm'}
                _hover={{
                  color: 'red.600',
                  borderColor: 'red.600'
                }}
                onClick={openConfirm(async () => {
                  if (!onDelete || !defaultValues.id) return;
                  try {
                    await delOneDatasetDataById(defaultValues.id);
                    onDelete();
                    onClose();
                    toast({
                      status: 'success',
                      title: '记录已删除'
                    });
                  } catch (error) {
                    toast({
                      status: 'warning',
                      title: getErrText(error)
                    });
                    console.log(error);
                  }
                })}
              />
            )}
          </Box>
          <Box>
            <Button variant={'base'} mr={3} isLoading={loading} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <Button
              isLoading={loading}
              // @ts-ignore
              onClick={handleSubmit(defaultValues.id ? onUpdateData : sureImportData)}
            >
              {defaultValues.id ? '确认变更' : '确认导入'}
            </Button>
          </Box>
        </Flex>
      </Flex>
      <ConfirmModal />
    </MyModal>
  );
};

export default InputDataModal;

export function RawSourceText({ sourceId, sourceName = '', ...props }: RawSourceTextProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();

  const canPreview = useMemo(() => !!sourceId, [sourceId]);

  return (
    <MyTooltip
      label={sourceId ? t('file.Click to view file') || '' : ''}
      shouldWrapChildren={false}
    >
      <Box
        color={'myGray.600'}
        display={'inline-block'}
        whiteSpace={'nowrap'}
        maxW={['200px', '300px']}
        className={'textEllipsis'}
        {...(canPreview
          ? {
              cursor: 'pointer',
              textDecoration: 'underline',
              onClick: async () => {
                if (strIsLink(sourceId)) {
                  return window.open(sourceId, '_blank');
                }
                setLoading(true);
                try {
                  await getFileAndOpen(sourceId as string);
                } catch (error) {
                  toast({
                    title: getErrText(error, '获取文件地址失败'),
                    status: 'error'
                  });
                }
                setLoading(false);
              }
            }
          : {})}
        {...props}
      >
        {sourceName || t('common.Unknow Source')}
      </Box>
    </MyTooltip>
  );
}
