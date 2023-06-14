import React, {
  useCallback,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Button, FormControl, IconButton, Tooltip, Input, Card } from '@chakra-ui/react';
import { QuestionOutlineIcon, DeleteIcon } from '@chakra-ui/icons';
import { delKbById, putKbById } from '@/api/plugins/kb';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/user';
import { useConfirm } from '@/hooks/useConfirm';
import { UseFormReturn } from 'react-hook-form';
import { compressImg } from '@/utils/file';
import type { KbItemType } from '@/types/plugin';
import Avatar from '@/components/Avatar';
import Tag from '@/components/Tag';

export interface ComponentRef {
  initInput: (tags: string) => void;
}

const Info = (
  { kbId, form }: { kbId: string; form: UseFormReturn<KbItemType, any> },
  ref: ForwardedRef<ComponentRef>
) => {
  const { getValues, formState, setValue, register, handleSubmit } = form;
  const InputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const router = useRouter();

  const [btnLoading, setBtnLoading] = useState(false);
  const [refresh, setRefresh] = useState(false);

  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该知识库？数据将无法恢复，请确认！'
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { kbDetail, getKbDetail, loadKbList, myKbList } = useUserStore();

  /* 点击删除 */
  const onclickDelKb = useCallback(async () => {
    setBtnLoading(true);
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
    setBtnLoading(false);
  }, [setBtnLoading, kbId, toast, router, myKbList, loadKbList]);

  const saveSubmitSuccess = useCallback(
    async (data: KbItemType) => {
      setBtnLoading(true);
      try {
        await putKbById({
          id: kbId,
          ...data
        });
        await getKbDetail(kbId, true);
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
    [getKbDetail, kbId, loadKbList, toast]
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
        const src = await compressImg({
          file,
          maxW: 100,
          maxH: 100
        });

        setValue('avatar', src);

        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : '头像选择异常',
          status: 'warning'
        });
      }
    },
    [setRefresh, setValue, toast]
  );

  useImperativeHandle(ref, () => ({
    initInput: (tags: string) => {
      if (InputRef.current) {
        InputRef.current.value = tags;
      }
    }
  }));

  return (
    <Flex px={5} flexDirection={'column'} alignItems={'center'}>
      <Flex mt={5} w={'100%'} maxW={'350px'} alignItems={'center'}>
        <Box flex={'0 0 90px'} w={0}>
          知识库头像
        </Box>
        <Box flex={1}>
          <Avatar
            m={'auto'}
            src={getValues('avatar')}
            w={['32px', '40px']}
            h={['32px', '40px']}
            cursor={'pointer'}
            title={'点击切换头像'}
            onClick={onOpenSelectFile}
          />
        </Box>
      </Flex>
      <FormControl mt={8} w={'100%'} maxW={'350px'} display={'flex'} alignItems={'center'}>
        <Box flex={'0 0 90px'} w={0}>
          知识库名称
        </Box>
        <Input
          flex={1}
          {...register('name', {
            required: '知识库名称不能为空'
          })}
        />
      </FormControl>
      <Flex mt={8} alignItems={'center'} w={'100%'} maxW={'350px'} flexWrap={'wrap'}>
        <Box flex={'0 0 90px'} w={0}>
          分类标签
          <Tooltip label={'用空格隔开多个标签，便于搜索'}>
            <QuestionOutlineIcon ml={1} />
          </Tooltip>
        </Box>
        <Input
          flex={1}
          maxW={'300px'}
          ref={InputRef}
          placeholder={'标签,使用空格分割。'}
          maxLength={30}
          onChange={(e) => {
            setValue('tags', e.target.value);
            setRefresh(!refresh);
          }}
        />
        <Box pl={'90px'} mt={2} w="100%">
          {getValues('tags')
            .split(' ')
            .filter((item) => item)
            .map((item, i) => (
              <Tag mr={2} mb={2} key={i} whiteSpace={'nowrap'}>
                {item}
              </Tag>
            ))}
        </Box>
      </Flex>
      {kbDetail._id && (
        <Flex mt={5} w={'100%'} maxW={'350px'} alignItems={'flex-end'}>
          <Box flex={'0 0 90px'} w={0}></Box>
          <Button
            isLoading={btnLoading}
            mr={4}
            w={'100px'}
            onClick={handleSubmit(saveSubmitSuccess, saveSubmitError)}
          >
            保存
          </Button>
          <IconButton
            isLoading={btnLoading}
            icon={<DeleteIcon />}
            aria-label={''}
            variant={'outline'}
            size={'sm'}
            _hover={{
              color: 'red.600',
              borderColor: 'red.600'
            }}
            onClick={openConfirm(onclickDelKb)}
          />
        </Flex>
      )}
      <File onSelect={onSelectFile} />
      <ConfirmChild />
    </Flex>
  );
};

export default forwardRef(Info);
