/*
  # Accounting System Indexes

  ## Summary
  Creates performance indexes for the accounting tables to optimize common query patterns.

  ## Indexes Created

  ### 1. General Ledger Indexes
  - **gl_journal(date, sucursal_id)**: Fast date range and branch filtering
  - **gl_entry(journal_id)**: Quick lookup of entries by journal
  - **gl_entry(account_id)**: Account-level queries and reports

  ### 2. Chart of Accounts Indexes
  - **coa_account(type, code)**: Account type filtering and sorting
  - **coa_account(parent_id)**: Hierarchical structure traversal
  - **coa_account(active)**: Filter active accounts

  ### 3. Accounts Payable Indexes
  - **ap_invoice(vendor_id, status, date)**: Vendor reports and aging
  - **ap_invoice(sucursal_id, date)**: Branch-level AP reports
  - **ap_invoice(status, due_date)**: Aging and payment tracking
  - **ap_payment(ap_invoice_id)**: Payment history lookup

  ### 4. Application Settings Indexes
  - Unique constraint already provides index on (scope, sucursal_id, key)

  ## Performance Impact
  These indexes significantly improve query performance for:
  - Trial balance calculations
  - General ledger reports
  - Account aging reports
  - Vendor payment history
  - Branch-specific financial reports
*/

-- =====================================================
-- GENERAL LEDGER INDEXES
-- =====================================================

-- Primary date and branch filtering for journal entries
CREATE INDEX IF NOT EXISTS idx_gl_journal_date_sucursal 
ON public.gl_journal (date, sucursal_id);

-- Source-based queries (e.g., all INVU entries)
CREATE INDEX IF NOT EXISTS idx_gl_journal_source 
ON public.gl_journal (source);

-- Quick lookup of all entries in a journal
CREATE INDEX IF NOT EXISTS idx_gl_entry_journal 
ON public.gl_entry (journal_id);

-- Account-level queries and ledger reports
CREATE INDEX IF NOT EXISTS idx_gl_entry_account 
ON public.gl_entry (account_id);

-- Combined index for efficient trial balance queries
CREATE INDEX IF NOT EXISTS idx_gl_entry_account_journal 
ON public.gl_entry (account_id, journal_id);

-- =====================================================
-- CHART OF ACCOUNTS INDEXES
-- =====================================================

-- Account type and code sorting
CREATE INDEX IF NOT EXISTS idx_coa_account_type_code 
ON public.coa_account (type, code);

-- Hierarchical structure traversal
CREATE INDEX IF NOT EXISTS idx_coa_account_parent 
ON public.coa_account (parent_id) WHERE parent_id IS NOT NULL;

-- Filter active accounts
CREATE INDEX IF NOT EXISTS idx_coa_account_active 
ON public.coa_account (active) WHERE active = true;

-- Level-based queries for reporting
CREATE INDEX IF NOT EXISTS idx_coa_account_level 
ON public.coa_account (level);

-- =====================================================
-- ACCOUNTS PAYABLE INDEXES
-- =====================================================

-- Vendor-specific reports and aging
CREATE INDEX IF NOT EXISTS idx_ap_invoice_vendor_status_date 
ON public.ap_invoice (vendor_id, status, date);

-- Branch-level AP reports
CREATE INDEX IF NOT EXISTS idx_ap_invoice_sucursal_date 
ON public.ap_invoice (sucursal_id, date);

-- Aging reports and payment tracking
CREATE INDEX IF NOT EXISTS idx_ap_invoice_status_due_date 
ON public.ap_invoice (status, due_date) WHERE status = 'OPEN';

-- Invoice lookup by number
CREATE INDEX IF NOT EXISTS idx_ap_invoice_invoice_no 
ON public.ap_invoice (invoice_no);

-- Payment history lookup
CREATE INDEX IF NOT EXISTS idx_ap_payment_invoice 
ON public.ap_payment (ap_invoice_id);

-- Payment date queries
CREATE INDEX IF NOT EXISTS idx_ap_payment_date 
ON public.ap_payment (date);

-- =====================================================
-- VENDOR INDEXES
-- =====================================================

-- Active vendor filtering
CREATE INDEX IF NOT EXISTS idx_vendor_active 
ON public.vendor (active) WHERE active = true;

-- Tax ID lookup
CREATE INDEX IF NOT EXISTS idx_vendor_tax_id 
ON public.vendor (tax_id) WHERE tax_id IS NOT NULL;

-- =====================================================
-- APP SETTINGS INDEXES
-- =====================================================

-- Scope-based filtering
CREATE INDEX IF NOT EXISTS idx_app_settings_scope 
ON public.app_settings (scope);

-- Unique constraint already provides index on (scope, sucursal_id, key)

COMMENT ON INDEX idx_gl_journal_date_sucursal IS 'Optimize date range queries by branch';
COMMENT ON INDEX idx_gl_entry_account IS 'Optimize account ledger and trial balance queries';
COMMENT ON INDEX idx_ap_invoice_vendor_status_date IS 'Optimize vendor aging and payment reports';
