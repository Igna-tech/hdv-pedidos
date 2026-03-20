// ============================================
// Edge Function: alertas-seguridad
// Recibe payloads de Database Webhooks (pg_net / Dashboard)
// Envia alertas criticas a WhatsApp via API configurable
// ============================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// --- Tipos de alerta soportados ---
type TipoAlerta = "fraude" | "delete_critico" | "kill_switch" | "audit_critico";

interface AlertaPayload {
    type: "INSERT" | "UPDATE" | "DELETE";
    table: string;
    record: Record<string, any>;
    old_record?: Record<string, any>;
}

// --- Sanitizar texto para mensaje (prevenir inyeccion en templates) ---
function sanitizar(texto: any, maxLen: number = 100): string {
    return String(texto ?? "").trim().substring(0, maxLen);
}

// --- Clasificar severidad del evento ---
function clasificarAlerta(payload: AlertaPayload): { tipo: TipoAlerta; mensaje: string } | null {
    const { type, table, record, old_record } = payload;

    // 1. FRAUDE: pedido con alerta_fraude activada
    if (table === "pedidos" && type === "UPDATE") {
        const datos = record.datos || {};
        const datosAntes = old_record?.datos || {};

        // Solo alertar cuando alerta_fraude CAMBIA a true (no en cada update)
        if (datos.alerta_fraude === true && datosAntes.alerta_fraude !== true) {
            const vendedor = sanitizar(datos.vendedor_nombre || record.vendedor_id?.substring(0, 8) || "Desconocido");
            const cliente = sanitizar(datos.cliente?.nombre || "N/A");
            const total = Number(datos.total || 0).toLocaleString("es-PY");
            const detalle = sanitizar(datos.fraude_detalle || "Sin detalle", 200);
            const pedidoId = sanitizar(record.id, 50);

            return {
                tipo: "fraude",
                mensaje: `🚨 *ALERTA FRAUDE HDV*\n\n`
                    + `📋 Pedido: ${pedidoId}\n`
                    + `👤 Vendedor: ${vendedor}\n`
                    + `🏪 Cliente: ${cliente}\n`
                    + `💰 Monto sospechoso: Gs. ${total}\n`
                    + `⚠️ Detalle: ${detalle}\n`
                    + `📅 ${new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })}\n\n`
                    + `_Accion requerida: Revisar en Centro de Comando Forense_`,
            };
        }
    }

    // 2. FRAUDE: pedido insertado ya con alerta (trigger lo marco en INSERT)
    if (table === "pedidos" && type === "INSERT") {
        const datos = record.datos || {};
        if (datos.alerta_fraude === true) {
            const cliente = sanitizar(datos.cliente?.nombre || "N/A");
            const total = Number(datos.total || 0).toLocaleString("es-PY");
            const pedidoId = sanitizar(record.id, 50);

            return {
                tipo: "fraude",
                mensaje: `🚨 *FRAUDE EN NUEVO PEDIDO*\n\n`
                    + `📋 Pedido: ${pedidoId}\n`
                    + `🏪 Cliente: ${cliente}\n`
                    + `💰 Monto: Gs. ${total}\n`
                    + `⚠️ ${sanitizar(datos.fraude_detalle || "Validacion de precios fallida", 200)}\n`
                    + `📅 ${new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })}`,
            };
        }
    }

    // 3. AUDIT LOG: DELETE en tablas criticas (columna real: tabla_afectada)
    if (table === "audit_logs" && type === "INSERT") {
        const accion = record.accion;
        const tablaAfectada = sanitizar(record.tabla_afectada, 50);
        const usuarioId = sanitizar(record.usuario_id, 40);

        // Alertar en DELETE (alta severidad)
        if (accion === "DELETE") {
            return {
                tipo: "delete_critico",
                mensaje: `🔴 *ELIMINACION DETECTADA*\n\n`
                    + `🗑️ Accion: DELETE en \`${tablaAfectada}\`\n`
                    + `👤 Usuario: ${usuarioId}\n`
                    + `📅 ${new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })}\n\n`
                    + `_Verificar en Caja Negra (Audit Logs)_`,
            };
        }

        // Alertar cambios en configuracion (potencial manipulacion)
        if (tablaAfectada === "configuracion" && (accion === "UPDATE" || accion === "INSERT")) {
            return {
                tipo: "audit_critico",
                mensaje: `🟠 *CAMBIO EN CONFIGURACION*\n\n`
                    + `⚙️ Accion: ${accion} en \`${tablaAfectada}\`\n`
                    + `👤 Usuario: ${usuarioId}\n`
                    + `📅 ${new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })}\n\n`
                    + `_Revisar en Caja Negra si fue autorizado_`,
            };
        }
    }

    // 4. KILL SWITCH: perfil desactivado
    if (table === "perfiles" && type === "UPDATE") {
        if (record.activo === false && old_record?.activo === true) {
            return {
                tipo: "kill_switch",
                mensaje: `🔒 *KILL SWITCH ACTIVADO*\n\n`
                    + `👤 Vendedor: ${sanitizar(record.nombre_completo || record.id, 100)}\n`
                    + `📅 ${new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })}\n\n`
                    + `_Cuenta desactivada. Datos del dispositivo seran purgados._`,
            };
        }
    }

    return null; // Evento no critico, ignorar
}

