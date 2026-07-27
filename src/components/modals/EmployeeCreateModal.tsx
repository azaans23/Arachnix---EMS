'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import toast from 'react-hot-toast';
import {
    X,
    User,
    Mail,
    Phone,
    Briefcase,
    DollarSign,
    Shield,
    MapPin,
    CreditCard,
    Database,
    Calendar,
    PlusCircle,
    Clock,
} from 'lucide-react';
import CustomDropdown from '@/components/ui/Dropdown';

interface SheetUser {
    name: string;
    email: string;
    role: string;
    employeeId?: string;
    raw?: Record<string, string | number | null | undefined>;
}

interface EmployeeCreateModalProps {
    user?: SheetUser;
    onClose: () => void;
    onSuccess?: () => void;
}

const roleOptions = [
    { label: 'Employee', value: 'Employee' },
    { label: 'Admin', value: 'Admin' },
    { label: 'HR', value: 'HR' },
    { label: 'Finance', value: 'Finance' },
    { label: 'Director', value: 'Director' },
];

const emsStatusOptions = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
];

export default function EmployeeCreateModal({
    user,
    onClose,
    onSuccess,
}: EmployeeCreateModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const isEditMode = !!user;
    const raw = user?.raw || {};

    const formik = useFormik({
        initialValues: {
            name: user?.name || '',
            email: user?.email || '',
            phone: raw.Phone || raw.phone || '',
            designation: raw.Designation || raw.designation || '',
            department: raw.Department || raw.department || '',
            employmentType: raw.EmployeeType || raw.employeeType || '',
            dob: raw.DOB || raw.dob || '',
            joiningDate: raw.JoiningDate || raw.joiningDate || '',
            baseSalary: raw.BaseSalary || raw.baseSalary || '',
            role: user?.role || 'Employee',
            emsStatus: raw.EMSStatus || raw.emsStatus || 'Active',
            address: raw.Address || raw.address || '',
            bankAccountDetails: raw.BankAccountDetails || raw.bankAccountDetails || '',
        },
        enableReinitialize: true,
        onSubmit: async (values) => {
            setSubmitting(true);
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                const res = await fetch('/api/update-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(values),
                });

                const result = await res.json();

                if (!res.ok || !result.success) {
                    throw new Error(result.error || 'Failed to update user.');
                }

                toast.success(
                    isEditMode
                        ? 'Employee profile updated successfully'
                        : 'Employee profile created successfully'
                );
                if (onSuccess) onSuccess();
                onClose();
            } catch (err: unknown) {
                console.error(err);
                const errMsg = err instanceof Error ? err.message : 'Failed to save employee profile.';
                toast.error(errMsg);
            } finally {
                setSubmitting(false);
            }
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/45 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
            <div
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                className="relative w-full max-w-2xl bg-pure-white border border-subtle-stone shadow-2xl rounded-2xl p-8 mx-auto animate-scale-up overflow-y-auto max-h-[90vh] [&::-webkit-scrollbar]:hidden"
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 p-1.5 text-muted-clay/55 hover:text-obsidian transition-colors rounded-full hover:bg-cream cursor-pointer"
                    aria-label="Close modal"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="border-b border-subtle-stone pb-4 mb-6">
                    <h2 className="text-2xl font-extrabold text-deep-ink tracking-tight flex items-center gap-2">
                        {isEditMode ? 'Edit Employee Profile' : 'Create Employee Profile'}
                    </h2>
                    <p className="text-sm text-muted-clay mt-1">
                        {isEditMode
                            ? 'Update the fields below to modify this employee profile.'
                            : 'Fill in the details below to add a new employee profile to the system.'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={formik.handleSubmit} className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {/* Full Name */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="name"
                            >
                                Full Name
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    placeholder="Muhammad Ahmed"
                                    value={formik.values.name}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Email Address */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="email"
                            >
                                Email Address
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    value={formik.values.email}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Designation */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="designation"
                            >
                                Designation
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Briefcase className="w-4 h-4" />
                                </div>
                                <input
                                    id="designation"
                                    name="designation"
                                    type="text"
                                    placeholder="Software Engineer"
                                    value={formik.values.designation}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Department */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="department"
                            >
                                Department
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Briefcase className="w-4 h-4" />
                                </div>
                                <input
                                    id="department"
                                    name="department"
                                    type="text"
                                    placeholder="Engineering"
                                    value={formik.values.department}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Employment Type */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="employmentType"
                            >
                                Employment Type
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <input
                                    id="employmentType"
                                    name="employmentType"
                                    type="text"
                                    placeholder="Full-time / Contract"
                                    value={formik.values.employmentType}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Phone Number */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="phone"
                            >
                                Phone Number
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Phone className="w-4 h-4" />
                                </div>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="text"
                                    placeholder="+92 300 1234567"
                                    value={formik.values.phone}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Date of Birth */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="dob"
                            >
                                Date of Birth
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <input
                                    id="dob"
                                    name="dob"
                                    type="date"
                                    value={formik.values.dob}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Joining Date */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="joiningDate"
                            >
                                Joining Date
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <input
                                    id="joiningDate"
                                    name="joiningDate"
                                    type="date"
                                    value={formik.values.joiningDate}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Base Salary */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="baseSalary"
                            >
                                Base Salary (PKR)
                            </label>
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-muted-clay/40">
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <input
                                    id="baseSalary"
                                    name="baseSalary"
                                    type="number"
                                    placeholder="85000"
                                    value={formik.values.baseSalary}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* System Assigned Role */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="role"
                            >
                                System Assigned Role
                            </label>
                            <CustomDropdown
                                id="role"
                                name="role"
                                value={formik.values.role}
                                onChange={(val) => formik.setFieldValue('role', val)}
                                onBlur={() => formik.setFieldTouched('role', true)}
                                options={roleOptions}
                                icon={<Shield className="w-4 h-4" />}
                            />
                        </div>

                        {/* EMS Status */}
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="emsStatus"
                            >
                                EMS Status
                            </label>
                            <CustomDropdown
                                id="emsStatus"
                                name="emsStatus"
                                value={formik.values.emsStatus}
                                onChange={(val) => formik.setFieldValue('emsStatus', val)}
                                onBlur={() => formik.setFieldTouched('emsStatus', true)}
                                options={emsStatusOptions}
                                icon={<Database className="w-4 h-4" />}
                            />
                        </div>

                        {/* Residential Address */}
                        <div className="flex flex-col gap-1 md:col-span-2">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="address"
                            >
                                Residential Address
                            </label>
                            <div className="relative flex items-start">
                                <div className="absolute left-3 top-3 text-muted-clay/40">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <textarea
                                    id="address"
                                    name="address"
                                    rows={2}
                                    placeholder="123 Main Street, Sector G-11, Islamabad"
                                    value={formik.values.address}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200 resize-none"
                                />
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div className="flex flex-col gap-1 md:col-span-2">
                            <label
                                className="text-xs font-semibold text-obsidian tracking-wide uppercase"
                                htmlFor="bankAccountDetails"
                            >
                                Bank Account Details
                            </label>
                            <div className="relative flex items-start">
                                <div className="absolute left-3 top-3 text-muted-clay/40">
                                    <CreditCard className="w-4 h-4" />
                                </div>
                                <textarea
                                    id="bankAccountDetails"
                                    name="bankAccountDetails"
                                    rows={2}
                                    placeholder="Alfalah Bank, Account No: 1234-56789-001, IBAN: PK00ALFA..."
                                    value={formik.values.bankAccountDetails}
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    required
                                    className="pl-10 pr-4 py-2 w-full bg-pure-white border border-subtle-stone rounded-lg text-sm text-deep-ink focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta transition-all duration-200 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer / Actions */}
                    <div className="border-t border-subtle-stone pt-6 flex justify-end gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-lg border border-subtle-stone text-sm font-semibold text-muted-clay hover:bg-cream/40 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="bg-terracotta text-pure-white px-5 py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 shadow-sm cursor-pointer text-sm disabled:opacity-50"
                        >
                            {isEditMode
                                ? submitting
                                    ? 'Saving...'
                                    : 'Save Changes'
                                : submitting
                                    ? 'Creating...'
                                    : 'Create Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
