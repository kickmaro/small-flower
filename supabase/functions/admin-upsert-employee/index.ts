import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  employeeId?: string;
  fullName?: string;
  role?: "employee" | "hr";
  password?: string;
  isActive?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    const jwt = authorization.replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing authorization token" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Invalid user token" }, 401);

    const { data: caller, error: callerError } = await admin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", userData.user.id)
      .single();
    if (callerError || caller?.role !== "hr" || !caller?.is_active) {
      return json({ error: "HR permission required" }, 403);
    }

    const body = (await request.json()) as Payload;
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const fullName = String(body.fullName || "").trim();
    const role = body.role === "hr" ? "hr" : "employee";
    const isActive = body.isActive !== false;
    const password = String(body.password || "").trim();

    if (!employeeId || !fullName) return json({ error: "employeeId and fullName are required" }, 400);
    if (password && password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: existing } = await admin.from("profiles").select("id").eq("employee_id", employeeId).maybeSingle();
    if (existing?.id) {
      const updateUser: { password?: string; user_metadata: Record<string, string> } = {
        user_metadata: { employee_id: employeeId, full_name: fullName },
      };
      if (password) updateUser.password = password;

      const { error: updateAuthError } = await admin.auth.admin.updateUserById(existing.id, updateUser);
      if (updateAuthError) return json({ error: updateAuthError.message }, 400);

      const { error: updateProfileError } = await admin
        .from("profiles")
        .update({ full_name: fullName, role, is_active: isActive })
        .eq("id", existing.id);
      if (updateProfileError) return json({ error: updateProfileError.message }, 400);

      return json({ ok: true, mode: "updated" });
    }

    if (password.length < 8) return json({ error: "Password is required for new employees" }, 400);
    const email = `${employeeId.toLowerCase()}@${Deno.env.get("AUTH_EMAIL_DOMAIN") || "hong-xiao-hua.local"}`;
    const { data: created, error: createAuthError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { employee_id: employeeId, full_name: fullName },
    });
    if (createAuthError || !created.user) return json({ error: createAuthError?.message || "Create user failed" }, 400);

    const { error: insertProfileError } = await admin.from("profiles").insert({
      id: created.user.id,
      employee_id: employeeId,
      full_name: fullName,
      role,
      is_active: isActive,
    });
    if (insertProfileError) return json({ error: insertProfileError.message }, 400);

    return json({ ok: true, mode: "created" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
