import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectionMongo, connectionLogMongo } from '@fastgpt/service/common/mongo/index';
import { MongoUser } from '@fastgpt/service/support/user/schema';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    const results = {
      mainConnection: {
        readyState: connectionMongo.connection.readyState,
        host: connectionMongo.connection.host,
        port: connectionMongo.connection.port,
        name: connectionMongo.connection.name
      },
      logConnection: {
        readyState: connectionLogMongo.connection.readyState,
        host: connectionLogMongo.connection.host,
        port: connectionLogMongo.connection.port,
        name: connectionLogMongo.connection.name
      },
      tests: {
        mainPing: 'pending',
        logPing: 'pending',
        userCount: 'pending',
        sessionTest: 'pending'
      }
    };

    // 测试主数据库连接
    try {
      await connectionMongo.connection.db?.admin().ping();
      results.tests.mainPing = 'success';
    } catch (error) {
      results.tests.mainPing = `failed: ${(error as any).message}`;
    }

    // 测试日志数据库连接
    try {
      await connectionLogMongo.connection.db?.admin().ping();
      results.tests.logPing = 'success';
    } catch (error) {
      results.tests.logPing = `failed: ${(error as any).message}`;
    }

    // 测试简单查询
    try {
      const userCount = await MongoUser.countDocuments();
      results.tests.userCount = `success: ${userCount} users`;
    } catch (error) {
      results.tests.userCount = `failed: ${(error as any).message}`;
    }

    // 测试会话创建
    try {
      const session = await connectionMongo.startSession();
      await session.endSession();
      results.tests.sessionTest = 'success';
    } catch (error) {
      results.tests.sessionTest = `failed: ${(error as any).message}`;
    }

    return jsonRes(res, {
      data: {
        ...results,
        timestamp: new Date().toISOString(),
        readyStates: {
          0: 'disconnected',
          1: 'connected',
          2: 'connecting',
          3: 'disconnecting'
        }
      }
    });
  } catch (err: any) {
    console.error('MongoDB health check error:', err);
    return jsonRes(res, {
      code: 500,
      error: {
        message: err.message,
        stack: err.stack
      }
    });
  }
}

export default handler;
