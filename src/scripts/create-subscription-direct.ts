import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Get token from environment or command line
const token = process.argv[2] || process.env.SQUARE_ACCESS_TOKEN;
const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const apiVersion = process.env.SQUARE_API_VERSION || '2025-04-16';

if (!token) {
  console.error('Square access token not found. Please provide it as a command line argument or in .env file.');
  process.exit(1);
}

// Determine base URL based on environment
const baseUrl = environment === 'sandbox' 
  ? 'https://connect.squareupsandbox.com' 
  : 'https://connect.squareup.com';

/**
 * Generate a unique idempotency key
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Format cadence for display
 */
function formatCadence(cadence: string): string {
  switch (cadence) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'QUARTERLY':
      return '3 Months';
    case 'EVERY_FOUR_MONTHS':
      return '4 Months';
    case 'SEMIANNUAL':
      return '6 Months';
    case 'ANNUAL':
      return 'Annual';
    default:
      return cadence;
  }
}

// Define response type for better TypeScript support
interface SquareResponse {
  catalog_object?: {
    id: string;
    type?: string;
    subscription_plan_data?: {
      name: string;
    };
    subscription_plan_variation_data?: {
      name: string;
      subscription_plan_id?: string;
    };
  };
  errors?: Array<{
    category: string;
    code: string;
    detail: string;
  }>;
}

/**
 * Create a subscription plan with multiple cadences
 */
async function createSubscriptionPlans() {
  try {
    console.log(`Creating subscription plans in Square (${environment} environment)...`);
    
    // Define the plan details
    const planName = 'Subscription';
    const planDescription = 'Access to all 500 signs, Interactive quizzes, Advanced sign recognition';
    
    // Step 1: Create the main subscription plan
    const planRequestBody = {
      idempotency_key: generateIdempotencyKey(),
      object: {
        type: 'SUBSCRIPTION_PLAN',
        id: '#subscription_plan',
        subscription_plan_data: {
          name: planName,
          description: planDescription
        }
      }
    };

    console.log('Creating main subscription plan...');
    console.log(JSON.stringify(planRequestBody, null, 2));

    // Set up headers for the request
    const headers = {
      'Square-Version': apiVersion,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Create the main subscription plan
    const planResponse = await fetch(`${baseUrl}/v2/catalog/object`, {
      method: 'POST',
      headers,
      body: JSON.stringify(planRequestBody)
    });

    if (!planResponse.ok) {
      const errorData = await planResponse.json() as SquareResponse;
      console.error('Square API error creating plan:', errorData);
      throw new Error(`Square API error: ${planResponse.status} ${planResponse.statusText}`);
    }

    const planResponseData = await planResponse.json() as SquareResponse;
    
    if (!planResponseData.catalog_object || !planResponseData.catalog_object.id) {
      throw new Error('Failed to get subscription plan ID from response');
    }
    
    const subscriptionPlanId = planResponseData.catalog_object.id;
    console.log(`Main subscription plan created with ID: ${subscriptionPlanId}`);
    
    // Step 2: Create variations with different cadences
    const variations = [
      // Test plan with minimal cost for production testing
      {
        cadence: 'MONTHLY',
        price: 1.00, // 1 dollar for testing
        variationName: 'Test Plan (DO NOT PUBLISH)'
      },
      // Daily test plan for webhook testing
      {
        cadence: 'DAILY',
        price: 1.00, // 1 dollar for webhook testing
        variationName: 'Daily Test Plan (DO NOT PUBLISH)'
      },
      {
        cadence: 'MONTHLY',
        price: 19.99,
        variationName: 'Monthly Plan'
      },
      {
        cadence: 'EVERY_FOUR_MONTHS', 
        price: 59.95,
        variationName: 'Semester Plan (4 months)'
      },
      {
        cadence: 'ANNUAL',
        price: 155.88,
        variationName: 'Annual Plan'
      }
    ];
    
    const variationResults = [];
    
    // Create each variation as a separate catalog object
    for (const variation of variations) {
      const variationRequestBody = {
        idempotency_key: generateIdempotencyKey(),
        object: {
          type: 'SUBSCRIPTION_PLAN_VARIATION',
          id: `#${variation.cadence.toLowerCase()}_variation`,
          subscription_plan_variation_data: {
            name: variation.variationName,
            subscription_plan_id: subscriptionPlanId,
            phases: [
              {
                cadence: variation.cadence,
                pricing: {
                  type: 'STATIC',
                  price_money: {
                    amount: Math.round(variation.price * 100), // Convert to cents
                    currency: 'USD'
                  }
                },
                ordinal: 0
              }
            ]
          }
        }
      };
      
      console.log(`Creating ${variation.variationName} variation...`);
      
      const variationResponse = await fetch(`${baseUrl}/v2/catalog/object`, {
        method: 'POST',
        headers,
        body: JSON.stringify(variationRequestBody)
      });
      
      if (!variationResponse.ok) {
        const errorData = await variationResponse.json() as SquareResponse;
        console.error(`Square API error creating ${variation.variationName} variation:`, errorData);
        continue; // Continue with other variations even if one fails
      }
      
      const variationResponseData = await variationResponse.json() as SquareResponse;
      
      if (variationResponseData.catalog_object && variationResponseData.catalog_object.id) {
        console.log(`${variation.variationName} variation created with ID: ${variationResponseData.catalog_object.id}`);
        variationResults.push({
          name: variation.variationName,
          id: variationResponseData.catalog_object.id,
          cadence: variation.cadence,
          price: variation.price
        });
      }
    }
    
    console.log('\nSubscription plan setup completed successfully!');
    console.log(`Main Plan ID: ${subscriptionPlanId}`);
    
    if (variationResults.length > 0) {
      console.log('Variation IDs:');
      variationResults.forEach(v => {
        console.log(`- ${v.name} (${formatCadence(v.cadence)}, $${v.price}): ${v.id}`);
      });
    }
    
    return {
      planId: subscriptionPlanId,
      variations: variationResults
    };
  } catch (error) {
    console.error('Error creating subscription plans:', error);
    throw error;
  }
}

// Execute the function
createSubscriptionPlans()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
