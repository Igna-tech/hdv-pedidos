# 📋 INSTRUCCIONES PARA ACTUALIZAR LA APP

## ⚡ RESPUESTA RÁPIDA: ¿Cambiar versión siempre?

### ✅ SÍ cambiar versión cuando:
- Cambias archivos `.js` o `.html` (app.js, index.html, admin.js, admin.html)
- Cambias la lógica o funcionalidad de la app
- Los vendedores necesitan ver los cambios inmediatamente

### ❌ NO cambiar versión cuando:
- Solo actualizas `productos.json` (precios, productos nuevos)
- Cambias datos en Google Sheets
- Cambias solo imágenes o estilos menores
- Actualizas documentación (README, etc.)

### 💡 Regla de oro:
**¿Cambié código (JS/HTML)? → SÍ, cambiar versión**
**¿Solo cambié datos (JSON)? → NO, se actualiza solo**

---

## 🔄 Proceso completo de actualización:

### Escenario 1: Cambios en CÓDIGO (JS/HTML)

1. Abre `service-worker.js`
2. Línea 2, incrementa:
   ```javascript
   const VERSION = '1.8'; // <-- CAMBIA A 1.9
   ```

3. Guarda todos los archivos
4. Sube a GitHub con Desktop
5. Los vendedores verán el botón verde "🔄 Nueva versión disponible"

### Escenario 2: Solo cambios en DATOS (productos.json)

1. Edita `productos.json` (agregar productos, cambiar precios, etc.)
2. Sube SOLO productos.json a GitHub
3. ✅ **¡Listo!** No necesitas cambiar versión
4. Los cambios se verán en ~30 segundos automáticamente

---

## 📝 Ejemplos prácticos:

| Acción | ¿Cambiar versión? | ¿Por qué? |
|--------|-------------------|-----------|
| Agregaste 5 productos nuevos | ❌ NO | productos.json se actualiza solo |
| Cambiaste precios | ❌ NO | Solo datos, no código |
| Corregiste un bug en app.js | ✅ SÍ | Código cambió |
| Agregaste nueva función | ✅ SÍ | Código cambió |
| Cambiaste diseño/colores CSS | ✅ SÍ | HTML cambió |
| Agregaste nuevo cliente | ❌ NO | Solo datos |
| Modificaste stock | ❌ NO | Solo datos |

---

## ✅ Qué hace el sistema:

- **Los usuarios verán el botón verde "🔄 Nueva versión disponible"** automáticamente
- Al hacer click, la app se actualiza sola
- **Ya no necesitas borrar datos del navegador** ✨
- productos.json se actualiza automáticamente sin cambiar versión

---

## 🆘 Si los usuarios no ven la actualización:

### Opción 1: Botón de Opciones (Recomendado)
1. Mantén presionado el botón 🌙 (modo oscuro)
2. Aparece un menú
3. Click en "🔄 Forzar Actualización"

### Opción 2: Manual
1. En el navegador: Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac)
2. Esto recarga sin usar caché

---

## 🎯 Resumen súper rápido:

```
CÓDIGO (JS/HTML) CAMBIÓ:
1. Incrementa versión en service-worker.js (1.8 → 1.9)
2. Sube todo a GitHub
3. Vendedores ven botón verde

SOLO DATOS (JSON) CAMBIARON:
1. Sube productos.json a GitHub
2. ¡Listo! Se actualiza solo en 30 seg
```

---

## 💻 Versionado recomendado:

- Cambios pequeños: 1.8 → 1.9
- Cambios medianos: 1.9 → 2.0
- Cambios grandes: 2.0 → 3.0

---

## ⚠️ Importante:

- Los pedidos guardados NUNCA se borran al actualizar
- El botón verde aparece solo si hay código nuevo
- productos.json SIEMPRE está actualizado (no necesita versión)
- Si dudas: cambia la versión (no hace daño)
