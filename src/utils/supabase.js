import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// supabase-js serializes internal auth calls (getSession, refreshSession, etc.)
// through the browser's navigator.locks API so multiple tabs don't race each
// other refreshing the same token. That lock is known to get stuck in some
// browsers/dev setups — most easily reproduced by React 18 StrictMode, which
// mounts the auth listener twice in quick succession — leaving getSession()
// hanging indefinitely (or until our own timeout fallback kicks in and force
// logs the user out). Since this app doesn't rely on multi-tab session
// coordination, we bypass navigator.locks entirely and just run the auth
// call directly — this is Supabase's own documented workaround for the hang.
const noopLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: noopLock,
  },
});