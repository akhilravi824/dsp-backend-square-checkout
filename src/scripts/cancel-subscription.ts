/**
 * Square Subscription Plan Deactivation Tool
 * 
 * This script deactivates Square subscription plans and their variations by marking them
 * as unavailable in Square's catalog. Since Square doesn't allow direct deletion of
 * subscription plans, this script uses a workaround:
 * 
 * 1. Sets present_at_all_locations to false
 * 2. Prefixes the name with "[DEACTIVATED]"
 * 
 * When deactivating a parent plan, all variations must be deactivated first.
 * This script automatically handles this requirement by:
 * 1. Detecting if the target is a parent plan with variations
 * 2. Deactivating all variations first
 * 3. Then deactivating the parent plan
 * 
 * Usage: npm run cancel-subscription <CATALOG_ITEM_ID>
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Set up environment variables
const token = process.env.SQUARE_ACCESS_TOKEN;
const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const apiVersion = process.env.SQUARE_API_VERSION || '2025-04-16';

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
 * 
 * This interface handles the different response formats from Square's Catalog API.
 * Square's API can return objects in different structures depending on the endpoint:
 * - GET /v2/catalog/object/{id} returns data in the 'object' property
 * - POST /v2/catalog/object (upsert) returns data in the 'catalog_object' property
 */
interface SquareResponse {
  // For catalog/object endpoint
  catalog_object?: {
    id: string;
    type?: string;
    version?: number;
    is_deleted?: boolean;
    present_at_all_locations?: boolean;
    subscription_plan_data?: {
      name?: string;
      phases?: Array<any>;
      subscription_plan_variations?: Array<{
        id: string;
        type?: string;
        version?: number;
        is_deleted?: boolean;
        subscription_plan_variation_data?: {
          name?: string;
          phases?: Array<any>;
          subscription_plan_id?: string;
        };
      }>;
    };
    subscription_plan_variation_data?: {
      name?: string;
      phases?: Array<any>;
      subscription_plan_id?: string;
    };
    updated_at?: string;
    created_at?: string;
  };
  // For catalog/object/{id} endpoint
  object?: {
    id: string;
    type?: string;
    version?: number;
    is_deleted?: boolean;
    present_at_all_locations?: boolean;
    subscription_plan_data?: {
      name?: string;
      phases?: Array<any>;
      subscription_plan_variations?: Array<{
        id: string;
        type?: string;
        version?: number;
        is_deleted?: boolean;
        subscription_plan_variation_data?: {
          name?: string;
          phases?: Array<any>;
          subscription_plan_id?: string;
        };
      }>;
    };
    subscription_plan_variation_data?: {
      name?: string;
      phases?: Array<any>;
      subscription_plan_id?: string;
    };
    updated_at?: string;
    created_at?: string;
  };
  errors?: Array<{
    category: string;
    code: string;
    detail: string;
  }>;
}

/**
 * Deactivate a subscription plan or variation in Square's catalog
 * 
 * This function implements a workaround for Square's limitation that prevents
 * direct deletion of subscription plans. Instead, it:
 * 1. Sets present_at_all_locations to false (making it unavailable)
 * 2. Prefixes the name with "[DEACTIVATED]"
 * 
 * For parent subscription plans, it automatically deactivates all variations first
 * before deactivating the parent plan (unless skipVariationCheck is true).
 * 
 * @param catalogItemId - The Square catalog item ID to deactivate
 * @param skipVariationCheck - If true, skips checking for variations (used internally to prevent recursion)
 * @returns A promise that resolves when deactivation is complete
 */
