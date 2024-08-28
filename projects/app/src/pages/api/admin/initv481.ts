import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { connectionMongo } from '@fastgpt/service/common/mongo';

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  // 重命名 dataset.trainigns -> dataset_trainings
  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'dataset.trainings' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('dataset.trainings');
      const targetCol = connectionMongo.connection.db.collection('dataset_trainings');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'dataset_trainings 中有数据，无法自动将 dataset.trainings 迁移到 dataset_trainings，请手动操作'
        );
      } else {
        await sourceCol.rename('dataset_trainings', { dropTarget: true });
        console.log('success rename dataset.trainings -> dataset_trainings');
      }
    }
  } catch (error) {
    console.log('error： rename dataset.trainings -> dataset_trainings', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'dataset.collections' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('dataset.collections');
      const targetCol = connectionMongo.connection.db.collection('dataset_collections');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'dataset_collections 中有数据，无法自动将 dataset.collections 迁移到 dataset_collections，请手动操作'
        );
      } else {
        await sourceCol.rename('dataset_collections', { dropTarget: true });
        console.log('success rename dataset.collections -> dataset_collections');
      }
    }
  } catch (error) {
    console.log('error： rename dataset.collections -> dataset_collections', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'dataset.datas' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('dataset.datas');
      const targetCol = connectionMongo.connection.db.collection('dataset_datas');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'dataset_datas 中有数据，无法自动将 dataset.datas 迁移到 dataset_datas，请手动操作'
        );
      } else {
        await sourceCol.rename('dataset_datas', { dropTarget: true });
        console.log('success rename dataset.datas -> dataset_datas');
      }
    }
  } catch (error) {
    console.log('error： rename dataset.datas -> dataset_datas', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'app.versions' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('app.versions');
      const targetCol = connectionMongo.connection.db.collection('app_versions');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'app_versions 中有数据，无法自动将 app.versions 迁移到 app_versions，请手动操作'
        );
      } else {
        await sourceCol.rename('app_versions', { dropTarget: true });
        console.log('success rename app.versions -> app_versions');
      }
    }
  } catch (error) {
    console.log('error： rename app.versions -> app_versions', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'buffer.rawtexts' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('buffer.rawtexts');
      const targetCol = connectionMongo.connection.db.collection('buffer_rawtexts');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'buffer_rawtexts 中有数据，无法自动将 buffer.rawtexts 迁移到 buffer_rawtexts，请手动操作'
        );
      } else {
        await sourceCol.rename('buffer_rawtexts', { dropTarget: true });
        console.log('success rename buffer.rawtexts -> buffer_rawtexts');
      }
    }
  } catch (error) {
    console.log('error： rename buffer.rawtext -> buffer_rawtext', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'buffer.tts' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('buffer.tts');
      const targetCol = connectionMongo.connection.db.collection('buffer_tts');

      if ((await targetCol.countDocuments()) > 0) {
        console.log('buffer_tts 中有数据，无法自动将 buffer.tts 迁移到 buffer_tts，请手动操作');
      } else {
        await sourceCol.rename('buffer_tts', { dropTarget: true });
        console.log('success rename buffer.tts -> buffer_tts');
      }
    }
  } catch (error) {
    console.log('error： rename buffer.tts -> buffer_tts', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'team.members' })
      .toArray();

    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('team.members');
      const targetCol = connectionMongo.connection.db.collection('team_members');

      if ((await targetCol.countDocuments()) > 1) {
        // 除了root
        console.log('team_members 中有数据，无法自动将 team.tts 迁移到 team_members，请手动操作');
      } else {
        await sourceCol.rename('team_members', { dropTarget: true });
        console.log('success rename team.members -> team_members');
      }
    }
  } catch (error) {
    console.log('error： rename team.members -> team_members', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'team.tags' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('team.tags');
      const targetCol = connectionMongo.connection.db.collection('team_tags');

      if ((await targetCol.countDocuments()) > 0) {
        console.log('team_tags 中有数据，无法自动将 team.tags 迁移到 team_tags，请手动操作');
      } else {
        await sourceCol.rename('team_tags', { dropTarget: true });
        console.log('success rename team.tags -> team_tags');
      }
    }
  } catch (error) {
    console.log('error： rename team.tags -> team_tags', error);
  }

  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'team.subscriptions' })
      .toArray();
    if (collections.length > 0) {
      const sourceCol = connectionMongo.connection.db.collection('team.subscriptions');
      const targetCol = connectionMongo.connection.db.collection('team_subscriptions');

      if ((await targetCol.countDocuments()) > 0) {
        console.log(
          'team_subscriptions 中有数据，无法自动将 team.subscriptions 迁移到 team_subscriptions，请手动操作'
        );
      } else {
        await sourceCol.rename('team_subscriptions', { dropTarget: true });
        console.log('success rename team.subscriptions -> team_subscriptions');
      }
    }
  } catch (error) {
    console.log('error： rename team.subscriptions -> team_subscriptions', error);
  }

  jsonRes(res, {
    message: 'success'
  });
}

export default NextAPI(handler);
