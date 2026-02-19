# 📋 INSTRUCCIONES PARA ACTUALIZAR LA APP

## 🔄 Cada vez que actualices archivos (index.html, app.js, admin.html, admin.js):

### ⚠️ IMPORTANTE: Incrementar versión en service-worker.js

1. Abre el archivo `service-worker.js`
2. En la línea 2, cambia el número de versión:
   ```javascript
   const VERSION = '1.8'; // <-- INCREMENTA ESTO
   ```
   
3. Cambia a:
   ```javascript
   const VERSION = '1.9'; // Nueva versión
   ```

4. Sube TODOS los archivos a GitHub (incluyendo service-worker.js actualizado)

---

## ✅ Qué hace esto:

- **Los usuarios verán el botón verde "🔄 Nueva versión disponible"** automáticamente
- Al hacer click, la app se actualiza sola
- **Ya no necesitas borrar datos del navegador** ✨

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

## 📝 Notas:

- **Incrementa la versión SIEMPRE** que cambies algo
- Usa decimales: 1.8 → 1.9 → 2.0 → 2.1, etc.
- El service worker se actualiza automáticamente cada 30 segundos
- Los pedidos guardados NO se borran al actualizar

---

## 🎯 Resumen rápido:

```
1. Cambias código
2. Incrementas versión en service-worker.js (1.8 → 1.9)
3. Subes todo a GitHub
4. Los vendedores ven "Nueva versión disponible"
5. ¡Listo! 🚀
```
