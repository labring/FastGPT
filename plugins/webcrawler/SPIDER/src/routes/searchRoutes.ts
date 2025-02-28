import express from 'express';
import searchController from '../controllers/searchController';
import authMiddleware from '../middleware/authMiddleware';

const searchRoutes = express.Router();

searchRoutes.get('/search', authMiddleware, searchController.search);

export default searchRoutes;