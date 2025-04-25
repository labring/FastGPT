import React from 'react';
import { Box, Flex, Text, Input, Button, useBreakpointValue, Image } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';

type Props = {
  teamName: string;
};

// 定义淡入淡出动画
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const CopyrightTable = ({ teamName }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { updateLocalCopyRightConfig } = useGateStore();

  // 使用useForm管理表单数据
  const { setValue, watch } = useForm({
    defaultValues: {
      name: teamName,
      avatar: userInfo?.team?.teamAvatar
    }
  });

  // 从表单中获取avatar值
  const avatar = watch('avatar');

  const handleTeamNameChange = (name: string) => {
    setValue('name', name);
    updateLocalCopyRightConfig({ name });
  };

  // 添加文件选择器
  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png,.svg',
    multiple: false
  });

  // 响应式尺寸 - 根据设计比例调整
  const logoBoxSize = useBreakpointValue({ base: '23.18px', md: '50px' });
  const logoIconSize = useBreakpointValue({ base: '15.45px', md: '33px' });
  const logoBorderRadius = useBreakpointValue({ base: '5.8px', md: '12px' });
  const titleFontSize = useBreakpointValue({ base: '18px', md: '28px' });
  const dividerHeight = useBreakpointValue({ base: '70px', md: '84px' });

  // 左侧带文本的Logo稍大一些
  const logoBoxSizeWithText = useBreakpointValue({ base: '28px', md: '60px' });
  const logoIconSizeWithText = useBreakpointValue({ base: '18.5px', md: '40px' });

  return (
    <Box flex={'1 0 0'} overflow={'hidden'} display="flex" justifyContent="center">
      <Box w="100%" maxW={{ base: '100%', md: '640px' }} py={{ base: 4, md: 6 }}>
        <Flex flexDirection={'column'} gap={{ base: 4, md: 6 }}>
          {/* 基础设置区域 */}
          <Flex flexDirection="column" gap={{ base: 3, md: 4 }}>
            <Flex alignItems="center" gap={3}>
              <Box w="4px" h="16px" bg="#3370FF" borderRadius="6px" />
              <Text fontSize={{ base: '14px', md: '16px' }} fontWeight={500}>
                {t('common:common.base_config')}
              </Text>
            </Flex>

            <Flex direction="column" gap={2}>
              <Text fontSize="14px" color="#485264" fontWeight={500}>
                {t('account_gate:team_name')}
              </Text>
              <Input
                value={watch('name')}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                bg="#FBFBFC"
                border="1px solid #E8EBF0"
                borderRadius="8px"
                height={{ base: '36px', md: '40px' }}
              />
            </Flex>
          </Flex>

          {/* Logo 设置区域 */}
          <Flex flexDirection="column" gap={{ base: 3, md: 4 }}>
            <Text fontSize="14px" color="#485264" fontWeight={500}>
              Logo预览
            </Text>

            <Flex
              gap={{ base: 4, md: 8 }}
              alignItems="center"
              justifyContent="flex-start"
              flexDirection={{ base: 'column', md: 'row' }}
            >
              {/* 左侧 Logo 显示 - 带文字 */}
              <Flex direction="column" gap={2} alignItems="center">
                <Flex gap={{ base: 3, md: 5 }} alignItems="center">
                  <Box
                    width={logoBoxSizeWithText}
                    height={logoBoxSizeWithText}
                    bg="white"
                    border="0.483px solid #ECECEC"
                    borderRadius={logoBorderRadius}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    position="relative"
                    overflow="hidden"
                    cursor="pointer"
                    onClick={onOpenSelectFile}
                    transition="all 0.3s ease"
                    _hover={{
                      transform: 'scale(1.03)'
                    }}
                  >
                    <Image
                      src={avatar}
                      alt="Team Logo"
                      width="100%"
                      height="100%"
                      objectFit="contain"
                      fallbackSrc="/icon/logo.svg"
                    />
                    {/* 悬停时显示的上传提示遮罩 - 模糊风格 */}
                    <Box
                      position="absolute"
                      top="0"
                      left="0"
                      width="100%"
                      height="100%"
                      backdropFilter="blur(4px)"
                      bg="rgba(255, 255, 255, 0.2)"
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      color="gray.700"
                      fontSize={{ base: '8px', md: '12px' }}
                      fontWeight="bold"
                      opacity="0"
                      borderRadius={logoBorderRadius}
                      transition="all 0.3s ease"
                      _hover={{
                        opacity: 1,
                        animation: `${fadeIn} 0.3s ease-in-out`
                      }}
                    >
                      <Flex direction="column" alignItems="center">
                        <SmallAddIcon boxSize={{ base: '10px', md: '14px' }} mb="2px" />
                        <Text>上传</Text>
                      </Flex>
                    </Box>
                  </Box>
                  <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                    {watch('name')}
                  </Text>
                </Flex>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('account_gate:suggestion_ratio_4_1')}
                </Text>
              </Flex>

              <Box display={{ base: 'none', md: 'block' }} w="1px" h={dividerHeight} bg="#F0F1F6" />

              {/* 右侧 Logo 显示 - 仅Logo */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  width={logoBoxSize}
                  height={logoBoxSize}
                  bg="white"
                  border="0.483px solid #ECECEC"
                  borderRadius={logoBorderRadius}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  position="relative"
                  overflow="hidden"
                  boxSizing="border-box"
                  cursor="pointer"
                  onClick={onOpenSelectFile}
                  transition="all 0.3s ease"
                  _hover={{
                    transform: 'scale(1.03)'
                  }}
                >
                  <Image
                    src={avatar}
                    alt="Team Logo"
                    width="100%"
                    height="100%"
                    objectFit="contain"
                    fallbackSrc="/icon/logo.svg"
                  />
                  {/* 悬停时显示的上传提示遮罩 - 模糊风格 */}
                  <Box
                    position="absolute"
                    top="0"
                    left="0"
                    width="100%"
                    height="100%"
                    backdropFilter="blur(4px)"
                    bg="rgba(255, 255, 255, 0.2)"
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    color="gray.700"
                    fontSize={{ base: '6px', md: '10px' }}
                    fontWeight="bold"
                    opacity="0"
                    borderRadius={logoBorderRadius}
                    transition="all 0.3s ease"
                    _hover={{
                      opacity: 1,
                      animation: `${fadeIn} 0.3s ease-in-out`
                    }}
                  >
                    <Flex direction="column" alignItems="center">
                      <SmallAddIcon boxSize={{ base: '8px', md: '12px' }} mb="1px" />
                      <Text>{t('account_gate:upload')}</Text>
                    </Flex>
                  </Box>
                </Box>
                <Text fontSize="12px" color="#667085">
                  {t('account_gate:suggestion_ratio_1_1')}
                </Text>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Box>

      {/* 文件选择器组件 */}
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => {
              setValue('avatar', e);
              updateLocalCopyRightConfig({ avatar: e });
            }
          })
        }
      />
    </Box>
  );
};

export default CopyrightTable;
