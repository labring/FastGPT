import express from 'express';
import { quickFetch } from '../controllers/quickfetchController';
import authMiddleware from '../middleware/authMiddleware';

const readRoutes = express.Router();

readRoutes.get('/quickFetch', authMiddleware, quickFetch);

export default readRoutes;