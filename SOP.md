# Arachnix EMS Standard Operating Procedure

**Document owner:** EMS Administrator  
**Applies to:** HR, Finance, Operations, Directors, and system administrators  
**System:** Arachnix Employee Management System (EMS)  
**Review cadence:** Review after material workflow or permission changes, and at least annually

## 1. Purpose

This SOP defines how to access and operate Arachnix EMS safely and consistently. It covers employee records, leave, holidays, salary data, salary slips, offer letters, accounting records, reports, search, and audit review.

The system is an internal operational tool. Enter only approved business data, verify changes before saving, and protect salary, bank, identity, and document information.

## 2. Roles And Access

Access is assigned by role. The navigation shown after sign-in is filtered to the signed-in user's permissions. A missing menu item normally means that the role does not have access; do not work around this restriction by sharing accounts.

| Role                           | Main responsibilities                                                                 | Access notes                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super Admin                    | System governance, all HR and Finance operations, access administration, audit review | Full access. The only role that can assign Director status or review the audit log. The single Super Admin account cannot be reassigned or deleted.                              |
| Admin                          | Day-to-day administration and staff access management                                 | Broad operational access. Can assign Admin, HR Manager, Finance Manager, and Employee roles, but not Super Admin.                                                                |
| HR Manager                     | Employee records, leave, holidays, salary profiles, and offer letters                 | Can manage HR Manager and Employee records. Reports are limited to the HR-supported report set.                                                                                  |
| Finance Manager                | Salary profiles, salary slip runs, accounting, and Finance reports                    | No employee directory access. Holiday calendar is read-only.                                                                                                                     |
| HR Manager with Finance access | HR work plus Finance operations                                                       | Finance access is an additional grant and must be assigned by a Super Admin or Admin.                                                                                            |
| Director                       | Read-only oversight                                                                   | Director is a flag on an employee record, not a separate login role. It provides read-only dashboard, reports, and financial statements access, but not accounting input access. |
| Employee                       | Personal workspace access                                                             | Settings access only in the current permission model; employees do not receive the dashboard overview.                                                                           |

### Access rules

- Never share credentials or use another person's session.
- Super Admin may assign or remove Director status.
- Super Admin and Admin may grant Finance access to an HR Manager.
- Finance access is an additional grant, not a separate role. An HR Manager with this grant keeps HR access and receives Finance permissions.
- HR Managers may not assign Finance Manager, Admin, or Super Admin roles.
- Finance Managers cannot manage employee records or user roles.
- Directors are read-only and cannot edit Monthly Balances, Accounting Records, or Financial Statements.
- Use the least access required for the job and remove temporary access when it is no longer needed.

## 3. Before You Start

Confirm the following before performing operational work:

1. You have an individual work account and the correct role.
2. The employee, payroll period, leave dates, or transaction reference is available and approved.
3. You have checked for an existing record before creating a new one.
4. Supporting documents are accurate, complete, and appropriate to upload.
5. For payroll, salary, bank, or accounting work, a second-person review is available where required by company policy.

## 4. Sign In And Workspace Basics

1. Open the EMS application URL supplied by your administrator.
2. Sign in with your work email and password.
3. Confirm the role shown in the workspace sidebar.
4. Use the Dashboard for operational totals and quick links when it is available for your role.
5. Open **Search** from the dashboard or use the search palette shortcut. Search results are filtered by your permissions.
6. Use the theme control only as a display preference; it does not change access.
7. Select **Log out** when finished, especially on a shared or managed device.

If sign-in fails, confirm the work email and contact the administrator. Do not repeatedly guess passwords or create an unapproved duplicate account.

## 5. Standard Operating Procedures

### 5.1 Register Or Update An Employee

**Owner:** Super Admin, Admin, or HR Manager with the relevant access

1. Open **Employees**.
2. Search by name, email, or another identifying field to avoid duplicates.
3. Select **Register employee** for a new record, or open the existing employee to edit it.
4. Enter the employee's approved personal, employment, contact, and role information.
5. Select the appropriate application role. Do not attempt to create or assign Super Admin.
6. If authorized, set Finance access for an HR Manager. Only a Super Admin may set or remove Director status.
7. Review every field, especially email, employment status, role, access flags, salary-related fields, and bank details.
8. Save the record and confirm the success message.
9. Search for the employee again and verify that the saved values and expected navigation/access are correct.

