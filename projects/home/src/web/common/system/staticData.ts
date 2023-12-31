import { FeConfigType } from '@/types';
import axios from 'axios';

export let feConfigs: FeConfigType = {
  startUrl: '/app/list',
  loginUrl: '/login',
  docUrl: 'https://doc.fastgpt.in/docs/intro/',
  commercialDocUrl: 'https://fael3z0zfze.feishu.cn/share/base/form/shrcnRxj3utrzjywsom96Px4sud',
  concatMd:
    '| 交流群 | 小助手 |\n| ----------------------- | -------------------- |\n| ![](https://doc.fastgpt.in/wechat-fastgpt.webp) | ![](https://otnvvf-imgs.oss.laf.run/wx300.jpg) |',
  scripts: []
};

let retryTimes = 3;

export const clientInitData = async (): Promise<FeConfigType> => {
  try {
    const { data } = await axios.get('/api/getFeConfig');
    feConfigs = data;

    return feConfigs;
  } catch (error) {
    retryTimes--;
    if (retryTimes > 0) {
      return clientInitData();
    }
    return feConfigs;
  }
};
