import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Header from './Header';
import Flow from '@/components/core/module/Flow';
import FlowProvider, { useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type.d';
import { pluginSystemModuleTemplates } from '@/web/core/modules/template/system';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useQuery } from '@tanstack/react-query';
import { getOnePlugin } from '@/web/core/plugin/api';
import { useToast } from '@/web/common/hooks/useToast';
import Loading from '@/components/Loading';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { usePluginStore } from '@/web/core/plugin/store/plugin';

type Props = { pluginId: string };

const Render = ({ pluginId }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { nodes, initData } = useFlowProviderStore();
  const { pluginModuleTemplates, loadPluginTemplates } = usePluginStore();

  const moduleTemplates = useMemo(() => {
    const pluginTemplates = pluginModuleTemplates.filter((item) => item.id !== pluginId);
    const concatTemplates = [...pluginSystemModuleTemplates, ...pluginTemplates];

    const copyTemplates: FlowModuleTemplateType[] = JSON.parse(JSON.stringify(concatTemplates));

    const filterType: Record<string, 1> = {
      [FlowNodeTypeEnum.userGuide]: 1,
      [FlowNodeTypeEnum.pluginInput]: 1,
      [FlowNodeTypeEnum.pluginOutput]: 1
    };

    // filter some template
    nodes.forEach((node) => {
      if (node.type && filterType[node.type]) {
        copyTemplates.forEach((module, index) => {
          if (module.flowType === node.type) {
            copyTemplates.splice(index, 1);
          }
        });
      }
    });

    // filter hideInPlugin inputs
    copyTemplates.forEach((template) => {
      template.inputs = template.inputs.filter((input) => !input.hideInPlugin);
    });

    return copyTemplates;
  }, [nodes, pluginId, pluginModuleTemplates]);

  const { data: pluginDetail } = useQuery(
    ['getOnePlugin', pluginId],
    () => getOnePlugin(pluginId),
    {
      onError: (error) => {
        toast({
          status: 'warning',
          title: getErrText(error, t('plugin.Load Plugin Failed'))
        });
        router.replace('/plugin/list');
      }
    }
  );

  useQuery(['getPlugTemplates'], () => loadPluginTemplates());

  useEffect(() => {
    initData(JSON.parse(JSON.stringify(pluginDetail?.modules || [])));
  }, [pluginDetail?.modules]);

  return pluginDetail ? (
    <Flow
      templates={moduleTemplates}
      Header={<Header plugin={pluginDetail} onClose={() => router.back()} />}
    />
  ) : (
    <Loading />
  );
};

export default function FlowEdit(props: any) {
  return (
    <FlowProvider mode={'plugin'} filterAppIds={[]}>
      <Render {...props} />
    </FlowProvider>
  );
}

export async function getServerSideProps(context: any) {
  return {
    props: {
      pluginId: context?.query?.pluginId || '',
      ...(await serviceSideProps(context))
    }
  };
}
