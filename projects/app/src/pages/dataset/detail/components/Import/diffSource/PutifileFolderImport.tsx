import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useFieldArray, useForm } from 'react-hook-form';
import {
  Box,
  Button,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Input,
  Select
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { getPutifileFileUrl, getPutiFolderFiles } from '@/web/core/dataset/api';
import { PutifileFileItemResp } from '@/pages/api/putifile/utils';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));

const PutifileFolderCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomLinkInput />}
      {activeStep === 1 && <DataProcess showPreviewChunks={true} />}
      {activeStep === 2 && <Upload />}
    </>
  );
};

export default React.memo(PutifileFolderCollection);

const CustomLinkInput = () => {
  const { t } = useTranslation();
  const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, reset, handleSubmit, control } = useForm<{
    list: {
      sourceName: string;
      externalFileUrl: string;
      externalFileId: string;
      name: string;
      folder: string;
      policy: string;
    }[];
  }>({
    defaultValues: {
      list: [
        {
          sourceName: '',
          externalFileUrl: '',
          externalFileId: '',
          name: '',
          folder: '',
          policy: ''
        }
      ]
    }
  });

  const {
    fields: list,
    update,
    remove
  } = useFieldArray({
    control,
    name: 'list'
  });

  // 导入文件夹
  const [name, setName] = useState<string>('');
  const [folder, setFolder] = useState<string>('');
  const [policy, setPolicy] = useState<string>('');

  const getFiles = async () => {
    // 获取文件夹下文件列表
    const files: any = await getPutiFolderFiles({ folder });

    // 遍历文件夹下的文件列表
    const list = files.map((item: PutifileFileItemResp) => {
      return {
        sourceName: item.fileName,
        externalFileId: item.id
      };
    });
    for (let i = 0; i < list.length; i++) {
      // 获取真实的文件地址
      list[i].externalFileUrl = await getPutifileFileUrl(files[i].id);
    }
    reset({
      list
    });
  };

  return (
    <Box>
      <Box>
        名称：
        <Input placeholder={'名称'} onChange={(e) => setName(e.target.value)} />
      </Box>
      <Box>
        文件夹：
        <Input
          placeholder={'文件夹'}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={getFiles}
        />
      </Box>
      <Box>
        策略：
        <Select placeholder={'策略'} onChange={(e) => setPolicy(e.target.value)}>
          <option value="once">一次性导入</option>
          <option value="sync_only_import_file">仅本次导入文件定期同步</option>
          <option value="sync_folder">本文件夹定期同步</option>
        </Select>
      </Box>
      <TableContainer>
        <Table bg={'white'}>
          <Thead>
            <Tr bg={'myGray.50'}>
              <Th>文件访问地址</Th>
              <Th>文件ID</Th>
              <Th>文件名称</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {list.map((item, index) => (
              <Tr key={item.id}>
                <Td>
                  <Input
                    {...register(`list.${index}.externalFileUrl`, {
                      required: index !== list.length - 1,
                      onBlur(e) {
                        const val = (e.target.value || '') as string;
                        if (val.includes('.') && !list[index]?.sourceName) {
                          const sourceName = val.split('/').pop() || '';
                          update(index, {
                            ...list[index],
                            externalFileUrl: val,
                            sourceName: decodeURIComponent(sourceName)
                          });
                        }
                        // if (val && index === list.length - 1) {
                        //   append({
                        //     sourceName: '',
                        //     externalFileUrl: '',
                        //     externalFileId: ''
                        //   });
                        // }
                      }
                    })}
                  />
                </Td>
                <Td>
                  <Input {...register(`list.${index}.externalFileId`)} />
                </Td>
                <Td>
                  <Input {...register(`list.${index}.sourceName`)} />
                </Td>
                <Td>
                  <MyIcon
                    name={'delete'}
                    w={'16px'}
                    cursor={'pointer'}
                    _hover={{ color: 'red.600' }}
                    onClick={() => remove(index)}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Flex mt={5} justifyContent={'space-between'}>
        <Button
          isDisabled={!folder || list.filter((item) => !!item.externalFileUrl).length === 0}
          onClick={handleSubmit((data) => {
            setSources(
              data.list
                .filter((item) => !!item.externalFileUrl)
                .map((item) => ({
                  id: '',
                  createStatus: 'waiting',
                  sourceName: item.sourceName,
                  icon: getFileIcon(item.externalFileUrl),
                  externalFileId: item.externalFileId,
                  externalFileUrl: item.externalFileUrl,
                  name: name,
                  policy: policy,
                  folder: folder
                }))
            );

            goToNext();
          })}
        >
          {t('common:common.Next Step')}
        </Button>
      </Flex>
    </Box>
  );
};
