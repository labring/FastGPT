import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import Header from './Header';
import Flow from '@/components/core/module/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import { SystemModuleTemplateType } from '@fastgpt/global/core/module/type.d';
import { CombineModuleTemplates } from '@/constants/flow/ModuleTemplate';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useQuery } from '@tanstack/react-query';
import { getOneModule } from '@/web/core/module/api';
import { useToast } from '@/web/common/hooks/useToast';
import Loading from '@/components/Loading';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'react-i18next';

type Props = { moduleId: string };

const Render = ({ moduleId }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { nodes = [] } = useFlowProviderStore();

  const filterTemplates = useMemo(() => {
    const copyTemplates: SystemModuleTemplateType = JSON.parse(
      JSON.stringify(CombineModuleTemplates)
    );
    const filterType: Record<string, 1> = {
      [FlowNodeTypeEnum.userGuide]: 1,
      [FlowNodeTypeEnum.customInput]: 1,
      [FlowNodeTypeEnum.customIOutput]: 1
    };

    // filter some template
    nodes.forEach((node) => {
      if (node.type && filterType[node.type]) {
        copyTemplates.forEach((item) => {
          item.list.forEach((module, index) => {
            if (module.flowType === node.type) {
              item.list.splice(index, 1);
            }
          });
        });
      }
    });

    return copyTemplates;
  }, [nodes]);

  const { data } = useQuery(['getModuleDetail', moduleId], () => getOneModule(moduleId), {
    onError: (error) => {
      toast({
        status: 'warning',
        title: getErrText(error, t('module.Load Module Failed'))
      });
      router.replace('/module/list');
    }
  });

  return data ? (
    <Flow
      systemTemplates={filterTemplates}
      combineTemplates={[]}
      modules={data?.modules || []}
      Header={<Header module={data} onClose={() => router.back()} />}
    />
  ) : (
    <Loading />
  );
};

export default function AdEdit(props: any) {
  return (
    <FlowProvider filterAppIds={[]}>
      <Render {...props} />
    </FlowProvider>
  );
}

export async function getServerSideProps(context: any) {
  return {
    props: {
      moduleId: context?.query?.moduleId || '',
      ...(await serviceSideProps(context))
    }
  };
}
