import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public auth routes
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/signup', authController.signup);
router.get('/verify', authController.verify);
router.post('/reset-password', authController.resetPassword);
router.post('/update-password', authController.updatePasswordAfterReset);
router.post('/resend-verification', authController.resendVerificationEmail);

// MFA routes (all require authentication)
router.get('/mfa/status', authenticate, authController.getMfaStatus);
router.post('/mfa/enroll', authenticate, authController.enrollMfa);

// Do NOT use authenticate middleware for /mfa/challenge
router.post('/mfa/challenge', authController.challengeMfa);

// Do NOT use authenticate middleware for /mfa/verify
router.post('/mfa/verify', authController.verifyMfaChallenge);
router.post('/mfa/disable', authenticate, authController.disableMfa);

// Email update routes
router.post('/update-email', authenticate, authController.updateEmail);
router.get('/check-email-change', authenticate, authController.checkEmailChange);
router.post('/sync-email-change', authenticate, authController.syncEmailChange);
router.post('/complete-email-change', authController.completeEmailChange);


export default router;
