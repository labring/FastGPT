import React, {
  useCallback,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Button, FormControl, IconButton, Input } from '@chakra-ui/react';
import { QuestionOutlineIcon, DeleteIcon } from '@chakra-ui/icons';
import { delDatasetById, putDatasetById } from '@/api/core/dataset';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { useDatasetStore } from '@/store/dataset';
import { useConfirm } from '@/hooks/useConfirm';
import { UseFormReturn } from 'react-hook-form';
import { compressImg } from '@/utils/web/file';
import type { DatasetItemType } from '@/types/core/dataset';
import Avatar from '@/components/Avatar';
import Tag from '@/components/Tag';
import MyTooltip from '@/components/MyTooltip';

export interface ComponentRef {
  initInput: (tags: string) => void;
}

const Info = (
  { kbId, form }: { kbId: string; form: UseFormReturn<DatasetItemType, any> },
  ref: ForwardedRef<ComponentRef>
) => {
  const { getValues, formState, setValue, register, handleSubmit } = form;
  const InputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const router = useRouter();

  const [btnLoading, setBtnLoading] = useState(false);
  const [refresh, setRefresh] = useState(false);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认删除该知识库？数据将无法恢复，请确认！'
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { kbDetail, getKbDetail, loadKbList } = useDatasetStore();

  /* 点击删除 */
  const onclickDelKb = useCallback(async () => {
    setBtnLoading(true);
    try {
      await delDatasetById(kbId);
      toast({
        title: '删除成功',
        status: 'success'
      });
      router.replace(`/kb/list`);
      await loadKbList();
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setBtnLoading(false);
  }, [setBtnLoading, kbId, toast, router, loadKbList]);

  const saveSubmitSuccess = useCallback(
    async (data: DatasetItemType) => {
      setBtnLoading(true);
      try {
        await putDatasetById({
          id: kbId,
          ...data
        });
        await getKbDetail(kbId, true);
        toast({
          title: '更新成功',
          status: 'success'
        });
        loadKbList();
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
    <Box py={5} px={[5, 10]}>
      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          知识库 ID
        </Box>
        <Box flex={1}>{kbDetail._id}</Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          索引模型
        </Box>
        <Box flex={[1, '0 0 300px']}>{getValues('vectorModel').name}</Box>
      </Flex>
      <Flex mt={8} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          MaxTokens
        </Box>
        <Box flex={[1, '0 0 300px']}>{getValues('vectorModel').maxToken}</Box>
      </Flex>
      <Flex mt={5} w={'100%'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          知识库头像
        </Box>
        <Box flex={[1, '0 0 300px']}>
          <MyTooltip label={'点击切换头像'}>
            <Avatar
              m={'auto'}
              src={getValues('avatar')}
              w={['32px', '40px']}
              h={['32px', '40px']}
              cursor={'pointer'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
        </Box>
      </Flex>
      <FormControl mt={8} w={'100%'} display={'flex'} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          知识库名称
        </Box>
        <Input
          flex={[1, '0 0 300px']}
          {...register('name', {
            required: '知识库名称不能为空'
          })}
        />
      </FormControl>
      <Flex mt={8} alignItems={'center'} w={'100%'} flexWrap={'wrap'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          标签
          <MyTooltip label={'用空格隔开多个标签，便于搜索'} forceShow>
            <QuestionOutlineIcon ml={1} />
          </MyTooltip>
        </Box>
        <Input
          flex={[1, '0 0 300px']}
          ref={InputRef}
          defaultValue={getValues('tags')}
          placeholder={'标签,使用空格分割。'}
          maxLength={30}
          onChange={(e) => {
            setValue('tags', e.target.value);
            setRefresh(!refresh);
          }}
        />
        <Flex w={'100%'} pl={['90px', '160px']} mt={2}>
          {getValues('tags')
            .split(' ')
            .filter((item) => item)
            .map((item, i) => (
              <Tag mr={2} mb={2} key={i} whiteSpace={'nowrap'}>
                {item}
              </Tag>
            ))}
        </Flex>
      </Flex>
      <Flex mt={5} w={'100%'} alignItems={'flex-end'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}></Box>
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
      <File onSelect={onSelectFile} />
      <ConfirmModal />
    </Box>
  );
};

export default forwardRef(Info);