**Control:** Record the approval source for role or access changes according to company policy. Super Admin changes and sensitive access changes should be independently reviewed.

### 5.2 Provision, Change, Or Revoke Employee Access

**Owner:** Super Admin or Admin; HR may manage only the roles permitted by the access rules

1. Confirm the approved role, employee identity, email address, and access flags before changing access.
2. For a new user, register the employee and create the login through the employee registration flow.
3. Assign only an allowed application role. Never create or reassign the seeded Super Admin role.
4. If approved, enable Finance access only for an HR Manager. Assign or remove Director status only as Super Admin.
5. Save the change and verify the employee's role and access flags.
6. Ask the user to sign in and confirm that the expected navigation appears and restricted pages remain unavailable.
7. To revoke access, follow the approved offboarding process and confirm that the employee is inactive or deleted as required by company policy.

Do not share a password or use a shared login. Record the approver, effective date, and reason for every access change.

### 5.3 Delete An Employee Record

**Owner:** Super Admin, Admin, or HR Manager, subject to record-level restrictions

1. Confirm that deletion is approved and that retention requirements do not require the record to remain.
2. Open the employee record and verify the identity, role, Director status, and linked operational records.
3. Do not delete yourself, the Super Admin record, or a record needed for payroll, audit, legal, or retention purposes.
4. HR Managers may delete only non-Director HR Manager or Employee records. Admin and Super Admin may manage the roles permitted by the access rules.
5. Confirm the permanent-delete action only after checking the target record again.
6. Verify that the employee no longer appears in searches or active lists, and record the approval and outcome.

Deletion is permanent. Use deactivation or the approved offboarding process when historical reporting or audit continuity is required.

### 5.4 Manage Leave Requests

**Owner:** HR operations

1. Open **Leave Requests**.
2. Filter by status, leave type, employee, or date as needed.
3. Open the request and verify the employee, dates, leave type, duration, reason, and available balance.
4. Check for date conflicts, public holidays, and any required supporting evidence.
5. Select the appropriate action: approve, reject, or request changes.
6. Add a clear reason when rejecting or requesting changes.
7. Confirm the new status and communicate the outcome through the approved employee communication channel.

Do not approve a request with incomplete dates or an unresolved balance discrepancy. Escalate conflicting records to the HR owner.

### 5.5 Maintain Leave Balances

**Owner:** HR operations

1. Open **Leave Balances** and locate the employee and leave year.
2. Select the correct leave category, such as annual, sick, casual, or carry-forward.
3. Create or edit the balance using the approved entitlement and carry-forward information.
4. Save the change and verify the updated available, used, and remaining values.
5. Reconcile the balance against approved leave requests.

Make corrections from the source record where possible. Do not overwrite a balance to hide an unexplained discrepancy; document and escalate the issue.

### 5.6 Maintain Holidays

**Owner:** Super Admin, Admin, or HR Manager

1. Open **Holiday Calendar**.
2. Check for an existing holiday before adding one.
3. Add or edit the holiday name, date, and applicable information.
4. Confirm the date and year, then save.
5. Review the calendar for duplicate or incorrectly dated entries.

Finance Managers may view the calendar but cannot modify it.

### 5.7 Maintain Salary Profiles

**Owner:** Super Admin, Admin, HR Manager, or Finance Manager

1. Open **Salary** and locate the employee.
2. Confirm the employee identity and effective period before editing.
3. Enter or update base salary, allowances, deductions or tax values, totals, and bank details as applicable.
4. Check that calculated totals agree with the approved compensation record.
5. Save the profile.
6. Reopen or refresh the record and verify the saved values before starting a salary slip run.

Treat salary and bank information as confidential. Do not place those values in chat, screenshots, or unapproved files.

### 5.8 Run Salary Slips

**Owner:** Finance operations

1. Open **Salary Slip Runs**.
2. Select the payroll period and intended employees.
3. Review the employee list and identify missing salary details.
4. Complete or correct missing salary profiles before generating slips.
5. Add approved extras or adjustments for the period.
6. Start the generation run.
7. Monitor the run until each employee has a success or failure result.
8. Open **Salary Slip Run Details** and review document generation and email status for each employee.
9. Investigate failures, correct the source data or integration issue, and rerun only according to Finance approval.
10. Confirm that generated documents and delivery statuses match the payroll checklist.

