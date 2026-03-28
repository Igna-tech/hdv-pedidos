// ============================================
// Edge Function: sifen-generar-xml
// Genera XML DTE compatible con SIFEN v150 (Paraguay)
// Auditado contra Manual Tecnico v150 + XSD DE_v150
// Recibe: { "pedido_id": "..." }
// Retorna: { "xml": "...", "cdc": "...", "numFactura": "...", "qr_url": "...", "soap_simulado": "..." }
// ============================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "npm:xmlbuilder2@3.1.1";

// --- CORS dinamico (restringir en produccion via ALLOWED_ORIGIN) ---
const corsHeaders = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Rate limiting en memoria (A-08) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
}

// --- Sanitizacion XML Anti-XXE (A-05) ---
// Sanitizador: convierte a string, escapa XML, trunca a maxLength
function sanitizarParaXML(texto: any, maxLength: number = 200): string {
    const str = String(texto ?? "").trim();
    const escaped = str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    return escaped.substring(0, maxLength);
}

// Validador numerico: asegura que un valor sea numero finito, devuelve fallback si no
function validarNumero(valor: any, fallback: number = 0): number {
    const n = Number(valor);
    return Number.isFinite(n) ? n : fallback;
}

// --- Mapeos SIFEN v150 ---
const TIPO_DOC_MAP: Record<string, { code: number; desc: string }> = {
    "RUC":       { code: 1, desc: "RUC" },
    "Cedula":    { code: 2, desc: "Cedula de identidad" },
    "Pasaporte": { code: 3, desc: "Pasaporte" },
};

const UNIDAD_MEDIDA_DESC: Record<string, string> = {
    "77": "UNI", "83": "KG", "88": "LTR", "16": "CAJ",
    "56": "PAR", "30": "BLS", "19": "DOC", "53": "GR",
    "66": "ML",  "26": "PCK",
};

// ============================================
// HELPERS
// ============================================

function parsearRUC(rucCompleto: string): { ruc: string; dv: string } {
    const partes = (rucCompleto || "").split("-");
    return { ruc: partes[0] || rucCompleto || "0", dv: partes[1] || "0" };
}

function generarNumeroFactura(): string {
    return String(Math.floor(Math.random() * 9999999) + 1).padStart(7, "0");
}

function generarCodigoSeguridad(): string {
    let c = "";
    for (let i = 0; i < 9; i++) c += Math.floor(Math.random() * 10);
    return c;
}

// --- Modulo 11 SIFEN (ref: Manual Tecnico v150 + facturacionelectronicapy) ---
// Bases 2..7 ciclicas, k empieza en 2 e incrementa, resetea a 2 al pasar 7.
// Letras en RUC se convierten a ASCII: A=65 B=66 C=67 a=97 b=98 c=99
function convertirLetrasRUC(ruc: string): string {
    return ruc
        .replace(/A/g, "65").replace(/B/g, "66").replace(/C/g, "67")
        .replace(/a/g, "97").replace(/b/g, "98").replace(/c/g, "99");
}

function calcularDV11(numero: string): number {
    // Algoritmo Modulo 11 segun especificacion SIFEN
    // Se recorre de derecha a izquierda multiplicando por k=2,3,4,5,6,7,2,3...
    let k = 2;
    let suma = 0;
    for (let i = numero.length - 1; i >= 0; i--) {
        suma += parseInt(numero.charAt(i)) * k;
        k++;
        if (k > 7) k = 2;
    }
    const resto = suma % 11;
    // Si resto > 1 → DV = 11 - resto; sino → DV = 0
    return resto > 1 ? 11 - resto : 0;
}