async function deactivateSubscriptionPlan(catalogItemId: string, skipVariationCheck: boolean = false): Promise<void> {
  try {
    console.log(`Deactivating subscription plan with ID: ${catalogItemId} in ${environment} environment...`);
    
    // Set up headers for API calls
    const headers = {
      'Square-Version': apiVersion,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    console.log(`Checking catalog item status...`);
    
    // Fetch the catalog item to check its current status
    const response = await fetch(`${baseUrl}/v2/catalog/object/${catalogItemId}`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.errors?.[0]?.detail || `Failed to fetch catalog item: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    // The response structure can vary, so we need to handle both formats
    let catalogObject = data.object || data.catalog_object;
    
    if (!catalogObject) {
      throw new Error(`Catalog item with ID ${catalogItemId} not found`);
    }
    
    const objectType = catalogObject.type;
    let objectVersion = catalogObject.version;
    
    if (catalogObject.is_deleted) {
      console.log(`Catalog item ${catalogItemId} is already deactivated.`);
      return;
    }
    
    // VARIATION HANDLING: Check if this is a subscription plan with variations
    // Square requires all variations to be deactivated before the parent plan can be deactivated
    if (!skipVariationCheck && objectType === 'SUBSCRIPTION_PLAN' && 
        catalogObject.subscription_plan_data?.subscription_plan_variations?.length > 0) {
      const variations = catalogObject.subscription_plan_data.subscription_plan_variations;
      console.log(`This subscription plan has ${variations.length} variations.`);
      console.log(`Deactivating all variations first before deactivating the parent plan...`);
      
      // Track successful deactivations
      const deactivatedVariations: string[] = [];
      const failedVariations: {id: string, name: string, error: string}[] = [];
      
      // Deactivate each variation first
      for (const variation of variations) {
        const variationId = variation.id;
        const variationName = variation.subscription_plan_variation_data?.name || 'Unknown';
        
        try {
          console.log(`\n----- Deactivating variation: ${variationName} (${variationId}) -----`);
          // Skip variation check to avoid infinite recursion
          await deactivateSubscriptionPlan(variationId, true);
          deactivatedVariations.push(variationId);
          console.log(`Successfully deactivated variation: ${variationName} (${variationId})`);
        } catch (error: any) {
          console.error(`Failed to deactivate variation ${variationName} (${variationId}): ${error.message || 'Unknown error'}`);
          failedVariations.push({id: variationId, name: variationName, error: error.message || 'Unknown error'});
        }
      }
      
      // Summary of variation deactivation
      console.log(`\n----- Variation Deactivation Summary -----`);
      console.log(`Total variations: ${variations.length}`);
      console.log(`Successfully deactivated: ${deactivatedVariations.length}`);
      console.log(`Failed to deactivate: ${failedVariations.length}`);
      
      if (failedVariations.length > 0) {
        console.log(`\nFailed variations:`);
        failedVariations.forEach(v => console.log(`- ${v.name} (${v.id}): ${v.error}`));
        console.log(`\nSome variations could not be deactivated. The parent plan may not be fully deactivated.`);
      }
      
      console.log(`\n----- Now deactivating parent plan: ${catalogItemId} -----`);
      
      // Refetch the catalog item to get the latest version after variation updates
      const refreshResponse = await fetch(`${baseUrl}/v2/catalog/object/${catalogItemId}`, {
        method: 'GET',
        headers
      });
      
      if (!refreshResponse.ok) {
        const refreshErrorData = await refreshResponse.json();
        throw new Error(refreshErrorData.errors?.[0]?.detail || `Failed to refresh catalog item: ${refreshResponse.statusText}`);
      }
      
      const refreshData = await refreshResponse.json();
      const refreshedObject = refreshData.object || refreshData.catalog_object;
      
      if (!refreshedObject) {
        throw new Error(`Refreshed catalog item with ID ${catalogItemId} not found`);
      }
      
      // Use the refreshed object and version
      catalogObject = refreshedObject;
      objectVersion = refreshedObject.version;
    }
    
    console.log(`Found ${objectType}: ${catalogItemId}, version: ${objectVersion}`);
    console.log('Proceeding with deactivation...');
    
    // DEACTIVATION STRATEGY: Since Square doesn't allow direct deletion of subscription plans,
    // we implement a soft-deactivation approach with two key changes:
    // 1. Set present_at_all_locations to false (makes the plan unavailable to customers)
    // 2. Add a "[DEACTIVATED]" prefix to the name for easy identification
    const idempotencyKey = `deactivate-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;    
    
    // Clone the original object to preserve all required fields
    const updatedObject = JSON.parse(JSON.stringify(catalogObject));
    
    // Mark it as not present at any locations
    updatedObject.present_at_all_locations = false;
    
    // Update the version number
    updatedObject.version = objectVersion;
    
    // Update the name to indicate it's deactivated
    // This provides visual indication in the Square Dashboard that the plan is no longer active
    // We check if the name already has the prefix to avoid adding it multiple times
    if (objectType === 'SUBSCRIPTION_PLAN_VARIATION' && updatedObject.subscription_plan_variation_data) {
      const currentName = updatedObject.subscription_plan_variation_data.name || '';
      if (!currentName.startsWith('[DEACTIVATED]')) {
        updatedObject.subscription_plan_variation_data.name = `[DEACTIVATED] ${currentName}`;
      }
    } else if (objectType === 'SUBSCRIPTION_PLAN' && updatedObject.subscription_plan_data) {
      const currentName = updatedObject.subscription_plan_data.name || '';
      if (!currentName.startsWith('[DEACTIVATED]')) {
        updatedObject.subscription_plan_data.name = `[DEACTIVATED] ${currentName}`;
      }
    }
    
    // Prepare the upsert request
    const upsertBody = {
      idempotency_key: idempotencyKey,
      object: updatedObject
    };
    
    console.log(`Using upsert endpoint to deactivate catalog item ${catalogItemId}...`);
    console.log('Request body:', JSON.stringify(upsertBody, null, 2));
    
    const updateResponse = await fetch(`${baseUrl}/v2/catalog/object`, {
      method: 'POST',
      headers,
      body: JSON.stringify(upsertBody)
    });
    
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json() as SquareResponse;
      const errorDetail = errorData.errors?.[0]?.detail || `Failed to deactivate catalog item: ${updateResponse.status}`;
      throw new Error(errorDetail);
    }
    
    const responseData = await updateResponse.json() as SquareResponse;
    console.log('Subscription plan deactivated successfully!');
    console.log(`Catalog Item ID: ${responseData.catalog_object?.id}`);
    console.log(`Type: ${responseData.catalog_object?.type}`);
    console.log(`Is Deleted: ${responseData.catalog_object?.is_deleted}`);
    console.log(`Updated At: ${responseData.catalog_object?.updated_at}`);
    
  } catch (error) {
    console.error('Error deactivating subscription plan:', error);
    throw error;
  }
}

// Helper for colorized console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Main execution
if (process.argv.length < 3) {
  console.error(`${colors.red}${colors.bright}ERROR: Please provide a catalog item ID${colors.reset}`);
  console.log(`\nUsage: ${colors.cyan}npm run cancel-subscription <CATALOG_ITEM_ID>${colors.reset}`);
  console.log(`\nTo find catalog item IDs, run: ${colors.cyan}npm run list-subscription-plans${colors.reset}`);
  process.exit(1);
}

const catalogItemId = process.argv[2];
console.log(`${colors.bright}=== Square Subscription Plan Deactivation Tool ===${colors.reset}`);
console.log(`${colors.dim}This tool will mark a subscription plan or variation as unavailable in Square's catalog.${colors.reset}`);
console.log(`${colors.dim}It will NOT delete the item, but will set present_at_all_locations=false and prefix the name.${colors.reset}\n`);

deactivateSubscriptionPlan(catalogItemId)
  .then(() => console.log(`\n${colors.green}${colors.bright}✓ Script completed successfully${colors.reset}`))
  .catch(error => {
    console.error(`\n${colors.red}${colors.bright}✗ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
