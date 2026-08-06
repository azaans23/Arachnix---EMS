const N8N_BASE_URL = (
  process.env.N8N_BASE_URL ||
  process.env.NEXT_PUBLIC_N8N_BASE_URL ||
  'https://n8n.arachnix.ai'
).replace(/\/$/, '');

export const SHEETS_WEBHOOKS = {
  getUsers: `${N8N_BASE_URL}/webhook/get-users`,
  updateUser: `${N8N_BASE_URL}/webhook/update-user`,
  getAuditLog: `${N8N_BASE_URL}/webhook/get-audit-log`,
  createAudit: `${N8N_BASE_URL}/webhook/create-audit`,
  generateSalarySlip: `${N8N_BASE_URL}/webhook/generate-salary-slip`,
  generateOfferLetter: `${N8N_BASE_URL}/webhook-test/generate-offer-letter`,
  getSalaryDetail: `${N8N_BASE_URL}/webhook/get-salary-detail`,
  updateSalaryDetail: `${N8N_BASE_URL}/webhook/update-salary-detail`,
} as const;
