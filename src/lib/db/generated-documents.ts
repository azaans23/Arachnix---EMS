import { getSupabaseAdmin } from '@/lib/supabase-admin';

const TABLE = 'generateddocuments';

export async function archiveGeneratedDocumentsForEmployee(employeeId: string): Promise<number> {
  const id = employeeId.trim();
  if (!id) return 0;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: 'Archived' })
    .eq('employeeid', id)
    .neq('status', 'Deleted')
    .select('docid');

  if (error) {
    // Table may be empty / unused; do not block offboarding.
    console.error('Failed to archive generated documents:', error.message);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}
