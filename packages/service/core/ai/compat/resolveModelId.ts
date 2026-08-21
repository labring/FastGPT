import { isObjectId } from '@fastgpt/global/common/string/utils';

/**
 * Resolve a legacy model identifier (provider model name or alias) to a modelId.
 *
 * Backward-compat entry for external business systems that still send the old
 * `model` name string. Lookup rules (design §2.8):
 * 1. Valid ObjectId that exists in the system → returned as-is (active only)
 * 2. Otherwise resolve through the startup-built systemModelNameMap.
 *    The map uses active/system/ID first-wins ordering; private hits require
 *    the current team context.
 *
 * Hot-upgrade compatibility uses the startup-built unified name index. When
 * duplicate private names exist, deterministic first-wins is retained.
 *
 * @param modelOrId - provider model name, alias, or an existing ObjectId
 * @param teamId - current request team id, used to filter same-team visibility
 * @returns resolved modelId, or the original input when no match is found
 */
export function resolveModelId(modelOrId: string, teamId?: string): string {
  // 1. Valid ObjectId that exists in the system → return as-is. Active only —
  //    a disabled model must not be resolvable, matching the name branch below
  //    (design §2.8: 未激活 ObjectId 直接不解析).
  if (isObjectId(modelOrId) && global.systemModelIdMap.get(modelOrId)?.isActive) {
    return modelOrId;
  }

  // 2. Resolve legacy names from the startup-built unified index.
  if (!isObjectId(modelOrId)) {
    const hit = global.systemModelNameMap.get(modelOrId);
    if (hit) {
      if (hit.isActive === false) return modelOrId;
      if (hit.isSystem) return hit.id;
      if (teamId && String(hit.teamId) === String(teamId)) return hit.id;
    }
  }

  return modelOrId;
}
