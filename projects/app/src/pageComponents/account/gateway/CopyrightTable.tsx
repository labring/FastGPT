import React, { useState } from 'react';
import { Box, Flex, Text, Input, Button, useBreakpointValue, Image } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';

type Props = {
  teamName: string;
};

// 定义淡入淡出动画
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// 斜线背景样式
const stripedBackgroundStyle = {
  backgroundImage:
    'linear-gradient(135deg, #f0f0f0 25%, transparent 25%, transparent 50%, #f0f0f0 50%, #f0f0f0 75%, transparent 75%, transparent)',
  backgroundSize: '5px 5px',
  padding: '12px',
  borderRadius: '16px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  border: '1px dashed #e0e0e0'
};

// LogoBox组件 - 提取重复的Logo盒子为可复用组件
type LogoBoxProps = {
  avatar?: string;
  boxSize: any;
  borderRadius: any;
  uploadFontSize: any;
  iconBoxSize: any;
  onUploadClick: () => void;
  withStripedBackground?: boolean; // 新增参数，决定是否添加斜线背景
};

const LogoBox = ({
  avatar,
  boxSize,
  borderRadius,
  uploadFontSize,
  iconBoxSize,
  onUploadClick,
  withStripedBackground = false // 默认不添加斜线背景
}: LogoBoxProps) => {
  const { t } = useTranslation();

  const logoContent = (
    <Box
      width={boxSize}
      height={boxSize}
      bg="white"
      border="0.483px solid #ECECEC"
      borderRadius={borderRadius}
      display="flex"
      justifyContent="center"
      alignItems="center"
      position="relative"
      overflow="hidden"
      boxSizing="border-box"
      cursor="pointer"
      onClick={onUploadClick}
      transition="all 0.3s ease"
    >
      <Flex
        width="40px"
        height="40px"
        justifyContent="center"
        alignItems="center"
        flexShrink="0"
        aspectRatio="1/1"
      >
        <Image
          src={avatar}
          alt="Team Logo"
          width="100%"
          height="100%"
          objectFit="contain"
          fallbackSrc="/icon/logo.svg"
        />
      </Flex>
      {/* 悬停时显示的上传提示遮罩 - 模糊风格 */}
      {/* <Box
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
        fontSize={uploadFontSize}
        fontWeight="bold"
        opacity="0"
        borderRadius={borderRadius}
        transition="all 0.3s ease"
        _hover={{
          opacity: 1,
          animation: `${fadeIn} 0.3s ease-in-out`
        }}
      >
        <Flex direction="column" alignItems="center">
          <SmallAddIcon boxSize={iconBoxSize} mb={{ base: '1px', md: '2px' }} />
          <Text>{t('account_gate:upload')}</Text>
        </Flex>
      </Box> */}
    </Box>
  );

  // 如果需要斜线背景，则外包一层带斜线的Box
  if (withStripedBackground) {
    return <Box sx={stripedBackgroundStyle}>{logoContent}</Box>;
  }

  // 否则直接返回原始内容
  return logoContent;
};

// 添加悬浮遮罩样式
const uploadOverlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  border: '1px dashed var(--Royal-Blue-200, #C5D7FF)',
  background: 'rgba(255, 255, 255, 0.5)',
  backdropFilter: 'blur(2px)',
  zIndex: 10,
  opacity: 0,
  transition: 'opacity 0.3s ease',
  _groupHover: {
    opacity: 1
  }
};

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
  const logoBoxSize = useBreakpointValue({ md: '60px' });
  const logoBorderRadius = useBreakpointValue({ base: '5.8px', md: '15px' });
  const titleFontSize = useBreakpointValue({ base: '18px', md: '28px' });
  const dividerHeight = useBreakpointValue({ base: '70px', md: '84px' });

  // 左侧带文本的Logo稍大一些
  const logoBoxSizeWithText = useBreakpointValue({ base: '28px', md: '60px' });

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
                <Box
                  sx={stripedBackgroundStyle}
                  onClick={onOpenSelectFile}
                  cursor="pointer"
                  role="group"
                  position="relative"
                >
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
                      boxSizing="border-box"
                      transition="all 0.3s ease"
                    >
                      <Flex
                        width="40px"
                        height="40px"
                        justifyContent="center"
                        alignItems="center"
                        flexShrink="0"
                        aspectRatio="1/1"
                      >
                        <Image
                          src={avatar}
                          alt="Team Logo"
                          width="100%"
                          height="100%"
                          objectFit="contain"
                          fallbackSrc="/icon/logo.svg"
                        />
                      </Flex>
                    </Box>
                    <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                      {watch('name')}
                    </Text>
                  </Flex>

                  {/* 悬浮遮罩 - 4:1 */}
                  <Box
                    sx={{
                      ...uploadOverlayStyle,
                      width: '100%',
                      height: '100%'
                    }}
                    borderRadius="16px"
                  >
                    <Flex direction="column" alignItems="center" justifyContent="center">
                      <MyIcon
                        name="support/gate/home/upload"
                        width="24px"
                        height="24px"
                        color="blue.500"
                      />
                    </Flex>
                  </Box>
                </Box>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('account_gate:suggestion_ratio_4_1')}
                </Text>
              </Flex>

              <Box display={{ base: 'none', md: 'block' }} w="1px" h={dividerHeight} bg="#F0F1F6" />

              {/* 右侧 Logo 显示 - 仅Logo */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  sx={stripedBackgroundStyle}
                  onClick={onOpenSelectFile}
                  cursor="pointer"
                  role="group"
                  position="relative"
                >
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
                    transition="all 0.3s ease"
                  >
                    <Flex
                      width="40px"
                      height="40px"
                      justifyContent="center"
                      alignItems="center"
                      flexShrink="0"
                      aspectRatio="1/1"
                    >
                      <Image
                        src={avatar}
                        alt="Team Logo"
                        width="100%"
                        height="100%"
                        objectFit="contain"
                        fallbackSrc="/icon/logo.svg"
                      />
                    </Flex>
                  </Box>

                  {/* 悬浮遮罩 - 1:1 */}
                  <Box
                    sx={{
                      ...uploadOverlayStyle,
                      width: '100%',
                      height: '100%'
                    }}
                    borderRadius="16px"
                  >
                    <Flex direction="column" alignItems="center" justifyContent="center">
                      <MyIcon
                        name="support/gate/home/upload"
                        width="24px"
                        height="24px"
                        color="blue.500"
                      />
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
