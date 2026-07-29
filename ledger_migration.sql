-- ============================================================
-- ESTIMATE APP - CLIENT LEDGER SYSTEM UPDATE
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- Ensure the update function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  mobile TEXT,
  opening_balance NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at for clients
CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- 2. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT,
  reference_number TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- 3. LINK ESTIMATES TO CLIENTS
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 4. MIGRATE EXISTING ESTIMATES (Auto-create clients based on existing names)
-- Insert unique client names from existing estimates (ignoring null/empty)
INSERT INTO clients (name, mobile)
SELECT DISTINCT TRIM(client_name), MAX(client_mobile)
FROM estimates
WHERE client_name IS NOT NULL AND TRIM(client_name) != ''
GROUP BY TRIM(client_name)
ON CONFLICT (name) DO NOTHING;

-- Update the client_id on all existing estimates
UPDATE estimates e
SET client_id = c.id
FROM clients c
WHERE TRIM(e.client_name) = c.name;

-- ============================================================
-- DONE! Ledger tables created and existing estimates linked.
-- ============================================================
