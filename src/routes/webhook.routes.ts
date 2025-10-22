import { Router } from 'express';
import { handleSquareWebhook } from '../controllers/webhook.controller';

const router = Router();

// Handle Square webhook events
router.post('/square', handleSquareWebhook);

export default router;
