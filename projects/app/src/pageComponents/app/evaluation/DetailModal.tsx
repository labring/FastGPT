import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Button, Flex, IconButton, ModalBody } from '@chakra-ui/react';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { deleteEvalItem, getEvalItemsList } from '@/web/core/app/api/evaluation';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { downloadFetch } from '@/web/common/system/utils';
import type { deleteItemQuery } from '@/pages/api/core/app/evaluation/deleteItem';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { type evaluationType } from '@/pages/api/core/app/evaluation/list';
import { type TFunction } from 'i18next';

const formatEvaluationStatus = (item: { status: number; errorMessage?: string }, t: TFunction) => {
  if (item.status === 0) {
    return (
      <Box color={'myGray.500'} fontWeight={'medium'}>
        {t('dashboard_evaluation:queuing')}
      </Box>
    );
  }
  if (item.status === 1) {
    return (
      <Box color={'primary.600'} fontWeight={'medium'}>
        {t('dashboard_evaluation:evaluating')}
      </Box>
    );
  }
  if (item.errorMessage) {
    return (
      <Box color={'red.600'} fontWeight={'medium'}>
        {t('dashboard_evaluation:error')}
      </Box>
    );
  }
  if (item.status === 2) {
    return (
      <Box color={'green.600'} fontWeight={'medium'}>
        {t('dashboard_evaluation:completed')}
      </Box>
    );
  }
  return null;
};

