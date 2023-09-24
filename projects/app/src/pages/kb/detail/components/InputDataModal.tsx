import React, { useState, useCallback } from 'react';
import { Box, Flex, Button, Textarea, IconButton, BoxProps } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import {
  postData2Dataset,
  putDatasetDataById,
  delOneDatasetDataById
} from '@/api/core/dataset/data';
import { useToast } from '@/hooks/useToast';
import { getErrText } from '@/utils/tools';
import MyIcon from '@/components/Icon';
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { DatasetDataItemType } from '@/types/core/dataset/data';
import { useTranslation } from 'react-i18next';
import { useDatasetStore } from '@/store/dataset';
import { getFileAndOpen } from '@/utils/web/file';

export type FormData = { dataId?: string } & DatasetDataItemType;

const InputDataModal = ({
  onClose,
  onSuccess,
  onDelete,
  kbId,
  defaultValues = {
    a: '',
    q: ''
  }
}: {
  onClose: () => void;
  onSuccess: (data: FormData) => void;
  onDelete?: () => void;
  kbId: string;
  defaultValues?: FormData;
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { kbDetail, getKbDetail } = useDatasetStore();

  const { getValues, register, handleSubmit, reset } = useForm<FormData>({
    defaultValues
  });

  const maxToken = kbDetail.vectorModel?.maxToken || 2000;

  /**
   * 确认导入新数据
   */
  const sureImportData = useCallback(
    async (e: FormData) => {
      if (e.q.length >= maxToken) {
        toast({
          title: '总长度超长了',
          status: 'warning'
        });
        return;
      }
      setLoading(true);

      try {
        const data = {
          dataId: '',
          a: e.a,
          q: e.q,
          source: '手动录入'
        };
        data.dataId = await postData2Dataset({
          kbId,
          data
        });

        toast({
          title: '导入数据成功,需要一段时间训练',
          status: 'success'
        });
        reset({
          a: '',
          q: ''
        });

        onSuccess(data);
      } catch (err: any) {
        toast({
          title: getErrText(err, '出现了点意外~'),
          status: 'error'
        });
      }
      setLoading(false);
    },
    [kbId, maxToken, onSuccess, reset, toast]
  );

  const updateData = useCallback(
    async (e: FormData) => {
      if (!e.dataId) return;

      if (e.a !== defaultValues.a || e.q !== defaultValues.q) {
        setLoading(true);
        try {
          const data = {
            dataId: e.dataId,
            kbId,
            a: e.a,
            q: e.q === defaultValues.q ? '' : e.q
          };
          await putDatasetDataById(data);
          onSuccess(data);
        } catch (err) {
          toast({
            status: 'error',
            title: getErrText(err, '更新数据失败')
          });
        }
        setLoading(false);
      }

      toast({
        title: '修改数据成功',
        status: 'success'
      });
      onClose();
    },
    [defaultValues.a, defaultValues.q, kbId, onClose, onSuccess, toast]
  );

  useQuery(['getKbDetail'], () => {
    if (kbDetail._id === kbId) return null;
    return getKbDetail(kbId);
  });

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      isCentered
      title={defaultValues.dataId ? '变更数据' : '手动导入数据'}
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
          <RawFileText
            fileId={getValues('file_id')}
            filename={getValues('source')}
            position={'absolute'}
            left={'50%'}
            top={['16px', '50%']}
            transform={'translate(-50%,-50%)'}
          />

          <Box flex={1}>
            {defaultValues.dataId && onDelete && (
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
                onClick={async () => {
                  if (!onDelete || !defaultValues.dataId) return;
                  try {
                    await delOneDatasetDataById(defaultValues.dataId);
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
                }}
              />
            )}
          </Box>
          <Box>
            <Button variant={'base'} mr={3} isLoading={loading} onClick={onClose}>
              取消
            </Button>
            <Button
              isLoading={loading}
              onClick={handleSubmit(defaultValues.dataId ? updateData : sureImportData)}
            >
              {defaultValues.dataId ? '确认变更' : '确认导入'}
            </Button>
          </Box>
        </Flex>
      </Flex>
    </MyModal>
  );
};

export default InputDataModal;

interface RawFileTextProps extends BoxProps {
  filename?: string;
  fileId?: string;
}
export function RawFileText({ fileId, filename = '', ...props }: RawFileTextProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  return (
    <MyTooltip label={fileId ? t('file.Click to view file') || '' : ''} shouldWrapChildren={false}>
      <Box
        color={'myGray.600'}
        display={'inline-block'}
        whiteSpace={'nowrap'}
        {...(!!fileId
          ? {
              cursor: 'pointer',
              textDecoration: 'underline',
              onClick: async () => {
                try {
                  await getFileAndOpen(fileId);
                } catch (error) {
                  toast({
                    title: getErrText(error, '获取文件地址失败'),
                    status: 'error'
                  });
                }
              }
            }
          : {})}
        {...props}
      >
        {filename}
      </Box>
    </MyTooltip>
  );
}
