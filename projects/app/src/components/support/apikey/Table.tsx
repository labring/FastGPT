import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalFooter,
  ModalBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useTheme,
  Link,
  Input,
  IconButton
} from '@chakra-ui/react';
import {
  getOpenApiKeys,
  createAOpenApiKey,
  delOpenApiById,
  putOpenApiKey
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import dayjs from 'dayjs';
import { AddIcon } from '@chakra-ui/icons';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyBox from '@fastgpt/web/components/common/MyBox';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  limit: {
    maxUsagePoints: -1
  }
};

const ApiKeyTable = ({ tips, appId }: { tips: string; appId?: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const [baseUrl, setBaseUrl] = useState('https://tryfastgpt.ai/api');
  const [editData, setEditData] = useState<EditProps>();
  const [apiKey, setApiKey] = useState('');

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('common:delete_api')
  });

  const { runAsync: onclickRemove } = useRequest2(delOpenApiById, {
    onSuccess() {
      refetch();
    }
  });

  const {
    data: apiKeys = [],
    loading: isGetting,
    run: refetch
  } = useRequest2(() => getOpenApiKeys({ appId }), {
    manual: false,
    refreshDeps: [appId]
  });

  useEffect(() => {
    setBaseUrl(feConfigs?.customApiDomain || `${location.origin}/api`);
  }, [feConfigs?.customApiDomain]);

  return (
    <MyBox
      isLoading={isGetting}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
    >
      <Box display={['block', 'flex']} alignItems={'center'}>
        <Box flex={1}>
          <Flex alignItems={'flex-end'}>
            <Box color={'myGray.900'} fontSize={'lg'}>
              {t('common:support.openapi.Api manager')}
            </Box>
            {feConfigs?.docUrl && (
              <Link
                href={feConfigs.openAPIDocUrl || getDocPath('/docs/development/openapi')}
                target={'_blank'}
                ml={1}
                color={'primary.500'}
                fontSize={'sm'}
              >
                {t('common:common.Read document')}
              </Link>
            )}
          </Flex>
          <Box fontSize={'mini'} color={'myGray.600'}>
            {tips}
          </Box>
        </Box>
        <Flex
          mt={[2, 0]}
          bg={'myGray.100'}
          py={2}
          px={4}
          borderRadius={'md'}
          cursor={'pointer'}
          userSelect={'none'}
          onClick={() => copyData(baseUrl, t('common:support.openapi.Copy success'))}
        >
          <Box border={theme.borders.md} px={2} borderRadius={'md'} fontSize={'xs'}>
            {t('common:support.openapi.Api baseurl')}
          </Box>
          <Box ml={2} fontSize={'sm'}>
            {baseUrl}
          </Box>
        </Flex>
        <Box mt={[2, 0]} textAlign={'right'}>
          <Button
            ml={3}
            leftIcon={<AddIcon fontSize={'md'} />}
            variant={'whitePrimary'}
            onClick={() =>
              setEditData({
                ...defaultEditData,
                appId
              })
            }
          >
            {t('common:new_create')}
          </Button>
        </Box>
      </Box>
      <TableContainer mt={3} position={'relative'} minH={'300px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('common:Name')}</Th>
              <Th>Api Key</Th>
              <Th>{t('common:support.outlink.Usage points')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('common:common.Expired Time')}</Th>
                </>
              )}

              <Th>{t('common:common.Create Time')}</Th>
              <Th>{t('common:common.Last use time')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map(({ _id, name, usagePoints, limit, apiKey, createTime, lastUsedTime }) => (
              <Tr key={_id}>
                <Td>{name}</Td>
                <Td>{apiKey}</Td>
                <Td>
                  {Math.round(usagePoints)}/
                  {feConfigs?.isPlus && limit?.maxUsagePoints && limit?.maxUsagePoints > -1
                    ? `${limit?.maxUsagePoints}`
                    : t('common:common.Unlimited')}
                </Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td whiteSpace={'pre-wrap'}>
                      {limit?.expiredTime
                        ? dayjs(limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                        : '-'}
                    </Td>
                  </>
                )}
                <Td whiteSpace={'pre-wrap'}>{dayjs(createTime).format('YYYY/MM/DD\nHH:mm:ss')}</Td>
                <Td whiteSpace={'pre-wrap'}>
                  {lastUsedTime
                    ? dayjs(lastUsedTime).format('YYYY/MM/DD\nHH:mm:ss')
                    : t('common:common.Un used')}
                </Td>
                <Td>
                  <MyMenu
                    offset={[-50, 5]}
                    Button={
                      <IconButton
                        icon={<MyIcon name={'more'} w={'14px'} />}
                        name={'more'}
                        variant={'whitePrimary'}
                        size={'sm'}
                        aria-label={''}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: t('common:common.Edit'),
                            icon: 'edit',
                            onClick: () =>
                              setEditData({
                                _id,
                                name,
                                limit,
                                appId
                              })
                          },
                          {
                            label: t('common:common.Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () => openConfirm(() => onclickRemove(_id))()
                          }
                        ]
                      }
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!!editData && (
        <EditKeyModal
          defaultData={editData}
          onClose={() => setEditData(undefined)}
          onCreate={(id) => {
            setApiKey(id);
            refetch();
            setEditData(undefined);
          }}
          onEdit={() => {
            refetch();
            setEditData(undefined);
          }}
        />
      )}
      <ConfirmModal />
      <MyModal
        isOpen={!!apiKey}
        w={['400px', '600px']}
        iconSrc="/imgs/modal/key.svg"
        title={
          <Box>
            <Box fontWeight={'bold'}>{t('common:support.openapi.New api key')}</Box>
            <Box fontSize={'xs'} color={'myGray.600'}>
              {t('common:support.openapi.New api key tip')}
            </Box>
          </Box>
        }
        onClose={() => setApiKey('')}
      >
        <ModalBody pt={5}>
          <Flex
            bg={'myGray.100'}
            px={3}
            py={2}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            cursor={'pointer'}
            borderRadius={'md'}
            userSelect={'all'}
            onClick={() => copyData(apiKey)}
          >
            <Box flex={1}>{apiKey}</Box>
            <MyIcon ml={1} name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={() => setApiKey('')}>
            {t('common:common.OK')}
          </Button>
        </ModalFooter>
      </MyModal>
    </MyBox>
  );
};

