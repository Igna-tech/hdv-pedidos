// ============================================
// Edge Function: sifen-generar-xml
// Genera XML DTE compatible con SIFEN v150 (Paraguay)
// Usa xmlbuilder2 via esm.sh para construccion del XML
// Recibe: { "pedido_id": "..." }
// Retorna: { "xml": "...", "cdc": "...", "numFactura": "..." }
// ============================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "npm:xmlbuilder2@3.1.1";

// --- CORS ---
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Mapeos SIFEN ---
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

// --- Helpers ---

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

function generarCDC(p: {
    iTiDE: number; ruc: string; dv: string; est: string; ptoExp: string;
    numDoc: string; tipContrib: number; fecha: Date; tipEmi: number; codSeg: string;
}): string {
    const tiDE   = String(p.iTiDE).padStart(2, "0");
    const ruc    = p.ruc.replace(/-/g, "").padStart(8, "0").slice(0, 8);
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

function calcIVAItem(precioUnit: number, cantidad: number, tipoImp: string) {
    const tipo = (tipoImp || "10").toString();
    const totalItem = precioUnit * cantidad;

    if (tipo === "exenta" || tipo === "0") {
        return { iAfecIVA: 4, dDesAfecIVA: "Exento", dTasaIVA: 0, dPropIVA: 100, dBasGravIVA: 0, dLiqIVAItem: 0 };
    }
    if (tipo === "5") {
        const base = Math.round((totalItem * 100) / 105);
        return { iAfecIVA: 3, dDesAfecIVA: "Gravado (IVA 5%)", dTasaIVA: 5, dPropIVA: 100, dBasGravIVA: base, dLiqIVAItem: totalItem - base };
    }
    // 10%
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
        // Auth check (solo para verificar que hay sesion, no para el cliente DB)
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "No autorizado" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Cliente Supabase con SERVICE_ROLE_KEY (bypass RLS total)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Body
        const body = await req.json();
        const pedidoId = body.pedido_id;
        console.log("[sifen] pedido_id:", pedidoId);

        if (!pedidoId) {
            return new Response(JSON.stringify({ error: "pedido_id requerido" }),
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
            nombre: clienteDB?.nombre || datos.cliente?.nombre || "Sin nombre",
            razon_social: clienteDB?.razon_social || datos.cliente?.razon_social || datos.cliente?.nombre || "Sin nombre",
            ruc: clienteDB?.ruc || datos.cliente?.ruc || "",
            tipo_documento: clienteDB?.tipo_documento || "RUC",
            direccion: clienteDB?.direccion || datos.cliente?.direccion || "",
            telefono: clienteDB?.telefono || datos.cliente?.telefono || "",
            email: clienteDB?.email || "",
        };
        if (!cliente.ruc) {
            return new Response(JSON.stringify({ error: "El cliente no tiene RUC/documento." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- 4. Productos (para unidad_medida_set) ---
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

        // --- Construir items y acumular totales ---
        let totalExe = 0, totalGrav5 = 0, totalGrav10 = 0, totalIVA5 = 0, totalIVA10 = 0;

        const xmlItems = items.map((item: any, idx: number) => {
            const prodInfo = productosDB[item.productoId] || {};
            const uMed = prodInfo.unidad_medida_set || "77";
            const uDesc = UNIDAD_MEDIDA_DESC[uMed] || "UNI";
            const precioUnit = item.precio || 0;
            const cant = item.cantidad || 1;
            const totalItem = item.subtotal || precioUnit * cant;
            const iva = calcIVAItem(precioUnit, cant, item.tipo_impuesto || "10");

            if (iva.iAfecIVA === 4) totalExe += totalItem;
            else if (iva.dTasaIVA === 5) { totalGrav5 += totalItem; totalIVA5 += iva.dLiqIVAItem; }
            else { totalGrav10 += totalItem; totalIVA10 += iva.dLiqIVAItem; }

            // Objeto plano para xmlbuilder2
            const itemObj: any = {
                dCodInt: item.productoId || `ITEM${idx + 1}`,
                dDesProSer: `${item.nombre || "Producto"} ${item.presentacion || ""}`.trim(),
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
            return itemObj;
        });

        const totalOpe = totalExe + totalGrav5 + totalGrav10;
        const totalGral = datos.total || totalOpe;
        const totalIVA = totalIVA5 + totalIVA10;
        const baseGrav5 = totalGrav5 > 0 ? Math.round((totalGrav5 * 100) / 105) : 0;
        const baseGrav10 = totalGrav10 > 0 ? Math.round((totalGrav10 * 100) / 110) : 0;

        // --- Condicion de pago ---
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
            gCamCond.gPagCont = {
                iMonPago: 1,
                dMonPago: "Guarani",
                dMonTiPag: totalGral.toFixed(4),
            };
        }

        // --- Fecha inicio timbrado (1 anio antes del vencimiento, o default) ---
        let feIniT = "2025-01-01";
        if (empresa.timbrado_vencimiento) {
            const venc = new Date(empresa.timbrado_vencimiento);
            const ini = new Date(venc.getTime() - 365 * 24 * 60 * 60 * 1000);
            feIniT = ini.toISOString().split("T")[0];
        }

        // ============================================
        // Objeto completo DTE → xmlbuilder2
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
                            iTipCont: 1,
                            dNomEmi: empresa.razon_social,
                            dNomFanEmi: empresa.nombre_fantasia || empresa.razon_social,
                            dDirEmi: empresa.direccion_fiscal || "Sin direccion",
                            dNumCas: "0",
                            cDepEmi: 1,
                            dDesDepEmi: "CAPITAL",
                            cDisEmi: 1,
                            dDesDisEmi: "ASUNCION",
                            cCiuEmi: 1,
                            dDesCiuEmi: "ASUNCION",
                            dTelEmi: empresa.telefono_empresa || "",
                            dEmailE: empresa.email_empresa || "",
                            gActEco: {
                                cActEco: empresa.actividad_economica || "47190",
                                dDesActEco: "Venta al por menor",
                            },
                        },

                        gDatRec: {
                            iNatRec: 1,
                            iTiOpe: 1,
                            cPaisRec: "PRY",
                            dDesPaisRe: "Paraguay",
                            iTiDocRec: tipoDoc.code,
                            dDTipIDRec: tipoDoc.desc,
                            dRucRec: rucCliente,
                            dDVRec: dvCliente,
                            dNomRec: cliente.razon_social || cliente.nombre,
                            dDirRec: cliente.direccion || "Sin direccion",
                            dTelRec: cliente.telefono || "",
                            dCelRec: cliente.telefono || "",
                            dEmailRec: cliente.email || "",
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
                        dTotDescGloworte: "0.0000",
                        dTotAntItem: "0.0000",
                        dTotAnt: "0.0000",
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

        // --- Generar XML con xmlbuilder2 ---
        const xmlString = create(rDEObj).end({ prettyPrint: true, indent: "  " });

        console.log("[sifen] XML generado OK, CDC:", cdc);

        // --- QR URL de consulta SET (entorno test) ---
        const fechaEmisionYMD = fechaEmision.toISOString().split("T")[0];
        const qrUrl = `https://ekuatia.set.gov.py/consultas/qr?nVersion=150`
            + `&Id=${cdc}`
            + `&dFeEmiDE=${encodeURIComponent(fechaISO)}`
            + `&dRucRec=${encodeURIComponent(rucCliente)}`
            + `&dTotGralOpe=${totalGral.toFixed(4)}`
            + `&dTotIVA=${totalIVA.toFixed(4)}`
            + `&cItems=${items.length}`
            + `&diDigVal=SIMULADO_SIN_FIRMA`
            + `&dProtAut=SIMULADO`;

        // --- Sobre SOAP simulado (recepcion DE individual) ---
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

        return new Response(
            JSON.stringify({
                xml: xmlString,
                cdc,
                numFactura: numFacturaCompleto,
                qr_url: qrUrl,
                soap_simulado: soapSimulado,
                empresa: empresa.razon_social,
                cliente: cliente.nombre,
                total: totalGral,
                fechaEmision: fechaISO,
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
