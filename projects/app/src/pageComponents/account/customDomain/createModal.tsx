import {
  ModalBody,
  Box,
  Radio,
  Flex,
  Text,
  Input,
  InputGroup,
  InputRightElement,
  Tag,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  IconButton,
  Button,
  ModalFooter,
  Link
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation, Trans } from 'next-i18next';
import Icon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { useEffect, useMemo, useState } from 'react';
import { providerMap } from '@/web/support/customDomain/const';
import type { ProviderEnum } from '@fastgpt/global/support/customDomain/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { generateCNAMEDomain } from '@fastgpt/global/support/customDomain/utils';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  activeCustomDomain,
  checkCustomDomainDNSResolve,
  createCustomDomain
} from '@/web/support/customDomain/api';
import { getDocPath } from '@/web/common/system/doc';

const ProviderItem = ({
  icon,
  selected,
  onClick,
  isDisabled
}: {
  icon: IconNameType;
  selected: boolean;
  onClick: () => void;
  isDisabled: boolean;
}) => {
  return (
    <Flex
      flex="1"
      paddingInline="32px"
      paddingBlock="12px"
      alignItems="center"
      justifyContent="start"
      gap="8px"
      border="1px solid"
      borderColor={'blue.600'}
      borderRadius="sm"
      {...(selected
        ? {
            backgroundColor: 'blue.50'
          }
        : {})}
      onClick={isDisabled ? undefined : onClick}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
    >
      <Radio isChecked={selected} />
      <Icon name={icon} padding={'11px'} h="20px" w="100px" />
    </Flex>
  );
};