export default React.memo(ApiKeyTable);

// edit link modal
function EditKeyModal({
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  defaultData: EditProps;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);
  const { feConfigs } = useSystemStore();

  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: EditProps) => createAOpenApiKey(e),
    errorToast: t('workflow:create_link_error'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: EditProps) => {
      //@ts-ignore
      return putOpenApiKey(e);
    },
    errorToast: t('workflow:update_link_error'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/key.svg"
      title={isEdit ? t('publish:edit_api_key') : t('publish:create_api_key')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
          <Input
            placeholder={t('publish:key_alias') || 'key_alias'}
            maxLength={20}
            {...register('name', {
              required: t('common:common.name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
        {feConfigs?.isPlus && (
          <>
            <Flex alignItems={'center'} mt={4}>
              <FormLabel display={'flex'} flex={'0 0 90px'} alignItems={'center'}>
                {t('common:support.outlink.Max usage points')}
                <QuestionTip
                  ml={1}
                  label={t('common:support.outlink.Max usage points tip')}
                ></QuestionTip>
              </FormLabel>
              <Input
                {...register('limit.maxUsagePoints', {
                  min: -1,
                  max: 10000000,
                  valueAsNumber: true,
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <FormLabel flex={'0 0 90px'}>{t('common:common.Expired Time')}</FormLabel>
              <Input
                type="datetime-local"
                defaultValue={
                  defaultData.limit?.expiredTime
                    ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
                    : ''
                }
                onChange={(e) => {
                  setValue('limit.expiredTime', new Date(e.target.value));
                }}
              />
            </Flex>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>

        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}
