import type { ClientSession } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { incrementModelCatalogRevision, type ModelCatalogScope } from './entity';

/**
 * 模型写入和目录修订号原子提交；同一目录的写入通过版本记录串行化。
 * 回调仅允许事务内数据库操作，渠道等外部 I/O 必须在提交后由生命周期层执行。
 */
export const runModelTransaction = <T>(
  context: ModelCatalogScope,
  write: (session: ClientSession) => Promise<T>
) =>
  mongoSessionRun(
    async (session) => {
      await incrementModelCatalogRevision(context, session);
      return write(session);
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
  );
