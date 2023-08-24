import React, { useCallback, useState } from 'react';
import { Box, type BoxProps, Flex, Textarea, useTheme, Button } from '@chakra-ui/react';
import MyRadio from '@/components/Radio/index';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/useToast';
import { useRequest } from '@/hooks/useRequest';
import { getErrText } from '@/utils/tools';
import { vectorModelList } from '@/store/static';
import { postKbDataFromList } from '@/api/plugins/kb';
import { TrainingModeEnum } from '@/constants/plugin';

type ManualFormType = { q: string; a: string };

const ManualImport = ({ kbId }: { kbId: string }) => {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { q: '', a: '' }
  });
  const { toast } = useToast();

  const { mutate: onImportData, isLoading } = useRequest({
    mutationFn: async (e: ManualFormType) => {
      if (e.a.length + e.q.length >= 3000) {
        toast({
          title: '总长度超长了',
          status: 'warning'
        });
        return;
      }

      try {
        const data = {
          a: e.a,
          q: e.q,
          source: '手动录入'
        };
        const { insertLen } = await postKbDataFromList({
          kbId,
          model: vectorModelList[0].model,
          mode: TrainingModeEnum.index,
          data: [data]
        });

        if (insertLen === 0) {
          toast({
            title: '已存在完全一致的数据',
            status: 'warning'
          });
        } else {
          toast({
            title: '导入数据成功,需要一段时间训练',
            status: 'success'
          });
          reset({
            a: '',
            q: ''
          });
        }
      } catch (err: any) {
        toast({
          title: getErrText(err, '出现了点意外~'),
          status: 'error'
        });
      }
    }
  });

  return (
    <Box p={[4, 8]} h={'100%'} overflow={'overlay'}>
      <Box display={'flex'} flexDirection={['column', 'row']}>
        <Box flex={1} mr={[0, 4]} mb={[4, 0]} h={['50%', '100%']}>
          <Box h={'30px'}>{'匹配的知识点'}</Box>
          <Textarea
            placeholder={'匹配的知识点。这部分内容会被搜索，请把控内容的质量。总和最多 3000 字。'}
            maxLength={3000}
            h={['250px', '500px']}
            {...register(`q`, {
              required: true
            })}
          />
        </Box>
        <Box flex={1} h={['50%', '100%']}>
          <Box h={'30px'}>补充知识</Box>
          <Textarea
            placeholder={
              '补充知识。这部分内容不会被搜索，但会作为"匹配的知识点"的内容补充，你可以讲一些细节的内容填写在这里。总和最多 3000 字。'
            }
            h={['250px', '500px']}
            maxLength={3000}
            {...register('a')}
          />
        </Box>
      </Box>
      <Button mt={5} isLoading={isLoading} onClick={handleSubmit((data) => onImportData(data))}>
        确认导入
      </Button>
    </Box>
  );
};

export default React.memo(ManualImport);