Do not treat a started run as completed. A run is complete only after its per-employee results and exceptions have been reviewed.

### 5.9 Generate Offer Letters

**Owner:** Super Admin, Admin, or HR Manager

1. Open **Offer Letters**.
2. Start a generation run and select the approved candidates.
3. Verify candidate identity, job details, compensation, start date, and template information.
4. Submit the run.
5. Monitor processing and open **Offer Letter Run Details**.
6. Review successful and failed documents before sending or distributing them.
7. Correct source data and rerun failed items only after checking that duplicates will not be issued.

### 5.10 Review Generated Documents

**Owner:** Super Admin, Admin, or HR Manager for offer-letter documents; Finance operations for salary-slip documents

1. Open **Generated Documents** after a document run or when reviewing previously generated files.
2. Filter by document type, employee or candidate, run, period, and status.
3. Open the document record and confirm the recipient, source record, generation status, and delivery status.
4. Do not distribute a document with failed generation, incorrect compensation, incorrect dates, or an unexpected recipient.
5. Correct the source record, document the correction, and rerun only the affected item when the workflow supports it.

### 5.11 Upload And Review Accounting Records

**Owner:** Super Admin, Admin, or Finance Manager

1. Open **Accounting Records**.
2. Confirm the transaction date, type, amount, description, and reference.
3. Upload only the correct supporting file and check that it contains no unrelated confidential data.
4. Save the record.
5. Review the resulting cashflow and accounting metrics for an obvious mismatch.
6. Wait for the configured downstream archive workflow to complete and review its result. Archival is performed by the integration, not manually from the accounting page.

Record integration failures for the Finance owner. Do not repeatedly upload the same transaction unless the duplicate handling procedure has been confirmed.

### 5.12 Maintain Monthly Balances

**Owner:** Super Admin, Admin, or Finance Manager

1. Open **Monthly Balances** and select the correct month.
2. Review existing liability and other-asset lines before adding or changing values.
3. Enter each approved line with a clear label and a zero-or-greater amount.
4. Save the month and verify the success message and resulting totals.
5. Super Admin may maintain opening cash and opening equity. Other authorized Finance users may maintain monthly lines but must leave opening values unchanged.
6. Reopen **Financial Statements** for the same month and confirm that the statement reflects the saved balances.

Do not use balance lines to conceal an unexplained accounting discrepancy. Preserve the source approval and escalate mismatches.

### 5.13 Generate Financial Statements

**Owner:** Super Admin, Admin, or Finance Manager; Directors have read-only access

1. Open **Financial Statements** and select the required month.
2. Select **Generate** when a fresh statement is required, then wait for the success or error result.
3. Review the income statement, balance sheet, and cash-flow statement.
4. If the page reports that the balance sheet is unbalanced, stop distribution and reconcile Accounting Records and Monthly Balances.
5. Review totals against source records and the approved reporting period.
6. Export only the required statement in CSV, XLSX, or PDF format and store it securely.

### 5.14 Generate Reports And Exports

**Owner:** Authorized business users

1. Open **Reports**. The available report types depend on your role; do not assume that every report area is available to every user.
2. Select the report type and date or period filters.
3. Confirm that the result scope matches the intended audience and reporting period.
4. Review totals and a sample of underlying records.
5. Export to CSV, XLSX, or PDF only when required.
6. Store or share the export using the approved secure location and retention policy.

Available report areas include payroll, leave, employees, expenses, income, cashflow, director accounts, and monthly summaries, subject to role permissions. Director access is read-only.

### 5.15 Review Audit Activity

**Owner:** Super Admin

1. Open **Audit Log**.
2. Filter or search by action, user, record, date, or outcome.
3. Review changed fields and processing results against the approved request.
4. Escalate unexplained access, data, or processing changes immediately.
5. Preserve relevant evidence according to the incident and retention policy.

The audit log is a review control, not a replacement for approvals or source documentation.

## 6. Daily And Periodic Checks

### Daily opening check

