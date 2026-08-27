'use client';
import { useState } from 'react';
import { Box, Button, Flex, Skeleton, Tag } from '@chakra-ui/react';
import BoxCard from '@/components/admin/BoxContainer/Card';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LicenseData from '@/components/admin/License/LicenseData';
import LicenseInput from '@/components/admin/License/Input';
import { useSystemStore } from '@/web/common/system/useSystemStore';

/**
 * 管理员主页：展示当前系统版本状态（开源版/商业版）与 license 激活信息。
 * 未激活时可触发激活窗口，已激活时展示 license 详细数据。
 * license 状态加载期间（licenseLoading）用骨架屏占位，避免状态切换闪烁。
 */
const AdminHome = () => {
  const { licenseData, licenseLoading } = useSystemStore();
  const [showLicenseInput, setShowLicenseInput] = useState(false);
  const isActivated = !!licenseData && !licenseLoading;

  return (
    <Box p={6} h={'100%'} overflow={'auto'}>
      <BoxCard>
        <Flex alignItems={'center'} justifyContent={'space-between'} flexWrap={'wrap'} gap={4}>
          <Box>
            <Flex alignItems={'center'} gap={3}>
              <Box fontSize={'2xl'} fontWeight={'bold'}>
                管理员主页
              </Box>
              {/* 加载中显示骨架，避免开源版/商业版状态切换闪烁 */}
              {licenseLoading ? (
                <Skeleton w={'80px'} h={'24px'} borderRadius={'sm'} />
              ) : (
                <Tag colorScheme={isActivated ? 'green' : 'orange'} size={'sm'}>
                  {isActivated ? '商业版' : '开源社区版'}
                </Tag>
              )}
            </Flex>
            <Box mt={2} color={'myGray.500'} fontSize={'sm'}>
              {licenseLoading ? (
                <Skeleton w={'260px'} h={'20px'} />
              ) : isActivated ? (
                `已激活 License（${licenseData?.company}）`
              ) : (
                '当前为开源社区版。激活 License 可解锁商业版功能（套餐管理、支付、自定义模板等）。'
              )}
            </Box>
          </Box>

          <Skeleton isLoaded={!licenseLoading} w={licenseLoading ? '120px' : undefined}>
            <Button
              variant={isActivated ? 'whiteBase' : 'primary'}
              leftIcon={<MyIcon name="common/settingLight" w={'18px'} />}
              onClick={() => setShowLicenseInput(true)}
            >
              {isActivated ? '变更 License' : '激活 License'}
            </Button>
          </Skeleton>
        </Flex>

        <Box mt={4} borderTop={'1px solid'} borderColor={'myGray.200'} pt={4}>
          {licenseLoading ? (
            <Box>
              <Skeleton h={'20px'} w={'160px'} mb={3} />
              <Skeleton h={'16px'} w={'220px'} mb={2} />
              <Skeleton h={'16px'} w={'200px'} mb={2} />
              <Skeleton h={'16px'} w={'180px'} />
            </Box>
          ) : isActivated ? (
            <LicenseData licenseData={licenseData} />
          ) : (
            <Flex
              py={8}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
              color={'myGray.500'}
            >
              <MyIcon name="empty" w={'56px'} h={'56px'} color={'transparent'} />
              <Box mt={4} fontSize={'sm'}>
                未激活 License，点击右上角「激活 License」开始激活
              </Box>
            </Flex>
          )}
        </Box>
      </BoxCard>

      {showLicenseInput && <LicenseInput onClose={() => setShowLicenseInput(false)} />}
    </Box>
  );
};

export default AdminHome;
