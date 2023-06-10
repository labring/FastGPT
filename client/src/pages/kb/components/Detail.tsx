import React, { useRef } from 'react';
import { useRouter } from 'next/router';
import { Card, Box } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/store/user';
import { KbItemType } from '@/types/plugin';

import DataCard from './DataCard';
import { getErrText } from '@/utils/tools';
import Info, { type ComponentRef } from './Info';

const Detail = ({ kbId }: { kbId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const BasicInfo = useRef<ComponentRef>(null);
  const { setLastKbId, kbDetail, getKbDetail, loadKbList, myKbList } = useUserStore();

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
    <Box h={'100%'} p={5} overflow={'overlay'} position={'relative'}>
      <Card p={6}>
        <Info ref={BasicInfo} kbId={kbId} form={form} />
      </Card>
      <Card p={6} mt={5}>
        <DataCard kbId={kbId} />
      </Card>
    </Box>
  );
};

export default Detail;