function generarCDC(p: {
    iTiDE: number; ruc: string; dv: string; est: string; ptoExp: string;
    numDoc: string; tipContrib: number; fecha: Date; tipEmi: number; codSeg: string;
}): string {
    // Estructura CDC 44 digitos segun MT v150:
    // [01-02] Tipo DE       [03-10] RUC (8 dig)   [11] DV RUC
    // [12-14] Estab.        [15-17] Pto Exp.       [18-24] N° Doc (7 dig)
    // [25]    Tipo Contrib.  [26-33] Fecha AAAAMMDD [34] Tipo Emision
    // [35-43] Cod Seguridad  [44] DV CDC (Modulo 11)
    const tiDE   = String(p.iTiDE).padStart(2, "0");
    // Convertir letras del RUC a ASCII para el calculo
    const rucConvertido = convertirLetrasRUC(p.ruc.replace(/-/g, ""));
    const ruc    = rucConvertido.padStart(8, "0").slice(0, 8);
    const dv     = p.dv.slice(0, 1);
    const est    = p.est.padStart(3, "0");
    const ptoExp = p.ptoExp.padStart(3, "0");
    const numDoc = p.numDoc.padStart(7, "0").slice(0, 7);
    const tipC   = String(p.tipContrib);
    const f      = p.fecha;
    const fechaS = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, "0")}${String(f.getDate()).padStart(2, "0")}`;
    const tipE   = String(p.tipEmi);
    const codS   = p.codSeg.padStart(9, "0").slice(0, 9);

    const sinDV = `${tiDE}${ruc}${dv}${est}${ptoExp}${numDoc}${tipC}${fechaS}${tipE}${codS}`;
    return `${sinDV}${calcularDV11(sinDV)}`;
}

// --- Hex encoder para QR (SIFEN codifica dFeEmiDE en hex) ---
function toHex(str: string): string {
    let hex = "";
    for (let i = 0; i < str.length; i++) {
        hex += str.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
}

// --- IVA por item segun XSD DE_Types_v150 ---
// iAfecIVA: 1=Gravado IVA, 2=Exonerado, 3=Exento, 4=Gravado parcial
function calcIVAItem(precioUnit: number, cantidad: number, tipoImp: string) {
    const tipo = (tipoImp || "10").toString();
    const totalItem = precioUnit * cantidad;

    if (tipo === "exenta" || tipo === "0") {
        // iAfecIVA=3 (Exento) — tasa 0, sin base gravada
        return { iAfecIVA: 3, dDesAfecIVA: "Exento", dTasaIVA: 0, dPropIVA: 100, dBasGravIVA: 0, dLiqIVAItem: 0 };
    }
    if (tipo === "5") {
        // iAfecIVA=1 (Gravado IVA) con tasa 5%
        const base = Math.round((totalItem * 100) / 105);
        return { iAfecIVA: 1, dDesAfecIVA: "Gravado (IVA)", dTasaIVA: 5, dPropIVA: 100, dBasGravIVA: base, dLiqIVAItem: totalItem - base };
    }
    // 10% — iAfecIVA=1 (Gravado IVA) con tasa 10%
    const base = Math.round((totalItem * 100) / 110);
    return { iAfecIVA: 1, dDesAfecIVA: "Gravado (IVA)", dTasaIVA: 10, dPropIVA: 100, dBasGravIVA: base, dLiqIVAItem: totalItem - base };
}

// ============================================
// MAIN
// ============================================

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "No autorizado" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- Secretos del certificado .p12 (firma digital SIFEN) ---
        const certB64 = Deno.env.get("CERTIFICADO_P12");
        const certPass = Deno.env.get("PASS_CERT");

        if (!certB64 || !certPass) {
            console.warn("[sifen] ADVERTENCIA: Certificado .p12 o contrasena no encontrados en los secretos. Operando en modo simulado.");
        } else {
            console.log("[sifen] INFO: Secretos del certificado cargados correctamente en memoria.");
        }

        // Validacion JWT estricta — respeta RLS del usuario autenticado
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Token invalido o expirado." }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // A-06: No se restringe por rol. Tanto admin como vendedor pueden facturar.
        // La seguridad esta cubierta por: (1) RLS — el vendedor solo lee sus propios
        // pedidos via el JWT, (2) anti-doble facturacion — un pedido con CDC no se
        // refactura, (3) SERVICE_ROLE solo se usa para la escritura final del resultado.

        // A-08: Rate limiting por usuario
        if (!checkRateLimit(user.id)) {
            return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intente de nuevo en 1 minuto." }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const body = await req.json();
        const pedidoId = body.pedido_id;
        console.log("[sifen] pedido_id:", pedidoId);

        // M-09: Validacion estricta de pedido_id
        if (!pedidoId || typeof pedidoId !== "string" || pedidoId.length > 50) {
            return new Response(JSON.stringify({ error: "pedido_id requerido y debe ser un texto valido" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- 1. Pedido ---
        const { data: pedido, error: errPedido } = await supabase
            .from("pedidos").select("*").eq("id", String(pedidoId)).single();
        if (errPedido || !pedido) {
            return new Response(JSON.stringify({ error: `Pedido no encontrado (id=${pedidoId}): ${errPedido?.message || "No existe"}` }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const datos = pedido.datos || pedido;

        // --- Anti-doble facturacion: rechazar si ya tiene CDC ---
        if (datos.sifen_xml_generado === true || datos.sifen_cdc) {
            return new Response(JSON.stringify({ error: "Este pedido ya fue facturado y tiene un CDC asignado." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- 2. Empresa ---
        const { data: empresa, error: errEmp } = await supabase
            .from("configuracion_empresa").select("*").eq("id", 1).single();
        if (errEmp || !empresa) {
            return new Response(JSON.stringify({ error: "Configure los datos fiscales en Herramientas." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!empresa.ruc_empresa || !empresa.razon_social || !empresa.timbrado_numero) {
            return new Response(JSON.stringify({ error: "Datos fiscales incompletos (RUC, Razon Social, Timbrado)." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- 3. Cliente ---
        const clienteId = datos.cliente?.id;
        let clienteDB: any = null;
        if (clienteId) {
            const { data } = await supabase.from("clientes").select("*").eq("id", clienteId).single();
            clienteDB = data;
        }
        const cliente = {
            nombre: sanitizarParaXML(clienteDB?.nombre || datos.cliente?.nombre || "Sin nombre", 200),
            razon_social: sanitizarParaXML(clienteDB?.razon_social || datos.cliente?.razon_social || datos.cliente?.nombre || "Sin nombre", 200),
            ruc: String(clienteDB?.ruc || datos.cliente?.ruc || "").trim(),
            tipo_documento: clienteDB?.tipo_documento || "RUC",
            direccion: sanitizarParaXML(clienteDB?.direccion || datos.cliente?.direccion || "", 300),
            telefono: sanitizarParaXML(clienteDB?.telefono || datos.cliente?.telefono || "", 50),
            email: sanitizarParaXML(clienteDB?.email || "", 100),
        };
        if (!cliente.ruc) {
            return new Response(JSON.stringify({ error: "El cliente no tiene RUC/documento." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- 4. Productos (unidad_medida_set) ---
        const items: any[] = datos.items || [];
        const prodIds = [...new Set(items.map((i: any) => i.productoId).filter(Boolean))];
        const productosDB: Record<string, any> = {};
        if (prodIds.length > 0) {
            const { data: prods } = await supabase.from("productos").select("id, unidad_medida_set").in("id", prodIds);
            if (prods) for (const p of prods) productosDB[p.id] = p;
        }

        // --- Preparar datos ---
        const fechaEmision = new Date(datos.fecha || pedido.creado_en || new Date());
        const { ruc: rucEmpresa, dv: dvEmpresa } = parsearRUC(empresa.ruc_empresa);
        const { ruc: rucCliente, dv: dvCliente } = parsearRUC(cliente.ruc);
        const tipoDoc = TIPO_DOC_MAP[cliente.tipo_documento] || TIPO_DOC_MAP["RUC"];
        const establecimiento = empresa.establecimiento || "001";
        const puntoExpedicion = empresa.punto_expedicion || "001";

        const numFactura7 = datos.numFactura
            ? (datos.numFactura.split("-").pop() || generarNumeroFactura())
            : generarNumeroFactura();
        const numFacturaCompleto = `${establecimiento}-${puntoExpedicion}-${numFactura7.padStart(7, "0")}`;

        const codigoSeguridad = generarCodigoSeguridad();
        const cdc = generarCDC({
            iTiDE: 1, ruc: rucEmpresa, dv: dvEmpresa,
            est: establecimiento, ptoExp: puntoExpedicion,
            numDoc: numFactura7, tipContrib: 1,
            fecha: fechaEmision, tipEmi: 1, codSeg: codigoSeguridad,
        });

        const fechaISO = fechaEmision.toISOString().split(".")[0];
        const esCredito = datos.tipoPago === "credito";

        // --- Items + totales ---
        let totalExe = 0, totalGrav5 = 0, totalGrav10 = 0, totalIVA5 = 0, totalIVA10 = 0;

        const xmlItems = items.map((item: any, idx: number) => {
            const prodInfo = productosDB[item.productoId] || {};
            const uMed = prodInfo.unidad_medida_set || "77";
            const uDesc = UNIDAD_MEDIDA_DESC[uMed] || "UNI";
            const precioUnit = validarNumero(item.precio, 0);
            const cant = validarNumero(item.cantidad, 1);
            const totalItem = validarNumero(item.subtotal, precioUnit * cant);
            const iva = calcIVAItem(precioUnit, cant, item.tipo_impuesto || "10");

            if (iva.iAfecIVA === 3) totalExe += totalItem;  // Exento
            else if (iva.dTasaIVA === 5) { totalGrav5 += totalItem; totalIVA5 += iva.dLiqIVAItem; }
            else { totalGrav10 += totalItem; totalIVA10 += iva.dLiqIVAItem; }

            return {
                dCodInt: sanitizarParaXML(item.productoId || `ITEM${idx + 1}`, 50),
                dDesProSer: sanitizarParaXML(`${item.nombre || "Producto"} ${item.presentacion || ""}`.trim(), 200),
                cUniMed: Number(uMed),
                dDesUniMed: uDesc,
                dCantProSer: cant.toFixed(4),
                gValorItem: {
                    dPUniProSer: precioUnit.toFixed(4),
                    dTotBruOpeItem: totalItem.toFixed(4),
                    gValorRestaItem: {
                        dDescItem: "0.0000",
                        dPorcDesIt: "0.0000",
                        dDescGloItem: "0.0000",
                        dAntPreUniIt: "0.0000",
                        dAntGloPreUniIt: "0.0000",
                        dTotOpeItem: totalItem.toFixed(4),
                        dTotOpeGs: Math.round(totalItem).toString(),
                    },
                },
                gCamIVA: {
                    iAfecIVA: iva.iAfecIVA,
                    dDesAfecIVA: iva.dDesAfecIVA,
                    dPropIVA: 100,
                    dTasaIVA: iva.dTasaIVA,
                    dBasGravIVA: iva.dBasGravIVA.toFixed(4),
                    dLiqIVAItem: iva.dLiqIVAItem.toFixed(4),
                },
            };
        });

        const totalOpe = totalExe + totalGrav5 + totalGrav10;
        // Sin descuentos: totalGral === totalOpe (decision de negocio Fase 5 P1)
        const totalGral = totalOpe;
        const totalIVA = totalIVA5 + totalIVA10;
        const baseGrav5 = totalGrav5 > 0 ? Math.round((totalGrav5 * 100) / 105) : 0;
        const baseGrav10 = totalGrav10 > 0 ? Math.round((totalGrav10 * 100) / 110) : 0;

        // --- Condicion de pago (XSD: gPaConEIni es array, gPagCred es objeto) ---
        const gCamCond: any = {
            iCondOpe: esCredito ? 2 : 1,
            dDCondOpe: esCredito ? "Credito" : "Contado",
        };
        if (esCredito) {
            gCamCond.gPagCred = {
                iCondCred: 1,
                dDCondCred: "Plazo",
                dPlazoCre: "30 dias",
            };
        } else {
            // XSD: gPaConEIni (array de formas de pago contado)
            // Campos obligatorios: iTiPago, dDesTiPag, dMonTiPag, cMoneTiPag, dDMoneTiPag
            gCamCond.gPaConEIni = [{
                iTiPago: 1,          // 1=Efectivo
                dDesTiPag: "Efectivo",
                dMonTiPag: totalGral.toFixed(4),
                cMoneTiPag: "PYG",
                dDMoneTiPag: "Guarani",
            }];
        }

        // --- Fecha inicio timbrado ---
        let feIniT = "2025-01-01";
        if (empresa.timbrado_vencimiento) {
            const venc = new Date(empresa.timbrado_vencimiento);
            const ini = new Date(venc.getTime() - 365 * 24 * 60 * 60 * 1000);
            feIniT = ini.toISOString().split("T")[0];
        }

        // ============================================
        // Objeto DTE completo → xmlbuilder2
        // Estructura auditada contra XSD DE_v150.xsd
        // ============================================
        const rDEObj = {
            rDE: {
                "@xmlns": "http://ekuatia.set.gov.py/sifen/xsd",
                "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "@xsi:schemaLocation": "http://ekuatia.set.gov.py/sifen/xsd siRecepDE_v150.xsd",
                dVerFor: 150,
                DE: {
                    "@Id": cdc,
                    dDVId: Number(cdc.charAt(43)),
                    dFecFirma: fechaISO,
                    dSisFact: 1,

                    gOpeDE: {
                        iTipEmi: 1,
                        dDesTipEmi: "Normal",
                        dCodSeg: codigoSeguridad,
                        dInfoEmi: "1",
                        dInfoFisc: "Generado por HDV Distribuciones",
                    },

                    gTimb: {
                        iTiDE: 1,
                        dDesTiDE: "Factura electronica",
                        dNumTim: empresa.timbrado_numero,
                        dEst: establecimiento.padStart(3, "0"),
                        dPunExp: puntoExpedicion.padStart(3, "0"),
                        dNumDoc: numFactura7.padStart(7, "0"),
                        dSerieNum: "AA",
                        dFeIniT: feIniT,
                    },

                    gDatGralOpe: {
                        dFeEmiDE: fechaISO,

                        gOpeCom: {
                            iTipTra: 1,
                            dDesTipTra: "Venta de mercaderia",
                            iTImp: 1,
                            dDesTImp: "IVA",
                            cMoneOpe: "PYG",
                            dDesMoneOpe: "Guarani",
                        },

                        gEmis: {
                            dRucEm: rucEmpresa,
                            dDVEmi: dvEmpresa,
                            iTipCont: 1,  // 1=Persona Juridica
                            dNomEmi: sanitizarParaXML(empresa.razon_social, 200),
                            dNomFanEmi: sanitizarParaXML(empresa.nombre_fantasia || empresa.razon_social, 200),
                            dDirEmi: sanitizarParaXML(empresa.direccion_fiscal || "Sin direccion", 300),
                            dNumCas: "0",
                            cDepEmi: 11,
                            dDesDepEmi: "CENTRAL",
                            cDisEmi: 117,
                            dDesDisEmi: "LAMBARE",
                            cCiuEmi: 3432,
                            dDesCiuEmi: "LAMBARE",
                            dTelEmi: sanitizarParaXML(empresa.telefono_empresa || "", 50),
                            dEmailE: sanitizarParaXML(empresa.email_empresa || "", 100),
                            gActEco: {
                                cActEco: empresa.actividad_economica || "47190",
                                dDesActEco: "Venta al por menor",
                            },
                        },

                        // XSD: gDatRec — campos corregidos segun DE_v150.xsd
                        // gDatRec: campos de texto ya sanitizados en objeto `cliente`
                        gDatRec: {
                            iNatRec: 1,           // 1=Contribuyente
                            iTiOpe: 1,            // 1=B2B
                            cPaisRec: "PRY",
                            dDesPaisRe: "Paraguay",
                            iTipIDRec: tipoDoc.code,   // XSD: iTipIDRec (NO iTiDocRec)
                            dDTipIDRec: tipoDoc.desc,  // XSD: dDTipIDRec
                            dRucRec: rucCliente,
                            dDVRec: dvCliente,
                            dNomRec: cliente.razon_social || cliente.nombre,
                            dDirRec: cliente.direccion || sanitizarParaXML("Sin direccion", 300),
                            dTelRec: cliente.telefono,
                            dCelRec: cliente.telefono,
                            dEmailRec: cliente.email,
                        },
                    },

                    gDtipDE: {
                        gCamFE: {
                            iIndPres: 1,
                            dDesIndPres: "Operacion presencial",
                        },
                        gCamCond,
                        gCamItem: xmlItems,
                    },

                    gTotSub: {
                        dSubExe: totalExe.toFixed(4),
                        dSubExo: "0.0000",
                        dSub5: totalGrav5.toFixed(4),
                        dSub10: totalGrav10.toFixed(4),
                        dTotOpe: totalOpe.toFixed(4),
                        dTotDesc: "0.0000",
                        dTotAntItem: "0.0000",
                        dTotAnt: "0.0000",
                        dPorcDescTotal: "0.0000",
                        dDescTotal: "0.0000",
                        dAnticipo: "0.0000",
                        dRedon: "0.0000",
                        dComi: "0.0000",
                        dTotGralOpe: totalGral.toFixed(4),
                        dIVA5: totalIVA5.toFixed(4),
                        dIVA10: totalIVA10.toFixed(4),
                        dLiqTotIVA5: totalIVA5.toFixed(4),
                        dLiqTotIVA10: totalIVA10.toFixed(4),
                        dTotIVA: totalIVA.toFixed(4),
                        dBaseGrav5: baseGrav5.toFixed(4),
                        dBaseGrav10: baseGrav10.toFixed(4),
                        dTBasGraIVA: (baseGrav5 + baseGrav10).toFixed(4),
                    },
                },
            },
        };

        // --- Generar XML ---
        // TODO: Implementar firma XMLDSig con .p12 y CSC
        // Requiere: (1) extraer clave privada del .p12, (2) firmar nodo <DE> con RSA-SHA256,
        // (3) insertar <ds:Signature> como hijo de <rDE>, (4) calcular DigestValue y cHashQR para QR.
        // Estado B-03: pendiente hasta adquirir certificado .p12 de produccion.
        const xmlString = create(rDEObj).end({ prettyPrint: true, indent: "  " });
        console.log("[sifen] XML generado OK, CDC:", cdc);

        // --- QR URL (SIFEN codifica dFeEmiDE en hex) ---
        const fechaHex = toHex(fechaISO);
        // Sin firma: DigestValue, IdCSC y cHashQR se completaran con certificado .p12
        // M-08: encodeURIComponent en parametros QR para prevenir inyeccion
        const qrUrl = `https://ekuatia.set.gov.py/consultas/qr?nVersion=150`
            + `&Id=${encodeURIComponent(cdc)}`
            + `&dFeEmiDE=${encodeURIComponent(fechaHex)}`
            + `&dRucRec=${encodeURIComponent(rucCliente)}`
            + `&dTotGralOpe=${encodeURIComponent(totalGral.toFixed(4))}`
            + `&dTotIVA=${encodeURIComponent(totalIVA.toFixed(4))}`
            + `&cItems=${encodeURIComponent(String(items.length))}`
            + `&DigestValue=SIMULADO_SIN_FIRMA`
            + `&IdCSC=0001`
            + `&cHashQR=SIMULADO_SIN_CSC`;

        // --- SOAP simulado ---
        const soapSimulado = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
  <env:Header/>
  <env:Body>
    <rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd">
      <dId>${cdc}</dId>
      <xDE>
