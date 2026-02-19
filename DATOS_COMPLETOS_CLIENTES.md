# 📋 Actualización: Sistema Completo de Datos de Clientes

## ✨ Nuevos campos agregados

El sistema ahora captura datos completos de los clientes para una gestión profesional.

---

## 📊 Campos del Cliente

### **Antes (solo 2 campos):**
- Nombre
- Zona

### **Ahora (6 campos):**
1. ✅ **Razón Social / Nombre Comercial** (obligatorio)
2. ✅ **RUC** (obligatorio)
3. ✅ **Teléfono** (obligatorio)
4. ✅ **Dirección** (obligatorio - reemplaza "Zona")
5. ✅ **Nombre del Encargado** (opcional)
6. ✅ **Precios personalizados** (se mantiene)

---

## 🔄 Compatibilidad con Clientes Existentes

### **No te preocupes:** El sistema es 100% compatible

Los clientes que ya tienes registrados seguirán funcionando:
- El campo "zona" se mapea automáticamente a "dirección"
- El campo "nombre" se mapea a "razón_social"
- Los campos nuevos aparecerán vacíos y podrás llenarlos después

**No se pierde ningún dato existente** ✅

---

## 📱 En la App de Vendedores

### **Cliente Rápido (Sin registro previo):**
Cuando el vendedor no tiene el cliente registrado:

```
Modal aparece con:
┌────────────────────────────────┐
│ Razón Social *                 │
│ RUC *                          │
│ Teléfono *                     │
│ Dirección *                    │
│ Encargado (opcional)           │
│ ☑ Guardar en sistema           │
└────────────────────────────────┘
```

### **Buscador mejorado:**
Ahora busca por:
- Razón social
- RUC
- Dirección
- Nombre del encargado

Ejemplo: 
```
🔍 Supermercado Central - RUC: 80012345-6 — Av. Central 1234
```

---

## 👨‍💼 En el Panel de Admin

### **Tabla de Gestión de Clientes:**

| ID | Razón Social | RUC | Teléfono | Dirección | Encargado | Precios | Acciones |
|----|-------------|-----|----------|-----------|-----------|---------|----------|
| C001 | [editable] | [editable] | [editable] | [editable] | [editable] | 5 | 👁️ 🗑️ |

**Todos los campos son editables directamente en la tabla**

### **Nuevo Cliente:**
Modal con todos los campos para registro completo

### **Botón Ver Detalles (👁️):**
Muestra popup con todos los datos del cliente:
```
📋 DETALLES DEL CLIENTE

ID: C001
Razón Social: Supermercado Central S.A.
RUC: 80012345-6
Teléfono: 0981234567
Dirección: Av. Central 1234, Loma Plata
Encargado: Juan Pérez

Precios Personalizados: 15 productos
```

---

## 🔍 Búsqueda Potente

El buscador ahora busca en **TODOS** los campos:
- Razón social
- RUC
- Teléfono
- Dirección
- Encargado
- ID

Ejemplo: buscar "0981" encuentra todos los clientes con ese número

---

## 📝 Estructura de Datos

### **Formato JSON del cliente:**

```json
{
  "id": "C001",
  "nombre": "Supermercado Central S.A.",
  "razon_social": "Supermercado Central S.A.",
  "ruc": "80012345-6",
  "telefono": "0981234567",
  "direccion": "Av. Central 1234, Loma Plata",
  "encargado": "Juan Pérez",
  "zona": "Av. Central 1234, Loma Plata",
  "tipo": "mayorista_estandar",
  "precios_personalizados": {}
}
```

**Nota:** `zona` y `nombre` se mantienen por compatibilidad con código anterior.

---

## 🚀 Migración de Clientes Existentes

### **Opción 1: Automática (Recomendada)**
El sistema funciona tal cual. Ve completando datos cuando visites clientes:
1. Selecciona cliente antiguo
2. Admin → Gestionar Clientes
3. Edita directo en la tabla
4. Guarda productos.json

### **Opción 2: Importación Masiva**
Si tienes los datos en Excel:
1. Usa "Importar desde Excel" (próxima función)
2. O edita productos.json directamente

### **Opción 3: Gradual**
Cuando un vendedor visite un cliente existente:
- Toma el pedido normal
- En admin, completa los datos faltantes después
- Guarda y actualiza

---

## 💾 En los Pedidos

Los pedidos ahora guardan **todos** los datos del cliente:

```json
{
  "cliente": {
    "id": "C001",
    "nombre": "Supermercado Central S.A.",
    "razon_social": "Supermercado Central S.A.",
    "ruc": "80012345-6",
    "telefono": "0981234567",
    "direccion": "Av. Central 1234, Loma Plata",
    "encargado": "Juan Pérez"
  },
  "zona": "Av. Central 1234, Loma Plata"
}
```

Esto es útil para:
- Facturación
- Contacto directo
- Estadísticas por ubicación
- Reportes

---

## 📊 Beneficios del Sistema Completo

✅ **Facturación:** Datos listos para facturas (RUC, razón social)
✅ **Contacto:** Teléfono disponible para seguimiento
✅ **Ubicación:** Dirección completa para entregas
✅ **Gestión:** Nombre del encargado para relación comercial
✅ **Profesional:** Sistema completo y organizado
✅ **Búsqueda:** Encuentra clientes por cualquier dato
✅ **Reportes:** Información completa en cada reporte

---

## 🔒 Validaciones

### **Campos obligatorios (*) solo al crear/editar:**
- Razón Social
- RUC
- Teléfono
- Dirección

### **Campo opcional:**
- Nombre del Encargado

### **Si falta un dato en cliente antiguo:**
- El sistema usa valores por defecto
- No genera errores
- Puedes completar cuando quieras

---

## 📤 Exportar a Google Sheets

Los pedidos enviados a Google Sheets ahora incluyen:
- Todos los datos del cliente
- Facilita facturación
- Mejor seguimiento

---

## ⚙️ Versión

Esta actualización es la **versión 2.1**

Cambios técnicos:
- Estructura de datos ampliada
- Compatibilidad con datos antiguos
- Búsqueda multi-campo
- Validaciones mejoradas

---

## 📞 Casos de Uso

### **Facturación:**
Tienes RUC y razón social listos

### **Seguimiento:**
Llamas directo con el teléfono guardado

### **Entregas:**
Dirección completa para el delivery

### **Relación:**
Contactas al encargado por nombre

---

¡Sistema de clientes ahora es nivel empresarial! 🎉