const EvaluationDetailModal = ({
  evalDetail,
  onClose
}: {
  evalDetail: evaluationType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const [seletedIndex, setSelectedIndex] = useState(0);

  const modelData = useMemo(() => {
    if (!evalDetail?.agentModel) {
      return {
        avatar: '',
        name: ''
      };
    }
    return getModelFromList(llmModelList, evalDetail?.agentModel);
  }, [evalDetail?.agentModel]);

  const {
    data: evalItemsList,
    ScrollData,
    refreshList
  } = useScrollPagination(getEvalItemsList, {
    pageSize: 20,
    params: {
      evalId: evalDetail._id,
      appId: evalDetail.appId
    },
    pollingInterval: 5000
  });

  const { runAsync: exportEval, loading: isDownloading } = useRequest2(async () => {
    await downloadFetch({
      url: `/api/core/app/evaluation/exportItems?evalId=${evalDetail._id}&appId=${evalDetail.appId}`,
      filename: `${evalDetail.name}.csv`
    });
  });

  const { runAsync: delEvalItem, loading: isLoadingDelete } = useRequest2(
    async (data: deleteItemQuery) => {
      await deleteEvalItem(data);
    },
    {
      onSuccess: () => {
        refreshList();
      }
    }
  );

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc={'common/detail'}
        iconColor={'primary.600'}
        title={t('dashboard_evaluation:task_detail')}
        w={['90vw', '1200px']}
        maxW={['90vw', '1200px']}
      >
        <ModalBody py={6} px={9}>
          <Flex
            border={'1px solid'}
            borderColor={'primary.200'}
            bg={'primary.50'}
            borderRadius={'12px'}
            px={10}
            py={5}
            justifyContent={'space-between'}
            fontSize={'14px'}
          >
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:task_name')}
              </Box>
              <Box color={'myGray.900'} fontWeight={'medium'}>
                {evalDetail?.name}
              </Box>
            </Box>
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:Evaluation_model')}
              </Box>
              <Flex gap={1.5}>
                <Avatar src={modelData?.avatar} w={5} />
                <Box color={'myGray.900'} fontWeight={'medium'}>
                  {modelData?.name}
                </Box>
              </Flex>
            </Box>
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:Evaluation_app')}
              </Box>
              <Flex gap={1.5}>
                <Avatar src={evalDetail?.appAvatar} w={5} borderRadius={'4px'} />
                <Box color={'myGray.900'} fontWeight={'medium'}>
                  {evalDetail?.appName}
                </Box>
              </Flex>
            </Box>
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:Progress')}
              </Box>
              <Flex color={'myGray.900'} fontWeight={'medium'}>
                {evalDetail?.completedCount}
                <Box color={'myGray.600'}>{`/${evalDetail?.totalCount}`}</Box>
              </Flex>
            </Box>
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:Overall_score')}
              </Box>
              <Box color={'myGray.900'} fontWeight={'medium'}>
                {evalDetail.score !== null ? evalDetail?.score : '-'}
              </Box>
            </Box>
          </Flex>

          <Box mt={4} borderRadius={'16px'} h={500} border={'1px solid'} borderColor={'myGray.200'}>
            <Flex h={16} w={'full'} borderBottom={'1px solid'} borderColor={'myGray.200'}>
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                px={6}
                h={'full'}
                w={2 / 3}
                borderRight={'1px solid'}
                borderColor={'myGray.200'}
              >
                <Flex gap={2}>
                  <MyIcon name={'common/list'} w={5} color={'primary.600'} />
                  <Box
                    fontSize={14}
                    color={'myGray.900'}
                    fontWeight={'medium'}
                  >{`${t('dashboard_evaluation:data_list')}: ${evalDetail?.totalCount}`}</Box>
                </Flex>

                <Button
                  variant={'whiteBase'}
                  leftIcon={<MyIcon name={'export'} w={4} />}
                  onClick={async () => {
                    await exportEval();
                  }}
                  isLoading={isDownloading}
                >
                  {t('dashboard_evaluation:export')}
                </Button>
              </Flex>
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                px={6}
                h={'full'}
                w={1 / 3}
              >
                <Flex gap={2}>
                  <MyIcon name={'common/detail'} w={5} color={'primary.600'} />
                  <Box fontSize={14} color={'myGray.900'} fontWeight={'medium'}>
                    {t('dashboard_evaluation:detail')}
                  </Box>
                </Flex>
                <Flex gap={2}>
                  {/* <IconButton
                    aria-label="edit"
                    size={'mdSquare'}
                    variant={'whiteBase'}
                    icon={<MyIcon name={'edit'} w={4} />}
                    onClick={() => {
                      console.log(evalItemsList[seletedIndex]);
                    }}
                  />
                  <IconButton
                    aria-label="restroe"
                    size={'mdSquare'}
                    variant={'whiteBase'}
                    icon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                  /> */}
                  <PopoverConfirm
                    Trigger={
                      <IconButton
                        aria-label="delete"
                        size={'mdSquare'}
                        variant={'whiteDanger'}
                        isLoading={isLoadingDelete}
                        icon={<MyIcon name={'delete'} w={4} />}
                      />
                    }
                    type="delete"
                    content={t('dashboard_evaluation:comfirm_delete_item')}
                    onConfirm={() =>
                      delEvalItem({ evalItemId: evalItemsList[seletedIndex].evalItemId })
                    }
                  />
                </Flex>
              </Flex>
            </Flex>
            <Flex flex={1} h={'calc(100% - 64px)'} overflow={'hidden'}>
              <Flex h={'full'} w={2 / 3} borderRight={'1px solid'} borderColor={'myGray.200'}>
                <Box h={5} />

                <Box w="full">
                  <Flex
                    h={10}
                    alignItems={'center'}
                    borderBottom="1px solid"
                    borderColor="myGray.200"
                    fontSize={14}
                    color={'myGray.600'}
                    mx={6}
                    mt={5}
                  >
                    <Box flex={3} px={4} borderRight={'1px solid'} borderColor={'myGray.200'}>
                      {t('dashboard_evaluation:question')}
                    </Box>
                    <Box flex={2} px={4} borderRight={'1px solid'} borderColor={'myGray.200'}>
                      {t('dashboard_evaluation:stauts')}
                    </Box>
                    <Box flex={2} px={4}>
                      {t('dashboard_evaluation:Overall_score')}
                    </Box>
                  </Flex>
                  <ScrollData px={6} w={'full'}>
                    {evalItemsList.map((item, index) => {
                      const formattedStatus = formatEvaluationStatus(item, t);

                      return (
                        <Flex
                          key={index}
                          py={3}
                          fontSize={'14px'}
                          border={'1px solid'}
                          borderColor={index === seletedIndex ? 'primary.600' : 'transparent'}
                          borderBottomColor={index !== seletedIndex ? 'myGray.100' : ''}
                          _hover={{ borderRadius: '8px', borderColor: 'primary.600' }}
                          borderRadius={index === seletedIndex ? '8px' : '0'}
                          cursor={'pointer'}
                          onClick={() => setSelectedIndex(index)}
                        >
                          <Box flex={3} px={4}>
                            <Flex gap={2}>
                              <Box color="myGray.500">
                                {index < 9 ? `0${index + 1}` : index + 1}
                              </Box>
                              <Box noOfLines={3} textOverflow="ellipsis" overflow="hidden">
                                {item.question}
                              </Box>
                            </Flex>
                          </Box>
                          <Box flex={2} px={4}>
                            {formattedStatus}
                          </Box>
                          <Box flex={2} px={4} color={'myGray.600'}>
                            {((item.score || 0) * 100).toFixed(2)}
                          </Box>
                        </Flex>
                      );
                    })}
                    <Box h={10} />
                  </ScrollData>
                </Box>
              </Flex>
              <Flex
                fontSize={'14px'}
                w={1 / 3}
                px={6}
                py={6}
                flexDirection={'column'}
                overflow={'auto'}
              >
                {evalItemsList[seletedIndex]?.errorMessage && (
                  <Box
                    p={4}
                    bg={'red.50'}
                    border={'1px solid'}
                    borderColor={'red.200'}
                    borderRadius={'12px'}
                    color={'red.600'}
                    mb={5}
                  >
                    {evalItemsList[seletedIndex]?.errorMessage}
                  </Box>
                )}
                <Box borderBottom={'1px solid'} borderColor={'myGray.200'} pb={5}>
                  <Box>{t('dashboard_evaluation:question')}</Box>
                  <Box color={'myGray.900'} mt={3}>
                    {evalItemsList[seletedIndex]?.question}
                  </Box>
                </Box>

                <Box borderBottom={'1px solid'} borderColor={'myGray.200'} py={5}>
                  <Box>{t('dashboard_evaluation:standard_response')}</Box>
                  <Box color={'myGray.900'} mt={3}>
                    {evalItemsList[seletedIndex]?.expectedResponse}
                  </Box>
                </Box>

                <Box borderBottom={'1px solid'} borderColor={'myGray.200'} py={5}>
                  <Box>{t('dashboard_evaluation:app_response')}</Box>
                  <Box color={'myGray.900'} mt={3}>
                    {evalItemsList[seletedIndex]?.response}
                  </Box>
                </Box>
              </Flex>
            </Flex>
          </Box>
        </ModalBody>
      </MyModal>
    </>
  );
};

export default EvaluationDetailModal;
