'use client';
import { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, GridItem, Link, Skeleton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import LicenseInput from '@/components/admin/License/Input';
import { commercialDocUrl } from '@/components/admin/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LicenseFunctionKey } from '@fastgpt/global/common/system/types';
import { getLicenseStatus, LicenseStatusEnum } from '@fastgpt/global/common/system/license/utils';

const formatDate = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

/**
 * 授权能力的展示顺序与文案 key，键取自决策版函数清单（licenseFunctionKeys）。
 *
 * 顺序即界面顺序：先给客户最关心的登录与计费，再是增强类能力。
 * 新增能力时在 licenseFunctionKeys 与本清单各补一项即可，两个清单不一致时由
 * typing 报错提醒，不会静默漏展示某一项授权。
 */
const FUNCTION_CAPABILITY_ITEMS: Array<{
  key: LicenseFunctionKey;
  labelKey: string;
}> = [
  { key: 'sso', labelKey: 'license_sso' },
  { key: 'pay', labelKey: 'license_pay' },
  { key: 'eval', labelKey: 'license_eval' },
  { key: 'datasetEnhance', labelKey: 'license_dataset_enhance' },
  { key: 'assistantGenerate', labelKey: 'license_assistant_generate' },
  { key: 'portal', labelKey: 'license_portal' },
  { key: 'sandboxSkills', labelKey: 'license_sandbox_skills' }
];

/** 无有效授权（尚未激活/已到期）时统一使用的占位符，避免把「不限」误读为真实额度。 */
const PLACEHOLDER = '--';

/** 四态对应的徽标文案与配色；「即将过期」用橙色提示续期。 */
const LICENSE_STATUS_DISPLAY: Record<
  LicenseStatusEnum,
  { labelKey: string; color: string; dot: string }
> = {
  [LicenseStatusEnum.inactive]: {
    labelKey: 'license_inactive',
    color: 'red.600',
    dot: 'red.500'
  },
  [LicenseStatusEnum.active]: {
    labelKey: 'license_active',
    color: 'primary.600',
    dot: 'primary.500'
  },
  [LicenseStatusEnum.expiring]: {
    labelKey: 'license_expiring_soon',
    color: 'orange.600',
    dot: 'orange.500'
  },
  [LicenseStatusEnum.expired]: {
    labelKey: 'license_expired',
    color: 'red.600',
    dot: 'red.500'
  }
};

/** 管理员首页的 License 概览，按设计稿展示租户信息、额度和授权能力。 */
const AdminHome = () => {
  const { licenseData, licenseLoading, feConfigs } = useSystemStore();
  const { t } = useClientTranslation('admin');
  const [showLicenseInput, setShowLicenseInput] = useState(false);
  // 未接入 pro 服务 = 社区版部署，没有授权概念：不展示租户名、额度与激活状态，只保留功能能力清单。
  const isCommunityEdition = !feConfigs?.isProService;
  // 四态由共享判定给出（尚未激活 / 生效中 / 即将过期 / 已到期），避免前后端各写一份窗口规则。
  const licenseStatus = licenseLoading ? LicenseStatusEnum.inactive : getLicenseStatus(licenseData);
  const isExpired = licenseStatus === LicenseStatusEnum.expired;
  const isExpiringSoon = licenseStatus === LicenseStatusEnum.expiring;
  const isActivated = licenseStatus === LicenseStatusEnum.active || isExpiringSoon;

  // 尚未激活/已到期时没有有效的授权信息：租户名、额度与版本标签一律用占位符，
  // 不展示「不限」「商业版」这类只对有效授权成立的语义。
  const isLicenseValid = isActivated;
  const company = isLicenseValid ? licenseData?.company : undefined;
  const limits = isLicenseValid ? licenseData?.limits : undefined;
  const licenseTypeKey = !isLicenseValid
    ? undefined
    : licenseData?.licenseType === 'trial'
      ? 'license_trial'
      : 'license_business';
  const avatarText = useMemo(() => {
    const latin = company
      ?.match(/[A-Za-z]/g)
      ?.join('')
      .slice(0, 2);
    return (latin || company?.slice(0, 2) || '').toUpperCase();
  }, [company]);

  // 展示顺序与文案由展示清单决定；每一项都从授权状态实际取值。
  // 未激活/已过期时全部显示为未授权（不隐藏任何能力项），避免过期授权继续显示为已开通。
  const capabilities = FUNCTION_CAPABILITY_ITEMS.map(({ key, labelKey }) => ({
    key,
    label: t(`admin:${labelKey}`),
    enabled: isLicenseValid && Boolean(licenseData?.functions?.[key])
  }));

  /**
   * License 主操作入口：未激活/已过期（licenseData 为空）时打开激活弹窗完成首次激活或续期，
   * 已激活时打开弹窗做变更（续期、换绑实例）。商业版文档降级为按钮旁的次级链接。
   */
  const onLicenseButtonClick = () => setShowLicenseInput(true);

  // 未激活时激活是唯一主操作；已激活时仅在临期续期场景强调按钮
  const isLicenseActionPrimary = !isActivated || isExpiringSoon;

  // 状态徽标：四态各有文案与配色，「已到期」与「尚未激活」都不可授权，
  // 但前者需要指向续期、后者需要引导激活，因此分开呈现。
  const statusDisplay = LICENSE_STATUS_DISPLAY[licenseStatus];

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
          {t('admin:license_admin_home')}
        </Box>
        <Box color="myGray.500" fontSize="12px">
          {isCommunityEdition
            ? t('admin:license_admin_home_community_description')
            : t('admin:license_admin_home_description')}
        </Box>
      </Flex>

      <Box p={6}>
        <Box border="1px solid" h="104px" borderColor="myGray.200" borderRadius="8px" p={6}>
          {isCommunityEdition ? (
            /* 社区版：没有授权概念，只展示版本标识与商业版引导 */
            <Flex alignItems="center" justifyContent="space-between" h="100%" gap={4}>
              <Flex minW={0} gap={2} alignItems={'center'}>
                <Box color="myGray.500" fontWeight={500} fontSize="12px" mb={0.5}>
                  {t('admin:license_current_version')}
                </Box>
                <Box
                  as="span"
                  display="inline-block"
                  px={3}
                  py={'6px'}
                  borderRadius="33px"
                  bg="myGray.100"
                  color="myGray.700"
                  fontSize="11px"
                  fontWeight={500}
                  lineHeight="1.3"
                  whiteSpace="nowrap"
                >
                  {t('admin:license_community')}
                </Box>
              </Flex>

              <Button
                variant="outline"
                color="primary.600"
                borderColor="primary.300"
                borderRadius="6px"
                py={2}
                px={'14px'}
                fontSize="14px"
                whiteSpace="nowrap"
                as={Link}
                href={commercialDocUrl}
                isExternal
                _hover={{ bg: 'primary.50' }}
              >
                {t('admin:license_upgrade_commercial')}
              </Button>
            </Flex>
          ) : (
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
                  border="1px solid"
                  borderColor="rgba(51, 112, 255, 0.20)"
                  bg="linear-gradient(201deg, #3E78FF 13.74%, #78A0FF 89.76%)"
                  color="white"
                  fontSize="12px"
                  fontWeight="500"
                >
                  {avatarText.slice(0, 2)}
                </Flex>
                <Box minW={0}>
                  <Box color="myGray.500" fontSize="12px" mb={0.5}>
                    {t('admin:license_tenant_name')}
                  </Box>
                  <Flex alignItems="center" gap="10px" flexWrap="wrap">
                    <Box fontSize="24px" fontWeight="600" lineHeight="1.25" noOfLines={1}>
                      {licenseLoading ? <Skeleton w="260px" h="38px" /> : company || PLACEHOLDER}
                    </Box>
                    {licenseTypeKey && (
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
                        {t(`admin:${licenseTypeKey}`)}
                      </Box>
                    )}
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
                <Box color={statusDisplay.color} fontSize="11px" mb={4} h={'16px'}>
                  <Box
                    as="span"
                    display="inline-block"
                    w="6px"
                    h="6px"
                    mr={2}
                    borderRadius="50%"
                    bg={statusDisplay.dot}
                  />
                  {t(`admin:${statusDisplay.labelKey}`)}
                </Box>
                <Flex alignItems="center" gap={4}>
                  <Box color="myGray.500" fontSize="12px">
                    {t('admin:license_expires_at')}
                  </Box>
                  <Box fontSize="24px" fontWeight="500" lineHeight="1">
                    {formatDate(licenseData?.expiredTime)}
                  </Box>
                </Flex>
              </Box>
              <Flex alignItems="center" gap={3} justifyContent="flex-end">
                {!isActivated && (
                  <Link
                    href={commercialDocUrl}
                    isExternal
                    color="myGray.500"
                    fontSize="12px"
                    textDecoration="underline"
                    whiteSpace="nowrap"
                    _hover={{ color: 'primary.600' }}
                  >
                    {t('admin:license_learn_commercial')}
                  </Link>
                )}
                <Button
                  variant={isLicenseActionPrimary ? 'primary' : 'outline'}
                  color={isLicenseActionPrimary ? 'white' : 'primary.600'}
                  borderColor={isLicenseActionPrimary ? 'primary.500' : 'primary.300'}
                  borderRadius="6px"
                  py={2}
                  px={'14px'}
                  fontSize="14px"
                  leftIcon={<MyIcon name="common/settingLight" w="18px" />}
                  onClick={onLicenseButtonClick}
                >
                  {isExpired
                    ? t('admin:license_renew')
                    : isActivated
                      ? t('admin:license_change')
                      : t('admin:license_activate')}
                </Button>
              </Flex>
            </Grid>
          )}
        </Box>

        {/* 资源额度来自 License，社区版没有该信息 */}
        {!isCommunityEdition && (
          <Box mt={4}>
            <Box fontSize="16px" fontWeight="600" color="myGray.700" mb={2}>
              {t('admin:license_limits')}
            </Box>
            <Grid
              h="98px"
              templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}
              border="1px solid"
              borderColor="myGray.200"
              borderRadius="8px"
              p={6}
            >
              {(
                [
                  [t('admin:license_max_users'), limits?.maxUsers],
                  [t('admin:license_max_apps'), limits?.maxApps],
                  [t('admin:license_max_datasets'), limits?.maxDatasets]
                ] satisfies Array<[string, number | undefined]>
              ).map(([label, value], index) => (
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
                    {/* 有额度时显示数值，额度为 0 表示不限，无有效授权时显示占位符 */}
                    {value === undefined
                      ? PLACEHOLDER
                      : value > 0
                        ? value
                        : t('admin:license_unlimited')}
                  </Box>
                </GridItem>
              ))}
            </Grid>
          </Box>
        )}

        <Box mt={4}>
          <Box fontSize="16px" fontWeight="600" color="myGray.700" mb={2}>
            {t('admin:license_capabilities')}
          </Box>
          <Grid templateColumns={'1fr 1fr'} gap={'10px'}>
            {capabilities.map(({ key, label, enabled }) => (
              <Flex
                key={key}
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
