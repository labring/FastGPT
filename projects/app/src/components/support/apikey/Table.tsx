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
  MenuList,
  MenuItem,
  MenuButton,
  Menu
} from '@chakra-ui/react';
import {
  getOpenApiKeys,
  createAOpenApiKey,
  delOpenApiById,
  putOpenApiKey
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLoading } from '@/web/common/hooks/useLoading';
import dayjs from 'dayjs';
import { AddIcon, QuestionOutlineIcon } from '@chakra-ui/icons';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@/components/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/web/common/hooks/useRequest';
import MyTooltip from '@/components/MyTooltip';
import { getDocPath } from '@/web/common/system/doc';
import MyMenu from '@/components/MyMenu';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  limit: {
    credit: -1
  }
};

const ApiKeyTable = ({ tips, appId }: { tips: string; appId?: string }) => {
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const [baseUrl, setBaseUrl] = useState('https://fastgpt.in/api');
  const [editData, setEditData] = useState<EditProps>();
  const [apiKey, setApiKey] = useState('');

  const { mutate: onclickRemove, isLoading: isDeleting } = useMutation({
    mutationFn: async (id: string) => delOpenApiById(id),
    onSuccess() {
      refetch();
    }
  });

  const {
    data: apiKeys = [],
    isLoading: isGetting,
    refetch
  } = useQuery(['getOpenApiKeys', appId], () => getOpenApiKeys({ appId }));

  useEffect(() => {
    setBaseUrl(feConfigs?.customApiDomain || `${location.origin}/api`);
  }, []);

  return (
    <Flex flexDirection={'column'} h={'100%'} position={'relative'}>
      <Box display={['block', 'flex']} py={[0, 3]} px={5} alignItems={'center'}>
        <Box flex={1}>
          <Flex alignItems={'flex-end'}>
            <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
              {t('support.openapi.Api manager')}
            </Box>
            {feConfigs?.docUrl && (
              <Link
                href={feConfigs.openAPIDocUrl || getDocPath('/docs/development/openapi')}
                target={'_blank'}
                ml={1}
                color={'primary.500'}
              >
                {t('common.Read document')}
              </Link>
            )}
          </Flex>
          <Box fontSize={'sm'} color={'myGray.600'}>
            {tips}
          </Box>
        </Box>
        <Flex
          mt={[2, 0]}
          bg={'myWhite.600'}
          py={2}
          px={4}
          borderRadius={'md'}
          cursor={'pointer'}
          userSelect={'none'}
          onClick={() => copyData(baseUrl, t('support.openapi.Copy success'))}
        >
          <Box border={theme.borders.md} px={2} borderRadius={'md'} fontSize={'sm'}>
            {t('support.openapi.Api baseurl')}
          </Box>
          <Box ml={2} color={'myGray.900'} fontSize={['sm', 'md']}>
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
            {t('common.New Create')}
          </Button>
        </Box>
      </Box>
      <TableContainer mt={2} position={'relative'} minH={'300px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('Name')}</Th>
              <Th>Api Key</Th>
              <Th>{t('support.openapi.Usage')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('support.openapi.Max usage')}</Th>
                  <Th>{t('common.Expired Time')}</Th>
                </>
              )}

              <Th>{t('common.Create Time')}</Th>
              <Th>{t('common.Last use time')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map(({ _id, name, usage, limit, apiKey, createTime, lastUsedTime }) => (
              <Tr key={_id}>
                <Td>{name}</Td>
                <Td>{apiKey}</Td>
                <Td>{usage}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>
                      {limit?.credit && limit?.credit > -1
                        ? `${limit?.credit}`
                        : t('common.Unlimited')}
                    </Td>
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
                    : t('common.Un used')}
                </Td>
                <Td>
                  <MyMenu
                    offset={[-50, 5]}
                    Button={
                      <MyIcon
                        name={'more'}
                        w={'14px'}
                        p={2}
                        _hover={{ bg: 'myWhite.600  ' }}
                        cursor={'pointer'}
                        borderRadius={'md'}
                      />
                    }
                    menuList={[
                      {
                        label: t('common.Edit'),
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
                        label: t('common.Delete'),
                        icon: 'delete',
                        onClick: () => onclickRemove(_id)
                      }
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        <Loading loading={isGetting || isDeleting} fixed={false} />
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
      <MyModal
        isOpen={!!apiKey}
        w={['400px', '600px']}
        iconSrc="/imgs/modal/key.svg"
        title={
          <Box>
            <Box fontWeight={'bold'} fontSize={'xl'}>
              {t('support.openapi.New api key')}
            </Box>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('support.openapi.New api key tip')}
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
            onClick={() => copyData(apiKey)}
          >
            <Box flex={1}>{apiKey}</Box>
            <MyIcon ml={1} name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={() => setApiKey('')}>
            {t('common.OK')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
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
    errorToast: '创建链接异常',
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: EditProps) => {
      //@ts-ignore
      return putOpenApiKey(e);
    },
    errorToast: '更新链接异常',
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/key.svg"
      title={isEdit ? t('outlink.Edit API Key') : t('outlink.Create API Key')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 90px'}>{t('Name')}:</Box>
          <Input
            placeholder={t('openapi.key alias') || 'key alias'}
            maxLength={20}
            {...register('name', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        {feConfigs?.isPlus && (
          <>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('common.Max credit')}:
                <MyTooltip label={t('common.Max credit tips' || '')}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                {...register('limit.credit', {
                  min: -1,
                  max: 1000,
                  valueAsNumber: true,
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('common.Expired Time')}:
              </Flex>
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
          {t('common.Close')}
        </Button>

        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}
