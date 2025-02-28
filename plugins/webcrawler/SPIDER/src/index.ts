import express, { Application } from 'express';
import bodyParser from 'body-parser';
import searchRoutes from './routes/searchRoutes';
import readRoutes from './routes/readRoutes';
import quickfetchRoutes from './routes/quickfetchRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app: Application = express();

app.use(bodyParser.json());
app.use('/api', searchRoutes);
app.use('/api', readRoutes);
app.use('/api', quickfetchRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));