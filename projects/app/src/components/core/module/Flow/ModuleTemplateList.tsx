import React, { useCallback, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type {
  FlowModuleTemplateType,
  moduleTemplateListType
} from '@fastgpt/global/core/module/type.d';
import { useViewport, XYPosition } from 'reactflow';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@/components/Avatar';
import { getFlowStore, onSetNodes } from './FlowProvider';
import { customAlphabet } from 'nanoid';
import { appModule2FlowNode } from '@/utils/adapt';
import { useTranslation } from 'next-i18next';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import EmptyTip from '@/components/EmptyTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { moduleTemplatesList } from '@/web/core/modules/template/system';

export type ModuleTemplateProps = {
  templates: FlowModuleTemplateType[];
};

type ModuleTemplateListProps = ModuleTemplateProps & {
  isOpen: boolean;
  onClose: () => void;
};
type RenderListProps = {
  templates: FlowModuleTemplateType[];
  onClose: () => void;
};

const ModuleTemplateList = ({ templates, isOpen, onClose }: ModuleTemplateListProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'absolute'}
        top={0}
        left={0}
        bottom={0}
        w={'360px'}
        onClick={onClose}
      />
      <Flex
        zIndex={3}
        flexDirection={'column'}
        position={'absolute'}
        top={'65px'}
        left={0}
        pt={2}
        pb={4}
        h={isOpen ? 'calc(100% - 100px)' : '0'}
        w={isOpen ? ['100%', '360px'] : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'20px'}
        overflow={'hidden'}
        transition={'.2s ease'}
        userSelect={'none'}
      >
        <RenderList templates={templates} onClose={onClose} />
      </Flex>
    </>
  );
};

export default React.memo(ModuleTemplateList);

const RenderList = React.memo(function RenderList({ templates, onClose }: RenderListProps) {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const { x, y, zoom } = useViewport();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();

  const formatTemplates = useMemo<moduleTemplateListType>(() => {
    const copy: moduleTemplateListType = JSON.parse(JSON.stringify(moduleTemplatesList));
    templates.forEach((item) => {
      const index = copy.findIndex((template) => template.type === item.templateType);
      if (index === -1) return;
      copy[index].list.push(item);
    });
    return copy.filter((item) => item.list.length > 0);
  }, [templates]);

  const onAddNode = useCallback(
    async ({ template, position }: { template: FlowModuleTemplateType; position: XYPosition }) => {
      const { reactFlowWrapper, nodes } = await getFlowStore();
      if (!reactFlowWrapper?.current) return;

      const templateModule = await (async () => {
        try {
          // get plugin preview module
          if (template.flowType === FlowNodeTypeEnum.pluginModule) {
            setLoading(true);
            const res = await getPreviewPluginModule(template.id);
            setLoading(false);
            return res;
          }
          return { ...template };
        } catch (e) {
          toast({
            status: 'error',
            title: getErrText(e, t('plugin.Get Plugin Module Detail Failed'))
          });
          setLoading(false);
          return Promise.reject(e);
        }
      })();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const mouseX = (position.x - reactFlowBounds.left - x) / zoom - 100;
      const mouseY = (position.y - reactFlowBounds.top - y) / zoom;

      onSetNodes(
        nodes.concat(
          appModule2FlowNode({
            item: {
              ...templateModule,
              moduleId: nanoid(),
              position: { x: mouseX, y: mouseY - 20 }
            }
          })
        )
      );
    },
    [setLoading, t, toast, x, y, zoom]
  );

  return templates.length === 0 ? (
    <EmptyTip text={t('app.module.No Modules')} />
  ) : (
    <Box flex={'1 0 0'} overflow={'overlay'}>
      <Box w={['100%', '330px']} mx={'auto'}>
        {formatTemplates.map((item, i) => (
          <Box key={item.type}>
            <Flex>
              <Box fontWeight={'bold'} flex={1}>
                {t(item.label)}
              </Box>
              {/* {isPlugin && item.type === ModuleTemplateTypeEnum.personalPlugin && (
                <Flex
                  alignItems={'center'}
                  _hover={{ textDecoration: 'underline' }}
                  cursor={'pointer'}
                  onClick={() => router.push('/plugin/list')}
                >
                  <Box fontSize={'sm'} transform={'translateY(-1px)'}>
                    {t('plugin.To Edit Plugin')}
                  </Box>
                  <MyIcon name={'common/rightArrowLight'} w={'12px'} />
                </Flex>
              )} */}
            </Flex>
            <>
              {item.list.map((template) => (
                <Flex
                  key={template.id}
                  alignItems={'center'}
                  p={5}
                  cursor={'pointer'}
                  _hover={{ bg: 'myWhite.600' }}
                  borderRadius={'sm'}
                  draggable
                  onDragEnd={(e) => {
                    if (e.clientX < 360) return;
                    onAddNode({
                      template: template,
                      position: { x: e.clientX, y: e.clientY }
                    });
                  }}
                  onClick={(e) => {
                    if (isPc) return;
                    onClose();
                    onAddNode({
                      template: template,
                      position: { x: e.clientX, y: e.clientY }
                    });
                  }}
                >
                  <Avatar
                    src={template.avatar}
                    w={'34px'}
                    objectFit={'contain'}
                    borderRadius={'0'}
                  />
                  <Box ml={5} flex={'1 0 0'}>
                    <Box color={'black'}>{t(template.name)}</Box>
                    <Box className="textEllipsis3" color={'myGray.500'} fontSize={'sm'}>
                      {t(template.intro)}
                    </Box>
                  </Box>
                </Flex>
              ))}
            </>
          </Box>
        ))}
      </Box>
    </Box>
  );
});
