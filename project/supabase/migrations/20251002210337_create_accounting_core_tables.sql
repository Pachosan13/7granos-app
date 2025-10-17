/*
  # Accounting Core Tables - Complete GL System

  ## Summary
  Creates a comprehensive general ledger accounting system with chart of accounts,
  journal entries, accounts payable, vendor management, and application settings.
  
  This migration does NOT modify existing CSV tables (ventas, compras, invu_ventas)
  to maintain compatibility with the existing Import functionality.

  ## New Tables Created
  
  ### 1. Chart of Accounts (coa_account)
  - Hierarchical account structure with parent-child relationships
  - Support for 5 account types: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
  - Multi-level account structure for detailed reporting
  - Active/inactive flag for account lifecycle management
  
  ### 2. General Ledger (gl_journal, gl_entry)
  - **gl_journal**: Header for each journal entry with source tracking
  - **gl_entry**: Individual debit/credit lines with account references
  - Support for three sources: INVU (API), CSV (imports), MANUAL (user entry)
  - Automatic cascade deletion to maintain referential integrity
  - Idempotent design with unique constraints to prevent duplicates
  
  ### 3. Accounts Payable (vendor, ap_invoice, ap_payment)
  - **vendor**: Supplier/vendor master data with tax ID
  - **ap_invoice**: Purchase invoices with status tracking (OPEN, PAID, VOID)
  - **ap_payment**: Payment records linked to invoices
  - Multi-source support (INVU, CSV, MANUAL)
  
  ### 4. Application Settings (app_settings)
  - Flexible key-value storage for configuration
  - Scope-based settings: global or per-sucursal
  - Used for account mappings and system configuration
  
  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Helper functions created for role checks
  
  ## Important Notes
  - This migration preserves all existing tables
  - sync_log table already exists and is reused
  - All monetary fields use numeric type for precision
  - Timestamps include timezone support (timestamptz)
  - Uses existing 'rol' column from user_profile (Spanish naming)
*/

-- =====================================================
-- 1. CHART OF ACCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.coa_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  level int NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES public.coa_account(id) ON DELETE RESTRICT,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.coa_account IS 'Chart of accounts with hierarchical structure';
COMMENT ON COLUMN public.coa_account.code IS 'Unique account code (e.g., 1000, 1100, 4000)';
COMMENT ON COLUMN public.coa_account.type IS 'Account type: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE';
COMMENT ON COLUMN public.coa_account.level IS 'Hierarchy level: 1=summary, 2+=detail';
COMMENT ON COLUMN public.coa_account.parent_id IS 'Parent account for hierarchical structure';

-- =====================================================
-- 2. GENERAL LEDGER
-- =====================================================

CREATE TABLE IF NOT EXISTS public.gl_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id uuid NOT NULL REFERENCES public.sucursal(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('INVU', 'CSV', 'MANUAL')),
  ref text NOT NULL,
  memo text,
  date date NOT NULL,
  posted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(source, ref, date, sucursal_id)
);

COMMENT ON TABLE public.gl_journal IS 'Journal entry headers with source tracking';
COMMENT ON COLUMN public.gl_journal.source IS 'Data source: INVU (API), CSV (import), MANUAL (user entry)';
COMMENT ON COLUMN public.gl_journal.ref IS 'Reference number (e.g., SALES-20250101-UUID, AP-INV123)';
COMMENT ON COLUMN public.gl_journal.memo IS 'Journal entry description';

CREATE TABLE IF NOT EXISTS public.gl_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.gl_journal(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.coa_account(id) ON DELETE RESTRICT,
  debit numeric DEFAULT 0 NOT NULL CHECK (debit >= 0),
  credit numeric DEFAULT 0 NOT NULL CHECK (credit >= 0),
  memo text,
  aux jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.gl_entry IS 'Individual journal entry lines (debits and credits)';
COMMENT ON COLUMN public.gl_entry.journal_id IS 'Reference to journal header';
COMMENT ON COLUMN public.gl_entry.account_id IS 'Account being debited or credited';
COMMENT ON COLUMN public.gl_entry.aux IS 'Auxiliary data (e.g., cost center, dimensions)';

-- =====================================================
-- 3. ACCOUNTS PAYABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.vendor IS 'Vendor/supplier master data';
COMMENT ON COLUMN public.vendor.tax_id IS 'Tax identification number (RUC, NIT, etc.)';

CREATE TABLE IF NOT EXISTS public.ap_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendor(id) ON DELETE RESTRICT,
  sucursal_id uuid NOT NULL REFERENCES public.sucursal(id) ON DELETE RESTRICT,
  invoice_no text NOT NULL,
  date date NOT NULL,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  itbms numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'VOID')),
  source text NOT NULL CHECK (source IN ('INVU', 'CSV', 'MANUAL')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(source, invoice_no, vendor_id)
);

COMMENT ON TABLE public.ap_invoice IS 'Accounts payable invoices from vendors';
COMMENT ON COLUMN public.ap_invoice.status IS 'Invoice status: OPEN (unpaid), PAID (fully paid), VOID (cancelled)';
COMMENT ON COLUMN public.ap_invoice.itbms IS 'ITBMS/VAT tax amount (Panama)';

CREATE TABLE IF NOT EXISTS public.ap_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_invoice_id uuid NOT NULL REFERENCES public.ap_invoice(id) ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric NOT NULL,
  method text,
  ref text,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.ap_payment IS 'Payments made against AP invoices';
COMMENT ON COLUMN public.ap_payment.method IS 'Payment method (e.g., CASH, CHECK, TRANSFER)';
COMMENT ON COLUMN public.ap_payment.ref IS 'Payment reference number';

-- =====================================================
-- 4. APPLICATION SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'sucursal')),
  sucursal_id uuid REFERENCES public.sucursal(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(scope, sucursal_id, key),
  CHECK (
    (scope = 'global' AND sucursal_id IS NULL) OR
    (scope = 'sucursal' AND sucursal_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.app_settings IS 'Application configuration and account mappings';
COMMENT ON COLUMN public.app_settings.scope IS 'Setting scope: global (system-wide) or sucursal (per-branch)';
COMMENT ON COLUMN public.app_settings.key IS 'Setting key (e.g., map_sales, map_purchases)';
COMMENT ON COLUMN public.app_settings.value IS 'Setting value as JSON (flexible structure)';

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.coa_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. HELPER FUNCTIONS FOR ROLE CHECKS
-- =====================================================

CREATE OR REPLACE FUNCTION public.has_accounting_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profile
    WHERE user_id = auth.uid()
    AND rol IN ('owner', 'admin', 'accountant')
  );
$$;

COMMENT ON FUNCTION public.has_accounting_role() IS 'Check if current user has accounting privileges (owner, admin, accountant)';

CREATE OR REPLACE FUNCTION public.has_read_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profile
    WHERE user_id = auth.uid()
    AND rol IN ('owner', 'admin', 'accountant', 'manager', 'viewer')
  );
$$;

COMMENT ON FUNCTION public.has_read_role() IS 'Check if current user has read privileges';

CREATE OR REPLACE FUNCTION public.user_sucursales()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sucursal_id FROM public.user_sucursal
  WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.user_sucursales() IS 'Get all sucursal IDs accessible by current user';
