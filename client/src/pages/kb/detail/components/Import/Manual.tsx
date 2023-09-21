import React, { useState } from 'react';
import { Box, Textarea, Button, Flex } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/useToast';
import { useRequest } from '@/hooks/useRequest';
import { getErrText } from '@/utils/tools';
import { postChunks2Dataset } from '@/api/core/dataset/data';
import { TrainingModeEnum } from '@/constants/plugin';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useDatasetStore } from '@/store/dataset';

type ManualFormType = { q: string; a: string };

const ManualImport = ({ kbId }: { kbId: string }) => {
  const { kbDetail } = useDatasetStore();
  const maxToken = kbDetail.vectorModel?.maxToken || 2000;

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { q: '', a: '' }
  });
  const { toast } = useToast();
  const [qLen, setQLen] = useState(0);

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
        const { insertLen } = await postChunks2Dataset({
          kbId,
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
        <Box flex={1} mr={[0, 4]} mb={[4, 0]} h={['50%', '100%']} position={'relative'}>
          <Flex>
            <Box h={'30px'}>{'匹配的知识点'}</Box>
            <MyTooltip label={'被向量化的部分，通常是问题，也可以是一段陈述描述'}>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Textarea
            placeholder={`匹配的知识点。这部分内容会被搜索，请把控内容的质量。最多 ${maxToken} 字。`}
            maxLength={maxToken}
            h={['250px', '500px']}
            {...register(`q`, {
              required: true,
              onChange(e) {
                setQLen(e.target.value.length);
              }
            })}
          />
          <Box position={'absolute'} color={'myGray.500'} right={5} bottom={3} zIndex={99}>
            {qLen}
          </Box>
        </Box>
        <Box flex={1} h={['50%', '100%']}>
          <Flex>
            <Box h={'30px'}>{'预期答案'}</Box>
            <MyTooltip
              label={'匹配的知识点被命中后，这部分内容会随匹配知识点一起注入模型，引导模型回答'}
            >
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Textarea
            placeholder={
              '预期答案。这部分内容不会被搜索，但会作为"匹配的知识点"的内容补充，通常是问题的答案。总和最多 3000 字。'
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
