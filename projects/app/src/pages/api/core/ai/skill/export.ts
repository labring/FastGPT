import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextAPI } from '@/service/middleware/entry';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { ExportSkillQuerySchema } from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { buildSkillAuditResource } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { streamSkillEditWorkspaceTarZst } from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import { parseTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR } from '@fastgpt/service/core/ai/sandbox/constants';

export const config = {
  api: {
    responseLimit: '200mb'
  }
};

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.EXPORT);

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { skillId } = parseApiInput({ req, querySchema: ExportSkillQuerySchema }).query;

  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (skill.type === AgentSkillTypeEnum.folder) {
    return jsonRes(res, { code: 400, error: 'Folders cannot be exported' });
  }

  logger.debug('Exporting skill edit workspace', { skillId, skillName: skill.name });

  const filename = `${skill.name}.zip`;
  const abortController = new AbortController();
  const onResponseClose = () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };
  res.once('close', onResponseClose);

  try {
    await streamSkillEditWorkspaceTarZst({
      skillId,
      teamId,
      signal: abortController.signal,
      onStreamReady: async (tarZstStream) => {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Cache-Control', 'no-store');
        res.status(200);

        // 边解析 `.tar.zst` 边写 zip：任一侧出错都通过同一个中止信号终止整条链路。
        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (error) => abortController.abort(error));
        const zipTask = pipeline(archive, res as unknown as NodeJS.WritableStream);
        zipTask.catch((error) => abortController.abort(error));

        let hasSkillMd = false;
        try {
          await parseTarZstStream({
            stream: tarZstStream,
            signal: abortController.signal,
            onEntry: async (entry) => {
              if (entry.type === 'file' && /(?:^|\/)skill\.md$/i.test(entry.path)) {
                hasSkillMd = true;
              }
              const data = { name: entry.path, mode: entry.mode, date: entry.mtime };
              if (entry.type === 'symlink') {
                archive.symlink(entry.path, entry.linkname ?? '', entry.mode);
              } else if (entry.type === 'directory') {
                archive.append(Buffer.alloc(0), data);
              } else {
                const body = new PassThrough();
                archive.append(body, data);
                await pipeline(entry.stream, body, { signal: abortController.signal });
              }
            }
          });
          if (!hasSkillMd) {
            throw new Error(
              'Missing required file: SKILL.md (expected at root or inside a top-level directory)'
            );
          }
          await archive.finalize();
          await zipTask;
        } catch (error) {
          // 响应头已发出，只能中断 zip 流让客户端感知下载失败。
          archive.destroy(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR) {
      return jsonRes(res, { code: 404, error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR });
    }

    throw error;
  } finally {
    res.off('close', onResponseClose);
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_SKILL,
      resources: [
        buildSkillAuditResource({
          _id: skillId,
          name: skill.name,
          avatar: skill.avatar,
          type: skill.type
        })
      ],
      params: {
        skillName: skill.name,
        skillType: getI18nSkillType(skill.type)
      }
    });
  })();
}

export default NextAPI(handler);
