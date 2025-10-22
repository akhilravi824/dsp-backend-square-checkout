-- Migration to add pending_plan_change column to users table
-- This allows storing information about pending subscription plan changes

-- Check if the column already exists before adding it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'pending_plan_change'
  ) THEN
    -- Add the pending_plan_change column
    ALTER TABLE public.users ADD COLUMN pending_plan_change JSONB DEFAULT NULL;
    
    -- Log the migration
    RAISE NOTICE 'Added pending_plan_change column to users table';
  ELSE
    RAISE NOTICE 'Column pending_plan_change already exists in users table';
  END IF;
END $$;
