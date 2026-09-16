import React, { useMemo } from 'react';
import CommonBatchDeleteModal from '@/components/common/batch/BatchDeleteModal';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { SkillListItemType } from './context';
import { deleteSkill } from '@/web/core/skill/api';

type BatchDeleteModalProps = {
  skills: SkillListItemType[];
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * 技能批量删除确认弹窗组件（委托至通用 CommonBatchDeleteModal）：
 * 1. 过滤无 Owner 权限的资源，并提示「已过滤无删除权限的技能」。
 * 2. 动态展示删除描述（区分纯技能、纯文件夹、技能与文件夹混选）。
 * 3. 展现待删除清单（文件夹保持文件夹图标，技能统一使用正方体图标）。
 * 4. 2 个及以上输入「确认删除」确认；单个对象沿用输入对象名称确认。
 */
const BatchDeleteModal = ({ skills, onClose, onSuccess }: BatchDeleteModalProps) => {
  const items = useMemo(
    () =>
      skills.map((skill) => ({
        ...skill,
        isFolder: skill.type === AgentSkillTypeEnum.folder
      })),
    [skills]
  );

  return (
    <CommonBatchDeleteModal
      type={'skill'}
      items={items}
      onClose={onClose}
      onSuccess={onSuccess}
      onDelete={async (deletableSkills) => {
        const deletePromises = deletableSkills.map((item) => deleteSkill(item._id));
        await Promise.all(deletePromises);
      }}
    />
  );
};

export default React.memo(BatchDeleteModal);
