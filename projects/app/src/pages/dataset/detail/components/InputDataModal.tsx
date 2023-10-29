import React, { useMemo } from 'react';
import { Box, Flex, Button, Textarea, IconButton, BoxProps, Image, Link } from '@chakra-ui/react';
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
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { feConfigs } from '@/web/common/system/staticData';

export type RawSourceType = {
  sourceName?: string;
  sourceId?: string;
  addr?: boolean;
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
      title={
        <Flex alignItems={'flex-end'}>
          <Box>
            {defaultValues.id ? t('dataset.data.Update Data') : t('dataset.data.Input Data')}
          </Box>
          <Link
            href={`${feConfigs.docUrl}/docs/use-cases/datasetengine`}
            target={'_blank'}
            fontSize={'sm'}
            color={'myGray.600'}
            textDecor={'underline'}
            ml={2}
          >
            结构详解
          </Link>
        </Flex>
      }
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
              <Box h={'25px'}>{'被搜索的内容'}</Box>
              <MyTooltip
                label={
                  '被向量化的部分，该部分的质量决定了对话时，能否高效的查找到合适的知识点。\n该内容通常是问题，或是一段陈述描述介绍'
                }
              >
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Flex>
            <Textarea
              placeholder={`被向量化的部分，该部分的质量决定了对话时，能否高效的查找到合适的知识点。\n该内容通常是问题，或是一段陈述描述介绍，最多 ${maxToken} 字。`}
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
              <Box h={'25px'}>{'补充内容(可选)'}</Box>
              <MyTooltip
                label={
                  '该部分内容不影响搜索质量。当“被搜索的内容”被搜索到后，“补充内容”可以选择性被填入提示词，从而实现更加丰富的提示词组合。'
                }
              >
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Flex>
            <Textarea
              placeholder={
                '该部分内容不影响搜索质量。当“被搜索的内容”被搜索到后，“补充内容”可以选择性被填入提示词，从而实现更加丰富的提示词组合。可以是问题的答案、代码、图片、表格等。'
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

export function RawSourceText({
  sourceId,
  sourceName = '',
  addr = true,
  ...props
}: RawSourceTextProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();

  const canPreview = useMemo(() => !!sourceId && addr, [addr, sourceId]);

  const icon = useMemo(() => getSourceNameIcon({ sourceId, sourceName }), [sourceId, sourceName]);

  return (
    <MyTooltip
      label={canPreview ? t('file.Click to view file') || '' : ''}
      shouldWrapChildren={false}
    >
      <Box
        color={'myGray.600'}
        display={'inline-flex'}
        alignItems={'center'}
        whiteSpace={'nowrap'}
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
        <Image src={icon} alt="" w={'14px'} mr={2} />
        <Box maxW={['200px', '300px']} className={'textEllipsis'}>
          {sourceName || t('common.Unknow Source')}
        </Box>
      </Box>
    </MyTooltip>
  );
}
