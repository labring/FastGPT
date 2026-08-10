import type { FlowNodeTypeEnum } from '../node/constant';
import type {
  FlowNodeTemplateType,
  NodeTemplateContext,
  NodeTemplateContextPredicate
} from '../type/node';

/**
 * 模板展示上下文规则：规则字段全部为空时匹配任何上下文。
 */
export type NodeTemplateContextRule = {
  sourceType?: FlowNodeTypeEnum;
  handleId?: string;
  parentType?: FlowNodeTypeEnum;
};

const matchRule = (rule: NodeTemplateContextRule, ctx: NodeTemplateContext): boolean => {
  if (rule.sourceType !== undefined && rule.sourceType !== ctx.sourceType) return false;
  if (rule.handleId !== undefined && rule.handleId !== ctx.handleId) return false;
  if (rule.parentType !== undefined && rule.parentType !== ctx.parentType) return false;
  return true;
};

/**
 * 白名单工厂：上下文非空且匹配任一规则时才展示；ctx 为 null（侧边栏）时不展示。
 */
export const createShowInContext = (
  rules: NodeTemplateContextRule[]
): NodeTemplateContextPredicate => {
  return (ctx) => !!ctx && rules.some((rule) => matchRule(rule, ctx));
};

/**
 * 黑名单工厂：匹配任一规则时隐藏；ctx 为 null（侧边栏）时正常展示。
 */
export const createHideInContext = (
  rules: NodeTemplateContextRule[]
): NodeTemplateContextPredicate => {
  return (ctx) => !ctx || !rules.some((rule) => matchRule(rule, ctx));
};

/**
 * 模板在给定上下文中是否可见：未声明谓词的模板为顶级节点，处处可见。
 */
export const isTemplateVisible = (
  template: Pick<FlowNodeTemplateType, 'isShowInContext'>,
  ctx: NodeTemplateContext | null
): boolean => {
  return !template.isShowInContext || template.isShowInContext(ctx);
};
