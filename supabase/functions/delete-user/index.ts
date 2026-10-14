// Supabase Edge Function: delete-user
// Allows an authenticated ADMIN to securely soft-delete and deactivate a user or staff account.
// Verifies authorization on the server, preserves print-job records, and bans the user from login.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not configured.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Authenticate caller with user JWT
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid authentication credentials.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Check if caller has admin role
    const { data: callerProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    const callerRole = (callerProfile?.role || callerUser.user_metadata?.role || '').toLowerCase();
    if (callerRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Access denied: Only administrators can delete accounts.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Parse request payload
    const body = await req.json();
    const { target_user_id } = body;

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'Target user ID is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Prevent self-deletion
    if (callerUser.id === target_user_id) {
      return new Response(JSON.stringify({ error: 'Administrators cannot delete their own account.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Admin client with service role key for privileged deactivation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify target user's role
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('id', target_user_id)
      .single();

    const targetRole = (targetProfile?.role || '').toLowerCase();
    if (targetRole === 'admin') {
      return new Response(JSON.stringify({ error: 'Action not allowed: Administrator accounts cannot be deleted.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Safe Referential Integrity Soft-Deletion:
    // Update profile status to 'deleted'. Preserves print_jobs.user_id and prevents cascade deletion.
    await supabaseAdmin
      .from('profiles')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', target_user_id);

    // Unassign this staff from active print jobs safely if column exists
    try {
      await supabaseAdmin
        .from('print_jobs')
        .update({ assigned_staff_id: null })
        .eq('assigned_staff_id', target_user_id)
        .in('status', ['Pending', 'Approved', 'Printing']);
    } catch (pjErr) {
      // Ignore if assigned_staff_id column does not exist in schema
    }

    // 7. Ban user in Supabase Auth to permanently block future logins
    try {
      await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
        ban_duration: '876000h', // ~100 years
      });
    } catch (e) {
      console.warn('Auth ban notice:', e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Account for ${targetProfile?.full_name || targetProfile?.email || 'User'} was successfully deleted and deactivated.`,
        deleted_user_id: target_user_id,
        status: 'deleted',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error deleting account.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
