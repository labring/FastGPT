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
import { delDatasetById } from '@/web/core/dataset/api';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@/web/common/hooks/useToast';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { UseFormReturn } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import Avatar from '@/components/Avatar';
import Tag from '@/components/Tag';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import PermissionRadio from '@/components/support/permission/Radio';
import MySelect from '@/components/Select';
import { qaModelList } from '@/web/common/system/staticData';

export interface ComponentRef {
  initInput: (tags: string) => void;
}

const Info = (
  { datasetId, form }: { datasetId: string; form: UseFormReturn<DatasetItemType, any> },
  ref: ForwardedRef<ComponentRef>
) => {
  const { t } = useTranslation();
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

  const { datasetDetail, loadDatasetDetail, loadDatasets, updateDataset } = useDatasetStore();

  /* 点击删除 */
  const onclickDelKb = useCallback(async () => {
    setBtnLoading(true);
    try {
      await delDatasetById(datasetId);
      toast({
        title: '删除成功',
        status: 'success'
      });
      router.replace(`/dataset/list`);
      await loadDatasets();
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setBtnLoading(false);
  }, [setBtnLoading, datasetId, toast, router, loadDatasets]);

  const saveSubmitSuccess = useCallback(
    async (data: DatasetItemType) => {
      setBtnLoading(true);
      try {
        await updateDataset({
          id: datasetId,
          ...data
        });
        toast({
          title: '更新成功',
          status: 'success'
        });
        loadDatasets();
      } catch (err: any) {
        toast({
          title: err?.message || '更新失败',
          status: 'error'
        });
      }
      setBtnLoading(false);
    },
    [updateDataset, datasetId, toast, loadDatasets]
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
        const src = await compressImgFileAndUpload({
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
        <Box flex={1}>{datasetDetail._id}</Box>
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
          maxLength={30}
          {...register('name', {
            required: '知识库名称不能为空'
          })}
        />
      </FormControl>
      <Flex mt={6} alignItems={'center'}>
        <Box flex={['0 0 90px', '0 0 160px']} w={0}>
          {t('dataset.Agent Model')}
        </Box>
        <Box flex={[1, '0 0 300px']}>
          <MySelect
            w={'100%'}
            value={getValues('agentModel').model}
            list={qaModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onchange={(e) => {
              const agentModel = qaModelList.find((item) => item.model === e);
              if (!agentModel) return;
              setValue('agentModel', agentModel);
              setRefresh((state) => !state);
            }}
          />
        </Box>
      </Flex>
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
            setValue('tags', e.target.value.split(' ').filter(Boolean));
            setRefresh(!refresh);
          }}
        />
        <Flex w={'100%'} pl={['90px', '160px']} mt={2}>
          {getValues('tags')
            .filter(Boolean)
            .map((item, i) => (
              <Tag mr={2} mb={2} key={i} whiteSpace={'nowrap'}>
                {item}
              </Tag>
            ))}
        </Flex>
      </Flex>
      {datasetDetail.isOwner && (
        <Flex mt={5} alignItems={'center'} w={'100%'} flexWrap={'wrap'}>
          <Box flex={['0 0 90px', '0 0 160px']} w={0}>
            {t('user.Permission')}
          </Box>
          <Box>
            <PermissionRadio
              value={getValues('permission')}
              onChange={(e) => {
                setValue('permission', e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
      )}

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
        {datasetDetail.isOwner && (
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
        )}
      </Flex>
      <File onSelect={onSelectFile} />
      <ConfirmModal />
    </Box>
  );
};

export default forwardRef(Info);