function CreateCustomDomainModal<T extends 'create' | 'refresh'>({
  onClose,
  type,
  data
}: {
  onClose: () => void;
  type: T;
  data?: T extends 'refresh'
    ? {
        domain: string;
        provider: ProviderEnum;
        cnameDomain: string;
      }
    : undefined;
}) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { copyData } = useCopyData();

  const [provider, setProvider] = useState<ProviderEnum>('tencent');
  const [domain, setDomain] = useState<string>('');
  const [editDomain, setEditDomain] = useState<boolean>(true);

  useEffect(() => {
    if (type === 'refresh') {
      setProvider(data?.provider || 'tencent');
      setDomain(data?.domain || '');
    }
  }, [data, type]);

  const cnameDomain = useMemo(() => {
    if (type === 'refresh') {
      return data?.cnameDomain!;
    }
    const domain = feConfigs?.customDomain?.domain?.[provider];
    if (domain) {
      return generateCNAMEDomain(domain);
    }
    return '';
  }, [data?.cnameDomain, feConfigs?.customDomain?.domain, provider, type]);

  const [DnsResolved, setDnsResolved] = useState<boolean>(false);
  const [startDnsResolve, setStartDnsResolve] = useState<boolean>(type === 'create');

  const { runAsync: checkDNSResolve } = useRequest2(
    () => checkCustomDomainDNSResolve({ cnameDomain, domain }),
    {
      manual: true,
      throttleWait: 4000,
      onSuccess: (data) => {
        setDnsResolved(data.success === true);
      }
    }
  );

  const { runAsync: activeDomain } = useRequest2(activeCustomDomain, {
    manual: true,
    onSuccess: () => onClose(),
    successToast: t('common:Success')
  });

  const { runAsync: createDomain, loading: loadingCreatingDomain } = useRequest2(
    createCustomDomain,
    {
      manual: true,
      onSuccess: () => onClose(),
      successToast: t('common:Success')
    }
  );

  // auto trigger checkDNSResolve per 5s
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (domain && !editDomain && !DnsResolved && startDnsResolve) checkDNSResolve();
    }, 5000);
    return () => clearInterval(intervalId);
  }, [DnsResolved, checkDNSResolve, cnameDomain, domain, editDomain, startDnsResolve]);

  useEffect(() => {
    if (domain && provider) {
      setDnsResolved(false);
    }
  }, [domain, provider]);

  const loading = loadingCreatingDomain;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/globalLine"
      title={t('account:custom_domain')}
      minW="800px"
    >
      <ModalBody>
        <Box fontWeight="500" color="gray.900">
          {t('account:custom_domain.provider')}
        </Box>
        <Flex flexDirection="row" gap="16px" w="100%" marginTop={'10px'}>
          <ProviderItem
            icon="support/account/customDomain/provider/tencent"
            selected={provider === 'tencent'}
            onClick={() => setProvider('tencent')}
            isDisabled={!editDomain || type === 'refresh'}
          />
          <ProviderItem
            icon="support/account/customDomain/provider/aliyun"
            selected={provider === 'aliyun'}
            onClick={() => setProvider('aliyun')}
            isDisabled={!editDomain || type === 'refresh'}
          />
          <ProviderItem
            icon="support/account/customDomain/provider/volcengine"
            selected={provider === 'volcengine'}
            onClick={() => setProvider('volcengine')}
            isDisabled={!editDomain || type === 'refresh'}
          />
        </Flex>
        <Box marginTop={'16px'} fontSize={'sm'} color={'gray.600'}>
          <Trans
            i18nKey="account:custom_domain.registration_hint"
            values={{ provider: t(providerMap[provider]) }}
            components={{ bold: <Text as="span" fontWeight="bold" color="gray.900" /> }}
          />
        </Box>
        <Flex marginTop={'16px'} alignItems="center">
          <InputGroup>
            <Input
              h="40px"
              placeholder="www.example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              isDisabled={!editDomain || type === 'refresh'}
            />
            <InputRightElement width="auto" paddingRight={'8px'}>
              {!editDomain && domain && startDnsResolve ? (
                DnsResolved ? (
                  <Tag colorScheme="green" size="sm">
                    {t('account:custom_domain.dns_resolved')}
                  </Tag>
                ) : (
                  <Tag colorScheme="red" size="sm">
                    {t('account:custom_domain.dns_resolving')}
                  </Tag>
                )
              ) : (
                <></>
              )}
            </InputRightElement>
          </InputGroup>
          <Button
            variant="whiteBase"
            marginLeft={'8px'}
            h={'40px'}
            onClick={() => {
              if (type === 'create') {
                setEditDomain(!editDomain);
              } else {
                checkDNSResolve();
                setStartDnsResolve(true);
              }
            }}
          >
            {type === 'create'
              ? editDomain
                ? t('common:Save')
                : t('common:Edit')
              : t('common:refresh')}
          </Button>
        </Flex>

        <Flex
          padding="16px"
          borderRadius={'12px'}
          border="1px dashed"
          borderColor="#A1A1AA"
          w="full"
          marginTop="24px"
          flexDir="column"
        >
          <Box fontWeight="500" color="gray.900">
            {t('account:custom_domain.DNS_record')}
          </Box>
          <Box marginTop={'16px'} fontSize={'sm'} color={'gray.600'}>
            <Trans
              i18nKey="account:custom_domain.DNS_resolve_hint"
              values={{ domain: cnameDomain }}
              components={{ bold: <Text as="span" fontWeight="bold" color="gray.900" /> }}
            />
          </Box>
          <Table size="sm" marginTop={'16px'} w="full">
            <Thead>
              <Tr>
                <Th>{t('account:custom_domain.DNS_record.type')}</Th>
                <Th>TTL</Th>
                <Th>{t('common:value')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td>CNAME</Td>
                <Td>Auto</Td>
                <Td>
                  <Flex alignItems="center" gap={2} justifyContent="space-between">
                    <Text>{cnameDomain}</Text>
                    <IconButton
                      icon={<Icon name="copy" w="14px" />}
                      aria-label="copy"
                      size="xs"
                      variant="ghost"
                      onClick={() => copyData(cnameDomain || '')}
                    />
                  </Flex>
                </Td>
              </Tr>
            </Tbody>
          </Table>

          <Link
            href={
              feConfigs.openAPIDocUrl ||
              getDocPath('/docs/introduction/guide/team_permissions/customDomain')
            }
            target={'_blank'}
            mt="2"
            ml="2"
            color={'primary.500'}
            fontSize={'sm'}
          >
            <Flex alignItems={'center'}>
              <Icon w={'17px'} h={'17px'} name="book" mr="1" />
              {t('common:read_doc')}
            </Flex>
          </Link>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose} colorScheme="gray" variant="outline" mr={3}>
          {t('common:Cancel')}
        </Button>
        <Button
          onClick={() => {
            if (type === 'create') {
              return createDomain({
                cnameDomain,
                domain,
                provider
              });
            }
            return activeDomain(domain);
          }}
          colorScheme="blue"
          isLoading={loading}
          isDisabled={!DnsResolved}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default CreateCustomDomainModal;
