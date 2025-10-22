import { Router } from 'express';
import {
  getSubscriptionPlans,
  createSubscription,
  getUserSubscriptions,
  cancelSubscription,
  updateSubscriptionPaymentMethod,
  swapSubscriptionPlan,
  getUserInvoices,
  getPaymentMethod,
  createCheckoutSession,
  createSubscriptionCheckoutLink,
} from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Get all available subscription plans (public)
router.get('/plans', getSubscriptionPlans);

// Square Checkout routes
router.post('/checkout', authenticate, createCheckoutSession);
router.post('/checkout-link', authenticate, createSubscriptionCheckoutLink);

// Routes that require authentication
// Get user's subscriptions
router.get('/', authenticate, getUserSubscriptions);

// Get user's invoices
router.get('/invoices', authenticate, getUserInvoices);

// Get payment method for a customer
router.get('/payment-method/:customerId', authenticate, getPaymentMethod);

// Create a new subscription
router.post('/', authenticate, createSubscription);

// Cancel a subscription
router.delete('/:subscriptionId', authenticate, cancelSubscription);

// Update subscription payment method
router.patch('/:subscriptionId/payment-method', authenticate, updateSubscriptionPaymentMethod);

// Swap subscription plan
router.patch('/:subscriptionId/swap-plan', authenticate, swapSubscriptionPlan);

export default router;