${xmlString.split("\n").map((l: string) => "        " + l).join("\n")}
      </xDE>
    </rEnviDe>
  </env:Body>
</env:Envelope>`;

        // --- Guardar SIFEN en pedido (cliente admin con SERVICE_ROLE_KEY) ---
        // Privilegios divididos: supabaseAdmin SOLO se usa aqui para escribir
        // el resultado oficial de SIFEN. Todas las lecturas previas usan el
        // cliente RLS del usuario autenticado.
        try {
            // M-10: Validar env var critica antes de usar
            const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (!supabaseServiceKey) {
                console.error("[sifen] SUPABASE_SERVICE_ROLE_KEY no configurada");
                return new Response(JSON.stringify({ error: "Configuracion del servidor incompleta" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

            const datosActualizados = {
                ...datos,
                sifen_cdc: cdc,
                sifen_qr_url: qrUrl,
                sifen_numFactura: numFacturaCompleto,
                sifen_xml_generado: true,
                sifen_fecha_generacion: new Date().toISOString(),
            };
            const { error: errUpdate } = await supabaseAdmin
                .from("pedidos")
                .update({ datos: datosActualizados, actualizado_en: new Date().toISOString() })
                .eq("id", String(pedidoId));
            if (errUpdate) console.warn("[sifen] No se pudo guardar en DB:", errUpdate.message);
            else console.log("[sifen] Datos SIFEN guardados en pedido:", pedidoId);
        } catch (dbErr: any) {
            console.warn("[sifen] Error guardando en DB:", dbErr.message);
        }

        return new Response(
            JSON.stringify({
                xml: xmlString, cdc, numFactura: numFacturaCompleto,
                qr_url: qrUrl, soap_simulado: soapSimulado,
                empresa: empresa.razon_social, cliente: cliente.nombre,
                total: totalGral, fechaEmision: fechaISO,
                desglose: { totalExentas: totalExe, totalGravada5: totalGrav5, totalGravada10: totalGrav10, totalIVA5, totalIVA10, totalIVA },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err: any) {
        console.error("[sifen] Error:", err);
        return new Response(
            JSON.stringify({ error: `Error interno: ${err.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
