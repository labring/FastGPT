import React, { useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  Card,
  Box,
  Flex,
  Button,
  Tooltip,
  Image,
  FormControl,
  Input,
  Tag,
  IconButton
} from '@chakra-ui/react';
import { QuestionOutlineIcon, DeleteIcon } from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import { delKbById, putKbById } from '@/api/plugins/kb';
import { useLoading } from '@/hooks/useLoading';
import { KbItemType } from '@/types/plugin';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useConfirm } from '@/hooks/useConfirm';
import { compressImg } from '@/utils/file';
import DataCard from './DataCard';

const Detail = ({ kbId }: { kbId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const InputRef = useRef<HTMLInputElement>(null);
  const { setLastKbId, KbDetail, getKbDetail, loadKbList, myKbList } = useUserStore();
  const { Loading, setIsLoading } = useLoading();
  const [btnLoading, setBtnLoading] = useState(false);
  const [refresh, setRefresh] = useState(false);

  const { getValues, formState, setValue, reset, register, handleSubmit } = useForm<KbItemType>({
    defaultValues: KbDetail
  });
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该知识库？数据将无法恢复，请确认！'
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { isLoading } = useQuery([kbId, myKbList], () => getKbDetail(kbId), {
    onSuccess(res) {
      kbId && setLastKbId(kbId);
      if (res) {
        reset(res);
        if (InputRef.current) {
          InputRef.current.value = res.tags;
        }
      }
    },
    onError(err: any) {
      toast({
        title: err?.message || '获取AI助手异常',
        status: 'error'
      });
      setLastKbId('');
      router.replace('/model');
    }
  });

  /* 点击删除 */
  const onclickDelKb = useCallback(async () => {
    setIsLoading(true);
    try {
      await delKbById(kbId);
      toast({
        title: '删除成功',
        status: 'success'
      });
      router.replace(`/kb?kbId=${myKbList.find((item) => item._id !== kbId)?._id || ''}`);
      await loadKbList(true);
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [setIsLoading, kbId, toast, router, myKbList, loadKbList]);

  const saveSubmitSuccess = useCallback(
    async (data: KbItemType) => {
      setBtnLoading(true);
      try {
        await putKbById({
          id: kbId,
          ...data
        });
        toast({
          title: '更新成功',
          status: 'success'
        });
        loadKbList(true);
      } catch (err: any) {
        toast({
          title: err?.message || '更新失败',
          status: 'error'
        });
      }
      setBtnLoading(false);
    },
    [kbId, loadKbList, toast]
  );
  const saveSubmitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return '提交表单错误';
      if (!!obj.message) {
        return obj.message;
      }
      return deepSearch(Object.values(obj)[0]);
    };
    toast({
      title: deepSearch(formState.errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [formState.errors, toast]);

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const base64 = await compressImg({
          file,
          maxW: 100,
          maxH: 100
        });
        setValue('avatar', base64);
        loadKbList(true);
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : '头像选择异常',
          status: 'warning'
        });
      }
    },
    [loadKbList, setValue, toast]
  );

  return (
    <Box h={'100%'} p={5} overflow={'overlay'} position={'relative'}>
      <Card p={6}>
        <Flex>
          <Box fontWeight={'bold'} fontSize={'2xl'} flex={1}>
            知识库信息
          </Box>
          {KbDetail._id && (
            <>
              <Button
                isLoading={btnLoading}
                mr={3}
                onClick={handleSubmit(saveSubmitSuccess, saveSubmitError)}
              >
                保存
              </Button>
              <IconButton
                isLoading={btnLoading}
                icon={<DeleteIcon />}
                aria-label={''}
                variant={'solid'}
                colorScheme={'red'}
                onClick={openConfirm(onclickDelKb)}
              />
            </>
          )}
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 60px'} w={0}>
            头像
          </Box>
          <Image
            src={getValues('avatar') || '/icon/logo.png'}
            alt={'avatar'}
            w={['28px', '36px']}
            h={['28px', '36px']}
            objectFit={'cover'}
            cursor={'pointer'}
            title={'点击切换头像'}
            onClick={onOpenSelectFile}
          />
        </Flex>
        <FormControl mt={5}>
          <Flex alignItems={'center'} maxW={'350px'}>
            <Box flex={'0 0 60px'} w={0}>
              名称
            </Box>
            <Input
              {...register('name', {
                required: '知识库名称不能为空'
              })}
            />
          </Flex>
        </FormControl>
        <Box>
          <Flex mt={5} alignItems={'center'} maxW={'350px'} flexWrap={'wrap'}>
            <Box flex={'0 0 60px'} w={0}>
              标签
              <Tooltip label={'仅用于记忆，用空格隔开多个标签'}>
                <QuestionOutlineIcon ml={1} />
              </Tooltip>
            </Box>
            <Input
              flex={1}
              ref={InputRef}
              placeholder={'标签,使用空格分割。'}
              onChange={(e) => {
                setValue('tags', e.target.value);
                setRefresh(!refresh);
              }}
            />
            <Box pl={'60px'} mt={2} w="100%">
              {getValues('tags')
                .split(' ')
                .filter((item) => item)
                .map((item, i) => (
                  <Tag mr={2} mb={2} key={i} variant={'outline'} colorScheme={'blue'}>
                    {item}
                  </Tag>
                ))}
            </Box>
          </Flex>
        </Box>
      </Card>
      <Card p={6} mt={5}>
        <DataCard kbId={kbId} />
      </Card>
      <File onSelect={onSelectFile} />
      <ConfirmChild />
      <Loading loading={isLoading} fixed={false} />
    </Box>
  );
};

export default Detail;
