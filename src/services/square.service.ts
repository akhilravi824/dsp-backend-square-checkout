import { SquareClient, Square, SquareEnvironment } from 'square';
import { Client, Environment } from 'square/legacy';

class SquareService {
  private _client: SquareClient | null;
  private _legacyClient: Client | null;
  private _environment: 'sandbox' | 'production';
  private _apiVersion: string = '2025-04-16'; // Default value to latest API version

  constructor() {
    try {
      // Get environment from .env file, default to sandbox for safety
      this._environment = (process.env.SQUARE_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
      
      // Get token from .env file
      const token = process.env.SQUARE_ACCESS_TOKEN;
      
      // Get API version from .env file or use default
      this._apiVersion = process.env.SQUARE_API_VERSION || '2025-04-16';
      
      if (!token) {
        throw new Error('Square access token not found in environment variables');
      }
      
      // Log partial token for debugging (safely)
      const tokenPreview = token.substring(0, 6) + '...' + token.substring(token.length - 4);
      console.log(`Initializing Square clients in ${this._environment} environment with token: ${tokenPreview}`);
      
      // Initialize modern client
      this._client = new SquareClient({
        environment: this._environment === 'sandbox' ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
        token: token,
      });
      
      // Initialize legacy client
      this._legacyClient = new Client({
        bearerAuthCredentials: {
          accessToken: token
        },
        environment: this._environment === 'sandbox' ? Environment.Sandbox : Environment.Production
      });
      
      console.log(`Square clients initialized in ${this._environment} environment`);
    } catch (error) {
      console.error('Error initializing Square client:', error);
      this._client = null;
      this._legacyClient = null;
      this._environment = 'sandbox';
    }
  }

  /**
   * Get Square client
   */
  get client(): SquareClient | null {
    return this._client;
  }

  /**
   * Get current environment
   */
  get environment(): string {
    return this._environment;
  }

  /**
   * Get Square API version
   */
  get apiVersion(): string {
    return this._apiVersion;
  }

  /**
   * Generate a unique idempotency key
   * @returns Idempotency key string
   */
  private generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * List locations associated with the Square account
   * @returns List of locations
   */
  async listLocations() {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      const response = await this._client.locations.list();
      return response;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Locations Error: ${errorMessage}`);
    }
  }

  /**
   * Create a Square customer and link to user profile
   * @param user User data for creating customer
   * @returns Square customer id
   */
  async createCustomer(user: { name: string; email: string; id: string }) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      // First, check if a customer with this email already exists
      console.log(`Checking if customer with email ${user.email} already exists`);
      
      try {
        // Use direct API call to search for customers by email
        const baseUrl = this._environment === 'sandbox' ? 
          'https://connect.squareupsandbox.com' : 
          'https://connect.squareup.com';
        
        const token = process.env.SQUARE_ACCESS_TOKEN;
        const headers = {
          'Square-Version': this._apiVersion,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        // Create search request body
        const searchBody = {
          query: {
            filter: {
              email_address: {
                exact: user.email
              }
            }
          }
        };
        
        const response = await fetch(`${baseUrl}/v2/customers/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify(searchBody)
        });
        
