import type { LicenseDataType } from '@fastgpt/global/common/system/types';
import { Box, Flex, Tag } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React from 'react';

/** 决策版 functions 中文展示清单（顺序即展示顺序） */
const FUNCTION_LABELS: Array<{ key: keyof LicenseDataType['functions']; label: string }> = [
  { key: 'sso', label: '企业登录' },
  { key: 'pay', label: '计费/套餐' },
  { key: 'eval', label: '评估' },
  { key: 'datasetEnhance', label: '数据集增强' },
  { key: 'assistantGenerate', label: '辅助生成' },
  { key: 'portal', label: '门户' },
  { key: 'sandboxSkills', label: '沙盒与技能' }
];

/** limits 中文展示清单（0 = 不限制） */
const LIMIT_LABELS: Array<{
  key: keyof NonNullable<LicenseDataType['limits']>;
  label: string;
}> = [
  { key: 'maxUsers', label: '最大用户数' },
  { key: 'maxApps', label: '最大应用数' },
  { key: 'maxDatasets', label: '最大知识库数量' }
];

const LicenseData = ({ licenseData }: { licenseData?: LicenseDataType }) => {
  if (!licenseData) return null;
  const limits = licenseData.limits ?? {};
  const isTrial = licenseData.licenseType === 'trial';

  return (
    <Box p={4} pb={3}>
      <Flex gap={2} alignItems={'center'}>
        <Avatar src="/icon/user.svg" w={6} h={6} />
        <Box fontSize={'sm'} color={'myGray.900'}>
          {licenseData.company}
        </Box>
        <Tag colorScheme={isTrial ? 'yellow' : 'green'} size={'sm'}>
          {isTrial ? '试用版' : '正式版'}
        </Tag>
      </Flex>

      {licenseData.instanceId && (
        <Flex mt={3} fontSize={'mini'} flexWrap={'wrap'} alignItems={'center'}>
          <Box color={'myGray.500'} mr={1} flexShrink={0}>
            实例 ID:
          </Box>
          <Box
            color={'myGray.600'}
            fontFamily={'mono'}
            fontSize={'xs'}
            wordBreak={'break-all'}
            userSelect={'all'}
          >
            {licenseData.instanceId}
          </Box>
        </Flex>
      )}

      <Flex mt={3} fontSize={'mini'}>
        <Box color={'myGray.500'} mr={1}>
          过期时间:
        </Box>
        <Box color={'myGray.600'}>{licenseData.expiredTime}</Box>
      </Flex>

      {LIMIT_LABELS.map(({ key, label }) => (
        <Flex key={key} mt={2} fontSize={'mini'}>
          <Box color={'myGray.500'} mr={1}>
            {label}:{' '}
          </Box>
          <Box color={'myGray.600'}>{limits[key] || '不限制'}</Box>
        </Flex>
      ))}

      {FUNCTION_LABELS.map(({ key, label }) => (
        <Flex key={key} mt={2} fontSize={'mini'}>
          <Box color={'myGray.500'} mr={1}>
            {label}:{' '}
          </Box>
          <Box color={'myGray.600'}>{licenseData.functions[key] ? '✅' : '❌'}</Box>
        </Flex>
      ))}
    </Box>
  );
};

export default LicenseData;
