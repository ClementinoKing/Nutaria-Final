# Supply Quality Checks – Test & Validation Notes

## Manual Test Checklist

1. **Wizard Navigation**
   - Open `Supplies` → `New Supply`.
   - Verify the step rail highlights the current stage.
   - Ensure `Next` is disabled until required fields in the current step are filled.
   - Confirm `Back` returns to the previous step without losing data.

2. **Basic Information**
   - Required fields: warehouse, supplier, received at, status.
   - Document number should be read-only and auto-generated.
   - Logged-in user name/email appears in `Received by`.

3. **Supply Batches**
   - Adding/removing batches adjusts the list and suggested lot numbers.
   - Validation prevents advancing with missing product/unit/quantity.
   - Quantity input allows decimals and enforces non-negative values.

4. **Quality Evaluation**
   - All 16 parameters render with specification text.
   - Score dropdown must accept only values 1–3; start defaulted to 3.
   - Remarks remain editable per row; legend displays below.
   - `Overall remarks` textarea saves free-text notes.

5. **Review & Submit**
   - Review step mirrors previously captured data.
   - Average quality score chip updates when changing scores.
   - Submitting triggers success toast and closes the modal.
   - New supply appears in table with correct quality status (`PASSED` if all 3, else `PENDING`).

6. **Persistence**
   - Inspect Supabase tables (`supplies`, `supply_lines`, `supply_batches`, `supply_quality_checks`, `supply_quality_check_items`) to confirm inserts.
   - Reload the page; new supply should still show quality metadata.
   - Open the supply detail view; quality section lists captured rows, overall score, and remarks.

7. **Edge Cases**
   - Try partial submissions (e.g., remove a score) and ensure validation blocks save.
   - Change status to `REJECTED` and confirm quality status defaults to `PENDING`.
   - Validate behaviour when network/API errors occur (mock Supabase failure) – toasts display error text.

## Suggested Automated Coverage

- **Unit tests** for score averaging and validation helpers (e.g., step validation logic).
- **Component tests** for the wizard to exercise:
  - Step transitions with mock form inputs.
  - Rendering of quality parameter table and legend.
- **Integration/e2e tests** (Playwright/Cypress):
  - Full supply creation path, verifying data persisted via API stubs.
  - Viewing an existing supply with quality data.

## Observations

- Quality parameter metadata seeds via Supabase on first save; confirm database role has `INSERT` permission.
- The wizard currently requires at least one batch; staged supplies will fail validation if batches missing.
- No retry/backoff logic is implemented for Supabase failures; manual retry via UI is required.

