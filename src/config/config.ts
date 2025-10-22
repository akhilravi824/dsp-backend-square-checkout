import dotenv from 'dotenv';
import path from 'path';

// Get the absolute path to the .env file
const envPath = path.join(__dirname, '../../.env');

// Load environment variables from .env file
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('Error loading .env file:', result.error);
}

interface IConfig {
  port: number;
  nodeEnv: string;
  clientUrl?: string;
  supabase: {
    url: string;
    key: string;
    serviceKey?: string;
  };
  square: {
    accessToken: string;
    applicationId: string;
    environment: 'sandbox' | 'production';
    webhookSignatureKey?: string;
  };
  mailchimp: {
    apiKey: string;
    serverPrefix: string;
    audienceId: string;
  };
}

const config: IConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || undefined,
  },
  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN || '',
    applicationId: process.env.SQUARE_APPLICATION_ID || '',
    environment: (process.env.SQUARE_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || undefined,
  },
  mailchimp: {
    apiKey: process.env.MAILCHIMP_API_KEY || '',
    serverPrefix: process.env.MAILCHIMP_SERVER_PREFIX || '',
    audienceId: process.env.MAILCHIMP_AUDIENCE_ID || '',
  },
};

export default config;
