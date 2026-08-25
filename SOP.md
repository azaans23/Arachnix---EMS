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

| Role | Main responsibilities | Access notes |
| --- | --- | --- |
| Super Admin | System governance, all HR and Finance operations, access administration, audit review | Full access. The only role that can assign Director status or review the audit log. The single Super Admin account cannot be reassigned. |
| Admin | Day-to-day administration and staff access management | Broad operational access. Can assign Admin, HR Manager, Finance Manager, and Employee roles, but not Super Admin. |
| HR Manager | Employee records, leave, holidays, salary profiles, and offer letters | Can manage HR Manager and Employee records. Reports are limited to the HR-supported report set. |
| Finance Manager | Salary profiles, salary slip runs, accounting, and Finance reports | No employee directory access. Holiday calendar is read-only. |
| HR Manager with Finance access | HR work plus Finance operations | Finance access is an additional grant and must be assigned by a Super Admin or Admin. |
| Director | Read-only oversight | Director is a flag on an employee record, not a separate login role. It provides read-only dashboard and report visibility. |
| Employee | Personal workspace access | Settings access only in the current permission model. |

### Access rules

- Never share credentials or use another person's session.
- Super Admin may assign or remove Director status.
- Super Admin and Admin may grant Finance access to an HR Manager.
- HR Managers may not assign Finance Manager, Admin, or Super Admin roles.
- Finance Managers cannot manage employee records or user roles.
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
4. Use the Dashboard for operational totals and quick links.
5. Use Search to locate records quickly. Search results are filtered by your permissions.
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
6. If authorized, set Finance access for an HR Manager or Director status according to the approval received.
7. Review every field, especially email, employment status, role, access flags, salary-related fields, and bank details.
8. Save the record and confirm the success message.
9. Search for the employee again and verify that the saved values and expected navigation/access are correct.

**Control:** Record the approval source for role or access changes according to company policy. Super Admin changes and sensitive access changes should be independently reviewed.

### 5.2 Manage Leave Requests

**Owner:** HR operations

1. Open **Leave Requests**.
2. Filter by status, leave type, employee, or date as needed.
3. Open the request and verify the employee, dates, leave type, duration, reason, and available balance.
4. Check for date conflicts, public holidays, and any required supporting evidence.
5. Select the appropriate action: approve, reject, or request changes.
6. Add a clear reason when rejecting or requesting changes.
7. Confirm the new status and communicate the outcome through the approved employee communication channel.

Do not approve a request with incomplete dates or an unresolved balance discrepancy. Escalate conflicting records to the HR owner.

### 5.3 Maintain Leave Balances

**Owner:** HR operations

1. Open **Leave Balances** and locate the employee and leave year.
2. Select the correct leave category, such as annual, sick, casual, or carry-forward.
3. Create or edit the balance using the approved entitlement and carry-forward information.
4. Save the change and verify the updated available, used, and remaining values.
5. Reconcile the balance against approved leave requests.

Make corrections from the source record where possible. Do not overwrite a balance to hide an unexplained discrepancy; document and escalate the issue.

### 5.4 Maintain Holidays

**Owner:** Super Admin, Admin, or HR Manager

1. Open **Holiday Calendar**.
2. Check for an existing holiday before adding one.
3. Add or edit the holiday name, date, and applicable information.
4. Confirm the date and year, then save.
5. Review the calendar for duplicate or incorrectly dated entries.

Finance Managers may view the calendar but cannot modify it.

### 5.5 Maintain Salary Profiles

**Owner:** Super Admin, Admin, HR Manager, or Finance Manager

1. Open **Salary** and locate the employee.
2. Confirm the employee identity and effective period before editing.
3. Enter or update base salary, allowances, deductions or tax values, totals, and bank details as applicable.
4. Check that calculated totals agree with the approved compensation record.
5. Save the profile.
6. Reopen or refresh the record and verify the saved values before starting a salary slip run.

Treat salary and bank information as confidential. Do not place those values in chat, screenshots, or unapproved files.

