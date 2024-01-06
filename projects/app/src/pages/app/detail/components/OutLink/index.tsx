import React, { useState } from 'react';
import { Box, useTheme } from '@chakra-ui/react';

import { OutLinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import Share from './Share';
const API = dynamic(() => import('./API'));

const OutLink = ({ appId }: { appId: string }) => {
  const theme = useTheme();

  const [linkType, setLinkType] = useState<`${OutLinkTypeEnum}`>(OutLinkTypeEnum.share);

  return (
    <Box pt={[1, 5]}>
      <Box fontWeight={'bold'} fontSize={['md', 'xl']} mb={2} px={[4, 8]}>
        外部使用途径
      </Box>
      <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
        <MyRadio
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(auto-fill, minmax(0, 400px))']}
          iconSize={'20px'}
          list={[
            {
              icon: '/imgs/modal/shareFill.svg',
              title: '免登录窗口',
              desc: '分享链接给其他用户，无需登录即可直接进行使用',
              value: OutLinkTypeEnum.share
            },
            {
              icon: 'support/outlink/apikeyFill',
              title: 'API 访问',
              desc: '通过 API 接入到已有系统中，或企微、飞书等',
              value: OutLinkTypeEnum.apikey
            }
            // {
            //   icon: 'support/outlink/iframeLight',
            //   title: '网页嵌入',
            //   desc: '嵌入到已有网页中，右下角会生成对话按键',
            //   value: OutLinkTypeEnum.iframe
            // }
          ]}
          value={linkType}
          onChange={(e) => setLinkType(e as `${OutLinkTypeEnum}`)}
        />
      </Box>

      {linkType === OutLinkTypeEnum.share && <Share appId={appId} />}
      {linkType === OutLinkTypeEnum.apikey && <API appId={appId} />}
    </Box>
  );
};

export default OutLink;
