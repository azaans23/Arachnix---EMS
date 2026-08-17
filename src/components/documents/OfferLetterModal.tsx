'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, FileText, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';

type OfferLetterModalProps = {
  /** How many blank candidate forms to show (1–20). */
  count: number;
  month: number;
  year: number;
  onClose: () => void;
  onSuccess?: (runId?: string) => void;
};

type OfferLetterForm = {
  fullName: string;
  email: string;
  designation: string;
  joiningDate: string;
  hasPartTimeTenure: boolean;
  partTimeTenure: string;
  fullTimeStart: string;
  partTimeSalary: string;
  fullTimeSalary: string;
  numberOfLeaves: string;
};

const inputClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]';

function emptyForm(): OfferLetterForm {
  return {
    fullName: '',
    email: '',
    designation: '',
    joiningDate: '',
    hasPartTimeTenure: true,
    partTimeTenure: '',
    fullTimeStart: '',
    partTimeSalary: '',
    fullTimeSalary: '',
    numberOfLeaves: '',
  };
}

function clampCount(value: number) {
  if (!Number.isInteger(value) || value < 1) return 1;
  return Math.min(value, 20);
}

export default function OfferLetterModal({
  count,
  month,
  year,
  onClose,
  onSuccess,
}: OfferLetterModalProps) {
  const formCount = clampCount(count);
  const [forms, setForms] = useState<OfferLetterForm[]>(() =>
    Array.from({ length: formCount }, () => emptyForm())
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, submitting]);

  const updateField = <K extends keyof OfferLetterForm>(
    index: number,
    field: K,
    value: OfferLetterForm[K]
  ) => {
    setForms((current) =>
      current.map((form, formIndex) => (formIndex === index ? { ...form, [field]: value } : form))
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const offers: Array<{
      fullName: string;
      email: string;
      designation: string;
      joiningDate: string;
      hasPartTimeTenure: boolean;
      partTimeTenure: string;
      fullTimeStart: string;
      partTimeSalary: number;
      fullTimeSalary: number;
      numberOfLeaves: number;
    }> = [];

    for (let index = 0; index < forms.length; index += 1) {
      const form = forms[index];
      const label = `Candidate ${index + 1}`;

      if (
        !form.fullName.trim() ||
        !form.email.trim() ||
        !form.designation.trim() ||
        !form.joiningDate
      ) {
        toast.error(`${label}: complete all employee and joining date fields.`);
        return;
      }

      if (form.hasPartTimeTenure && !form.partTimeTenure) {
        toast.error(`${label}: enter the part-time tenure end date.`);
        return;
      }

      if (form.hasPartTimeTenure && !form.fullTimeStart) {
        toast.error(`${label}: enter the full-time start date.`);
        return;
      }

      const partTimeSalary = Number(form.partTimeSalary);
      const fullTimeSalary = Number(form.fullTimeSalary);
      const numberOfLeaves = Number(form.numberOfLeaves);

      if (!Number.isFinite(fullTimeSalary) || fullTimeSalary <= 0) {
        toast.error(`${label}: full-time salary must be greater than zero.`);
        return;
      }

      if (
        form.hasPartTimeTenure &&
        (!Number.isFinite(partTimeSalary) || partTimeSalary <= 0)
      ) {
        toast.error(`${label}: part-time salary must be greater than zero.`);
        return;
      }

      if (!Number.isInteger(numberOfLeaves) || numberOfLeaves < 0) {
        toast.error(`${label}: number of leaves must be a whole number of zero or more.`);
        return;
      }

      offers.push({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        joiningDate: form.joiningDate,
        hasPartTimeTenure: form.hasPartTimeTenure,
        partTimeTenure: form.hasPartTimeTenure ? form.partTimeTenure : '',
        fullTimeStart: form.hasPartTimeTenure ? form.fullTimeStart : '',
        partTimeSalary: form.hasPartTimeTenure ? partTimeSalary : 0,
        fullTimeSalary,
        numberOfLeaves,
      });
    }

    const emails = offers.map((offer) => offer.email.toLowerCase());
    const duplicate = emails.find((email, index) => emails.indexOf(email) !== index);
    if (duplicate) {
      toast.error(`Duplicate email: ${duplicate}. Each candidate needs a unique email.`);
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/offer-letters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ month, year, offers }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate offer letters.');
      }

      toast.success(
        result.message || `Started ${offers.length} offer letter${offers.length === 1 ? '' : 's'}.`
      );
      onSuccess?.(result.data?.runId ? String(result.data.runId) : undefined);
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate offer letters.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/55 p-4 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-letter-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-5 sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-canvas text-ink">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id="offer-letter-title" className="text-xl font-semibold tracking-tight text-ink">
                Generate offer letter{formCount === 1 ? '' : 's'}
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted">
                Enter details for {formCount} new candidate{formCount === 1 ? '' : 's'}. Offer date
                is set to today.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close offer letter form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-8 px-6 py-6 sm:px-7">
            {forms.map((form, index) => (
              <div key={index} className={index > 0 ? 'border-t border-border pt-8' : undefined}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">Candidate {index + 1}</h3>
                  {formCount > 1 && (
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      {index + 1} / {formCount}
                    </span>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-medium text-muted">Candidate details</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <label className="text-xs font-medium text-muted">
                        Full name <span className="text-danger">*</span>
                        <input
                          autoFocus={index === 0}
                          required
                          value={form.fullName}
                          onChange={(event) => updateField(index, 'fullName', event.target.value)}
                          className={inputClassName}
                          placeholder="Ali Khan"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Email <span className="text-danger">*</span>
                        <input
                          type="email"
                          required
                          value={form.email}
                          onChange={(event) => updateField(index, 'email', event.target.value)}
                          className={inputClassName}
                          placeholder="ali.khan@example.com"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted sm:col-span-2">
                        Designation <span className="text-danger">*</span>
                        <input
                          required
                          value={form.designation}
                          onChange={(event) =>
                            updateField(index, 'designation', event.target.value)
                          }
                          className={inputClassName}
                          placeholder="Frontend Developer"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-medium text-muted">Employment timeline</p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.hasPartTimeTenure}
                        aria-label="Part-time tenure"
                        disabled={submitting}
                        onClick={() =>
                          updateField(index, 'hasPartTimeTenure', !form.hasPartTimeTenure)
                        }
                        className="inline-flex cursor-pointer items-center gap-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-xs font-medium text-ink">Part-time tenure</span>
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                            form.hasPartTimeTenure
                              ? 'border-accent bg-accent'
                              : 'border-border bg-canvas'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
                              form.hasPartTimeTenure
                                ? 'translate-x-5 bg-accent-fg'
                                : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                    <div
                      className={`mt-3 grid gap-4 ${
                        form.hasPartTimeTenure ? 'sm:grid-cols-3' : 'sm:grid-cols-1'
                      }`}
                    >
                      <label className="text-xs font-medium text-muted">
                        Joining date <span className="text-danger">*</span>
                        <span className="relative block">
                          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
                          <input
                            type="date"
                            required
                            value={form.joiningDate}
                            onChange={(event) =>
                              updateField(index, 'joiningDate', event.target.value)
                            }
                            className={`${inputClassName} pl-9`}
                          />
                        </span>
                      </label>
                      {form.hasPartTimeTenure && (
                        <>
                          <label className="text-xs font-medium text-muted">
                            Part-time tenure ends <span className="text-danger">*</span>
                            <input
                              type="date"
                              required
                              value={form.partTimeTenure}
                              onChange={(event) =>
                                updateField(index, 'partTimeTenure', event.target.value)
                              }
                              className={inputClassName}
                            />
                          </label>
                          <label className="text-xs font-medium text-muted">
                            Full-time start <span className="text-danger">*</span>
                            <input
                              type="date"
                              required
                              value={form.fullTimeStart}
                              onChange={(event) =>
                                updateField(index, 'fullTimeStart', event.target.value)
                              }
                              className={inputClassName}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted">Compensation and leave</p>
                    <div
                      className={`mt-3 grid gap-4 ${
                        form.hasPartTimeTenure ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                      }`}
                    >
                      {form.hasPartTimeTenure && (
                        <label className="text-xs font-medium text-muted">
                          Part-time salary <span className="text-danger">*</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={form.partTimeSalary}
                            onChange={(event) =>
                              updateField(index, 'partTimeSalary', event.target.value)
                            }
                            className={inputClassName}
                            placeholder="60000"
                          />
                        </label>
                      )}
                      <label className="text-xs font-medium text-muted">
                        {form.hasPartTimeTenure ? 'Full-time salary' : 'Salary'}{' '}
                        <span className="text-danger">*</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={form.fullTimeSalary}
                          onChange={(event) =>
                            updateField(index, 'fullTimeSalary', event.target.value)
                          }
                          className={inputClassName}
                          placeholder="120000"
                        />
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Annual leaves <span className="text-danger">*</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={form.numberOfLeaves}
                          onChange={(event) =>
                            updateField(index, 'numberOfLeaves', event.target.value)
                          }
                          className={inputClassName}
                          placeholder="18"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Generate {formCount} offer letter{formCount === 1 ? '' : 's'}
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
