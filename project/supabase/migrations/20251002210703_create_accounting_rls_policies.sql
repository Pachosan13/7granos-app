/*
  # Accounting RLS Policies

  ## Summary
  Implements Row Level Security policies for all accounting tables based on user roles
  and branch assignments.

  ## Access Rules

  ### Reading (SELECT)
  - **owner/admin/accountant**: Full access to all records (global)
  - **manager/viewer**: Restricted to their assigned branches only
  - Uses user_sucursal table to determine branch access

  ### Writing (INSERT/UPDATE/DELETE)
  - **owner/admin/accountant**: Full write access
  - **manager/viewer**: No write access (read-only)

  ## Tables Covered
  - coa_account (Chart of Accounts)
  - gl_journal (Journal Headers)
  - gl_entry (Journal Entry Lines)
  - vendor (Vendors)
  - ap_invoice (AP Invoices)
  - ap_payment (AP Payments)
  - app_settings (Application Settings)

  ## Important Notes
  - Policies do NOT affect existing CSV tables (ventas, compras, invu_ventas)
  - Uses helper functions: has_accounting_role(), has_read_role(), user_sucursales()
  - All policies are restrictive by default (deny all, then allow)
*/

-- =====================================================
-- COA_ACCOUNT POLICIES
-- =====================================================

-- Chart of accounts is global - all authenticated users can read
CREATE POLICY "Users can read chart of accounts"
  ON public.coa_account
  FOR SELECT
  TO authenticated
  USING (has_read_role());

-- Only accounting users can modify chart of accounts
CREATE POLICY "Accounting users can insert accounts"
  ON public.coa_account
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update accounts"
  ON public.coa_account
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete accounts"
  ON public.coa_account
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- GL_JOURNAL POLICIES
-- =====================================================

-- Read: Owner/admin/accountant see all, manager/viewer see only their branches
CREATE POLICY "Accounting users can read all journals"
  ON public.gl_journal
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Branch users can read their branch journals"
  ON public.gl_journal
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('manager', 'viewer')
    )
    AND sucursal_id IN (SELECT user_sucursales())
  );

-- Write: Only accounting users
CREATE POLICY "Accounting users can insert journals"
  ON public.gl_journal
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update journals"
  ON public.gl_journal
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete journals"
  ON public.gl_journal
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- GL_ENTRY POLICIES
-- =====================================================

-- Read: Follow journal access rules
CREATE POLICY "Accounting users can read all entries"
  ON public.gl_entry
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Branch users can read their branch entries"
  ON public.gl_entry
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('manager', 'viewer')
    )
    AND EXISTS (
      SELECT 1 FROM public.gl_journal
      WHERE gl_journal.id = gl_entry.journal_id
      AND gl_journal.sucursal_id IN (SELECT user_sucursales())
    )
  );

-- Write: Only accounting users
CREATE POLICY "Accounting users can insert entries"
  ON public.gl_entry
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update entries"
  ON public.gl_entry
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete entries"
  ON public.gl_entry
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- VENDOR POLICIES
-- =====================================================

-- All authenticated users can read vendors
CREATE POLICY "Users can read vendors"
  ON public.vendor
  FOR SELECT
  TO authenticated
  USING (has_read_role());

-- Only accounting users can modify vendors
CREATE POLICY "Accounting users can insert vendors"
  ON public.vendor
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update vendors"
  ON public.vendor
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete vendors"
  ON public.vendor
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- AP_INVOICE POLICIES
-- =====================================================

-- Read: Owner/admin/accountant see all, manager/viewer see only their branches
CREATE POLICY "Accounting users can read all invoices"
  ON public.ap_invoice
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Branch users can read their branch invoices"
  ON public.ap_invoice
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('manager', 'viewer')
    )
    AND sucursal_id IN (SELECT user_sucursales())
  );

-- Write: Only accounting users
CREATE POLICY "Accounting users can insert invoices"
  ON public.ap_invoice
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update invoices"
  ON public.ap_invoice
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete invoices"
  ON public.ap_invoice
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- AP_PAYMENT POLICIES
-- =====================================================

-- Read: Follow invoice access rules
CREATE POLICY "Accounting users can read all payments"
  ON public.ap_payment
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY "Branch users can read their branch payments"
  ON public.ap_payment
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE user_id = auth.uid()
      AND rol IN ('manager', 'viewer')
    )
    AND EXISTS (
      SELECT 1 FROM public.ap_invoice
      WHERE ap_invoice.id = ap_payment.ap_invoice_id
      AND ap_invoice.sucursal_id IN (SELECT user_sucursales())
    )
  );

-- Write: Only accounting users
CREATE POLICY "Accounting users can insert payments"
  ON public.ap_payment
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update payments"
  ON public.ap_payment
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete payments"
  ON public.ap_payment
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- APP_SETTINGS POLICIES
-- =====================================================

-- Read: All authenticated users can read settings
CREATE POLICY "Users can read app settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (
    has_read_role()
    AND (
      scope = 'global'
      OR sucursal_id IN (SELECT user_sucursales())
    )
  );

-- Write: Only accounting users
CREATE POLICY "Accounting users can insert settings"
  ON public.app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can update settings"
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (has_accounting_role())
  WITH CHECK (has_accounting_role());

CREATE POLICY "Accounting users can delete settings"
  ON public.app_settings
  FOR DELETE
  TO authenticated
  USING (has_accounting_role());

-- =====================================================
-- GRANT EXECUTE PERMISSIONS FOR FUNCTIONS
-- =====================================================

-- Grant execute on reporting functions to authenticated users
GRANT EXECUTE ON FUNCTION public.v_trial_balance(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v_general_ledger(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v_pl(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v_balance_sheet(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v_cashflow(date, date, uuid) TO authenticated;

-- Grant execute on posting functions only to authenticated users (RLS enforced in function)
GRANT EXECUTE ON FUNCTION public.api_post_sales_to_gl(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.api_post_purchases_to_gl(date, date, uuid) TO authenticated;

COMMENT ON POLICY "Users can read chart of accounts" ON public.coa_account IS 'All users with read role can view chart of accounts';
COMMENT ON POLICY "Branch users can read their branch journals" ON public.gl_journal IS 'Manager/viewer can only see journals from their assigned branches';
COMMENT ON POLICY "Accounting users can insert journals" ON public.gl_journal IS 'Only owner/admin/accountant can create journal entries';
