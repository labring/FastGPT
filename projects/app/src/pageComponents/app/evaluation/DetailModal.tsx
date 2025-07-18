import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  Box,
  Button,
  Flex,
  IconButton,
  ModalBody,
  Textarea,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Input
} from '@chakra-ui/react';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  deleteEvalItem,
  getEvalItemsList,
  retryEvalItem,
  updateEvalItem
} from '@/web/core/app/api/evaluation';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { downloadFetch } from '@/web/common/system/utils';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { type TFunction } from 'i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useForm } from 'react-hook-form';
import {
  EvaluationStatusMap,
  EvaluationStatusEnum
} from '@fastgpt/global/core/app/evaluation/constants';
import type { evaluationType, listEvalItemsItem } from '@fastgpt/global/core/app/evaluation/type';
import type {
  retryEvalItemBody,
  updateEvalItemBody
} from '@fastgpt/global/core/app/evaluation/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const formatEvaluationStatus = (item: { status: number; errorMessage?: string }, t: TFunction) => {
  if (item.errorMessage) {
    return (
      <Box color="red.600" fontWeight={'medium'}>
        {t('dashboard_evaluation:error')}
      </Box>
    );
  }

  const statusConfig = {
    [EvaluationStatusEnum.queuing]: {
      color: 'myGray.500',
      key: t('dashboard_evaluation:queuing')
    },
    [EvaluationStatusEnum.evaluating]: {
      color: 'primary.600',
      key: t('dashboard_evaluation:evaluating')
    },
    [EvaluationStatusEnum.completed]: {
      color: 'green.600',
      key: t('dashboard_evaluation:completed')
    }
  };

  const config = statusConfig[item.status as keyof typeof statusConfig] || null;
  if (!config) return null;

  return (
    <Box color={config.color} fontWeight={'medium'}>
      {config.key}
    </Box>
  );
};

