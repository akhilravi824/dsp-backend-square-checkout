import { Router } from 'express';
import multer from 'multer';

// Configure multer for video uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

const router = Router();

// Import controllers after defining the router to avoid circular dependencies
import * as videoController from '../controllers/video.controller';
import { authenticate } from '../middleware/auth.middleware';

// Video upload endpoint
router.post('/upload', upload.single('video'), videoController.uploadVideo);

// Proxy endpoint to forward video to external service
router.post('/proxy-upload', authenticate, upload.single('video'), videoController.proxyUpload);

export default router;
