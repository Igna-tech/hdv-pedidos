// ============================================
// HDV Supabase - Credenciales centralizadas
// Este archivo se carga ANTES que cualquier otro
// y expone window.hdvSupabase para todos los scripts
// ============================================

const SUPABASE_URL = 'https://ngtoshttgnfgbiurnrix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndG9zaHR0Z25mZ2JpdXJucml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODAwNjMsImV4cCI6MjA4ODc1NjA2M30.x_s34j_YOsMgxAhFPOUvGTIRaJoRRvOUfDqQGHNZdcM';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: sessionStorage,   // Cada pestaña mantiene su propia sesion
        autoRefreshToken: true,
        persistSession: true
    }
});