- Confirm that you can sign in and that your role is correct.
- Review dashboard exceptions and pending leave or document work.
- Check integration-dependent work for failures before beginning a new run.

### Payroll-period check

- Confirm all in-scope employees have current salary profiles.
- Verify approved adjustments and extras.
- Review every salary run result and delivery status.
- Retain the approved payroll checklist and exception decisions.

### Monthly or scheduled review

- Review employee duplicates, inactive records, and role assignments.
- Reconcile leave balances and approved requests.
- Review accounting records and exports for completeness.
- Review audit activity for unusual or unauthorized changes.
- Remove access that is no longer required.

## 7. Troubleshooting And Escalation

| Symptom                            | First check                                                                          | Escalate to                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Menu or page is unavailable        | Confirm role, access flags, and whether the page is read-only                        | EMS Administrator                                               |
| Employee is missing or duplicated  | Search with alternate identifying fields; do not create a second record immediately  | HR owner, then EMS Administrator                                |
| Leave balance is incorrect         | Compare the balance with approved requests and the leave year/category               | HR owner                                                        |
| Salary slip or offer letter fails  | Open run details, identify the failed employee or document, then correct source data | Finance or HR owner; EMS Administrator for integration failures |
| Accounting upload or archive fails | Confirm file type, record metadata, and whether the transaction already exists       | Finance owner, then integration administrator                   |
| Report totals look wrong           | Recheck filters, period, source records, and permissions                             | Report owner and EMS Administrator                              |
| Sign-in or session problem         | Confirm account status and use the approved sign-in recovery process                 | EMS Administrator                                               |

When escalating, include the affected record or run identifier, approximate time, action attempted, visible error, and steps already taken. Do not include passwords or expose confidential data unnecessarily.

## 8. Data Protection And Change Control

- Use real production data only in the production environment and approved tools.
- Verify before saving; saved changes may affect payroll, leave, reports, or downstream workflows.
- Keep supporting approvals with the relevant business process.
- Do not delete, duplicate, or bulk-edit records to work around an error.
- Export only the minimum data needed and follow the organization's retention and disposal rules.
- Report suspected unauthorized access or incorrect payroll/document distribution immediately.
- Test integration, permission, or schema changes in the approved non-production process before release.

## 9. Administrator Setup Reference

This section is for the person responsible for operating the application, not for normal end users.

The deployment requires Node.js 22 for the Docker build, a `.env` file for Compose, the Supabase project, and these core configuration values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMS_SESSION_SECRET` or the configured session secret fallback
- `N8N_BASE_URL` or `NEXT_PUBLIC_N8N_BASE_URL`

Supabase Auth, the employee/account structure, and the required n8n workflows must be provisioned before users can complete end-to-end operations. The Docker Compose deployment exposes the application locally at `http://127.0.0.1:5000`.

Apply the SQL files in `supabase/migrations` to the intended Supabase project before the first operational use. Confirm that the migration state and Auth configuration match the release.

The application uses `N8N_BASE_URL` first, then `NEXT_PUBLIC_N8N_BASE_URL`, and otherwise defaults to `https://n8n.arachnix.ai`. Confirm the n8n workflows and webhook mode before production use. In particular, accounting-balance and financial-statement integrations currently use `/webhook-test/` endpoints and require the corresponding active test workflows; change and validate this configuration before treating those workflows as production-ready.

For local development:

```text
npm ci
npm run dev
```

For a production-style container deployment:

```text
docker compose up --build -d
```

After deployment, verify sign-in, role-filtered navigation, one representative employee lookup, and the integration workflows required by the release. Never place service-role keys in client-side code or share them with end users.

The Compose port is bound to `127.0.0.1`, so the application is local to the host unless a reverse proxy or deliberate network exposure is configured. If the service is exposed beyond the host, apply the organization's TLS, authentication, firewall, backup, and monitoring controls.

## 10. Quick End-Of-Task Checklist

- [ ] I used my own account and had the required permission.
- [ ] I checked for an existing record before creating one.
- [ ] I verified the employee, dates, period, amount, or transaction reference.
- [ ] I reviewed the success message or processing result.
- [ ] I checked downstream status where applicable.
- [ ] I recorded or escalated exceptions.
- [ ] I stored exports and supporting documents securely.
- [ ] I logged out when finished.