### 5.6 Run Salary Slips

**Owner:** Finance operations

1. Open **Salary Slip Runs**.
2. Select the payroll period and intended employees.
3. Review the employee list and identify missing salary details.
4. Complete or correct missing salary profiles before generating slips.
5. Add approved extras or adjustments for the period.
6. Start the generation run.
7. Monitor the run until each employee has a success or failure result.
8. Open the run details and review document generation and email status.
9. Investigate failures, correct the source data or integration issue, and rerun only according to Finance approval.
10. Confirm that generated documents and delivery statuses match the payroll checklist.

Do not treat a started run as completed. A run is complete only after its per-employee results and exceptions have been reviewed.

### 5.7 Generate Offer Letters

**Owner:** Super Admin, Admin, or HR Manager

1. Open **Offer Letters**.
2. Start a generation run and select the approved candidates.
3. Verify candidate identity, job details, compensation, start date, and template information.
4. Submit the run.
5. Monitor processing and open the run details.
6. Review successful and failed documents before sending or distributing them.
7. Correct source data and rerun failed items only after checking that duplicates will not be issued.

### 5.8 Upload And Review Accounting Records

**Owner:** Super Admin, Admin, or Finance Manager

1. Open **Accounting Records**.
2. Confirm the transaction date, type, amount, description, and reference.
3. Upload only the correct supporting file and check that it contains no unrelated confidential data.
4. Save the record.
5. Review the resulting cashflow and accounting metrics for an obvious mismatch.
6. Archive records through the configured workflow when the accounting process requires it.

Record integration failures for the Finance owner. Do not repeatedly upload the same transaction unless the duplicate handling procedure has been confirmed.

### 5.9 Generate Reports And Exports

**Owner:** Authorized business users

1. Open **Reports**.
2. Select the report type and date or period filters.
3. Confirm that the result scope matches the intended audience and reporting period.
4. Review totals and a sample of underlying records.
5. Export to CSV, XLSX, or PDF only when required.
6. Store or share the export using the approved secure location and retention policy.

Available report areas include payroll, leave, employees, expenses, income, cashflow, director accounts, and monthly summaries. Director access is read-only.

### 5.10 Review Audit Activity

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

| Symptom | First check | Escalate to |
| --- | --- | --- |
| Menu or page is unavailable | Confirm role, access flags, and whether the page is read-only | EMS Administrator |
| Employee is missing or duplicated | Search with alternate identifying fields; do not create a second record immediately | HR owner, then EMS Administrator |
| Leave balance is incorrect | Compare the balance with approved requests and the leave year/category | HR owner |
| Salary slip or offer letter fails | Open run details, identify the failed employee or document, then correct source data | Finance or HR owner; EMS Administrator for integration failures |
| Accounting upload or archive fails | Confirm file type, record metadata, and whether the transaction already exists | Finance owner, then integration administrator |
| Report totals look wrong | Recheck filters, period, source records, and permissions | Report owner and EMS Administrator |
| Sign-in or session problem | Confirm account status and use the approved sign-in recovery process | EMS Administrator |

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

The deployment requires Node.js 22 for the Docker build and these core configuration values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMS_SESSION_SECRET` or the configured session secret fallback
- `N8N_BASE_URL` or `NEXT_PUBLIC_N8N_BASE_URL`

Supabase Auth, the employee/account structure, and the required n8n workflows must be provisioned before users can complete end-to-end operations. The Docker Compose deployment exposes the application locally at `http://127.0.0.1:5000`.

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

## 10. Quick End-Of-Task Checklist

- [ ] I used my own account and had the required permission.
- [ ] I checked for an existing record before creating one.
- [ ] I verified the employee, dates, period, amount, or transaction reference.
- [ ] I reviewed the success message or processing result.
- [ ] I checked downstream status where applicable.
- [ ] I recorded or escalated exceptions.
- [ ] I stored exports and supporting documents securely.
- [ ] I logged out when finished.