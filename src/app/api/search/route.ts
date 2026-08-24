import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { runGlobalSearch } from '@/lib/search/global-search';
import { SEARCH_SOURCES, type SearchSource } from '@/types/search-reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { role, hasFinanceAccess, isDirector, errorResponse } = await verifyResourceAccess(
      request,
      'search',
      'read'
    );
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const sourceParam = searchParams.get('source') || searchParams.get('sources') || '';
    const sources = sourceParam
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is SearchSource =>
        (SEARCH_SOURCES as readonly string[]).includes(value)
      );

    const data = await runGlobalSearch({
      query,
      role: role!,
      hasFinanceAccess,
      isDirector,
      sources: sources.length ? sources : undefined,
    });

    return NextResponse.json({ success: true, data, query });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
