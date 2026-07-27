import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export async function verifyAdmin(
  request: Request
): Promise<{ user?: User; errorResponse?: NextResponse }> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Unauthorized: No token provided' },
        { status: 401 }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token' },
        { status: 401 }
      ),
    };
  }

  const role = user.app_metadata?.role || user.user_metadata?.role || '';
  if (role.toLowerCase().trim() !== 'admin') {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Forbidden: Admin role required' },
        { status: 403 }
      ),
    };
  }

  return { user };
}
