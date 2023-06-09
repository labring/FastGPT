import { User, Model, Kb } from '../schema.js';

export const useAppRoute = (app) => {
  // 获取AI助手列表
  app.get('/models', async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort || '_id';
      const userId = req.query.userId || '';
      const name = req.query.name || '';
      const where = {
        ...(userId ? { userId: userId } : {}),
        name
      };

      const modelsRaw = await Model.find()
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order });

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
          relatedKbs: kbNames, // 将relatedKbs的id转换为相应的Kb名称
          searchMode: model.chat?.searchMode,
          systemPrompt: model.chat?.systemPrompt || '',
          temperature: model.chat?.temperature
        };

        models.push(orderedModel);
      }
      const totalCount = await Model.countDocuments();
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(models);
    } catch (err) {
      console.log(`Error fetching models: ${err}`);
      res.status(500).json({ error: 'Error fetching models', details: err.message });
    }
  });
};
