import { redirect } from 'next/navigation';

export default function PayrollRedirectPage() {
  redirect('/dashboard/salary-slip-runs');
}
