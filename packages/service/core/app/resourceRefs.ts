import type { AppResourceRefsType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

/**
 * 从应用 workflow 节点中提取该版本引用的资源索引。
 * 当前只维护 skillIds，后续有真实消费场景时再补充其他资源字段。
 * 创建、保存版本、发布和历史回填共用同一套规则，避免不同写入路径统计口径漂移。
 */
export function extractAppResourceRefsFromNodes(
  nodes: StoreNodeItemType[] = []
): AppResourceRefsType {
  const skillIds = new Set<string>();

  nodes.forEach((node) => {
    node.inputs?.forEach((input) => {
      if (input.key !== NodeInputKeyEnum.skills) return;

      const value = input.value;
      const skills = Array.isArray(value) ? value : value ? [value] : [];

      skills.forEach((item) => {
        const skillId = item?.skillId;
        if (skillId) {
          skillIds.add(String(skillId));
        }
      });
    });
  });

  return {
    skillIds: Array.from(skillIds)
  };
}
