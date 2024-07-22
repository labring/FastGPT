import React, { useEffect } from 'react';
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
  Input
} from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useI18n } from '@/web/context/I18n';
import { SmallAddIcon } from '@chakra-ui/icons';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));

const ExternalFileCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomLinkInput />}
      {activeStep === 1 && <DataProcess showPreviewChunks={true} />}
      {activeStep === 2 && <Upload />}
    </>
  );
};

export default React.memo(ExternalFileCollection);

const CustomLinkInput = () => {
  const { t } = useTranslation();
  const { datasetT, commonT } = useI18n();
  const { goToNext, sources, setSources } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, reset, handleSubmit, control } = useForm<{
    list: {
      sourceName: string;
      externalFileUrl: string;
      externalFileId: string;
    }[];
  }>({
    defaultValues: {
      list: [
        {
          sourceName: '',
          externalFileUrl: '',
          externalFileId: ''
        }
      ]
    }
  });

  const {
    fields: list,
    append,
    remove,
    update
  } = useFieldArray({
    control,
    name: 'list'
  });

  useEffect(() => {
    if (sources.length > 0) {
      reset({
        list: sources.map((item) => ({
          sourceName: item.sourceName,
          externalFileUrl: item.externalFileUrl || '',
          externalFileId: item.externalFileId || ''
        }))
      });
    }
  }, []);

  return (
    <Box>
      <TableContainer>
        <Table bg={'white'}>
          <Thead>
            <Tr bg={'myGray.50'}>
              <Th>{datasetT('external_url')}</Th>
              <Th>{datasetT('external_id')}</Th>
              <Th>{datasetT('filename')}</Th>
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
                        if (val && index === list.length - 1) {
                          append({
                            sourceName: '',
                            externalFileUrl: '',
                            externalFileId: ''
                          });
                        }
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
          variant={'whitePrimary'}
          leftIcon={<SmallAddIcon />}
          onClick={() => {
            append({
              sourceName: '',
              externalFileUrl: '',
              externalFileId: ''
            });
          }}
        >
          {commonT('add_new')}
        </Button>
        <Button
          isDisabled={list.filter((item) => !!item.externalFileUrl).length === 0}
          onClick={handleSubmit((data) => {
            setSources(
              data.list
                .filter((item) => !!item.externalFileUrl)
                .map((item) => ({
                  id: getNanoid(32),
                  createStatus: 'waiting',
                  sourceName: item.sourceName || item.externalFileUrl,
                  icon: getFileIcon(item.externalFileUrl),
                  externalFileId: item.externalFileId,
                  externalFileUrl: item.externalFileUrl
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
