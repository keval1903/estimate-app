-- ============================================================
-- ESTIMATE APP - SUPABASE DATABASE SETUP
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  length NUMERIC(10,2),
  width NUMERIC(10,2),
  unit TEXT NOT NULL DEFAULT 'Nos.',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  calculation_type TEXT NOT NULL DEFAULT 'QUANTITY',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SITES TABLE (for site name autocomplete)
CREATE TABLE IF NOT EXISTS sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BILL NUMBER SEQUENCE (safe atomic increment)
CREATE SEQUENCE IF NOT EXISTS bill_number_seq START WITH 1;

-- 4. ESTIMATES TABLE
CREATE TABLE IF NOT EXISTS estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number INTEGER NOT NULL UNIQUE,
  bill_date TEXT NOT NULL,
  transport TEXT,
  site_name TEXT,
  total_nos NUMERIC(12,2) DEFAULT 0,
  total_quantity NUMERIC(12,2) DEFAULT 0,
  grand_total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ESTIMATE ITEMS TABLE (snapshots of product at time of estimate)
CREATE TABLE IF NOT EXISTS estimate_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  serial_number INTEGER NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  length_snapshot NUMERIC(10,2),
  width_snapshot NUMERIC(10,2),
  nos NUMERIC(12,2),
  quantity NUMERIC(12,2),
  unit_snapshot TEXT,
  rate NUMERIC(12,2) NOT NULL,
  calculation_type_snapshot TEXT NOT NULL DEFAULT 'QUANTITY',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SAFE BILL NUMBER FUNCTION (atomic, no duplicates)
CREATE OR REPLACE FUNCTION get_next_bill_number()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT NEXTVAL('bill_number_seq') INTO next_num;
  RETURN next_num;
END;
$$;

-- 7. SEED BILL SEQUENCE to start after any existing estimates
-- (If this is fresh, starts at 1. Change 290 below to start from a specific number)
SELECT SETVAL('bill_number_seq', 290);

-- 8. AUTO-UPDATE updated_at TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. DISABLE ROW LEVEL SECURITY (simple app, no auth needed)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sites DISABLE ROW LEVEL SECURITY;
ALTER TABLE estimates DISABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items DISABLE ROW LEVEL SECURITY;

-- 10. SEED SAMPLE PRODUCTS (from your estimate image)
INSERT INTO products (product_name, length, width, unit, rate, calculation_type) VALUES
  ('C PLY 4 18 MM 7 x 4', 7, 4, 'Sq.Ft', 57.50, 'SQFT'),
  ('C PLY 4 12 MM 7 x 4', 7, 4, 'Sq.Ft', 48.00, 'SQFT'),
  ('25 MM BLOCK BOARD A GRADE CAL 7 x 4', 7, 4, 'Sq.Ft', 100.00, 'SQFT'),
  ('LAMINATE FABRIC 5027', NULL, NULL, 'Nos.', 460.00, 'QUANTITY'),
  ('FALCOFIX ULTRA MARINE', NULL, NULL, 'Nos.', 190.00, 'QUANTITY'),
  ('NAILS 14 X 1 3/4', NULL, NULL, 'Kg.', 130.00, 'QUANTITY'),
  ('NAILS 14 X 1 1/2', NULL, NULL, 'Kg.', 130.00, 'QUANTITY'),
  ('ABRO TAPE 40M ASIAN', NULL, NULL, 'Bundle', 190.00, 'QUANTITY')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE! All tables, sequences, functions created successfully.
-- ============================================================
