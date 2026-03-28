# 🧾 Hoja de Ruta Definitiva — Facturacion Electronica Legal (SIFEN/DNIT)

> **Proyecto:** HDV Distribuciones — Sistema POS/ERP
> **Fecha:** 28 de marzo de 2026
> **Version MT SIFEN:** v150 (vigente, con Notas Tecnicas hasta NT-23)
> **Estado general:** Motor de calculo listo, pendiente firma digital y homologacion SET

---

## 🏆 1. Estado Actual de la Arquitectura

### Lo que YA esta blindado y funcionando

| Componente | Estado | Detalle |
|------------|--------|---------|
| Motor CDC (Modulo 11) | ✅ Perfecto | Algoritmo oficial implementado en Edge Function. Pesos ciclicos 2-7, conversion ASCII de letras RUC, digito verificador correcto. |
| Redondeo Guaranies | ✅ Perfecto | `Math.round()` en toda division IVA (frontend y backend). Cero decimales en valores PYG. Verificado por fuerza bruta 1-500,000. |
| Ecuacion Fiscal XML | ✅ Blindada | Descuentos eliminados por decision de negocio. `totalGral = totalOpe = sum(precio × cantidad)`. Ecuacion `dTotGralOpe = dTotOpe - dDescTotal` siempre cuadra (descuento = 0). |
| Desglose IVA | ✅ Correcto | 3 tasas: Exenta (0%), IVA 5% (`/21`), IVA 10% (`/11`). Calculo per-item en backend, por bucket en frontend. Sin divergencia. |
| Sanitizacion XML | ✅ Anti-XXE | `sanitizarParaXML()` escapa `& < > " '` en orden correcto, trunca a maxLength. `validarNumero()` previene NaN/Infinity. |
| Anti-doble facturacion | ✅ Activo | Edge Function rechaza pedidos con `sifen_cdc` existente. |
| Rate limiting | ✅ Activo | 10 req/min por usuario en Edge Function. |
| Estructura XML DTE v150 | ✅ Auditada | Namespace, version, campos obligatorios presentes. Auditada contra XSD DE_v150. |

### Lo que esta en modo simulado (funcional pero sin validez legal)

- **Firma digital XMLDSig**: El `.p12` se carga en memoria pero no se usa para firmar. XML sale sin `<ds:Signature>`.
- **QR del KuDE**: `DigestValue`, `IdCSC` y `cHashQR` tienen placeholders. El QR no es verificable en ekuatia.set.gov.py.
- **Numero de factura**: Generado aleatoriamente (no secuencial del timbrado autorizado).
- **CDC provisional en frontend**: String estatico `"PENDIENTE-DE-SINCRONIZACION-SIFEN"` hasta que la Edge Function responde con el CDC real.

---

## 📋 2. Checklist de Requisitos Faltantes

> Estos son los 3 elementos que **la Direccion debe conseguir** antes de que el sistema pueda emitir facturas con validez legal ante la SET/DNIT.

### Requisito 1: Catalogo con IVA clasificado

- [ ] Revisar TODOS los productos en Supabase → tabla `productos` → columna `tipo_impuesto`
- [ ] Asignar correctamente: `'10'` (IVA 10%), `'5'` (IVA 5%), o `'exenta'` (0%)
- [ ] Verificar que el tipo impositivo coincida con la realidad fiscal de cada producto
- [ ] Productos sin `tipo_impuesto` se asumen como IVA 10% (fallback actual)

> **Por que importa:** Si un producto exento se factura como gravado 10%, la empresa paga IVA de mas. Si un gravado se factura como exento, es evasion fiscal.

### Requisito 2: Certificado Digital `.p12`

