import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import Header from './Header';
import Flow from '@/pages/app/components/Flow';
import FlowProvider, { useFlowProviderStore } from '@/pages/app/components/Flow/FlowProvider';
import { SystemModuleTemplateType } from '@fastgpt/global/core/module/type.d';
import { CombineModuleTemplates } from '@/constants/flow/ModuleTemplate';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { serviceSideProps } from '@/web/common/utils/i18n';

type Props = {};

const Render = ({}: Props) => {
  const router = useRouter();
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

  return (
    <Flow
      systemTemplates={filterTemplates}
      combineTemplates={[]}
      modules={[]}
      Header={<Header onClose={() => router.back()} />}
    />
  );
};

export default function AdEdit(props: any) {
  return (
    <FlowProvider filterAppIds={[]}>
      <Render {...props} />
    </FlowProvider>
  );
}

export async function getServerSideProps(content: Props) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}
