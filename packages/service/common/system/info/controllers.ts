import { exit } from 'process';
import { compareVersion, getNextVersion, initScripts } from '../initScripts';
import { MongoSystemInfo } from './schema';

export async function checkSystemVersion() {
  // 1. global.systemVersion is the newest version
  // 2. version in db is the db's version
  const info = await MongoSystemInfo.findOne();
  const autoUpdate = process.env.AUTO_UPDATE === 'true';
  if (info) {
    const dbVersion = info.version;
    const systemVersion = global.systemVersion;
    if (compareVersion(dbVersion, systemVersion) < 0) {
      console.info('System version is out of date, auto updating');
      if (!autoUpdate) {
        console.info('Please update the system manually');
        return;
      }
      await MongoSystemInfo.findOneAndUpdate(
        {
          version: dbVersion
        },
        {
          $set: {
            version: global.systemVersion,
            updateTime: new Date()
          }
        }
      );
    } else if (compareVersion(dbVersion, systemVersion) === 0) {
      console.info('System version is up to date');
    } else {
      console.error('System downgrade is not permitted');
      exit(1);
    }
  } else {
    return await MongoSystemInfo.create({
      version: global.systemVersion,
      initScript: global.systemVersion
    });
  }
  await runInitScript();
}

export async function runInitScript(retry = 0): Promise<boolean> {
  const info = await MongoSystemInfo.findOne();
  if (info) {
    const initScriptVersion = info.initScript;
    const nextVersion = getNextVersion(initScriptVersion);
    if (!nextVersion) {
      console.log('System is up to date');
      return false;
    }
    const initFunc = initScripts[nextVersion];
    if (initFunc) {
      if (info.lock) {
        console.log('System is updating');
        return false;
      }
      await MongoSystemInfo.updateOne(
        { _id: info._id },
        {
          $set: {
            lock: true
          }
        }
      );
      const result = await initFunc();
      if (result) {
        console.log('run init script success: ', nextVersion);
        await MongoSystemInfo.updateOne(
          { _id: info._id },
          {
            $set: {
              initScript: nextVersion,
              lock: false
            }
          }
        );
      } else {
        console.log('run init script failed: ', nextVersion);
        console.log('retry: ', retry);
        if (retry < 3) {
          await runInitScript(retry + 1);
        } else {
          console.log('run init script failed, exit');
          await MongoSystemInfo.updateOne(
            { _id: info._id },
            {
              $set: {
                lock: false
              }
            }
          );
          exit(1);
        }
      }
    }
    const ret = await runInitScript();
    if (!ret) {
      return false;
    }
  }
  return false;
}
