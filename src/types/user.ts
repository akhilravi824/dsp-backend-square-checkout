/**
 * User-related type definitions
 */

/**
 * User signup data structure
 * This interface defines the structure for the signup_data JSONB field
 * that stores additional information collected during user registration
 */
export interface SignupData {
  /**
   * Any custom fields can be added here
   * Example: referral_source, marketing_consent, etc.
   */
  [key: string]: any;
}

/**
 * User database record structure
 * Represents the structure of a user in the database
 */
export interface User {
  id: string;
  email: string;
  name: string;
  university?: string;
  allow_video_usage: boolean;
  has_active_subscription: boolean;
  had_subscription: boolean;
  square_subscription_status?: string;
  square_customer_id?: string;
  square_subscription_variation_id?: string;
  square_subscription_id?: string;
  square_subscription_canceled_date?: string;
  progress: any; // This could be replaced with a more specific type
  tips_and_guidance: boolean;
  product_updates: boolean;
  signup_data: SignupData;
  created_at: string;
  updated_at: string;
}
