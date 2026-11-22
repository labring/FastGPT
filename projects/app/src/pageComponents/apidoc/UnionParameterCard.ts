export type VuePluginRuntime = {
  defineComponent: (options: Record<string, unknown>) => unknown;
  h: (tag: string, props?: Record<string, unknown>, children?: string | unknown[]) => unknown;
  markRaw: <T>(value: T) => T;
  onMounted: (fn: () => void) => void;
  ref: <T = undefined>() => { value: T | undefined };
};

type ParameterCard = {
  label: string;
  position: 'only' | 'first' | 'middle' | 'last';
};

/**
 * 通过 Scalar 的字段扩展标记专用参数；卡片样式保留原生字段、折叠控件和调试行为。
 * 只渲染声明了扩展的字段，默认展开卡片中的当前组合，不移动或复制 Scalar 管理的节点。
 */
export const createUnionParameterCardPlugin = ({
  defineComponent,
  h,
  markRaw,
  onMounted,
  ref
}: VuePluginRuntime) => {
  const UnionParameterLabel = markRaw(
    defineComponent({
      props: {
        xFastgptUnionParameter: { type: [Boolean, Object] }
      },
      setup: (props: { xFastgptUnionParameter?: boolean | ParameterCard }) => {
        const label = ref<HTMLElement>();
        onMounted(() => {
          // Scalar 默认收起深层组合；只展开本卡片当前选中的分支，保留其他对象的折叠行为。
          const card = label.value?.closest('.property');
          card
            ?.querySelectorAll<HTMLButtonElement>(
              '.composition-panel > button, .schema-card-title[aria-expanded="false"]'
            )
            .forEach((button) => {
              if (button.closest('.property') === card) button.click();
            });
        });

        return () => {
          if (!props.xFastgptUnionParameter) return null;
          const card =
            typeof props.xFastgptUnionParameter === 'object'
              ? props.xFastgptUnionParameter
              : { label: '', position: 'only' };
          return h(
            'span',
            { ref: label, class: 'fastgpt-union-parameter-marker', 'data-position': card.position },
            card.label && (card.position === 'first' || card.position === 'only')
              ? [h('span', { class: 'fastgpt-union-parameter-label' }, card.label)]
              : []
          );
        };
      }
    })
  );

  const UnionLayoutMarker = markRaw({
    render: () => h('span', { class: 'fastgpt-union-layout-marker', 'aria-hidden': true })
  });

  return () => ({
    name: 'fastgpt-union-parameter-card',
    extensions: [
      { name: 'x-fastgpt-union-parameter', component: UnionParameterLabel },
      { name: 'x-fastgpt-union-layout', component: UnionLayoutMarker }
    ]
  });
};