        if (response.ok) {
          const responseData = await response.json();
          
          // If customer already exists, return that ID
          if (responseData.customers && responseData.customers.length > 0) {
            console.log(`Found existing customer with email ${user.email}`);
            return responseData.customers[0].id;
          }
        } else {
          console.log('Customer search returned non-OK response:', await response.text());
        }
      } catch (error) {
        console.log('Error searching for existing customer:', error);
        // Continue with customer creation if search fails
      }
      
      // If no existing customer, create a new one
      console.log(`No existing customer found, creating new customer for ${user.email}`);
      const response = await this._client.customers.create({
        idempotencyKey: this.generateIdempotencyKey(),
        givenName: user.name.split(' ')[0],
        familyName: user.name.split(' ').slice(1).join(' '),
        emailAddress: user.email,
        referenceId: user.id // Link to your user ID
      });
      
      if (response.customer?.id) {
        return response.customer.id;
      }
      
      throw new Error('Failed to create Square customer');
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Customer Creation Error: ${errorMessage}`);
    }
  }

  /**
   * Store a payment method for a customer
   * @param customerId Square customer ID
   * @param sourceId Payment source ID (card nonce)
   * @returns Stored card information
   */
  async storeCustomerCard(customerId: string, sourceId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      const response = await this._client.cards.create({
        idempotencyKey: this.generateIdempotencyKey(),
        sourceId: sourceId,
        card: {
          customerId: customerId,
        }
      });
      
      return response.card;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Card Storage Error: ${errorMessage}`);
    }
  }

  /**
   * List available subscription plans
   * @returns List of subscription plans
   */
  async listSubscriptionPlans() {
    try {
      if (!this._client || !this._legacyClient) {
        throw new Error('Square client not initialized');
      }

      // Use the legacy client to fetch catalog items
      const response = await this._legacyClient.catalogApi.listCatalog();
      
      // Filter for subscription plans
      const plans = response.result.objects?.filter(
        (obj: any) => obj.type === 'SUBSCRIPTION_PLAN'
      ) || [];
      
      return plans;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square List Subscription Plans Error: ${errorMessage}`);
    }
  }

  /**
   * Create a subscription for a customer
   * @param customerId Square customer ID
   * @param planVariationId Square catalog object ID for subscription plan variation
   * @param cardId Card ID to use for billing (optional)
   * @param planData Plan data including pricing information (optional)
   * @returns Created subscription
   */
  async createSubscription(
    customerId: string, 
    planVariationId: string, 
    cardId?: string,
    planData?: {
      name?: string;
      price?: number;
      currency?: string;
      interval?: string;
      phases?: any[];
      hasRelativePricing?: boolean;
      phaseOrdinals?: any[]; // Add type for phase ordinals
    }
  ) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }
      
      console.log('Creating subscription with params:', { 
        customerId, 
        planVariationId, 
        cardId: cardId || 'not provided',
        planData: planData ? 'provided' : 'not provided'
      });
      
      try {
        // Create basic request with required fields
        const locationId = await this.getDefaultLocationId();
        const idempotencyKey = this.generateIdempotencyKey();
        const startDate = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        // Check if this plan uses RELATIVE pricing
        const hasRelativePricing = planData?.hasRelativePricing;
        
        // For RELATIVE pricing plans, we have to use a direct REST API call
        // due to a confirmed bug in Square SDK v40+ with BigInt serialization
        if (hasRelativePricing) {
          console.log('Using direct REST API for RELATIVE pricing plan (Square SDK BigInt bug workaround)');
          console.log(`Using variation ID: ${planVariationId}`);
          
          // Calculate price in cents
          const priceCents = planData?.price ? Math.round(planData.price * 100) : 1999;
          const currency = planData?.currency || 'USD';
          
          // Base URL for Square API based on environment
          const baseUrl = this._environment === 'sandbox' ? 
            'https://connect.squareupsandbox.com' : 
            'https://connect.squareup.com';
          
          const token = process.env.SQUARE_ACCESS_TOKEN;
          const headers = {
            'Square-Version': this._apiVersion,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          };
          
          // Step 1: Create an order template first
          console.log('Creating order template for RELATIVE pricing plan...');
          const orderTemplateIdempotencyKey = this.generateIdempotencyKey();
          
          const orderRequest = {
            idempotency_key: orderTemplateIdempotencyKey,
            order: {
              location_id: locationId,
              state: 'DRAFT', // Explicitly set state to DRAFT as required by Square
              line_items: [
                {
                  name: planData?.name || 'Subscription',
                  quantity: '1',
                  base_price_money: {
                    amount: priceCents,
                    currency: currency
                  }
                }
              ]
            }
          };
          
          console.log('Order template request:', JSON.stringify(orderRequest, null, 2));
          
          // Make the order template API call
          const orderResponse = await fetch(`${baseUrl}/v2/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify(orderRequest)
          });
          
          const orderData = await orderResponse.json();
          console.log('Order template response status:', orderResponse.status);
          
          if (!orderResponse.ok) {
            console.error('Order template creation error:', orderData);
            throw new Error(orderData.errors?.[0]?.detail || 'Failed to create order template');
          }
          
          if (!orderData.order?.id) {
            throw new Error('No order template ID returned from Square API');
          }
          
          let orderTemplateId = orderData.order.id;
          console.log('Order template created with ID:', orderTemplateId);
          
          // Step 2: Now create the subscription using the order template ID
          const subscriptionUrl = `${baseUrl}/v2/subscriptions`;
          const subscriptionIdempotencyKey = this.generateIdempotencyKey();
          
          // Create the request body with the exact format Square REST API expects
          const requestBody: {
            idempotencyKey: string;
            customerId: string;
            planVariationId: string;
            startDate: string;
            phases: {
              ordinal: number;
              orderTemplateId: string;
            }[];
            cardId?: string;
          } = {
            idempotencyKey: subscriptionIdempotencyKey,
            customerId: customerId,
            planVariationId: planVariationId,
            startDate: startDate,
            phases: [
              {
                ordinal: 0,
                orderTemplateId: orderTemplateId
              }
            ]
          };
          
          // Add card ID if provided
          if (cardId) {
            requestBody.cardId = cardId;
          }
          
          console.log('Direct REST API request body details:');
          console.log(`  - idempotencyKey: ${requestBody.idempotencyKey}`);
          console.log(`  - customerId: ${requestBody.customerId}`);
          console.log(`  - planVariationId: ${requestBody.planVariationId}`);
          console.log(`  - startDate: ${requestBody.startDate}`);
          console.log(`  - phases: ${JSON.stringify(requestBody.phases, null, 2)}`);
          if (requestBody.cardId) {
            console.log(`  - cardId: ${requestBody.cardId}`);
          }
          console.log('Direct REST API request:', JSON.stringify(requestBody, null, 2));
          
          // Make the direct API call
          const response = await fetch(subscriptionUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
          });
          
          const responseData = await response.json();
          console.log('Square API direct response status:', response.status);
          
          if (!response.ok) {
            console.error('Square API error:', responseData);
            if (responseData.errors && responseData.errors.length > 0) {
              const error = responseData.errors[0];
              throw new Error(error.detail || `Square API Error: ${error.code}`);
            }
            throw new Error(`Square API Error: Status code ${response.status}`);
          }
          
          if (!responseData.subscription) {
            throw new Error('No subscription data returned from Square API');
          }
          
          console.log('Subscription created successfully via direct REST API');
          return responseData.subscription;
        } 
        // For non-RELATIVE pricing, use the Square client SDK
        else {
          console.log('Using Square SDK for standard pricing plan');
          console.log(`Using variation ID in SDK path: ${planVariationId}`);
          
          const request: any = {
            customerId,
            planVariationId,
            idempotencyKey,
            startDate,
            locationId // Add locationId to the SDK request
          };
          
          // Add card ID if provided
          if (cardId) {
            request.cardId = cardId;
          }
          
          console.log('SDK request details:');
          console.log(`  - customerId: ${request.customerId}`);
          console.log(`  - planVariationId: ${request.planVariationId}`);
          console.log(`  - idempotencyKey: ${request.idempotencyKey}`);
          console.log(`  - startDate: ${request.startDate}`);
          console.log(`  - locationId: ${request.locationId}`);
          if (request.cardId) {
            console.log(`  - cardId: ${request.cardId}`);
          }
          console.log('SDK request:', JSON.stringify(request, null, 2));
          
          // Create the subscription using the Square client
          if (!this._client) {
            throw new Error('Square client not initialized');
          }
          
          const response = await this._client.subscriptions.create(request);
          console.log('Square SDK response:', JSON.stringify(response, null, 2));
          
          if (!response.subscription) {
            throw new Error('No subscription data returned from Square API');
          }
          
          console.log('Subscription created successfully via SDK');
          return response.subscription;
        }
      } catch (error: unknown) {
        console.error('Original Square error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Square Subscription Creation Error: ${errorMessage}`);
      }
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Subscription Creation Error: ${errorMessage}`);
    }
  }

  /**
   * Get a subscription by ID
   * @param subscriptionId Square subscription ID
   * @returns Subscription details
   */
  async getSubscription(subscriptionId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      console.log(`Getting subscription details for ID: ${subscriptionId}`);
      
      // Use direct API call instead of SDK method since the SDK might have changed
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Make direct REST API call to get subscription details
      const response = await fetch(`${baseUrl}/v2/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Square API error response:', errorData);
        
        // Extract the specific error details for better formatting
        if (errorData.errors && errorData.errors.length > 0) {
          const error = errorData.errors[0];
          throw new Error(error.detail || `Square API Error: ${error.code}`);
        }
        
        throw new Error(`Square API Error: Status code ${response.status}`);
      }
      
      const responseData = await response.json();
      //console.log('Raw Square subscription response:', JSON.stringify(responseData, null, 2));
      
      return responseData.subscription;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Get Subscription Error: ${errorMessage}`);
    }
  }

  /**
   * Swap a subscription plan to a new plan variation
   * @param subscriptionId Square subscription ID
   * @param newPlanVariationId New plan variation ID to switch to
   * @returns Updated subscription
   */
  async swapSubscriptionPlan(subscriptionId: string, newPlanVariationId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      console.log(`Swapping subscription plan: ${subscriptionId} to variation: ${newPlanVariationId}`);
      
      // Get the default location ID - needed for the URL, not the request body
      const locationId = await this.getDefaultLocationId();
      console.log(`Using location ID: ${locationId}`);
      
      // For Square API v2, we need to use new_plan_variation_id instead of planVariationId
      const requestBody = {
        new_plan_variation_id: newPlanVariationId
      };
      
      console.log('Square API request body:', JSON.stringify(requestBody, null, 2));
      
      // Base URL for Square API based on environment
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Make direct REST API call to swap the plan
      const response = await fetch(`${baseUrl}/v2/subscriptions/${subscriptionId}/swap-plan`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Square API error response for swap plan:', errorData);
        
        // Handle pending plan change error gracefully
        if (
          errorData.errors &&
          errorData.errors.length > 0 &&
          errorData.errors[0].code === 'BAD_REQUEST' &&
          errorData.errors[0].detail &&
          errorData.errors[0].detail.includes('already pending a plan change')
        ) {
          console.log('Detected pending plan change error');
          return { success: false, reason: 'pending_plan_change' };
        }
        
        // Handle case when trying to swap to the same plan
        if (
          errorData.errors &&
          errorData.errors.length > 0 &&
          (errorData.errors[0].detail?.includes('same as current plan') ||
           errorData.errors[0].detail?.includes('New plan is the same'))
        ) {
          console.log('Detected same plan error');
          return { success: false, reason: 'same_plan' };
        }
        
        // Extract the specific error details for better formatting
        if (errorData.errors && errorData.errors.length > 0) {
          const error = errorData.errors[0];
          throw new Error(error.detail || `Square API Error: ${error.code}`);
        }
        
        throw new Error(`Square API Error: Status code ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log('Plan swap successful response:', JSON.stringify(responseData, null, 2));
      
      // Extract actions from the swap-plan response
      const pendingActions = responseData.actions || [];
      const swapPlanAction = pendingActions.find((action: any) => 
        action.type === 'SWAP_PLAN' && action.effective_date && action.new_plan_variation_id
      );
      
      // Create a subscription object with the pending plan change information
      const subscription = responseData.subscription;
      
      // Add the pending plan change information to the subscription object
      if (swapPlanAction) {
        console.log('Found pending plan change in actions array:', JSON.stringify(swapPlanAction, null, 2));
        subscription.pendingPlanChange = {
          effective_date: swapPlanAction.effective_date,
          new_plan_variation_id: swapPlanAction.new_plan_variation_id
        };
      }
      
      return subscription;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = this._formatSquareError(error);
      throw new Error(`Square Swap Subscription Plan Error: ${errorMessage}`);
    }
  }

  /**
   * Cancel a subscription
   * @param subscriptionId Square subscription ID
   * @returns Result of cancellation
   */
  async cancelSubscription(subscriptionId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      // Use direct API call to cancel subscription
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      console.log(`Canceling subscription with ID: ${subscriptionId}`);
      
      // First, check if the subscription is already canceled
      const getResponse = await fetch(`${baseUrl}/v2/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers
      });
      
      if (!getResponse.ok) {
        const errorData = await getResponse.json();
        throw new Error(errorData.errors?.[0]?.detail || `Failed to get subscription: ${getResponse.status}`);
      }
      
      const subscriptionData = await getResponse.json();
      
      // If subscription is already canceled, return it without trying to cancel again
      if (subscriptionData.subscription.status === 'CANCELED' || 
          subscriptionData.subscription.canceled_date) {
        console.log(`Subscription ${subscriptionId} is already canceled with date: ${subscriptionData.subscription.canceled_date}`);
        return subscriptionData.subscription;
      }
      
      // If not canceled, proceed with cancellation
      const response = await fetch(`${baseUrl}/v2/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // Extract the specific error details for better formatting
        if (errorData.errors && errorData.errors.length > 0) {
          const error = errorData.errors[0];
          throw new Error(error.detail || `Square API Error: ${error.code}`);
        }
        
        throw new Error(`Square API Error: Status code ${response.status}`);
      }
      
      const responseData = await response.json();
      return responseData.subscription;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Check if error message contains indication that subscription is already canceled
      if (errorMessage.includes('already has a pending cancel date')) {
        console.log('Handling already canceled subscription gracefully');
        // Return a mock subscription object with canceled status
        return {
          status: 'CANCELED',
          id: subscriptionId,
          canceled_date: new Date().toISOString()
        };
      }
      
      throw new Error(`Square Cancel Subscription Error: ${errorMessage}`);
    }
  }

  /**
   * List subscriptions for a customer
   * @param customerId Square customer ID
   * @returns List of subscriptions
   */
  async listCustomerSubscriptions(customerId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      // Use direct API call to search for subscriptions by customer ID
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      console.log(`Searching for subscriptions with customer ID: ${customerId}`);
      
      // First, get the default location ID
      const locationId = await this.getDefaultLocationId();
      
      // Construct the URL for listing subscriptions from a specific location
      const url = `${baseUrl}/v2/subscriptions?location_id=${locationId}`;
      console.log(`Requesting subscriptions from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Square API error response:', errorData);
        
        // If NOT_FOUND, treat as no subscriptions (not an error)
        if (
          errorData.errors &&
          errorData.errors.length > 0 &&
          errorData.errors[0].code === 'NOT_FOUND'
        ) {
          console.log(`No subscriptions found for customer ID ${customerId}`);
          return [];
        }
        
        // Extract the specific error details for better formatting
        if (errorData.errors && errorData.errors.length > 0) {
          const error = errorData.errors[0];
          throw new Error(error.detail || `Square API Error: ${error.code}`);
        }
        
        throw new Error(`Square API Error: Status code ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log(`Retrieved ${responseData.subscriptions?.length || 0} subscriptions from Square API`);
      
      // Filter subscriptions for the specific customer
      const customerSubscriptions = (responseData.subscriptions || []).filter((subscription: any) => {
        if (!subscription.customer_id) return false;
        return subscription.customer_id === customerId;
      });
      
      console.log(`Found ${customerSubscriptions.length} subscriptions for customer ID ${customerId}`);
      
      return customerSubscriptions;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square List Customer Subscriptions Error: ${errorMessage}`);
    }
  }

  /**
   * Get default location ID for creating subscriptions
   * @returns Location ID
   */
  async getDefaultLocationId(): Promise<string> {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      const locations = await this.listLocations();
      if (!locations.locations || locations.locations.length === 0) {
        throw new Error('No locations found for this Square account');
      }
      
      // Return the first active location
      const activeLocation = locations.locations.find(location => location.status === 'ACTIVE');
      if (!activeLocation || !activeLocation.id) {
        throw new Error('No active locations found for this Square account');
      }
      
      return activeLocation.id;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Get Default Location Error: ${errorMessage}`);
    }
  }

  /**
   * List subscription items from Square Catalog API
   * @returns List of subscription plan variations
   */
  async listSubscriptionItems() {
    try {
      if (!this._legacyClient) {
        throw new Error('Square legacy client not initialized');
      }

      //console.log(`Fetching catalog items from Square (${this._environment} environment)...`);
      
      try {
        // Test token validity first with a simple API call
        const locationResponse = await this._legacyClient.locationsApi.listLocations();
        //console.log(`Location API test successful. Found ${locationResponse.result.locations?.length || 0} locations.`);
      } catch (tokenError: any) {
        console.error('Square token validation failed:', tokenError);
        
        // Provide detailed troubleshooting info
        if (tokenError.statusCode === 401) {
          console.error('Authentication error: The Square access token is invalid or expired.');
          console.error('Please check your SQUARE_ACCESS_TOKEN in the .env file.');
          console.error('For sandbox testing, get a valid token from https://developer.squareup.com/apps');
          
          throw new Error('Square API Authentication Error: Invalid access token. Check your .env configuration.');
        }
      }
      
      // Fetch all catalog items to ensure we get all types
      const response = await this._legacyClient.catalogApi.listCatalog();
      
      // Log response for debugging
      // console.log('Square catalog response:', JSON.stringify({
      //   environment: this._environment,
      //   count: response.result.objects?.length || 0,
      //   types: response.result.objects?.map(obj => obj.type) || []
      // }, null, 2));
      
      // Process subscription plans to extract variations
      const subscriptionPlans = response.result.objects?.filter(
        (obj: any) => obj.type === 'SUBSCRIPTION_PLAN'
      ) || [];
      
      // Extract formatted subscription plan variations
      const processedPlans: any[] = [];
      
      subscriptionPlans.forEach((plan: any) => {
        // Get the plan name and data
        const planName = plan.subscriptionPlanData?.name || 'Unnamed Plan';
        const planVariations = plan.subscriptionPlanData?.subscriptionPlanVariations || [];
        
        // Get the product description from the first eligible item
        const eligibleItemIds = plan.subscriptionPlanData?.eligibleItemIds || [];
        const eligibleItems = response.result.objects?.filter(
          (obj: any) => eligibleItemIds.includes(obj.id)
        ) || [];
        
        // Get the product description from the first eligible item
        const productDescription = eligibleItems.length > 0 
          ? eligibleItems[0].itemData?.description || '' 
          : '';
        
        // Process each variation
        planVariations.forEach((variation: any) => {
          const variationData = variation.subscriptionPlanVariationData;
          if (!variationData) return;
          
          // Get the first phase (subscription plans typically start with a single phase)
          const firstPhase = variationData.phases && variationData.phases.length > 0 
            ? variationData.phases[0] 
            : null;
          
          if (!firstPhase) return;
          
          // Extract price from the eligible items
          let price = 0;
          let itemPrice = 0;
          let hasDiscount = false;
          let discountPercent = 0;
          let currency = 'USD';

          // Check if this is a STATIC pricing plan
          if (firstPhase.pricing && firstPhase.pricing.type === 'STATIC' && firstPhase.pricing.priceMoney) {
            // Use the static price directly
            price = Number(firstPhase.pricing.priceMoney.amount) / 100;
            currency = firstPhase.pricing.priceMoney.currency || 'USD';
            itemPrice = price; // Set the base price to be the same as the static price
          } 
          // If not static pricing, get price from eligible items
          else if (eligibleItems.length > 0) {
            const item = eligibleItems[0];
            // Get the first variation's price
            if (item.itemData && item.itemData.variations && item.itemData.variations.length > 0) {
              const itemVariation = item.itemData.variations[0];
              if (itemVariation.itemVariationData && itemVariation.itemVariationData.priceMoney) {
                itemPrice = Number(itemVariation.itemVariationData.priceMoney.amount) / 100;
                currency = itemVariation.itemVariationData.priceMoney.currency || 'USD';
                
                // Start with the item price
                price = itemPrice;
              }
            }
          }
          
          // Check for discounts in the pricing
          if (firstPhase.pricing && firstPhase.pricing.discountIds && firstPhase.pricing.discountIds.length > 0) {
            hasDiscount = true;
            
            // Try to find the discount in the catalog
            const discountId = firstPhase.pricing.discountIds[0];
            const discount = response.result.objects?.find(
              (obj: any) => obj.id === discountId && obj.type === 'DISCOUNT'
            );
            
            if (discount && discount.discountData) {
              const discountData = discount.discountData;
              
              // Calculate discount percentage
              if (discountData.percentage) {
                discountPercent = parseFloat(discountData.percentage);
                // Apply discount to price
                price = itemPrice * (1 - discountPercent / 100);
              }
            }
          }
          
          // Extract cadence and plan name
          const cadence = firstPhase.cadence || 'MONTHLY';
          const planNameLower = planName.toLowerCase();
          let interval = 'monthly';
          let formattedInterval = 'Monthly';
          
          // Set interval based on cadence
          if (cadence === 'DAILY' || planNameLower.includes('daily')) {
            interval = 'daily';
            formattedInterval = 'Daily';
          } else if (cadence === 'EVERY_SIX_MONTHS' || planNameLower.includes('bi-annual') || planNameLower.includes('biannual') || planNameLower.includes('semester')) {
            interval = 'semester';
            formattedInterval = 'Semester';
          } else if (cadence === 'ANNUAL' || planNameLower.includes('annual') || planNameLower.includes('yearly')) {
            interval = 'yearly';
            formattedInterval = 'Yearly';
          } else {
            // Default to monthly for MONTHLY cadence and any other cadence
            interval = 'monthly';
            formattedInterval = 'Monthly';
          }
          
          // Calculate monthly equivalent price
          let monthlyPrice = price;
          let totalPrice = price;
          
          if (cadence === 'DAILY' || planNameLower.includes('daily')) {
            // Daily plan - calculate monthly equivalent (30 days)
            totalPrice = price;
            monthlyPrice = price * 30;
          } else if (cadence === 'MONTHLY' || planNameLower.includes('monthly')) {
            // Monthly plan - price remains the same
            monthlyPrice = price;
            totalPrice = price;
          } else if (cadence === 'EVERY_SIX_MONTHS' || planNameLower.includes('bi-annual') || planNameLower.includes('biannual') || planNameLower.includes('semester')) {
            // Bi-annual plan (every 6 months)
            totalPrice = price;
            monthlyPrice = price / 6;
          } else if (cadence === 'ANNUAL' || planNameLower.includes('annual') || planNameLower.includes('yearly')) {
            // Annual plan
            totalPrice = price;
            monthlyPrice = price / 12;
          }
          
          // Round down prices ending with .00 to .99
          const roundDownPrice = (p: number): number => {
            // Convert to string with 2 decimal places to check ending
            const priceStr = p.toFixed(2);
            // Check if price ends with .00
            return priceStr.endsWith('.00') ? p - 0.01 : p;
          };
          
          // Apply rounding to all prices
          price = roundDownPrice(price);
          monthlyPrice = roundDownPrice(monthlyPrice);
          totalPrice = roundDownPrice(totalPrice);
          
          const formattedData = {
            id: plan.id,
            variationId: variation.id,
            name: planName,
            description: productDescription,
            basePrice: itemPrice,
            price: price,
            monthlyPrice: monthlyPrice,
            totalPrice: totalPrice,
            discountPercent: discountPercent,
            hasDiscount: discountPercent > 0,
            currency: currency,
            formattedPrice: `$${price.toFixed(2)}`,
            formattedMonthlyPrice: `$${monthlyPrice.toFixed(2)}`,
            formattedTotalPrice: `$${totalPrice.toFixed(2)}`,
            formattedBasePrice: `$${itemPrice.toFixed(2)}`,
            interval: interval,
            formattedInterval: formattedInterval,
            phases: variationData.phases || [],
            active: !plan.isDeleted && plan.presentAtAllLocations !== false,
            isDeleted: plan.isDeleted
          };
          
          processedPlans.push(formattedData);
        });
      });
      
      // Return object with expected structure to match controller expectations
      if (processedPlans.length === 0) {
        console.log(`No subscription plans found in ${this._environment} environment. Make sure to create them in the ${this._environment} dashboard.`);
      }
      
      return {
        objects: processedPlans,
        environment: this._environment
      };
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square List Subscription Items Error: ${errorMessage}`);
    }
  }
  
  /**
   * Format cadence for display
   * @param cadence Billing cadence
   * @returns Formatted string
   */
  private formatCadence(cadence: string): string {
    switch (cadence) {
      case 'DAILY':
        return 'Daily';
      case 'WEEKLY':
        return 'Weekly';
      case 'BIWEEKLY':
        return 'Every 2 Weeks';
      case 'MONTHLY':
        return 'Monthly';
      case 'QUARTERLY':
        return 'Every 3 Months';
      case 'EVERY_FOUR_MONTHS':
        return 'Every 4 Months';
      case 'EVERY_SIX_MONTHS':
        return 'Every 6 Months';
      case 'ANNUAL':
        return 'Yearly';
      case 'BIENNIAL':
        return 'Every 2 Years';
      default:
        // For any custom or unknown cadences, try to format them nicely
        return cadence.toLowerCase()
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
  }

  /**
   * Get details for a customer
   * @param customerId Square customer ID
   * @returns Customer details
   */
  async getCustomer(customerId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      // Use direct API call to get customer by ID
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      console.log(`Retrieving customer with ID: ${customerId}`);
      const response = await fetch(`${baseUrl}/v2/customers/${customerId}`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Square API error response:', errorData);
        
        // Extract the specific error details for better formatting
        if (errorData.errors && errorData.errors.length > 0) {
          const error = errorData.errors[0];
          throw new Error(error.detail || `Square API Error: ${error.code}`);
        }
        
        throw new Error(`Square API Error: Status code ${response.status}`);
      }
      
      const responseData = await response.json();
      if (responseData.customer) {
        return responseData.customer;
      }
      
      // If we get here, we couldn't find the customer
      throw new Error('Customer not found');
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Customer Retrieval Error: ${errorMessage}`);
    }
  }

  async listCustomerInvoices(customerId: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }
  
      if (!customerId?.trim()) {
        console.log('No customer ID provided, returning empty invoice list');
        return {
          invoices: [],
          environment: this._environment
        };
      }
  
      const baseUrl = this._environment === 'sandbox'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com';
  
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
  
      const locationId = await this.getDefaultLocationId();
      const url = `${baseUrl}/v2/invoices/search`;
  
      const body = {
        query: {
          filter: {
            customer_ids: [customerId],
            location_ids: [locationId]
          },
          sort: {
            field: "INVOICE_SORT_DATE",
            order: "DESC"
          }
        },
        limit: 100
      };
  
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Square API error response:', errorData);
        const error = errorData.errors?.[0];
        throw new Error(error?.detail || `Square API Error: ${error?.code || response.status}`);
      }
  
      const responseData = await response.json();
      const invoices = responseData.invoices || [];
  
      const processedInvoices = invoices.map((invoice: any) => {
        const status = invoice.status;
        const createdAt = invoice.created_at;
        const scheduledAt = invoice.scheduled_at;
        const paymentRequestedAt = invoice.payment_requests?.[0]?.due_date;
  
        const totalAmount = invoice.payment_requests?.[0]?.computed_amount_money;
        const formattedAmount = totalAmount
          ? `${(totalAmount.amount / 100).toFixed(2)} ${totalAmount.currency}`
          : 'N/A';
  
        return {
          id: invoice.id,
          status,
          createdAt,
          scheduledAt,
          paymentRequestedAt,
          totalAmount,
          formattedAmount,
          invoiceNumber: invoice.invoice_number,
          description: invoice.primary_recipient?.given_name || 'Invoice',
          url: invoice.public_url
        };
      });
  
      console.log(`Found ${processedInvoices.length} invoices for customer ID ${customerId}`);
  
      return {
        invoices: processedInvoices,
        environment: this._environment
      };
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square List Customer Invoices Error: ${errorMessage}`);
    }
  }
  



  /**
   * Create a subscription plan with multiple cadences
   * @param planName Name of the subscription plan
   * @param planDescription Description of the subscription plan
   * @param variations Array of plan variations with different cadences and prices
   * @returns Created subscription plan
   */
  async createSubscriptionPlanWithCadences(
    planName: string,
    planDescription: string,
    variations: Array<{
      cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
      price: number;
      variationName?: string;
    }>
  ) {
    try {
      if (!this._legacyClient) {
        throw new Error('Square legacy client not initialized');
      }

      // Get the default location ID
      const locationId = await this.getDefaultLocationId();

      // Create a catalog object for the subscription plan
      const idempotencyKey = this.generateIdempotencyKey();
      
      // Format variations for the catalog object
      const catalogSubscriptionPlanVariations = variations.map(variation => {
        return {
          type: 'SUBSCRIPTION_PLAN_VARIATION',
          id: `#${variation.cadence.toLowerCase()}_variation`,
          subscriptionPlanVariationData: {
            name: variation.variationName || `${planName} (${this.formatCadence(variation.cadence)})`,
            phases: [
              {
                cadence: variation.cadence,
                recurringPriceMoney: {
                  amount: Math.round(variation.price * 100), // Convert to cents
                  currency: 'USD'
                },
                ordinal: 0
              }
            ]
          }
        };
      });

      // Create the request body
      const requestBody = {
        idempotencyKey: idempotencyKey,
        object: {
          type: 'SUBSCRIPTION_PLAN',
          id: '#subscription_plan',
          subscriptionPlanData: {
            name: planName,
            description: planDescription,
            phases: []
          },
          catalogSubscriptionPlanVariations: catalogSubscriptionPlanVariations.map(variation => ({
            type: variation.type,
            id: variation.id,
            subscriptionPlanVariationData: variation.subscriptionPlanVariationData
          }))
        }
      };

      console.log('Creating subscription plan with request:', JSON.stringify(requestBody, null, 2));

      // Call the Square API to create the subscription plan
      const response = await this._legacyClient.catalogApi.upsertCatalogObject(requestBody);
      
      console.log('Subscription plan created successfully:', JSON.stringify(response, null, 2));
      
      return response;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Create Subscription Plan Error: ${errorMessage}`);
    }
  }

  /**
   * Update a customer's name in Square
   * @param customerId Square customer ID
   * @param name New name value
   * @returns Updated customer details
   */
  async updateCustomerName(customerId: string, name: string) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      console.log(`Updating name for Square customer ${customerId} to: ${name}`);

      // Split the name into first and last name
      const nameParts = name.split(' ');
      const givenName = nameParts[0] || '';
      const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Use direct API call to update the customer
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Create update request body
      const updateBody = {
        given_name: givenName,
        family_name: familyName
      };
      
      // Make the API call
      const response = await fetch(`${baseUrl}/v2/customers/${customerId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody)
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        const errorMessage = responseData.errors ? 
          responseData.errors[0].detail : 
          'Failed to update customer name';
        throw new Error(errorMessage);
      }

      console.log('Square customer name updated successfully');
      return responseData;
    } catch (error: unknown) {
      console.error('Original Square error:', error);
      const errorMessage = this._formatSquareError(error);
      throw new Error(`Square Update Customer Error: ${errorMessage}`);
    }
  }

  /**
   * Create a Square Checkout session for subscription payments
   * @param params Checkout session parameters
   * @returns Checkout session with URL
   */
  async createCheckoutSession(params: {
    planId: string;
    userId: string;
    userEmail: string;
    userName: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    try {
      if (!this._client) {
        throw new Error('Square client not initialized');
      }

      console.log('Creating Square Checkout session with params:', {
        planId: params.planId,
        userId: params.userId,
        userEmail: params.userEmail,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl
      });

      // Get location ID
      const locationId = await this.getDefaultLocationId();

      // For Square Subscription Plans, we need to use the Payment Links API, not Checkout API
      // The Checkout API doesn't support subscription plans directly
      const paymentLinkRequest = {
        idempotency_key: this.generateIdempotencyKey(),
        quick_pay: {
          name: "Subscription Plan",
          price_money: {
            amount: 100, // This will be overridden by the subscription plan
            currency: "USD"
          },
          location_id: locationId
        },
        checkout_options: {
          subscription_plan_variation_id: params.planId
        },
        redirect_url: params.successUrl,
        cancel_url: params.cancelUrl
      };

      console.log('Square Payment Link request:', JSON.stringify(paymentLinkRequest, null, 2));

      // Use direct API call for payment link creation
      const baseUrl = this._environment === 'sandbox' ? 
        'https://connect.squareupsandbox.com' : 
        'https://connect.squareup.com';
      
      const token = process.env.SQUARE_ACCESS_TOKEN;
      const headers = {
        'Square-Version': this._apiVersion,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
        method: 'POST',
        headers,
        body: JSON.stringify(paymentLinkRequest)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Square Payment Link API error:', responseData);
        throw new Error(responseData.errors?.[0]?.detail || 'Failed to create payment link');
      }

      if (!responseData.payment_link?.url) {
        throw new Error('No payment link URL returned from Square');
      }

      console.log('Square Payment Link created successfully:', responseData.payment_link.url);

      return responseData.payment_link.url;

    } catch (error: unknown) {
      console.error('Error creating Square Checkout session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Square Checkout Creation Error: ${errorMessage}`);
    }
  }

  /**
   * Handle Square API errors in a consistent way
   * @param error The error object from Square API
   * @returns Formatted error message
   */
  private _formatSquareError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    // If it's a response object with errors array
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as any;
      
      if (errorObj.errors && Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
        const firstError = errorObj.errors[0];
        return firstError.detail || `Square API Error: ${firstError.code}`;
      }
      
      // If it has a message property
      if (errorObj.message) {
        return errorObj.message;
      }
    }
    
    return 'Unknown Square API error occurred';
  }
}

export default new SquareService();