// --- Enviar mensaje a WhatsApp via CallMeBot (GET con query params) ---
async function enviarWhatsApp(mensaje: string): Promise<{ ok: boolean; detalle?: string }> {
    const apiUrl = Deno.env.get("WHATSAPP_API_URL"); // https://api.callmebot.com/whatsapp.php
    const apiKey = Deno.env.get("WHATSAPP_API_KEY");
    const destino = Deno.env.get("WHATSAPP_DESTINO"); // Numero con codigo de pais (ej: 595981...)

    if (!apiUrl) {
        console.warn("[alertas] WHATSAPP_API_URL no configurada. Alerta solo en logs.");
        return { ok: false, detalle: "API URL no configurada" };
    }

    if (!apiKey || !destino) {
        console.warn("[alertas] WHATSAPP_API_KEY o WHATSAPP_DESTINO no configurados.");
        return { ok: false, detalle: "API Key o destino no configurados" };
    }

    try {
        const urlFinal = `${apiUrl}?phone=${destino}&text=${encodeURIComponent(mensaje)}&apikey=${apiKey}`;
        const response = await fetch(urlFinal);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[alertas] CallMeBot error ${response.status}:`, errorBody);
            return { ok: false, detalle: `HTTP ${response.status}` };
        }

        console.log("[alertas] Mensaje WhatsApp enviado via CallMeBot");
        return { ok: true };
    } catch (err: any) {
        console.error("[alertas] Error de red al enviar WhatsApp:", err.message);
        return { ok: false, detalle: err.message };
    }
}

// ============================================
// MAIN: Recibe webhook y despacha alerta
// ============================================
serve(async (req: Request) => {
    // Solo aceptar POST
    if (req.method === "OPTIONS") {
        return new Response("ok", { status: 200 });
    }
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405 });
    }

    // Verificar token secreto del webhook (defense-in-depth)
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (webhookSecret) {
        const authHeader = req.headers.get("x-webhook-secret") || req.headers.get("authorization");
        if (authHeader !== webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
            console.warn("[alertas] Token de webhook invalido");
            return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
        }
    }

    try {
        const payload: AlertaPayload = await req.json();
        console.log(`[alertas] Evento recibido: ${payload.type} en ${payload.table}`);

        // Clasificar si el evento amerita alerta
        const alerta = clasificarAlerta(payload);

        if (!alerta) {
            console.log("[alertas] Evento no critico, ignorado.");
            return new Response(JSON.stringify({ status: "ignored", reason: "no_critical_event" }), { status: 200 });
        }

        console.log(`[alertas] ALERTA DETECTADA tipo=${alerta.tipo}`);
        console.log(`[alertas] Mensaje:\n${alerta.mensaje}`);

        // Intentar enviar a WhatsApp (no-fatal si falla)
        const resultado = await enviarWhatsApp(alerta.mensaje);

        return new Response(
            JSON.stringify({
                status: "processed",
                tipo: alerta.tipo,
                whatsapp_sent: resultado.ok,
                detalle: resultado.detalle || null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );

    } catch (err: any) {
        // CRITICO: nunca devolver 5xx para evitar reintentos infinitos del webhook
        console.error("[alertas] Error procesando webhook:", err.message);
        return new Response(
            JSON.stringify({ status: "error", message: err.message }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }
});