- [ ] Adquirir Certificado de Firma Electronica de **Persona Juridica** con un Prestador acreditado por el MIC (ej: [Code100](https://code100.com.py/))
- [ ] El certificado debe contener el **RUC de la empresa**
- [ ] Formato: `.p12` (PKCS#12) con contrasena
- [ ] Vigencia: 1 ano (renovable)
- [ ] Tiempo de tramite: ~48 horas habiles

> **Donde se guardara:** El archivo `.p12` codificado en Base64 y su contrasena se almacenaran como **Secrets** de la Edge Function en Supabase Dashboard (nunca en codigo fuente). Variables: `CERTIFICADO_P12` y `PASS_CERT`.

### Requisito 3: Codigo de Seguridad del Contribuyente (CSC)

- [ ] Ingresar a **Marangatu** (marangatu.set.gov.py) con el RUC de la empresa
- [ ] Navegar a: `Solicitudes → Documentos Electronicos → Solicitud y Obtencion del CSC`
- [ ] Completar el motivo y hacer clic en **"SOLICITAR CSC"**
- [ ] Anotar: el **IdCSC** (identificador de 4 digitos) y el **valor secreto del CSC**

> **Donde se guardara:** Como Secrets de la Edge Function: `SIFEN_CSC_ID` y `SIFEN_CSC_VALUE`. Se usaran para calcular el hash SHA-256 del QR (`cHashQR = SHA256(IdCSC + CDC + CSC)`).

### Requisito adicional: Timbrado electronico

- [ ] Solicitar **timbrado para Documentos Electronicos** en Marangatu (si aun no se tiene)
- [ ] Verificar: numero de timbrado, fecha inicio, fecha vencimiento, rango autorizado
- [ ] Cargar datos en Supabase → tabla `configuracion_empresa` (ya existe la estructura)

---

## 🗺️ 3. Plan de Accion Arquitectonico

### Fase A — Preparacion de datos (1-2 dias, sin codigo)

```
Director → Clasifica IVA en catalogo de productos
Director → Adquiere certificado .p12
Director → Obtiene CSC en Marangatu
Director → Verifica timbrado electronico
```

### Fase B — Integracion tecnica (4-8 horas de desarrollo)

```
1. Subir .p12 como Secret en Supabase Edge Functions
2. Subir CSC_ID y CSC_VALUE como Secrets
3. Implementar firma XMLDSig (RSA-SHA256) en Edge Function
4. Calcular DigestValue real del nodo <DE>
5. Calcular cHashQR = SHA256(IdCSC + CDC + CSC)
6. Agregar campos geograficos del receptor (dept/distrito/ciudad)
7. Conectar numero de factura al secuencial del timbrado
8. Eliminar placeholders y modo simulado
```

### Fase C — Homologacion SET (1-2 semanas)

```
1. Apuntar Edge Function al ambiente de pruebas: sifen-test.set.gov.py
2. Enviar lotes de prueba (hasta 50 DTEs por batch)
3. Validar respuestas, corregir rechazos
4. Probar: facturas, notas de credito, cancelaciones
5. Solicitar habilitacion de produccion a SET
6. Apuntar a produccion: sifen.set.gov.py
```

### Seguridad de secretos

| Secreto | Almacenamiento | Acceso |
|---------|---------------|--------|
| `.p12` (Base64) | Supabase Edge Function Secrets → `CERTIFICADO_P12` | Solo la Edge Function en runtime |
| Contrasena `.p12` | Supabase Edge Function Secrets → `PASS_CERT` | Solo la Edge Function en runtime |
| CSC ID | Supabase Edge Function Secrets → `SIFEN_CSC_ID` | Solo la Edge Function en runtime |
| CSC Value | Supabase Edge Function Secrets → `SIFEN_CSC_VALUE` | Solo la Edge Function en runtime |

> **Principio:** Ningun secreto toca el codigo fuente, repositorio Git, ni variables de frontend. Todo vive en Supabase Secrets (cifrado at rest, accesible solo por la funcion en ejecucion).

---

## 🤖 4. Prompt de Activacion Final

> Cuando los 3 requisitos esten listos, copia y pega este prompt exacto en una nueva conversacion con Claude:

```
Claude, actuando como SIFEN Integration Engineer con acceso al MCP de Supabase.

CONTEXTO:
La Direccion ha completado los 3 requisitos para produccion SIFEN:
1. Catalogo de productos clasificado con tipo_impuesto correcto en Supabase
2. Certificado .p12 subido como Secret "CERTIFICADO_P12" con su contrasena en "PASS_CERT"
3. CSC obtenido: IdCSC = "[REEMPLAZAR]", valor guardado en Secret "SIFEN_CSC_VALUE"

TAREA — Activacion SIFEN Produccion:
1. En `supabase/functions/sifen-generar-xml/index.ts`:
   a. Implementar firma XMLDSig: extraer clave privada del .p12 (PKCS#12), firmar el
      nodo <DE> con RSA-SHA256, insertar <ds:Signature> como hijo de <rDE>.
   b. Calcular DigestValue real (SHA-256 del nodo <DE> canonicalizado C14N).
   c. Calcular cHashQR: SHA-256 de la concatenacion (IdCSC + CDC + CSC_VALUE).
   d. Reemplazar placeholders: "SIMULADO_SIN_FIRMA" → DigestValue real,
      "0001" → IdCSC real, "SIMULADO_SIN_CSC" → cHashQR real.
   e. Agregar campos geograficos del receptor en gDatRec: dNumCasRec, cDepRec,
      dDesDepRec, cDisRec, dDesDisRec, cCiuRec, dDesCiuRec (leer de tabla clientes).
   f. Conectar dSerieNum al timbrado autorizado desde configuracion_empresa.
   g. Implementar numeracion secuencial de facturas (no aleatoria).

2. En `js/utils/formatters.js`:
   a. Eliminar generarCDC() provisional — el CDC solo viene del servidor.
   b. Eliminar generarNumeroFactura() provisional — el numero solo viene del servidor.

3. Apuntar al ambiente de pruebas SET (sifen-test.set.gov.py) para homologacion.

4. Ejecutar tests, hacer commit y push.

RESTRICCIONES:
- NO hardcodear ningun secreto. Leer TODO de Deno.env.get().
- Validar XML contra XSD DE_v150 antes de firmar (si hay libreria disponible).
- Mantener modo fallback: si no hay certificado, seguir generando XML sin firma (modo simulado).
- Documentar en CLAUDE.md los cambios realizados.
```

---

## 📊 5. Resumen de Hallazgos Fase 5 (Auditoria SIFEN)

| ID | Hallazgo | Estado |
|----|----------|--------|
| B-01 | Descuento rompe ecuacion fiscal | ✅ Remediado — descuentos eliminados |
| B-02 | Campo XML `dTotDescGloworte` invalido | ✅ Remediado — eliminado |
| B-03 | Firma digital no implementada | ⏳ Pendiente certificado .p12 |
| RF-01 | Divergencia IVA frontend/backend | ✅ Remediado — calculo sobre items reales |
| RF-02 | Fallback IVA 10% sin warning | ✅ Remediado — console.warn agregado |
| DT-01 | CDC mock 44 digitos aleatorios | ✅ Remediado — string estatico |
| DT-02 | Funcion muerta sanitizeXML() | ✅ Remediado — eliminada |
| DT-03 | Ciudad hardcoded ASUNCION | ✅ Remediado — cambiado a LAMBARE |

---

## 📅 6. Calendario de Obligatoriedad SIFEN

> Referencia para saber cuando HDV Distribuciones debe estar en produccion.

| Grupo | Fecha obligatoria |
|-------|-------------------|
| Grupo 15 | 1 marzo 2026 |
| Grupo 16 | 1 junio 2026 |
| Grupo 17 | 1 septiembre 2026 |
| Grupo 18 | 1 diciembre 2026 |
| Proveedores del Estado | 2 enero 2026 (Res. 41/2025) |

> **Accion:** Verificar en Marangatu a que grupo pertenece HDV Distribuciones para conocer la fecha limite.

---

*Documento generado automaticamente por Claude — HDV Distribuciones ERP*
*Ultima actualizacion: 28 de marzo de 2026*
