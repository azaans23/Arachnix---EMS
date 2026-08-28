const N8N_BASE_URL = (
  process.env.N8N_BASE_URL ||
  process.env.NEXT_PUBLIC_N8N_BASE_URL ||
  'https://n8n.arachnix.ai'
).replace(/\/$/, '');

/** Active n8n webhooks still called from the app. */
export const SHEETS_WEBHOOKS = {
  updateUser: `${N8N_BASE_URL}/webhook/update-user`,
  createAudit: `${N8N_BASE_URL}/webhook/create-audit`,
  createSalaryHistory: `${N8N_BASE_URL}/webhook/create-salary-history`,
  upsertOffboarding: `${N8N_BASE_URL}/webhook/upsert-offboarding`,
  generateSalarySlip: `${N8N_BASE_URL}/webhook/generate-salary-slip`,
  generateOfferLetter: `${N8N_BASE_URL}/webhook/generate-offer-letter`,
  updateSalaryDetail: `${N8N_BASE_URL}/webhook/update-salary-detail`,
  updateLeave: `${N8N_BASE_URL}/webhook/update-leave`,
  createLeaveRequest: `${N8N_BASE_URL}/webhook/create-leave-request`,
  createHoliday: `${N8N_BASE_URL}/webhook/create-holiday`,
  uploadAccountingRecord: `${N8N_BASE_URL}/webhook/create-transaction`,
  upsertFinancialStatements: `${N8N_BASE_URL}/webhook-test/upsert-financial-statements`,
  upsertAccountingBalances: `${N8N_BASE_URL}/webhook-test/upsert-accounting-balances`,
  deleteEmployee: `${N8N_BASE_URL}/webhook/delete-employee`,
} as const;
