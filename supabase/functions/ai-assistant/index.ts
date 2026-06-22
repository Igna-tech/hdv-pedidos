// ============================================
// Edge Function: ai-assistant
// Asistente de inteligencia de negocios para el panel admin.
// Recibe: { pregunta, historial, contexto }
// Valida JWT admin + rate limit + llama a Anthropic API.
// ============================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PREGUNTAS_POR_HORA = 30;
const RATE_LIMIT_KEY_PREFIX = "ai_chat_";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const anthropicKey   = Deno.env.get("ANTHROPIC_API_KEY");

        if (!anthropicKey) {
            return errResponse("ANTHROPIC_API_KEY no configurada en los secrets de la Edge Function.", 500);
        }

        // ── 1. Validar JWT ──────────────────────────────────────────────────
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return errResponse("Sin autorización.", 401);

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: authErr } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", "")
        );
        if (authErr || !user) return errResponse("Token inválido o expirado.", 401);

        // ── 2. Verificar rol admin ──────────────────────────────────────────
        const { data: perfil } = await supabase
            .from("perfiles")
            .select("rol, activo")
            .eq("id", user.id)
            .single();

        if (perfil?.rol !== "admin" || !perfil?.activo) {
            return errResponse("Acceso restringido a administradores activos.", 403);
        }

        // ── 3. Rate limiting (reutiliza tabla alertas_rate_limit) ───────────
        const rlKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
        const ahora = new Date();

        const { data: rl } = await supabase
            .from("alertas_rate_limit")
            .select("*")
            .eq("clave", rlKey)
            .single();

        if (rl) {
            const minutos = (ahora.getTime() - new Date(rl.ventana_inicio).getTime()) / 60000;
            if (minutos < 60 && rl.contador >= MAX_PREGUNTAS_POR_HORA) {
                const restantes = Math.ceil(60 - minutos);
                return errResponse(
                    `Límite de ${MAX_PREGUNTAS_POR_HORA} preguntas por hora alcanzado. Podés continuar en ${restantes} minuto(s).`,
                    429
                );
            }
        }

        // ── 4. Parsear body ─────────────────────────────────────────────────
        const body = await req.json().catch(() => ({}));
        const pregunta  = String(body.pregunta  || "").trim().substring(0, 3000);
        const historial = Array.isArray(body.historial) ? body.historial.slice(-12) : [];
        const contexto  = body.contexto || {};

        if (!pregunta) return errResponse("La pregunta no puede estar vacía.", 400);

        // ── 5. Llamada a Anthropic ──────────────────────────────────────────
        const systemPrompt = _construirSystemPrompt(contexto);
        const mensajes = [
            ...historial.map((m: any) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: String(m.content || "").substring(0, 2000),
            })),
            { role: "user", content: pregunta },
        ];

        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1024,
                system: systemPrompt,
                messages: mensajes,
            }),
        });

        if (!anthropicRes.ok) {
            const errBody = await anthropicRes.text();
            console.error("[ai-assistant] Anthropic error:", anthropicRes.status, errBody);
            return errResponse("Error al conectar con la IA. Intentá de nuevo en unos segundos.", 502);
        }

        const aiData = await anthropicRes.json();
        const respuesta: string = aiData.content?.[0]?.text || "No pude generar una respuesta. Intentá reformular la pregunta.";
        const tokensUsados: number = aiData.usage?.input_tokens + aiData.usage?.output_tokens || 0;

        // ── 6. Actualizar rate limit ────────────────────────────────────────
        if (rl) {
            const minutos = (ahora.getTime() - new Date(rl.ventana_inicio).getTime()) / 60000;
            if (minutos >= 60) {
                await supabase.from("alertas_rate_limit").upsert({
                    clave: rlKey, contador: 1, ventana_inicio: ahora.toISOString()
                });
            } else {
                await supabase.from("alertas_rate_limit")
                    .update({ contador: rl.contador + 1 })
                    .eq("clave", rlKey);
            }
        } else {
            await supabase.from("alertas_rate_limit").insert({
                clave: rlKey, contador: 1, ventana_inicio: ahora.toISOString()
            });
        }

        return new Response(JSON.stringify({ respuesta, tokens: tokensUsados }), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });

    } catch (e) {
        console.error("[ai-assistant] Error inesperado:", e);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor. Intentá de nuevo." }),
            { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
    }
});

function errResponse(mensaje: string, status: number): Response {
    return new Response(JSON.stringify({ error: mensaje }), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

function _construirSystemPrompt(ctx: Record<string, any>): string {
    const fecha = new Date().toLocaleDateString("es-PY", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    let p = `Sos el analista de inteligencia de negocios de HDV Distribuciones, una empresa distribuidora en Paraguay.
Hoy es ${fecha}.

Reglas:
- Respondé siempre en español rioplatense, de forma directa y concisa.
- Usá los datos concretos del contexto que te proveo. Si un dato no está, decilo claramente en lugar de inventar.
- Podés usar negritas (**texto**) y listas para organizar respuestas largas.
- Cuando compares períodos, destacá tendencias positivas o negativas con claridad.
- Las cantidades monetarias están en guaraníes paraguayos (Gs.).

`;

    if (ctx.periodo) p += `PERÍODO ANALIZADO: ${ctx.periodo}\n\n`;

    if (ctx.resumen) {
        const r = ctx.resumen;
        p += `RESUMEN DE VENTAS:\n`;
        p += `- Total facturado: ${r.total_fmt}\n`;
        p += `- Cantidad de pedidos: ${r.cantidad}\n`;
        p += `- Ticket promedio: ${r.ticket_fmt}\n`;
        if (r.pendientes_cantidad) p += `- Pedidos pendientes: ${r.pendientes_cantidad} (${r.pendientes_fmt})\n`;
        if (r.comparativa) p += `- Variación vs mes anterior: ${r.comparativa}\n`;
        p += "\n";
    }

    if (ctx.vendedores?.length) {
        p += `RENDIMIENTO POR VENDEDOR:\n`;
        ctx.vendedores.forEach((v: any) => {
            p += `- ${v.nombre}: ${v.total_fmt} | ${v.cantidad} pedidos | ticket prom. ${v.ticket_fmt}`;
            if (v.meta_pct !== undefined) p += ` | meta: ${v.meta_pct}% completada`;
            p += "\n";
        });
        p += "\n";
    }

    if (ctx.top_productos?.length) {
        p += `TOP 10 PRODUCTOS MÁS VENDIDOS:\n`;
        ctx.top_productos.forEach((pr: any, i: number) => {
            p += `${i + 1}. ${pr.nombre}: ${pr.unidades} unidades — ${pr.total_fmt}\n`;
        });
        p += "\n";
    }

    if (ctx.clientes_deudores?.length) {
        p += `CLIENTES CON DEUDA PENDIENTE:\n`;
        ctx.clientes_deudores.forEach((c: any) => {
            p += `- ${c.nombre}: ${c.deuda_fmt}`;
            if (c.dias) p += ` (${c.dias} días de antigüedad)`;
            p += "\n";
        });
        p += "\n";
    }

    if (ctx.alertas?.length) {
        p += `ALERTAS DETECTADAS:\n`;
        ctx.alertas.forEach((a: string) => { p += `⚠️ ${a}\n`; });
        p += "\n";
    }

    return p;
}
