import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Get token from environment or command line
const token = process.argv[2] || process.env.SQUARE_ACCESS_TOKEN;
const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const apiVersion = process.env.SQUARE_API_VERSION || '2025-04-16';

// Get subscription plan ID from command line argument
const subscriptionPlanId = process.argv[3];

if (!token) {
  console.error('Square access token not found. Please provide it as a command line argument or in .env file.');
  process.exit(1);
}

if (!subscriptionPlanId) {
  console.error('Subscription plan ID required. Usage: npm run ts-node src/scripts/add-daily-variation.ts [token] [subscription_plan_id]');
  console.error('Example: npm run ts-node src/scripts/add-daily-variation.ts your_token PLAN_ID_HERE');
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
 * Add daily variation to existing subscription plan
 */
async function addDailyVariation(): Promise<void> {
  try {
    console.log(`Adding daily variation to subscription plan in ${environment} environment...`);
    console.log(`Using API version: ${apiVersion}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Subscription Plan ID: ${subscriptionPlanId}`);

    const headers = {
      'Square-Version': apiVersion,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Create the daily variation
    const variationRequestBody = {
      idempotency_key: generateIdempotencyKey(),
      object: {
        type: 'SUBSCRIPTION_PLAN_VARIATION',
        id: '#daily_variation',
        subscription_plan_variation_data: {
          name: 'Daily Test Plan',
          subscription_plan_id: subscriptionPlanId,
          phases: [
            {
              cadence: 'DAILY',
              pricing: {
                type: 'STATIC',
                price_money: {
                  amount: 100, // $1.00 in cents
                  currency: 'USD'
                }
              }
            }
          ]
        }
      }
    };

    console.log('Creating daily variation...');
    
    const variationResponse = await fetch(`${baseUrl}/v2/catalog/object`, {
      method: 'POST',
      headers,
      body: JSON.stringify(variationRequestBody)
    });

    if (!variationResponse.ok) {
      const errorText = await variationResponse.text();
      throw new Error(`Failed to create daily variation: ${variationResponse.status} ${errorText}`);
    }

    const variationResponseData = await variationResponse.json();
    
    if (!variationResponseData.catalog_object?.id) {
      console.error('Variation response:', JSON.stringify(variationResponseData, null, 2));
      throw new Error('Failed to get variation ID from response');
    }

    console.log('\n=== DAILY VARIATION CREATED ===');
    console.log(`Variation ID: ${variationResponseData.catalog_object.id}`);
    console.log(`Name: Daily Test Plan`);
    console.log(`Cadence: DAILY`);
    console.log(`Price: $1.00/day`);
    console.log(`Parent Plan: ${subscriptionPlanId}`);

    console.log('\n=== WEBHOOK TESTING READY ===');
    console.log('1. Subscribe a test user to this daily plan');
    console.log('2. Immediately swap to another plan (e.g., Monthly Plan)');
    console.log('3. Monitor webhook logs for ~24 hours');
    console.log('4. Verify both initial and effectuation webhooks are received');

  } catch (error) {
    console.error('Error adding daily variation:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  addDailyVariation()
    .then(() => {
      console.log('\nDaily variation added successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { addDailyVariation };
