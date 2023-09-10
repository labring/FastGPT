import React, { useCallback, useState, useRef, useMemo } from 'react';
import { Box, Card, IconButton, Flex, Button, Grid, Image } from '@chakra-ui/react';
import type { KbDataItemType } from '@/types/plugin';
import { usePagination } from '@/hooks/usePagination';
import {
  getKbDataList,
  getExportDataList,
  delOneKbDataByDataId,
  getTrainingData,
  getFileInfoById
} from '@/api/plugins/kb';
import { DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { fileDownload } from '@/utils/file';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import Papa from 'papaparse';
import InputModal, { FormData as InputDataType } from './InputDataModal';
import { debounce } from 'lodash';
import { getErrText } from '@/utils/tools';
import { useConfirm } from '@/hooks/useConfirm';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import MyInput from '@/components/MyInput';
import { fileImgs } from '@/constants/common';
import { useRequest } from '@/hooks/useRequest';
import { feConfigs } from '@/store/static';

const DataCard = ({ kbId }: { kbId: string }) => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef('');
  const router = useRouter();
  const { fileId = '' } = router.query as { fileId: string };
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('dataset.Confirm to delete the data')
  });

  const {
    data: kbDataList,
    isLoading,
    Pagination,
    total,
    getData,
    pageNum,
    pageSize
  } = usePagination<KbDataItemType>({
    api: getKbDataList,
    pageSize: 24,
    params: {
      kbId,
      searchText,
      fileId
    },
    onChange() {
      if (BoxRef.current) {
        BoxRef.current.scrollTop = 0;
      }
    }
  });

  const [editInputData, setEditInputData] = useState<InputDataType>();

  const { data: { qaListLen = 0, vectorListLen = 0 } = {}, refetch: refetchTrainingData } =
    useQuery(['getModelSplitDataList', kbId], () => getTrainingData({ kbId, init: false }), {
      onError(err) {
        console.log(err);
      }
    });

  const refetchData = useCallback(
    (num = pageNum) => {
      getData(num);
      refetchTrainingData();
      return null;
    },
    [getData, pageNum, refetchTrainingData]
  );

  // get first page data
  const getFirstData = useCallback(
    debounce(() => {
      getData(1);
      lastSearch.current = searchText;
    }, 300),
    []
  );

  // interval get data
  useQuery(['refetchData'], () => refetchData(1), {
    refetchInterval: 5000,
    enabled: qaListLen > 0 || vectorListLen > 0
  });

  // get file info
  const { data: fileInfo } = useQuery(['getFileInfo', fileId], () => getFileInfoById(fileId));
  const fileIcon = useMemo(
    () =>
      fileImgs.find((item) => new RegExp(item.suffix, 'gi').test(fileInfo?.filename || ''))?.src,
    [fileInfo?.filename]
  );

  // get al data and export csv
  const { mutate: onclickExport, isLoading: isLoadingExport = false } = useRequest({
    mutationFn: () => getExportDataList({ kbId, fileId }),
    onSuccess(res) {
      const text = Papa.unparse({
        fields: ['question', 'answer', 'source'],
        data: res
      });

      const filenameSplit = fileInfo?.filename?.split('.') || [];
      const filename = filenameSplit?.length <= 1 ? 'data' : filenameSplit.slice(0, -1).join('.');

      fileDownload({
        text,
        type: 'text/csv',
        filename
      });
    },
    successToast: `导出成功，下次导出需要 ${feConfigs.exportLimitMinutes} 分钟后`,
    errorToast: '导出异常'
  });

  return (
    <Box ref={BoxRef} position={'relative'} px={5} py={[1, 5]} h={'100%'} overflow={'overlay'}>
      <Flex alignItems={'center'}>
        <Flex
          className="textEllipsis"
          flex={'1 0 0'}
          mr={[3, 5]}
          fontSize={['sm', 'md']}
          alignItems={'center'}
        >
          <Image src={fileIcon} w={'16px'} mr={2} alt={''} />
          {t(fileInfo?.filename || 'Filename')}
        </Flex>
        <Button
          mr={2}
          size={['sm', 'md']}
          variant={'base'}
          borderColor={'myBlue.600'}
          color={'myBlue.600'}
          isLoading={isLoadingExport || isLoading}
          title={`${feConfigs} 分钟能导出 1 次`}
          onClick={onclickExport}
        >
          {t('dataset.Export')}
        </Button>
        <Box>
          <MyTooltip label={'刷新'}>
            <IconButton
              icon={<RepeatIcon />}
              size={['sm', 'md']}
              aria-label={'refresh'}
              variant={'base'}
              isLoading={isLoading}
              onClick={() => {
                getData(pageNum);
                getTrainingData({ kbId, init: true });
              }}
            />
          </MyTooltip>
        </Box>
      </Flex>
      <Flex my={3} alignItems={'center'}>
        <Box>
          <Box as={'span'} fontSize={['md', 'lg']}>
            {total}组
          </Box>
          <Box as={'span'}>
            {(qaListLen > 0 || vectorListLen > 0) && (
              <>
                ({qaListLen > 0 ? `${qaListLen}条数据正在拆分，` : ''}
                {vectorListLen > 0 ? `${vectorListLen}条数据正在生成索引，` : ''}
                请耐心等待... )
              </>
            )}
          </Box>
        </Box>
        <Box flex={1} mr={1} />
        <MyInput
          leftIcon={
            <MyIcon name="searchLight" position={'absolute'} w={'14px'} color={'myGray.500'} />
          }
          w={['200px', '300px']}
          placeholder="根据匹配知识，预期答案和来源进行搜索"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            getFirstData();
          }}
          onBlur={() => {
            if (searchText === lastSearch.current) return;
            getFirstData();
          }}
          onKeyDown={(e) => {
            if (searchText === lastSearch.current) return;
            if (e.key === 'Enter') {
              getFirstData();
            }
          }}
        />
      </Flex>
      <Grid
        minH={'100px'}
        gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)']}
        gridGap={4}
      >
        {kbDataList.map((item) => (
          <Card
            key={item.id}
            cursor={'pointer'}
            pt={3}
            userSelect={'none'}
            boxShadow={'none'}
            _hover={{ boxShadow: 'lg', '& .delete': { display: 'flex' } }}
            border={'1px solid '}
            borderColor={'myGray.200'}
            onClick={() =>
              setEditInputData({
                dataId: item.id,
                ...item
              })
            }
          >
            <Box
              h={'95px'}
              overflow={'hidden'}
              wordBreak={'break-all'}
              px={3}
              py={1}
              fontSize={'13px'}
            >
              <Box color={'myGray.1000'} mb={2}>
                {item.q}
              </Box>
              <Box color={'myGray.600'}>{item.a}</Box>
            </Box>
            <Flex py={2} px={4} h={'36px'} alignItems={'flex-end'} fontSize={'sm'}>
              <Box className={'textEllipsis'} flex={1} color={'myGray.500'}>
                ID:{item.id}
              </Box>
              <IconButton
                className="delete"
                display={['flex', 'none']}
                icon={<DeleteIcon />}
                variant={'base'}
                colorScheme={'gray'}
                aria-label={'delete'}
                size={'xs'}
                borderRadius={'md'}
                _hover={{ color: 'red.600' }}
                isLoading={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  openConfirm(async () => {
                    try {
                      setIsDeleting(true);
                      await delOneKbDataByDataId(item.id);
                      refetchData(pageNum);
                    } catch (error) {
                      toast({
                        title: getErrText(error),
                        status: 'error'
                      });
                    }
                    setIsDeleting(false);
                  })();
                }}
              />
            </Flex>
          </Card>
        ))}
      </Grid>

      {total > pageSize && (
        <Flex mt={2} justifyContent={'center'}>
          <Pagination />
        </Flex>
      )}
      {total === 0 && (
        <Flex flexDirection={'column'} alignItems={'center'} pt={'10vh'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            知识库空空如也
          </Box>
        </Flex>
      )}

      {editInputData !== undefined && (
        <InputModal
          kbId={kbId}
          defaultValues={editInputData}
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => refetchData()}
        />
      )}
      <ConfirmModal />
    </Box>
  );
};

export default React.memo(DataCard);
