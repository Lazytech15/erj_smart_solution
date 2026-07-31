// supabase/functions/send-employee-invite/index.ts
//
// Sends a new employee their login credentials by email, right after an
// admin creates their account (see src/utils/db.js#createEmployeeAccount).
// Reuses the same _shared/email.ts sender as everything else.
//
// Call from the client with the Supabase JS client:
//
//   await supabase.functions.invoke('send-employee-invite', {
//     body: {
//       email: employee.email,
//       name: employee.name,
//       username: employee.username,
//       tempPassword: generatedPassword,   // the one shown to the admin on-screen
//       companyName: subscription.company?.name,
//       loginUrl: 'https://erjsmartsolutions.eablao.dev/login',
//     },
//   });
//
// Deploy:
//   supabase functions deploy send-employee-invite

import { sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { email, name, username, tempPassword, companyName, loginUrl } = await req.json().catch(() => ({}));

  if (!email || !username || !tempPassword) {
    return new Response(
      JSON.stringify({ ok: false, error: "email, username, and tempPassword are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = await sendEmail({
    to: email,
    subject: `You've been added to ${companyName ?? "your company"} on ERJ Smart Solutions`,
    heading: `Welcome${name ? `, ${name}` : ""}!`,
    body: `<p>${companyName ?? "Your employer"} has set up your attendance account. Here are your login details:</p>
           <table role="presentation" style="width:100%;margin:12px 0;">
             <tr><td style="padding:4px 0;color:#6b7280;">Username</td><td style="padding:4px 0;font-weight:bold;">${username}</td></tr>
             <tr><td style="padding:4px 0;color:#6b7280;">Temporary password</td><td style="padding:4px 0;font-weight:bold;">${tempPassword}</td></tr>
           </table>
           <p>For your security, please log in and change this password as soon as possible.</p>
           ${loginUrl ? `<p><a href="${loginUrl}" style="color:#4f6ef7;font-weight:bold;">Log in now →</a></p>` : ""}`,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
