import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import { KbItemType } from '@/types/plugin';
import { useScreen } from '@/hooks/useScreen';
import DataCard from './DataCard';
import { getErrText } from '@/utils/tools';
import Info, { type ComponentRef } from './Info';
import Tabs from '@/components/Tabs';

enum TabEnum {
  data = 'data',
  test = 'test',
  info = 'info'
}

const Detail = ({ kbId }: { kbId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useScreen();
  const BasicInfo = useRef<ComponentRef>(null);
  const { setLastKbId, kbDetail, getKbDetail, loadKbList, myKbList } = useUserStore();
  const [currentTab, setCurrentTab] = useState(TabEnum.data);

  const form = useForm<KbItemType>({
    defaultValues: kbDetail
  });
  const { reset } = form;

  useQuery([kbId, myKbList], () => getKbDetail(kbId), {
    onSuccess(res) {
      kbId && setLastKbId(kbId);
      if (res) {
        reset(res);
        BasicInfo.current?.initInput?.(res.tags);
      }
    },
    onError(err: any) {
      loadKbList(true);
      setLastKbId('');
      router.replace(`/kb`);
      toast({
        title: getErrText(err, '获取知识库异常'),
        status: 'error'
      });
    }
  });

  return (
    <Box bg={'#fcfcfc'} h={'100%'} p={5} overflow={'overlay'} position={'relative'}>
      <Box mb={5}>
        <Tabs
          m={'auto'}
          w={'260px'}
          size={isPc ? 'md' : 'sm'}
          list={[
            { id: TabEnum.data, label: '数据管理' },
            { id: TabEnum.test, label: '搜索测试' },
            { id: TabEnum.info, label: '基本信息' }
          ]}
          activeId={currentTab}
          onChange={(e: any) => setCurrentTab(e)}
        />
      </Box>
      {currentTab === TabEnum.data && <DataCard kbId={kbId} />}
      {currentTab === TabEnum.info && <Info ref={BasicInfo} kbId={kbId} form={form} />}
    </Box>
  );
};

export default Detail;
