import React, { useCallback, useState, useRef, useMemo } from 'react';
import {
  Box,
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Image
} from '@chakra-ui/react';
import { getKbFiles, deleteKbFileById } from '@/api/plugins/kb';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { debounce } from 'lodash';
import { formatFileSize } from '@/utils/tools';
import { useConfirm } from '@/hooks/useConfirm';
import { useTranslation } from 'react-i18next';
import MyIcon from '@/components/Icon';
import MyInput from '@/components/MyInput';
import dayjs from 'dayjs';
import { fileImgs } from '@/constants/common';
import { useRequest } from '@/hooks/useRequest';
import { useLoading } from '@/hooks/useLoading';
import { FileStatusEnum } from '@/constants/kb';
import { useRouter } from 'next/router';

const FileCard = ({ kbId }: { kbId: string }) => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef('');
  const router = useRouter();
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const { Loading } = useLoading();
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('kb.Confirm to delete the file')
  });

  const {
    data: files = [],
    refetch,
    isInitialLoading
  } = useQuery(['getFiles', kbId], () => getKbFiles({ kbId, searchText }), {
    refetchInterval: 6000,
    refetchOnWindowFocus: true
  });

  const debounceRefetch = useCallback(
    debounce(() => {
      refetch();
      lastSearch.current = searchText;
    }, 300),
    []
  );

  const formatFiles = useMemo(
    () =>
      files.map((file) => ({
        ...file,
        icon: fileImgs.find((item) => new RegExp(item.suffix, 'gi').test(file.filename))?.src
      })),
    [files]
  );
  const totalDataLength = useMemo(
    () => files.reduce((sum, item) => sum + item.chunkLength, 0),
    [files]
  );

  const { mutate: onDeleteFile, isLoading } = useRequest({
    mutationFn: (fileId: string) =>
      deleteKbFileById({
        fileId,
        kbId
      }),
    onSuccess() {
      refetch();
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.Delete Failed')
  });

  const statusMap = {
    [FileStatusEnum.embedding]: {
      color: 'myGray.500',
      text: t('file.Embedding')
    },
    [FileStatusEnum.ready]: {
      color: 'green.500',
      text: t('file.Ready')
    }
  };

  return (
    <Box ref={BoxRef} position={'relative'} py={[1, 5]} h={'100%'} overflow={'overlay'}>
      <Flex justifyContent={'space-between'} px={5}>
        <Box fontWeight={'bold'} fontSize={'lg'} mr={2}>
          {t('kb.Files', { total: files.length })}
        </Box>
        <Flex alignItems={'center'}>
          <MyInput
            leftIcon={
              <MyIcon name="searchLight" position={'absolute'} w={'14px'} color={'myGray.500'} />
            }
            w={['100%', '200px']}
            placeholder={t('common.Search') || ''}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              debounceRefetch();
            }}
            onBlur={() => {
              if (searchText === lastSearch.current) return;
              refetch();
            }}
            onKeyDown={(e) => {
              if (searchText === lastSearch.current) return;
              if (e.key === 'Enter') {
                refetch();
              }
            }}
          />
        </Flex>
      </Flex>
      <TableContainer mt={[0, 3]}>
        <Table variant={'simple'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('kb.Filename')}</Th>
              <Th>
                {t('kb.Chunk Length')}({totalDataLength})
              </Th>
              <Th>{t('kb.Upload Time')}</Th>
              <Th>{t('kb.File Size')}</Th>
              <Th>{t('common.Status')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {formatFiles.map((file) => (
              <Tr
                key={file.id}
                _hover={{ bg: 'myWhite.600' }}
                cursor={'pointer'}
                title={'点击查看数据详情'}
                onClick={() =>
                  router.push({
                    query: {
                      kbId,
                      fileId: file.id,
                      currentTab: 'dataCard'
                    }
                  })
                }
              >
                <Td>
                  <Flex alignItems={'center'}>
                    <Image src={file.icon} w={'16px'} mr={2} alt={''} />
                    <Box maxW={['300px', '400px']} className="textEllipsis">
                      {t(file.filename)}
                    </Box>
                  </Flex>
                </Td>
                <Td fontSize={'md'} fontWeight={'bold'}>
                  {file.chunkLength}
                </Td>
                <Td>{dayjs(file.uploadTime).format('YYYY/MM/DD HH:mm')}</Td>
                <Td>{formatFileSize(file.size)}</Td>
                <Td
                  display={'flex'}
                  alignItems={'center'}
                  _before={{
                    content: '""',
                    w: '10px',
                    h: '10px',
                    mr: 2,
                    borderRadius: 'lg',
                    bg: statusMap[file.status].color
                  }}
                >
                  {statusMap[file.status].text}
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <MyIcon
                    name={'delete'}
                    w={'14px'}
                    _hover={{ color: 'red.600' }}
                    onClick={() =>
                      openConfirm(() => {
                        onDeleteFile(file.id);
                      })()
                    }
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <ConfirmModal />
      <Loading loading={isInitialLoading || isLoading} />
    </Box>
  );
};

export default React.memo(FileCard);
