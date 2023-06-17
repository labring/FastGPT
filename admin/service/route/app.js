import { Model, Kb } from '../schema.js';
import { auth } from './system.js';

export const useAppRoute = (app) => {
  // 获取AI助手列表
  app.get('/models', auth(), async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort;
      const name = req.query.name || '';
      const id = req.query.id || '';

      const where = {
        ...(name && { name: { $regex: name, $options: 'i' } }),
        ...(id && { _id: id })
      };

      const modelsRaw = await Model.find(where)
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order, 'share.isShare': -1, 'share.collection': -1 });

      const models = [];

      for (const modelRaw of modelsRaw) {
        const model = modelRaw.toObject();

        // 获取与模型关联的知识库名称
        const kbNames = [];
        for (const kbId of model.chat.relatedKbs) {
          const kb = await Kb.findById(kbId);
          kbNames.push(kb.name);
        }

        const orderedModel = {
          id: model._id.toString(),
          userId: model.userId,
          name: model.name,
          intro: model.intro,
          model: model.chat?.chatModel,
          relatedKbs: kbNames, // 将relatedKbs的id转换为相应的Kb名称
          systemPrompt: model.chat?.systemPrompt || '',
          temperature: model.chat?.temperature || 0,
          'share.topNum': model.share?.topNum || 0,
          'share.isShare': model.share?.isShare || false,
          'share.collection': model.share?.collection || 0
        };

        models.push(orderedModel);
      }
      const totalCount = await Model.countDocuments(where);
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(models);
    } catch (err) {
      console.log(`Error fetching models: ${err}`);
      res.status(500).json({ error: 'Error fetching models', details: err.message });
    }
  });

  // 修改 app 信息
  app.put('/models/:id', auth(), async (req, res) => {
    try {
      const _id = req.params.id;

      let {
        share: { isShare, topNum },
        intro
      } = req.body;

      await Model.findByIdAndUpdate(_id, {
        $set: {
          intro: intro,
          'share.topNum': Number(topNum),
          'share.isShare': isShare === 'true' || isShare === true
        }
      });

      res.json({});
    } catch (err) {
      console.log(`Error updating user: ${err}`);
      res.status(500).json({ error: 'Error updating user' });
    }
  });
};
