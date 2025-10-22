import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Get token from environment
const token = process.env.SQUARE_ACCESS_TOKEN;
const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const apiVersion = process.env.SQUARE_API_VERSION || '2025-04-16';

// Validate required parameters
if (!token) {
  console.error('Square access token not found in environment variables.');
  process.exit(1);
}

// Determine base URL based on environment
const baseUrl = environment === 'sandbox' 
  ? 'https://connect.squareupsandbox.com' 
  : 'https://connect.squareup.com';

/**
 * Interface for Square API responses
 */
interface SquareResponse {
  objects?: Array<{
    id: string;
    type?: string;
    version?: number;
    is_deleted?: boolean;
    present_at_all_locations?: boolean;
    subscription_plan_data?: {
      name?: string;
    };
    subscription_plan_variation_data?: {
      name?: string;
      subscription_plan_id?: string;
      phases?: Array<{
        cadence?: string;
        pricing?: {
          type?: string;
          price_money?: {
            amount?: number;
            currency?: string;
          };
        };
      }>;
    };
    updated_at?: string;
    created_at?: string;
  }>;
  cursor?: string;
  errors?: Array<{
    category: string;
    code: string;
    detail: string;
  }>;
}

/**
 * Format money amount from cents to dollars
 */
function formatMoney(amount?: number, currency?: string): string {
  if (amount === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2
  }).format(amount / 100);
}

/**
 * Format cadence for display
 */
function formatCadence(cadence?: string): string {
  if (!cadence) return 'N/A';
  
  switch (cadence) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'QUARTERLY':
      return '3 Months';
    case 'EVERY_SIX_MONTHS':
      return '6 Months';
    case 'ANNUAL':
      return 'Annual';
    default:
      return cadence;
  }
}

/**
 * List all subscription plans in Square catalog
 */
async function listSubscriptionPlans(): Promise<void> {
  try {
    console.log(`Listing subscription plans in ${environment} environment...`);
    
    // Set up headers for the request
    const headers = {
      'Square-Version': apiVersion,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Query parameters to find subscription plans and variations
    const types = 'SUBSCRIPTION_PLAN,SUBSCRIPTION_PLAN_VARIATION';
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let totalPlans = 0;
    let totalVariations = 0;
    
    // Get all subscription plans with pagination
    while (hasMore) {
      const url = cursor 
        ? `${baseUrl}/v2/catalog/search?cursor=${cursor}` 
        : `${baseUrl}/v2/catalog/search`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          object_types: [
            "SUBSCRIPTION_PLAN",
            "SUBSCRIPTION_PLAN_VARIATION"
          ],
          include_deleted_objects: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json() as SquareResponse;
        const errorDetail = errorData.errors?.[0]?.detail || `Failed to list subscription plans: ${response.status}`;
        throw new Error(errorDetail);
      }
      
      const responseData = await response.json() as SquareResponse;
      
      if (!responseData.objects || responseData.objects.length === 0) {
        if (totalPlans === 0 && totalVariations === 0) {
          console.log('No subscription plans found.');
        }
        break;
      }
      
      // Process the results
      for (const item of responseData.objects) {
        if (item.type === 'SUBSCRIPTION_PLAN') {
          totalPlans++;
          console.log('---------------------------------------------------');
          console.log(`SUBSCRIPTION PLAN (ID: ${item.id})`);
          console.log(`Name: ${item.subscription_plan_data?.name || 'Unnamed Plan'}`);
          console.log(`Status: ${item.is_deleted ? 'DEACTIVATED' : 'ACTIVE'}`);
          console.log(`Created: ${item.created_at || 'N/A'}`);
          console.log(`Updated: ${item.updated_at || 'N/A'}`);
        } else if (item.type === 'SUBSCRIPTION_PLAN_VARIATION') {
          totalVariations++;
          console.log('---------------------------------------------------');
          console.log(`PLAN VARIATION (ID: ${item.id})`);
          console.log(`Name: ${item.subscription_plan_variation_data?.name || 'Unnamed Variation'}`);
          console.log(`Parent Plan ID: ${item.subscription_plan_variation_data?.subscription_plan_id || 'N/A'}`);
          console.log(`Status: ${item.is_deleted ? 'DEACTIVATED' : 'ACTIVE'}`);
          
          // Show pricing information if available
          const phase = item.subscription_plan_variation_data?.phases?.[0];
          if (phase) {
            console.log(`Cadence: ${formatCadence(phase.cadence)}`);
            const amount = phase.pricing?.price_money?.amount;
            const currency = phase.pricing?.price_money?.currency;
            console.log(`Price: ${formatMoney(amount, currency)}`);
          }
          
          console.log(`Created: ${item.created_at || 'N/A'}`);
          console.log(`Updated: ${item.updated_at || 'N/A'}`);
        }
      }
      
      // Check if there are more results
      cursor = responseData.cursor;
      hasMore = !!cursor;
    }
    
    console.log('---------------------------------------------------');
    console.log(`Found ${totalPlans} subscription plans and ${totalVariations} variations.`);
    console.log('---------------------------------------------------');
    console.log('To deactivate a plan or variation, run:');
    console.log('npm run cancel-subscription <catalog_item_id>');
    
  } catch (error) {
    console.error('Error listing subscription plans:', error);
    throw error;
  }
}

// Execute the function
listSubscriptionPlans()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
