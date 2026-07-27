import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase URL or Anon Key is missing from server configuration.',
        },
        { status: 500 }
      );
    }

    // Initialize clients with persistSession: false for server environments
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: No token provided' },
        { status: 401 }
      );
    }

    const {
      data: { user: requester },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !requester) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token' },
        { status: 401 }
      );
    }

    const requesterRole = requester.app_metadata?.role || requester.user_metadata?.role || '';
    if (requesterRole.toLowerCase().trim() !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin role required' },
        { status: 403 }
      );
    }

    const { email, password, name, role, employeeId } = await request.json();

    let supabaseUserId: string | undefined;

    try {
      // 1. Create the user. If service role key is available, use Admin API
      // to create the user without establishing a session immediately.
      if (supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Auto-confirm email so they can log in
          app_metadata: { role },
          user_metadata: { name },
        });

        if (adminError) throw adminError;
        supabaseUserId = adminData.user?.id;
      } else {
        // Fallback to standard signUp if service key is not configured
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, role },
          },
        });

        if (signUpError) throw signUpError;
        supabaseUserId = signUpData.user?.id;
      }

      if (!supabaseUserId) {
        throw new Error('Failed to retrieve user ID from Supabase.');
      }

      // 2. Update the record in the sheet via n8n update-user webhook
      const webhookRes = await fetch('https://n8n.arachnix.io/webhook/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          role,
          supabaseUserId,
          status: 'Active',
          employeeId,
          created_at: new Date().toISOString(),
        }),
      });

      if (!webhookRes.ok) {
        let errText = '';
        try {
          errText = await webhookRes.text();
        } catch { }
        throw new Error(errText || `n8n update-user webhook returned status ${webhookRes.status}.`);
      }

      const webhookData = await webhookRes.json();
      if (!webhookData.success && webhookData.error) {
        throw new Error(webhookData.error);
      }

      // 3. Create the session by signing in with the credentials
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      if (!signInData.session) throw new Error('Failed to create session after user creation.');

      return NextResponse.json({
        success: true,
        session: signInData.session,
        user: {
          id: signInData.user.id,
          name: signInData.user.user_metadata?.name || name,
          email: signInData.user.email || '',
          role: signInData.user.app_metadata?.role || role,
        },
      });
    } catch (transactionError: unknown) {
      const errMsg =
        transactionError instanceof Error ? transactionError.message : 'Signup transaction failed.';

      // ROLLBACK: Delete the created user in Supabase if we have a supabaseUserId and service key
      if (supabaseUserId && supabaseServiceKey) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });
          await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
        } catch (rollbackError) {
          console.error(
            'Failed to rollback/delete user during transaction failure:',
            rollbackError
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: errMsg,
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: errMsg,
      },
      { status: 500 }
    );
  }
}