const EvaluationDetailModal = ({
  evalDetail,
  onClose,
  fetchEvalList
}: {
  evalDetail: evaluationType;
  onClose: () => void;
  fetchEvalList: () => void;
}) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);

  const { llmModelList } = useSystemStore();
  const modelData = useMemo(
    () => getModelFromList(llmModelList, evalDetail.evalModel),
    [evalDetail.evalModel]
  );

  const {
    data: evalItemsList,
    ScrollData,
    fetchData
  } = useScrollPagination(getEvalItemsList, {
    pageSize: 20,
    params: {
      evalId: evalDetail._id
    },
    pollingInterval: 5000
  });
  const evalItem = evalItemsList[selectedIndex] || null;

  const statusMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(EvaluationStatusMap).map(([key, config]) => [
          key,
          { label: t(config.name as any) }
        ])
      ),
    [t]
  );

  const { runAsync: exportEval, loading: isDownloading } = useRequest2(async () => {
    await downloadFetch({
      url: `/api/proApi/core/app/evaluation/exportItems?evalId=${evalDetail._id}`,
      filename: `${evalDetail.name}.csv`,
      body: {
        title: t('dashboard_evaluation:evaluation_export_title'),
        statusMap
      }
    });
  });

  const { runAsync: delEvalItem, loading: isLoadingDelete } = useRequest2(
    async (data: { evalItemId: string }) => {
      await deleteEvalItem(data);
    },
    {
      onSuccess: () => {
        fetchData({ init: false, isPolling: true });
        fetchEvalList();
      }
    }
  );

  const { runAsync: rerunItem, loading: isLoadingRerun } = useRequest2(
    async (data: retryEvalItemBody) => {
      await retryEvalItem(data);
    },
    {
      onSuccess: () => {
        fetchData({ init: false, isPolling: true });
        fetchEvalList();
      }
    }
  );

  const { runAsync: updateItem, loading: isLoadingUpdate } = useRequest2(
    async (data: updateEvalItemBody) => {
      await updateEvalItem({ ...data, evalItemId: evalItem.evalItemId });
    },
    {
      onSuccess: () => {
        fetchData({ init: false, isPolling: true });
        fetchEvalList();
      }
    }
  );

  const { register, handleSubmit } = useForm<updateEvalItemBody>();

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
        isLoading={isLoadingUpdate || isLoadingRerun || isLoadingDelete}
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
              <Flex color={'myGray.900'} fontWeight={'medium'} alignItems={'center'}>
                {evalDetail?.completedCount}
                <Box color={'myGray.600'} mr={2}>{`/${evalDetail?.totalCount}`}</Box>
                {evalDetail?.errorMessage && (
                  <MyTooltip label={t('common:code_error.team_error.ai_points_not_enough')}>
                    <Flex alignItems={'center'}>
                      <Box fontWeight={'medium'} color={'adora.600'} fontSize={'12px'}>
                        {t('dashboard_evaluation:paused')}
                      </Box>
                      <MyIcon name={'common/help'} w={4} color={'adora.600'} ml={0.5} />
                    </Flex>
                  </MyTooltip>
                )}
              </Flex>
            </Box>
            <Box>
              <Box mb={3} color={'myGray.600'}>
                {t('dashboard_evaluation:Overall_score')}
              </Box>
              <Box color={'myGray.900'} fontWeight={'medium'}>
                {evalDetail.score ? (evalDetail?.score * 100).toFixed(2) : '-'}
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
                  variant={'whitePrimary'}
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
                {evalItem && (
                  <Flex gap={2}>
                    {(evalItem.status === EvaluationStatusEnum.queuing ||
                      !!evalItem.errorMessage) && (
                      <>
                        {editing ? (
                          <Button
                            fontSize={12}
                            onClick={handleSubmit(async (data) => {
                              await updateItem(data);
                              setEditing(false);
                            })}
                          >
                            {t('common:Save')}
                          </Button>
                        ) : (
                          <IconButton
                            aria-label="edit"
                            size={'mdSquare'}
                            variant={'whitePrimary'}
                            icon={<MyIcon name={'edit'} w={4} />}
                            onClick={() => {
                              setEditing(true);
                            }}
                          />
                        )}
                      </>
                    )}
                    {evalItem.status === EvaluationStatusEnum.completed && (
                      <IconButton
                        aria-label="restroe"
                        size={'mdSquare'}
                        variant={'whitePrimary'}
                        icon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                        onClick={() => {
                          rerunItem({
                            evalItemId: evalItem.evalItemId
                          });
                        }}
                      />
                    )}
                    <PopoverConfirm
                      Trigger={
                        <IconButton
                          aria-label="delete"
                          size={'mdSquare'}
                          variant={'whiteDanger'}
                          icon={<MyIcon name={'delete'} w={4} />}
                        />
                      }
                      type="delete"
                      content={t('dashboard_evaluation:comfirm_delete_item')}
                      onConfirm={() => delEvalItem({ evalItemId: evalItem.evalItemId })}
                    />
                  </Flex>
                )}
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
                    {evalItemsList.map((item: listEvalItemsItem, index: number) => {
                      const formattedStatus = formatEvaluationStatus(item, t);

                      return (
                        <Flex
                          key={index}
                          py={3}
                          fontSize={'14px'}
                          border={'1px solid'}
                          borderColor={index === selectedIndex ? 'primary.600' : 'transparent'}
                          borderBottomColor={index !== selectedIndex ? 'myGray.100' : ''}
                          _hover={{ borderRadius: '8px', borderColor: 'primary.600' }}
                          borderRadius={index === selectedIndex ? '8px' : '0'}
                          cursor={'pointer'}
                          onClick={() => {
                            setSelectedIndex(index);
                            setEditing(false);
                          }}
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
              {evalItem ? (
                <Flex
                  fontSize={'14px'}
                  w={1 / 3}
                  px={6}
                  py={6}
                  flexDirection={'column'}
                  overflow={'auto'}
                >
                  {!editing && evalItem?.errorMessage && (
                    <Box
                      p={4}
                      bg={'red.50'}
                      border={'1px solid'}
                      borderColor={'red.200'}
                      borderRadius={'12px'}
                      color={'red.600'}
                      mb={5}
                    >
                      {evalItem?.errorMessage}
                    </Box>
                  )}
                  {Object.keys(evalItem?.globalVariables || {}).length > 0 && (
                    <Box borderBottom={'1px solid'} borderColor={'myGray.200'} mb={5}>
                      <Accordion allowToggle defaultIndex={[0]}>
                        <AccordionItem border={'none'}>
                          <AccordionButton
                            px={0}
                            py={2}
                            _hover={{ bg: 'transparent' }}
                            justifyContent={'flex-start'}
                          >
                            <Box flex="1" textAlign="left" fontSize={14}>
                              {t('dashboard_evaluation:variables')}
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                          <AccordionPanel px={0} py={3}>
                            {Object.entries(evalItem?.globalVariables || {}).map(
                              ([key, value], index, arr) => (
                                <Flex
                                  key={key}
                                  border={'1px solid'}
                                  borderColor={'myGray.200'}
                                  borderTopLeftRadius={index === 0 ? 'sm' : 0}
                                  borderTopRightRadius={index === 0 ? 'sm' : 0}
                                  borderBottomLeftRadius={index === arr.length - 1 ? 'sm' : 0}
                                  borderBottomRightRadius={index === arr.length - 1 ? 'sm' : 0}
                                >
                                  <Box
                                    w={1 / 3}
                                    borderRight={'1px solid'}
                                    borderColor={'myGray.200'}
                                    py={2}
                                    px={3}
                                  >
                                    {key}
                                  </Box>
                                  <Box w={2 / 3}>
                                    {editing ? (
                                      <Input
                                        {...register(`variables.${key}`)}
                                        bg={'myGray.25'}
                                        defaultValue={value}
                                        border={'none'}
                                      />
                                    ) : (
                                      <Box color={'myGray.900'} px={3} py={2}>
                                        {value}
                                      </Box>
                                    )}
                                  </Box>
                                </Flex>
                              )
                            )}
                          </AccordionPanel>
                        </AccordionItem>
                      </Accordion>
                    </Box>
                  )}
                  <Box borderBottom={'1px solid'} borderColor={'myGray.200'} pb={5}>
                    <Box>{t('dashboard_evaluation:question')}</Box>
                    {editing ? (
                      <Textarea
                        {...register('question')}
                        bg={'myGray.25'}
                        defaultValue={evalItem?.question}
                      />
                    ) : (
                      <Box color={'myGray.900'} mt={3}>
                        {evalItem?.question}
                      </Box>
                    )}
                  </Box>

                  <Box borderBottom={'1px solid'} borderColor={'myGray.200'} py={5}>
                    <Box>{t('dashboard_evaluation:standard_response')}</Box>
                    {editing ? (
                      <Textarea
                        {...register('expectedResponse')}
                        bg={'myGray.25'}
                        defaultValue={evalItem?.expectedResponse}
                      />
                    ) : (
                      <Box color={'myGray.900'} mt={3}>
                        {evalItem?.expectedResponse}
                      </Box>
                    )}
                  </Box>

                  {!editing && (
                    <Box borderBottom={'1px solid'} borderColor={'myGray.200'} py={5}>
                      <Box>{t('dashboard_evaluation:app_response')}</Box>
                      <Box color={'myGray.900'} mt={3}>
                        {evalItem?.response}
                      </Box>
                    </Box>
                  )}
                </Flex>
              ) : (
                <EmptyTip w={1 / 3} h={'full'} />
              )}
            </Flex>
          </Box>
        </ModalBody>
      </MyModal>
    </>
  );
};

export default EvaluationDetailModal;
