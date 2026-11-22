import { defineComponent, h, markRaw, onMounted, ref, type PropType } from 'vue';

type ParameterCard = {
  label: string;
  position: 'only' | 'first' | 'middle' | 'last';
};

const UnionParameterLabel = markRaw(
  defineComponent({
    props: {
      xFastgptUnionParameter: { type: [Boolean, Object] as PropType<boolean | ParameterCard> }
    },
    setup: (props) => {
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

/**
 * 通过 Scalar 的字段扩展标记专用参数；卡片样式保留原生字段、折叠控件和调试行为。
 * 只渲染声明了扩展的字段，默认展开卡片中的当前组合，不移动或复制 Scalar 管理的节点。
 */
export const createUnionParameterCardPlugin = () => ({
  name: 'fastgpt-union-parameter-card',
  extensions: [
    { name: 'x-fastgpt-union-parameter', component: UnionParameterLabel },
    {
      name: 'x-fastgpt-union-layout',
      component: markRaw({
        render: () => h('span', { class: 'fastgpt-union-layout-marker', 'aria-hidden': true })
      })
    }
  ]
});
