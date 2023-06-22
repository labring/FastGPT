import { OpenAIKey } from '../schema.js';
import { auth } from './system.js';

export const useOpenAIKeyRoute = (app) => {
  // 获取用户知识库列表
  app.get('/openaikey', auth(), async (req, res) => {
    try {
      const start = parseInt(req.query._start) || 0;
      const end = parseInt(req.query._end) || 20;
      const order = req.query._order === 'DESC' ? -1 : 1;
      const sort = req.query._sort || '_id';
      const apiKey = req.query.apiKey || '';

      const where = {
        ...(apiKey
          ? {
              apiKey: { $regex: apiKey, $options: 'i' }
            }
          : {})
      };
      console.log(where);

      const OpenAIKeysRaw = await OpenAIKey.find(where)
        .skip(start)
        .limit(end - start)
        .sort({ [sort]: order });

      const totalCount = await OpenAIKey.countDocuments(where);
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      res.header('X-Total-Count', totalCount);
      res.json(
        OpenAIKeysRaw.map((item) => {
          const obj = item.toObject();
          return {
            ...obj,
            id: obj._id,
            balanceTotal: obj.balanceTotal.toFixed(0),
            balanceAvailable: obj.balanceAvailable.toFixed(4),
            balanceUsed: obj.balanceUsed.toFixed(4)
          };
        })
      );
    } catch (err) {
      console.log(`Error fetching openaikeys: ${err}`);
      res.status(500).json({ error: 'Error fetching openaikeys', details: err.message });
    }
  });
  app.post('/openaikey', auth(), async (req, res) => {
    try {
      await OpenAIKey.create({
        ...req.body
      });

      res.json({});
    } catch (error) {
      res.status(500).json({ error: 'Error creating OpenAIKey' });
    }
  });
  app.put('/openaikey/:id', auth(), async (req, res) => {
    try {
      const _id = req.params.id;
      await OpenAIKey.findByIdAndUpdate(_id, {
        ...req.body
      });

      res.json({});
    } catch (error) {
      res.status(500).json({ error: 'Error updating OpenAIKey' });
    }
  });
  app.delete('/openaikey/:id', auth(), async (req, res) => {
    try {
      const _id = req.params.id;
      await OpenAIKey.findByIdAndDelete(_id);

      res.json({});
    } catch (error) {
      res.status(500).json({ error: 'Error updating OpenAIKey' });
    }
  });
};
