'use client';
import { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, GridItem, Skeleton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import LicenseInput from '@/components/admin/License/Input';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const formatDate = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const isLicenseExpiringSoon = (expiredTime?: string, licenseType?: string) => {
  if (!expiredTime) return false;
  const now = new Date();
  const expiration = new Date(expiredTime);
  if (Number.isNaN(expiration.getTime()) || expiration <= now) return false;

  const threshold = new Date(now);
  // 试用版预警窗口为 10 天，商业版按自然月计算，和续期策略保持一致。
  if (licenseType === 'trial') {
    threshold.setDate(threshold.getDate() + 10);
  } else {
    threshold.setMonth(threshold.getMonth() + 1);
  }
  return expiration <= threshold;
};

/** 管理员首页的 License 概览，按设计稿展示租户信息、额度和授权能力。 */
const AdminHome = () => {
  const { licenseData, licenseLoading } = useSystemStore();
  const { t } = useClientTranslation('admin_plugin');
  const [showLicenseInput, setShowLicenseInput] = useState(false);
  const isActivated = Boolean(licenseData) && !licenseLoading;
  const isExpiringSoon =
    isActivated && isLicenseExpiringSoon(licenseData?.expiredTime, licenseData?.licenseType);
  const limits = licenseData?.limits;
  const company = licenseData?.company ?? t('admin_plugin:license_current_tenant');
  const avatarText = useMemo(() => {
    const latin = company
      .match(/[A-Za-z]/g)
      ?.join('')
      .slice(0, 2);
    return (latin || company.slice(0, 2) || 'VI').toUpperCase();
  }, [company]);
  const capabilities = [
    { label: t('admin_plugin:license_sso'), enabled: Boolean(licenseData?.functions?.sso) },
    { label: t('admin_plugin:license_pay'), enabled: Boolean(licenseData?.functions?.pay) },
    {
      label: t('admin_plugin:license_templates'),
      enabled: Boolean(licenseData?.functions?.customTemplates || licenseData?.functions?.portal)
    },
    {
      label: t('admin_plugin:license_dataset_enhance'),
      enabled: Boolean(licenseData?.functions?.datasetEnhance)
    }
  ];

  return (
    <Box h="100%" overflow="auto" bg="white" color="myGray.900">
      <Flex
        h="63px"
        alignItems="center"
        gap={4}
        px={6}
        borderBottom="1px solid"
        borderColor="myGray.200"
      >
        <Box fontSize="16px" fontWeight="600" lineHeight="1.2" whiteSpace="nowrap">
          {t('admin_plugin:license_admin_home')}
        </Box>
        <Box color="myGray.500" fontSize="12px">
          {t('admin_plugin:license_admin_home_description')}
        </Box>
      </Flex>

      <Box p={6}>
        <Box border="1px solid" h="104px" borderColor="myGray.200" borderRadius="8px" p={6}>
          <Grid
            alignItems="center"
            gap={{ base: 5, md: 7 }}
            templateColumns={{ base: '1fr', md: 'minmax(0, 1.35fr) 1px minmax(260px, 1fr) auto' }}
          >
            <Flex alignItems="center" gap={3} minW={0} flex="1 1 420px">
              <Flex
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
                w="36px"
                h="36px"
                borderRadius="50%"
                bg="linear-gradient(145deg, #5d8cff 0%, #4b7bf5 100%)"
                color="white"
                fontSize="12px"
                fontWeight="500"
              >
                {avatarText.slice(0, 2)}
              </Flex>
              <Box minW={0}>
                <Box color="myGray.500" fontSize="12px" mb={0.5}>
                  {t('admin_plugin:license_tenant_name')}
                </Box>
                <Flex alignItems="center" gap="10px" flexWrap="wrap">
                  <Box fontSize="24px" fontWeight="600" lineHeight="1.25" noOfLines={1}>
                    {licenseLoading ? <Skeleton w="260px" h="38px" /> : company}
                  </Box>
                  <Box
                    px={3}
                    py={1}
                    borderRadius="18px"
                    bg="blue.50"
                    color="primary.600"
                    fontSize="11px"
                    fontWeight={500}
                    whiteSpace="nowrap"
                  >
                    {licenseData?.licenseType === 'trial'
                      ? t('admin_plugin:license_trial')
                      : t('admin_plugin:license_business')}
                  </Box>
                </Flex>
              </Box>
            </Flex>

            <Box
              h="56px"
              borderLeft="1px solid"
              borderColor="myGray.200"
              display={{ base: 'none', md: 'block' }}
            />
            <Box flex="1 1 360px">
              <Box
                color={isExpiringSoon ? 'orange.600' : isActivated ? 'primary.600' : 'red.600'}
                fontSize="11px"
                mb={4}
                h={'16px'}
              >
                <Box
                  as="span"
                  display="inline-block"
                  w="6px"
                  h="6px"
                  mr={2}
                  borderRadius="50%"
                  bg={isExpiringSoon ? 'orange.500' : isActivated ? 'primary.500' : 'red.500'}
                />
                {isExpiringSoon
                  ? t('admin_plugin:license_expiring_soon')
                  : isActivated
                    ? t('admin_plugin:license_active')
                    : t('admin_plugin:license_inactive')}
              </Box>
              <Flex alignItems="center" gap={4}>
                <Box color="myGray.500" fontSize="12px">
                  {t('admin_plugin:license_expires_at')}
                </Box>
                <Box fontSize="24px" fontWeight="500" lineHeight="1">
                  {formatDate(licenseData?.expiredTime)}
                </Box>
              </Flex>
            </Box>
            <Button
              variant={isExpiringSoon ? 'primary' : 'outline'}
              color={isExpiringSoon ? 'white' : 'primary.600'}
              borderColor={isExpiringSoon ? 'primary.500' : 'primary.300'}
              borderRadius="6px"
              py={2}
              px={'14px'}
              fontSize="14px"
              leftIcon={<MyIcon name="common/settingLight" w="18px" />}
              onClick={() => setShowLicenseInput(true)}
            >
              {isActivated ? t('admin_plugin:license_change') : t('admin_plugin:license_activate')}
            </Button>
          </Grid>
        </Box>

        <Box mt={4}>
          <Box fontSize="16px" fontWeight="600" color="myGray.700" mb={2}>
            {t('admin_plugin:license_limits')}
          </Box>
          <Grid
            h="98px"
            templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}
            border="1px solid"
            borderColor="myGray.200"
            borderRadius="8px"
            p={6}
          >
            {[
              [t('admin_plugin:license_max_users'), limits?.maxUsers],
              [t('admin_plugin:license_max_apps'), limits?.maxApps],
              [t('admin_plugin:license_max_datasets'), limits?.maxDatasets]
            ].map(([label, value], index) => (
              <GridItem
                key={label}
                pl={index === 0 ? 0 : 6}
                borderLeft={index === 0 ? 'none' : '1px solid'}
                borderColor="myGray.200"
              >
                <Box color="myGray.500" fontSize="12px" mb={'2px'}>
                  {label}
                </Box>
                <Box fontSize="24px" fontWeight="600">
                  {typeof value === 'number' && value > 0
                    ? value
                    : t('admin_plugin:license_unlimited')}
                </Box>
              </GridItem>
            ))}
          </Grid>
        </Box>

        <Box mt={4}>
          <Box fontSize="16px" fontWeight="600" color="myGray.700" mb={2}>
            {t('admin_plugin:license_capabilities')}
          </Box>
          <Grid templateColumns={'1fr 1fr'} gap={'10px'}>
            {capabilities.map(({ label, enabled }) => (
              <Flex
                key={label}
                alignItems="center"
                gap={'11px'}
                h="50px"
                px={4}
                border="1px solid"
                borderColor="myGray.200"
                borderRadius="8px"
                color={enabled ? 'myGray.700' : 'myGray.400'}
              >
                <Flex
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  w="24px"
                  h="24px"
                  borderRadius="50%"
                  bg={enabled ? 'blue.50' : 'myGray.100'}
                >
                  {enabled ? (
                    <MyIcon name="common/check" w="16px" color="primary.500" />
                  ) : (
                    <MyIcon name="common/closeLight" w="16px" color="myGray.400" />
                  )}
                </Flex>
                <Box fontSize="16px" fontWeight="500">
                  {label}
                </Box>
              </Flex>
            ))}
          </Grid>
        </Box>
      </Box>

      {showLicenseInput && <LicenseInput onClose={() => setShowLicenseInput(false)} />}
    </Box>
  );
};

export default AdminHome;
