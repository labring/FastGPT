import express from 'express';
import cors from 'cors';
import { useUserRoute } from './service/route/user.js';
import { useAppRoute } from './service/route/app.js';
import { useKbRoute } from './service/route/kb.js';
import { useSystemRoute } from './service/route/system.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

useUserRoute(app);
useAppRoute(app);
useKbRoute(app);
useSystemRoute(app);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
