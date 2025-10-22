import { Router } from 'express';
import * as profileController from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, profileController.getProfile);
router.post('/notifications', authenticate, profileController.updateNotificationPreferences);
router.post('/university', authenticate, profileController.updateUniversity);
router.post('/name', authenticate, profileController.updateUserName);
router.post('/mailchimp/contacts', authenticate, profileController.addMailchimpContact);
router.post('/mailchimp/current-user', authenticate, profileController.addCurrentUserToMailchimp);
router.post('/video-usage', authenticate, profileController.updateAllowVideoUsage);
router.post('/signed-up', authenticate, profileController.updateSignedUp);

export default router;
