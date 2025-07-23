import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectionMongo, connectionLogMongo } from '@fastgpt/service/common/mongo/index';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 测试主数据库连接
    const mainDbState = connectionMongo.connection.readyState;
    const mainDbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    // 测试日志数据库连接
    const logDbState = connectionLogMongo.connection.readyState;

    // 尝试执行一个简单的数据库操作
    let mainDbTest = 'failed';
    let logDbTest = 'failed';

    try {
      await connectionMongo.connection.db?.admin().ping();
      mainDbTest = 'success';
    } catch (error) {
      console.error('Main DB ping failed:', error);
    }

    try {
      await connectionLogMongo.connection.db?.admin().ping();
      logDbTest = 'success';
    } catch (error) {
      console.error('Log DB ping failed:', error);
    }

    return jsonRes(res, {
      data: {
        mainDatabase: {
          state: mainDbStates[mainDbState as keyof typeof mainDbStates] || 'unknown',
          stateCode: mainDbState,
          ping: mainDbTest,
          host: connectionMongo.connection.host,
          port: connectionMongo.connection.port,
          name: connectionMongo.connection.name
        },
        logDatabase: {
          state: mainDbStates[logDbState as keyof typeof mainDbStates] || 'unknown',
          stateCode: logDbState,
          ping: logDbTest,
          host: connectionLogMongo.connection.host,
          port: connectionLogMongo.connection.port,
          name: connectionLogMongo.connection.name
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Database connection test error:', err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
