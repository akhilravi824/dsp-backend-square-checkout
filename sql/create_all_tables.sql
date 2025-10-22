-- ====================
-- USERS TABLE
-- ====================

-- Create a function to create the users table if it doesn't exist
CREATE OR REPLACE FUNCTION create_users_table()
RETURNS void AS $$
BEGIN
  -- Check if the table already exists
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'users'
  ) THEN
    -- Create the users table
    CREATE TABLE public.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      university TEXT,
      allow_video_usage BOOLEAN DEFAULT FALSE,
      has_active_subscription BOOLEAN DEFAULT FALSE,
      square_subscription_status TEXT DEFAULT NULL,
      square_customer_id TEXT DEFAULT NULL,
      square_subscription_variation_id TEXT DEFAULT NULL,
      square_subscription_id TEXT DEFAULT NULL,
      square_subscription_canceled_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
      pending_plan_change JSONB DEFAULT NULL,
      progress JSONB DEFAULT '{}'::jsonb,
      tips_and_guidance BOOLEAN DEFAULT FALSE,
      product_updates BOOLEAN DEFAULT FALSE,
      had_subscription BOOLEAN DEFAULT FALSE,
      signed_up BOOLEAN DEFAULT FALSE,
      signup_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Create an index on email for faster lookups
    CREATE INDEX idx_users_email ON public.users(email);
    
    -- Add RLS policies
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Users are viewable by authenticated users"
      ON public.users FOR SELECT
      TO authenticated
      USING (true);
      
    CREATE POLICY "Users can be inserted by the service role"
      ON public.users FOR INSERT
      TO service_role
      WITH CHECK (true);
      
    -- Add table comment
    COMMENT ON TABLE public.users IS 'Table for tracking user emails to prevent duplicates';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ====================
-- EXECUTE ALL FUNCTIONS
-- ====================

-- First create the users table
SELECT create_users_table();

-- Verify tables were created
DO $$ 
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'users'
  ) THEN
    RAISE NOTICE 'SUCCESS: users table created successfully';
  ELSE
    RAISE EXCEPTION 'ERROR: users table creation failed';
  END IF;
END $$;
