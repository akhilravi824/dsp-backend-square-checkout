import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import config from '../config/config';
import squareService from '../services/square.service';

const router = Router();

// Get Square application ID and location ID
router.get('/locations', async (req, res) => {
  try {
    // Get default location ID from Square service
    const locationId = await squareService.getDefaultLocationId();
    
    // Return the application ID and location ID
    res.json({
      success: true,
      applicationId: config.square.applicationId,
      locationId: locationId,
      environment: config.square.environment
    });
  } catch (error) {
    console.error('Error fetching Square locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Square locations'
    });
  }
});

export default router;
