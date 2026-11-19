import React from 'react';
import { Box, Flex, Link } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { PresentedAuditResource } from '@fastgpt/web/support/user/audit/presenter';

/**
 * 审计日志专用的资源展示组件：呈现可选头像与名称（已删除资源直接展示「该资源已被删除」且不可跳转），
 * 类型仅用于决定图标与目标跳转路由。
 */
const AuditResourceLink = ({ resource }: { resource: PresentedAuditResource }) => {
  const { t } = useSafeTranslation();
  const label = resource.deleted ? t('account_team:audit_resource_deleted') : resource.name;

  const content = (
    <>
      {resource.avatar && (
        <Avatar src={resource.avatar} w="18px" borderRadius="xs" flexShrink={0} />
      )}
      <Box
        as="span"
        minW={0}
        overflowWrap="anywhere"
        _groupHover={{ textDecoration: 'underline' }}
      >
        {label}
      </Box>
    </>
  );

  if (!resource.deleted && resource.href) {
    return (
      <Link
        href={getWebReqUrl(resource.href)}
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
