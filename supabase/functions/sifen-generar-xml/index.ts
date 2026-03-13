// ============================================
// Edge Function: sifen-generar-xml
// Genera XML DTE compatible con SIFEN v150 (Paraguay)
// Recibe: { "pedido_id": "..." }
// Retorna: { "xml": "<rDE>...</rDE>", "cdc": "...", "numFactura": "..." }
// ============================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS headers ---
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Constantes SIFEN ---
const SIFEN = {
    version: 150,
    dVerFor: 1,
    // Tipos de documento electronico
    iTiDE: 1, // 1=Factura electronica
    // Tipo de emision
    iTipEmi: 1, // 1=Normal
    // Moneda
    cMoneOpe: "PYG",
    dTiMon: "Guarani",
    // Tipo de transaccion
    iTipTra: 1, // 1=Venta de mercaderia
    // Tipo de impuesto afectado
    iAfecIVA_GRAVADO_10: 1,
    iAfecIVA_GRAVADO_5: 3,
    iAfecIVA_EXENTO: 4,
    // Tasas IVA
    dTasaIVA_10: 10,
    dTasaIVA_5: 5,
    // Presencia
    iTiPago: 1, // 1=Contado, 2=Credito
};

// Mapeo tipo_documento cliente -> codigo SIFEN
const TIPO_DOC_MAP: Record<string, { iTipIDRec: number; dDTipIDRec: string }> = {
    "RUC":       { iTipIDRec: 1, dDTipIDRec: "RUC" },
    "Cedula":    { iTipIDRec: 2, dDTipIDRec: "Cedula de identidad" },
    "Pasaporte": { iTipIDRec: 3, dDTipIDRec: "Pasaporte" },
};

// Mapeo unidad de medida SET
const UNIDAD_MEDIDA_MAP: Record<string, string> = {
    "77": "UNI", "83": "KG", "88": "LTR", "16": "CAJ",
    "56": "PAR", "30": "BLS", "19": "DOC", "53": "GR",
    "66": "ML", "26": "PCK",
};

