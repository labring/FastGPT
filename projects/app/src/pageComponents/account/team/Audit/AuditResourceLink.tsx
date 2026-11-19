import React from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { subRoute } from '@fastgpt/web/common/system/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { PresentedAuditResource } from '@fastgpt/web/support/user/audit/presenter';

/**
 * presenter 返回不含部署前缀的站内绝对路由；显式拼接一次部署前缀，避免前缀与路由首段同名（如 `/app`）时被启发式去重吞掉。
 */
const buildPrefixedResourceHref = (href: string) => {
  const normalizedBase = subRoute ? subRoute.replace(/\/+$/, '') : '';
  if (!normalizedBase) return href;
  return `${normalizedBase}${href.startsWith('/') ? href : `/${href}`}`;
};

/**
 * 审计日志专用的资源展示组件：呈现可选头像与名称（已删除资源保留快照名称并标记已删除、禁用跳转），
 * 类型仅用于决定图标与目标跳转路由。
 */
const AuditResourceLink = ({ resource }: { resource: PresentedAuditResource }) => {
  const { t } = useSafeTranslation();
  const hasSnapshotName = Boolean(resource.name && !resource.nameMissing);
  const label = resource.deleted
    ? hasSnapshotName
      ? `${resource.name} (${t('account_team:audit_resource_deleted_suffix')})`
      : t('account_team:audit_resource_deleted')
    : resource.name;

  const content = (
    <>
      {resource.avatar && (
        <Avatar src={resource.avatar} w="18px" borderRadius="xs" flexShrink={0} />
      )}
      <Box as="span" minW={0} overflowWrap="anywhere" _groupHover={{ textDecoration: 'underline' }}>
        {label}
      </Box>
    </>
  );

  if (!resource.deleted && resource.href) {
    return (
      <Link
        href={buildPrefixedResourceHref(resource.href)}
        role="group"
        display="inline-flex"
        alignItems="center"
        gap={1.5}
        maxW="100%"
        color="primary.600"
        _hover={{ textDecoration: 'none' }}
      >
        {content}
      </Link>
    );
  }

  return (
    <Flex
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      maxW="100%"
      color={resource.deleted ? 'myGray.500' : 'myGray.900'}
    >
      {content}
    </Flex>
  );
};

export default React.memo(AuditResourceLink);
