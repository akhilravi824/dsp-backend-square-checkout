import { Router } from 'express';
import { getUserProgress, updateProgress } from '../controllers/progress.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all progress routes
router.use(authenticate);

// Get user progress
router.get('/', getUserProgress);

// Update user progress
router.post('/update', updateProgress);

export default router;
