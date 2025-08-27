/**
 * Agent 相关的工具函数
 */

import type { AgentPlan } from './type';

/**
 * 解析计划文本为结构化数据
 */
export function parsePlanText(planText: string): AgentPlan[] {
  const plans: AgentPlan[] = [];

  try {
    // 尝试解析 JSON 格式的计划
    const parsed = JSON.parse(planText);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => ({
        id: item.id || `plan_${index}`,
        description: item.description || item.title || '',
        status: item.status || 'pending',
        result: item.result
      }));
    }
  } catch (error) {
    // 如果不是 JSON，尝试解析 Markdown 格式
    const lines = planText.split('\n');
    let currentPlan: Partial<AgentPlan> | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 检测步骤标题
      if (trimmedLine.startsWith('## Step')) {
        if (currentPlan) {
          plans.push({
            id: currentPlan.id || `plan_${plans.length}`,
            description: currentPlan.description || '',
            status: 'pending',
            ...currentPlan
          });
        }
        currentPlan = {
          id: `step_${plans.length + 1}`,
          description: trimmedLine.replace(/^## Step \d+:\s*/, ''),
          status: 'pending'
        };
      }

      // 检测任务项
      if (trimmedLine.startsWith('- [') && currentPlan) {
        const isCompleted = trimmedLine.includes('[x]') || trimmedLine.includes('[X]');
        if (isCompleted && currentPlan.status === 'pending') {
          currentPlan.status = 'completed';
        }
      }
    }

    // 添加最后一个计划
    if (currentPlan) {
      plans.push({
        id: currentPlan.id || `plan_${plans.length}`,
        description: currentPlan.description || '',
        status: 'pending',
        ...currentPlan
      });
    }
  }

  return plans;
}

/**
 * 检查计划是否全部完成
 */
export function areAllPlansCompleted(plans: AgentPlan[]): boolean {
  return plans.length > 0 && plans.every((plan) => plan.status === 'completed');
}

/**
 * 获取下一个待执行的计划
 */
export function getNextPendingPlan(plans: AgentPlan[]): AgentPlan | null {
  return plans.find((plan) => plan.status === 'pending') || null;
}

/**
 * 更新计划状态
 */
export function updatePlanStatus(
  plans: AgentPlan[],
  planId: string,
  status: AgentPlan['status']
): void {
  const plan = plans.find((p) => p.id === planId);
  if (plan) {
    plan.status = status;
  }
}
