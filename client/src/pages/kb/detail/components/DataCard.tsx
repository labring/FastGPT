import React, { useCallback, useState, useRef } from 'react';
import { Box, Card, IconButton, Flex, Button, Input, Grid } from '@chakra-ui/react';
import type { KbDataItemType } from '@/types/plugin';
import { usePagination } from '@/hooks/usePagination';
import {
  getKbDataList,
  getExportDataList,
  delOneKbDataByDataId,
  getTrainingData
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
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';

const DataCard = ({ kbId }: { kbId: string }) => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef('');
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
      searchText
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

  // get al data and export csv
  const { mutate: onclickExport, isLoading: isLoadingExport = false } = useMutation({
    mutationFn: () => getExportDataList(kbId),
    onSuccess(res) {
      const text = Papa.unparse({
        fields: ['question', 'answer', 'source'],
        data: res
      });
      fileDownload({
        text,
        type: 'text/csv',
        filename: 'data.csv'
      });
      toast({
        title: '导出成功，下次导出需要半小时后',
        status: 'success'
      });
    },
    onError(err: any) {
      toast({
        title: getErrText(err, '导出异常'),
        status: 'error'
      });
      console.log(err);
    }
  });

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

  return (
    <Box ref={BoxRef} position={'relative'} px={5} py={[1, 5]} h={'100%'} overflow={'overlay'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'} fontSize={'lg'} mr={2}>
          知识库数据: {total}组
        </Box>
        <Box>
          <MyTooltip label={'刷新'}>
            <IconButton
              icon={<RepeatIcon />}
              aria-label={'refresh'}
              variant={'base'}
              isLoading={isLoading}
              mr={[2, 4]}
              size={'sm'}
              onClick={() => {
                getData(pageNum);
                getTrainingData({ kbId, init: true });
              }}
            />
          </MyTooltip>
          <Button
            mr={2}
            size={'sm'}
            variant={'base'}
            borderColor={'myBlue.600'}
            color={'myBlue.600'}
            isLoading={isLoadingExport || isLoading}
            title={'半小时仅能导出1次'}
            onClick={() => onclickExport()}
          >
            导出数据
          </Button>
        </Box>
      </Flex>
      <Flex my={4}>
        {qaListLen > 0 || vectorListLen > 0 ? (
          <Box fontSize={'xs'}>
            {qaListLen > 0 ? `${qaListLen}条数据正在拆分，` : ''}
            {vectorListLen > 0 ? `${vectorListLen}条数据正在生成索引，` : ''}
            请耐心等待...
          </Box>
        ) : (
          <Box fontSize={'xs'}>所有数据已就绪~</Box>
        )}
        <Box flex={1} mr={1} />
        <Input
          maxW={['60%', '300px']}
          size={'sm'}
          value={searchText}
          placeholder="根据匹配知识，预期答案和来源进行搜索"
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
                {item.source?.trim()}
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