// --- Helper: generar CDC 44 digitos ---
function generarCDC(params: {
    iTiDE: number;
    rucEmisor: string;
    dv: string;
    establecimiento: string;
    puntoExpedicion: string;
    numFactura: string;
    tipoContribuyente: number;
    fechaEmision: Date;
    tipoEmision: number;
    codigoSeguridad: string;
}): string {
    // Estructura CDC segun SIFEN MT v150:
    // Pos 1-2: Tipo DE (2 dig)
    // Pos 3-10: RUC emisor sin DV (8 dig, pad left 0)
    // Pos 11: Digito verificador RUC (1 dig)
    // Pos 12-14: Establecimiento (3 dig)
    // Pos 15-17: Punto expedicion (3 dig)
    // Pos 18-24: Numero factura (7 dig)
    // Pos 25: Tipo contribuyente (1 dig)
    // Pos 26-33: Fecha emision AAAAMMDD (8 dig)
    // Pos 34: Tipo emision (1 dig)
    // Pos 35-43: Codigo seguridad (9 dig)
    // Pos 44: Digito verificador CDC (1 dig)

    const tiDE = String(params.iTiDE).padStart(2, "0");
    const ruc = params.rucEmisor.replace(/-/g, "").padStart(8, "0").slice(0, 8);
    const dv = params.dv.slice(0, 1);
    const est = params.establecimiento.padStart(3, "0");
    const ptoExp = params.puntoExpedicion.padStart(3, "0");
    const numDoc = params.numFactura.padStart(7, "0").slice(0, 7);
    const tipContrib = String(params.tipoContribuyente);
    const fecha = params.fechaEmision;
    const fechaStr = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}`;
    const tipEmi = String(params.tipoEmision);
    const codSeg = params.codigoSeguridad.padStart(9, "0").slice(0, 9);

    const sinDV = `${tiDE}${ruc}${dv}${est}${ptoExp}${numDoc}${tipContrib}${fechaStr}${tipEmi}${codSeg}`;

    // Digito verificador modulo 11 (SIFEN usa base 2-7 repetido)
    const dvCDC = calcularDV11(sinDV);

    return `${sinDV}${dvCDC}`;
}

function calcularDV11(numero: string): number {
    const bases = [2, 3, 4, 5, 6, 7];
    let suma = 0;
    const digitos = numero.split("").reverse();
    for (let i = 0; i < digitos.length; i++) {
        suma += parseInt(digitos[i]) * bases[i % bases.length];
    }
    const resto = suma % 11;
    if (resto === 0) return 0;
    if (resto === 1) return 1;
    return 11 - resto;
}

// --- Helper: extraer RUC y DV ---
function parsearRUC(rucCompleto: string): { ruc: string; dv: string } {
    // Formato: 80000000-0 o 80000000
    const partes = rucCompleto.split("-");
    return {
        ruc: partes[0] || rucCompleto,
        dv: partes[1] || "0",
    };
}

// --- Helper: generar numero factura ---
function generarNumeroFactura(): string {
    const num = String(Math.floor(Math.random() * 9999999) + 1).padStart(7, "0");
    return num;
}

// --- Helper: codigo seguridad aleatorio (9 digitos) ---
function generarCodigoSeguridad(): string {
    let codigo = "";
    for (let i = 0; i < 9; i++) codigo += Math.floor(Math.random() * 10);
    return codigo;
}

// --- Helper: calcular IVA por item segun SIFEN ---
function calcularIVAItem(precioTotal: number, cantidad: number, tipoImpuesto: string): {
    iAfecIVA: number;
    dDesAfecIVA: string;
    dTasaIVA: number;
    dBasGravIVA: number;
    dLiqIVAItem: number;
} {
    const tipo = (tipoImpuesto || "10").toString();

    if (tipo === "exenta" || tipo === "0") {
        return {
            iAfecIVA: 4,
            dDesAfecIVA: "Exento",
            dTasaIVA: 0,
            dBasGravIVA: 0,
            dLiqIVAItem: 0,
        };
    }

    if (tipo === "5") {
        // IVA 5%: base = total * 100 / 105
        const totalItem = precioTotal * cantidad;
        const base = Math.round((totalItem * 100) / 105);
        const liq = totalItem - base;
        return {
            iAfecIVA: 3,
            dDesAfecIVA: "Gravado (IVA 5%)",
            dTasaIVA: 5,
            dBasGravIVA: base,
            dLiqIVAItem: liq,
        };
    }

    // Default: IVA 10%
    const totalItem = precioTotal * cantidad;
    const base = Math.round((totalItem * 100) / 110);
    const liq = totalItem - base;
    return {
        iAfecIVA: 1,
        dDesAfecIVA: "Gravado (IVA)",
        dTasaIVA: 10,
        dBasGravIVA: base,
        dLiqIVAItem: liq,
    };
}

// --- XML builder simple (sin dependencias externas) ---
function escapeXML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | undefined | null, attrs?: string): string {
    if (value === undefined || value === null || value === "") return "";
    const a = attrs ? ` ${attrs}` : "";
    return `<${name}${a}>${escapeXML(String(value))}</${name}>`;
}

function tagGroup(name: string, children: string): string {
    if (!children.trim()) return "";
    return `<${name}>${children}</${name}>`;
}

// ============================================
// MAIN: Generar XML DTE SIFEN
// ============================================

serve(async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Obtener auth del header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "No autorizado" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Crear cliente Supabase con service_role key (bypass RLS)
        // IMPORTANTE: NO pasar el Authorization del usuario — eso reactivaria RLS
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parsear body
        const body = await req.json();
        const pedidoId = body.pedido_id;
        console.log("[sifen-generar-xml] pedido_id recibido:", JSON.stringify(pedidoId), "| body keys:", Object.keys(body));

        if (!pedidoId) {
            return new Response(
                JSON.stringify({ error: "pedido_id requerido", body_keys: Object.keys(body) }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 1. Obtener pedido (service_role bypasses RLS)
        const { data: pedido, error: errPedido } = await supabase
            .from("pedidos")
            .select("*")
            .eq("id", String(pedidoId))
            .single();

        if (errPedido || !pedido) {
            return new Response(
                JSON.stringify({ error: `Pedido no encontrado (id=${pedidoId}): ${errPedido?.message || "No existe en DB"}` }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const datos = pedido.datos || pedido;

        // 2. Obtener configuracion empresa
        const { data: empresa, error: errEmpresa } = await supabase
            .from("configuracion_empresa")
            .select("*")
            .eq("id", 1)
            .single();

        if (errEmpresa || !empresa) {
            return new Response(
                JSON.stringify({ error: "Configuracion de empresa no encontrada. Configure los datos fiscales en Herramientas." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validar campos obligatorios de empresa
        if (!empresa.ruc_empresa || !empresa.razon_social || !empresa.timbrado_numero) {
            return new Response(
                JSON.stringify({ error: "Datos fiscales incompletos. Complete RUC, Razon Social y Timbrado en Herramientas > Datos Fiscales." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 3. Obtener cliente
        const clienteId = datos.cliente?.id;
        let clienteDB = null;
        if (clienteId) {
            const { data } = await supabase
                .from("clientes")
                .select("*")
                .eq("id", clienteId)
                .single();
            clienteDB = data;
        }

        // Merge datos cliente (DB tiene prioridad)
        const cliente = {
            nombre: clienteDB?.nombre || datos.cliente?.nombre || "Sin nombre",
            razon_social: clienteDB?.razon_social || datos.cliente?.razon_social || datos.cliente?.nombre || "Sin nombre",
            ruc: clienteDB?.ruc || datos.cliente?.ruc || "",
            tipo_documento: clienteDB?.tipo_documento || "RUC",
            direccion: clienteDB?.direccion || datos.cliente?.direccion || "",
            telefono: clienteDB?.telefono || datos.cliente?.telefono || "",
            email: clienteDB?.email || "",
        };

        if (!cliente.ruc) {
            return new Response(
                JSON.stringify({ error: "El cliente no tiene RUC/documento asignado." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 4. Obtener productos para unidad_medida_set
        const items = datos.items || [];
        const productoIds = [...new Set(items.map((i: any) => i.productoId).filter(Boolean))];
        let productosDB: Record<string, any> = {};
        if (productoIds.length > 0) {
            const { data: prods } = await supabase
                .from("productos")
                .select("id, unidad_medida_set")
                .in("id", productoIds);
            if (prods) {
                for (const p of prods) productosDB[p.id] = p;
            }
        }

        // --- Preparar datos para el XML ---
        const fechaEmision = new Date(datos.fecha || pedido.creado_en || new Date());
        const { ruc: rucEmpresa, dv: dvEmpresa } = parsearRUC(empresa.ruc_empresa);
        const { ruc: rucCliente, dv: dvCliente } = parsearRUC(cliente.ruc);
        const tipoDocCliente = TIPO_DOC_MAP[cliente.tipo_documento] || TIPO_DOC_MAP["RUC"];

        const numFactura = datos.numFactura
            ? datos.numFactura.split("-").pop() || generarNumeroFactura()
            : generarNumeroFactura();

        const numFacturaCompleto = `${empresa.establecimiento || "001"}-${empresa.punto_expedicion || "001"}-${numFactura.padStart(7, "0")}`;

        const codigoSeguridad = generarCodigoSeguridad();

        const cdc = generarCDC({
            iTiDE: SIFEN.iTiDE,
            rucEmisor: rucEmpresa,
            dv: dvEmpresa,
            establecimiento: empresa.establecimiento || "001",
            puntoExpedicion: empresa.punto_expedicion || "001",
            numFactura: numFactura,
            tipoContribuyente: 1, // 1=Persona juridica
            fechaEmision,
            tipoEmision: SIFEN.iTipEmi,
            codigoSeguridad,
        });

        // --- Construir items XML ---
        let itemsXML = "";
        let totalExentas = 0;
        let totalGravada5 = 0;
        let totalGravada10 = 0;
        let totalIVA5 = 0;
        let totalIVA10 = 0;

        items.forEach((item: any, idx: number) => {
            const productoInfo = productosDB[item.productoId] || {};
            const unidadMedida = productoInfo.unidad_medida_set || "77"; // Default UNI
            const unidadDesc = UNIDAD_MEDIDA_MAP[unidadMedida] || "UNI";
            const tipoImpuesto = item.tipo_impuesto || "10";

            const precioUnitario = item.precio || 0;
            const cantidad = item.cantidad || 1;
            const totalItem = item.subtotal || precioUnitario * cantidad;

            const iva = calcularIVAItem(precioUnitario, cantidad, tipoImpuesto);

            // Acumular totales
            if (iva.iAfecIVA === 4) {
                totalExentas += totalItem;
            } else if (iva.dTasaIVA === 5) {
                totalGravada5 += totalItem;
                totalIVA5 += iva.dLiqIVAItem;
            } else {
                totalGravada10 += totalItem;
                totalIVA10 += iva.dLiqIVAItem;
            }

            itemsXML += tagGroup("gCamItem", [
                tag("dCodInt", item.productoId || `ITEM${idx + 1}`),
                tag("dDesProSer", `${item.nombre || "Producto"} ${item.presentacion || ""}`.trim()),
                tag("cUniMed", unidadMedida),
                tag("dDesUniMed", unidadDesc),
                tag("dCantProSer", cantidad.toFixed(4)),
                tagGroup("gValorItem", [
                    tag("dPUniProSer", precioUnitario.toFixed(4)),
                    tag("dTotBruOpeItem", totalItem.toFixed(4)),
                    tagGroup("gValorRestaItem", [
                        tag("dDescItem", "0.0000"),
                        tag("dPorcDesIt", "0.0000"),
                        tag("dDescGloItem", "0.0000"),
                        tag("dAntPreUniIt", "0.0000"),
                        tag("dAntGloPreUniIt", "0.0000"),
                        tag("dTotOpeItem", totalItem.toFixed(4)),
                        tag("dTotOpeGs", totalItem.toFixed(0)),
                    ].join("")),
                ].join("")),
                tagGroup("gCamIVA", [
                    tag("iAfecIVA", iva.iAfecIVA),
                    tag("dDesAfecIVA", iva.dDesAfecIVA),
                    tag("dPropIVA", "100"),
                    tag("dTasaIVA", iva.dTasaIVA),
                    tag("dBasGravIVA", iva.dBasGravIVA.toFixed(4)),
                    tag("dLiqIVAItem", iva.dLiqIVAItem.toFixed(4)),
                ].join("")),
            ].join(""));
        });

        // --- Totales ---
        const totalOperacion = totalExentas + totalGravada5 + totalGravada10;
        const descuentoPorc = datos.descuento || 0;
        const totalConDescuento = datos.total || totalOperacion;
        const totalIVA = totalIVA5 + totalIVA10;

        // Condicion de pago
        const esCredito = datos.tipoPago === "credito";
        const iCondOpe = esCredito ? 2 : 1;

        // --- XML DTE completo ---
        const fechaISO = fechaEmision.toISOString().split(".")[0]; // Sin milisegundos

        const xmlDE = tagGroup("rDE", [
            `xmlns="http://ekuatia.set.gov.py/sifen/xsd" `,
            tagGroup("DE", [
                // Atributo Id como pseudo-atributo en tag
                tagGroup("gOpeDE", [
                    tag("iTipEmi", SIFEN.iTipEmi),
                    tag("dDesTipEmi", "Normal"),
                    tag("dCodSeg", codigoSeguridad),
                    tag("dInfoEmi", "1"),
                    tag("dInfoFisc", "Generado por HDV Distribuciones"),
                ].join("")),
                tagGroup("gTimb", [
                    tag("iTiDE", SIFEN.iTiDE),
                    tag("dDesTiDE", "Factura electronica"),
                    tag("dNumTim", empresa.timbrado_numero),
                    tag("dEst", empresa.establecimiento || "001"),
                    tag("dPunExp", empresa.punto_expedicion || "001"),
                    tag("dNumDoc", numFactura.padStart(7, "0")),
                    tag("dSerieNum", "AA"),
                    tag("dFeIniT", empresa.timbrado_vencimiento ? new Date(new Date(empresa.timbrado_vencimiento).getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : "2025-01-01"),
                ].join("")),
                tagGroup("gDatGralOpe", [
                    tag("dFeEmiDE", fechaISO),
                    tagGroup("gOpeCom", [
                        tag("iTipTra", SIFEN.iTipTra),
                        tag("dDesTipTra", "Venta de mercaderia"),
                        tag("iTIpoOpe", 1),
                        tag("dDesTIpoOpe", "B2B"),
                        tag("cMoneOpe", SIFEN.cMoneOpe),
                        tag("dDesMoneOpe", SIFEN.dTiMon),
                    ].join("")),
                    tagGroup("gEmis", [
                        tag("dRucEm", rucEmpresa),
                        tag("dDVEmi", dvEmpresa),
                        tag("iTipCont", 1),
                        tag("dNomFanEmi", empresa.nombre_fantasia || empresa.razon_social),
                        tag("dNomEmi", empresa.razon_social),
                        tag("dDirEmi", empresa.direccion_fiscal || "Sin direccion"),
                        tag("dNumCas", "0"),
                        tag("cDepEmi", 1),
                        tag("dDesDepEmi", "CAPITAL"),
                        tag("cDisEmi", 1),
                        tag("dDesDisEmi", "ASUNCION"),
                        tag("cCiuEmi", 1),
                        tag("dDesCiuEmi", "ASUNCION"),
                        tag("dTelEmi", empresa.telefono_empresa || ""),
                        tag("dEmailE", empresa.email_empresa || ""),
                        tagGroup("gActEco", [
                            tag("cActEco", empresa.actividad_economica || "47190"),
                            tag("dDesActEco", "Venta al por menor"),
                        ].join("")),
                    ].join("")),
                    tagGroup("gDatRec", [
                        tag("iNatRec", 1), // 1=contribuyente
                        tag("iTiOpe", 1), // 1=B2B
                        tag("cPaisRec", "PRY"),
                        tag("dDesPaisRe", "Paraguay"),
                        tag("iTiDocRec", tipoDocCliente.iTipIDRec),
                        tag("dDTipIDRec", tipoDocCliente.dDTipIDRec),
                        tag("dNumIDRec", rucCliente),
                        tag("dNomRec", cliente.razon_social || cliente.nombre),
                        tag("dDirRec", cliente.direccion || "Sin direccion"),
                        tag("dTelRec", cliente.telefono || ""),
                        tag("dCelRec", cliente.telefono || ""),
                        tag("dEmailRec", cliente.email || ""),
                    ].join("")),
                ].join("")),
                tagGroup("gDtipDE", [
                    tagGroup("gCamFE", [
                        tag("iIndPres", 1), // 1=Operacion presencial
                        tag("dDesIndPres", "Operacion presencial"),
                        tag("dFecEmNR", ""),
                    ].join("")),
                    tagGroup("gCamCond", [
                        tag("iCondOpe", iCondOpe),
                        tag("dDCondOpe", esCredito ? "Credito" : "Contado"),
                        ...(esCredito
                            ? [tagGroup("gPagCred", [
                                tag("iCondCred", 1), // 1=Plazo
                                tag("dDCondCred", "Plazo"),
                                tag("dPlazoCre", "30 dias"),
                              ].join(""))]
                            : [tagGroup("gPagCont", [
                                tag("iMonPago", 1), // 1=PYG
                                tag("dMonPago", "Guarani"),
                                tag("dMonTiPag", totalConDescuento.toFixed(4)),
                              ].join(""))]
                        ),
                    ].join("")),
                ].join("")),
                // Items
                itemsXML,
                // Subtotales
                tagGroup("gTotSub", [
                    tag("dSubExe", totalExentas.toFixed(4)),
                    tag("dSubExo", "0.0000"),
                    tag("dSub5", totalGravada5.toFixed(4)),
                    tag("dSub10", totalGravada10.toFixed(4)),
                    tag("dTotOpe", totalOperacion.toFixed(4)),
                    tag("dTotDesc", "0.0000"),
                    tag("dTotDescGloworte", "0.0000"),
                    tag("dAnticipo", "0.0000"),
                    tag("dRewordc", "0.0000"),
                    tag("dComi", "0.0000"),
                    tag("dTotGralOpe", totalConDescuento.toFixed(4)),
                    tag("dIVA5", totalIVA5.toFixed(4)),
                    tag("dIVA10", totalIVA10.toFixed(4)),
                    tag("dLiqTotIVA5", totalIVA5.toFixed(4)),
                    tag("dLiqTotIVA10", totalIVA10.toFixed(4)),
                    tag("dTotIVA", totalIVA.toFixed(4)),
                    tag("dBaseGrav5", totalGravada5 > 0 ? Math.round((totalGravada5 * 100) / 105).toFixed(4) : "0.0000"),
                    tag("dBaseGrav10", totalGravada10 > 0 ? Math.round((totalGravada10 * 100) / 110).toFixed(4) : "0.0000"),
                    tag("dTBasGraIVA", (
                        (totalGravada5 > 0 ? Math.round((totalGravada5 * 100) / 105) : 0) +
                        (totalGravada10 > 0 ? Math.round((totalGravada10 * 100) / 110) : 0)
                    ).toFixed(4)),
                ].join("")),
            ].join("")),
            // CDC como atributo del DE
            tag("dCDC", cdc),
            tag("dFecFirma", fechaISO),
        ].join(""));

        // Envolver en declaracion XML
        const xmlFinal = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlDE}`;

        return new Response(
            JSON.stringify({
                xml: xmlFinal,
                cdc,
                numFactura: numFacturaCompleto,
                empresa: empresa.razon_social,
                cliente: cliente.nombre,
                total: totalConDescuento,
                desglose: {
                    totalExentas,
                    totalGravada5,
                    totalGravada10,
                    totalIVA5,
                    totalIVA10,
                    totalIVA,
                },
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: `Error interno: ${err.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
