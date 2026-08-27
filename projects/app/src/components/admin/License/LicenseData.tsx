import type { LicenseDataType } from '@fastgpt/global/common/system/types';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React from 'react';

const LicenseData = ({ licenseData }: { licenseData?: LicenseDataType }) => {
  return licenseData ? (
    <Box p={4} pb={3}>
      <Flex gap={2}>
        <Avatar src="/icon/user.svg" w={6} h={6} />
        <Box fontSize={'sm'} color={'myGray.900'}>
          {licenseData.company}
        </Box>
      </Flex>
      {licenseData.startTime && (
        <>
          <Flex mt={3} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              过期时间:
            </Box>
            <Box color={'myGray.600'}>{licenseData.expiredTime}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              最大用户数:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.maxUsers || '不限制'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              最大应用数:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.maxApps || '不限制'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              最大知识库数量:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.maxDatasets || '不限制'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              单点登录:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.functions.sso ? '✅' : '❌'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              支付系统:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.functions.pay ? '✅' : '❌'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              自定义模板和系统工具:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.functions.customTemplates ? '✅' : '❌'}</Box>
          </Flex>
          <Flex mt={2} fontSize={'mini'}>
            <Box color={'myGray.500'} mr={1}>
              知识库增强:{' '}
            </Box>
            <Box color={'myGray.600'}>{licenseData.functions.datasetEnhance ? '✅' : '❌'}</Box>
          </Flex>
        </>
      )}
    </Box>
  ) : null;
};

export default LicenseData;
