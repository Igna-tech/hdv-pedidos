// ============================================================
// DEMO-DATA.JS  —  DATOS FALSOS / TEMPORAL
// ------------------------------------------------------------
// Genera pedidos/cobros/metas/gastos FALSOS solo en este dispositivo
// (memoria + IndexedDB con marca _demo) para ver el dashboard lleno.
// NO se suben a Supabase.
//
// PERSISTENCIA: el "bundle" demo y el flag se guardan en localStorage
// (hdv_demo_bundle / hdv_demo_activo). Sobreviven a recargas Y al cierre
// de sesión (la purga de logout solo toca IndexedDB, no localStorage).
// Al volver a entrar como admin se REHIDRATA solo, hasta que toques
// "Quitar datos demo".
//
// PARA ELIMINAR DEFINITIVAMENTE: borrar este archivo, su <script> en
// admin.html y la tarjeta "Datos de demostración" en seccion-herramientas.
// ============================================================
(function () {
    'use strict';

    const KEY_FLAG = 'hdv_demo_activo';
    const KEY_BUNDLE = 'hdv_demo_bundle';

    const _rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const _pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const _uuid = () => 'DEMO-' + (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

    const ESTADOS = [
        ...Array(20).fill('pedido_pendiente'),
        ...Array(20).fill('entregado'),
        ...Array(45).fill('cobrado_sin_factura'),
        ...Array(15).fill('facturado_mock')
    ];

    // --- Persistencia del bundle en localStorage ---
    function _guardarBundle(bundle) {
        try {
            localStorage.setItem(KEY_BUNDLE, JSON.stringify(bundle));
            localStorage.setItem(KEY_FLAG, '1');
        } catch (e) { console.error('[Demo] No se pudo persistir el bundle:', e); }
    }
    function _leerBundle() {
        try { const raw = localStorage.getItem(KEY_BUNDLE); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
    }
    function _demoEstaActivo() { return localStorage.getItem(KEY_FLAG) === '1'; }

    // --- Refleja el estado en la tarjeta (pill + botones) ---
    function _actualizarEstadoDemoUI() {
        const pill = document.getElementById('demoEstado');
        const activo = _demoEstaActivo();
        if (pill) {
            pill.textContent = activo ? 'ACTIVO' : 'TEMPORAL';
            pill.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold ' +
                (activo ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700');
        }
        const g = document.getElementById('btnGenerarDemo');
        if (g) g.disabled = activo;
    }

    // --- Construye el conjunto de datos demo (sin persistir ni aplicar) ---
    async function _construirBundle() {
        // Vendedores reales (nombres en radar/leaderboard/metas)
        let vendedores = [];
        try {
            if (typeof _obtenerPerfilesMetas === 'function') {
                const perf = await _obtenerPerfilesMetas();
                vendedores = (perf || []).map(p => ({ id: p.id, nombre: p.nombre_completo || 'Vendedor' }));
            }
        } catch (_) {}
        if (!vendedores.length) {
            vendedores = [
                { id: 'demo-v1', nombre: 'Vendedor Uno' }, { id: 'demo-v2', nombre: 'Vendedor Dos' },
                { id: 'demo-v3', nombre: 'Vendedor Tres' }, { id: 'demo-v4', nombre: 'Vendedor Cuatro' }
            ];
        }
        vendedores = vendedores.slice(0, 4);

        let clientes = (typeof productosData !== 'undefined' && productosData?.clientes) ? productosData.clientes.slice(0, 30) : [];
        if (!clientes.length) {
            clientes = Array.from({ length: 12 }, (_, i) => ({ id: 'demo-c' + i, nombre: 'Cliente Demo ' + (i + 1), zona: _pick(['Centro', 'Norte', 'Sur', 'Este']) }));
        }

        let productos = (typeof productosData !== 'undefined' && productosData?.productos) ? productosData.productos.filter(p => (p.presentaciones || []).length) : [];

        const armarItems = () => {
            const items = []; let total = 0;
            const n = _rint(1, 4);
            for (let i = 0; i < n; i++) {
                if (productos.length) {
                    const prod = _pick(productos);
                    const pres = _pick(prod.presentaciones.filter(x => x.activo !== false) || prod.presentaciones);
                    if (!pres) continue;
                    const precio = pres.precio_base || _rint(10, 80) * 1000;
                    const cant = _rint(1, 12);
                    const sub = precio * cant;
                    total += sub;
                    items.push({ productoId: prod.id, nombre: prod.nombre, presentacion: pres.tamano, precio, cantidad: cant, subtotal: sub });
                } else {
                    const precio = _rint(10, 80) * 1000, cant = _rint(1, 12), sub = precio * cant;
                    total += sub;
                    items.push({ productoId: 'demo-p' + i, nombre: 'Producto Demo ' + (i + 1), presentacion: 'Unidad', precio, cantidad: cant, subtotal: sub });
                }
            }
            return { items, total };
        };

        // Pedidos (90 días, densos hacia hoy, horario comercial)
        const pedidos = [];
        for (let i = 0; i < 150; i++) {
            const d = new Date();
            d.setDate(d.getDate() - Math.floor(Math.pow(Math.random(), 1.6) * 90));
            d.setHours(_rint(8, 19), _rint(0, 59), 0, 0);
            const { items, total } = armarItems();
            if (!items.length) continue;
            const v = _pick(vendedores);
            const c = _pick(clientes);
            pedidos.push({
                id: _uuid(),
                numero_pedido: _rint(1000, 9999),
                fecha: d.toISOString(),
                total,
                estado: _pick(ESTADOS),
                tipoPago: Math.random() < 0.65 ? 'contado' : 'credito',
                vendedor_id: v.id,
                cliente: { id: c.id, nombre: c.nombre },
                items,
                sincronizado: true,
                _demo: true
            });
        }

        // Cobros (libro unificado): fechados cerca del pedido
        const pagos = [];
        pedidos.filter(p => p.estado === 'cobrado_sin_factura' || p.estado === 'entregado').forEach(p => {
            if (Math.random() < 0.75) {
                const pd = new Date(p.fecha);
                pd.setDate(pd.getDate() + _rint(0, 3));
                if (pd.getTime() > Date.now()) pd.setTime(Date.now());
                const parcial = p.estado === 'entregado' ? Math.round(p.total * (_rint(3, 8) / 10)) : p.total;
                pagos.push({ pedidoId: p.id, numero_pedido: p.numero_pedido, monto: parcial, fecha: pd.toISOString(), tipo: p.tipoPago, vendedor_id: p.vendedor_id, _demo: true });
            }
        });

        // Metas del mes por vendedor
        const mesActual = new Date().toISOString().slice(0, 7);
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const metas = vendedores.map(v => {
            const ventasMesV = pedidos.filter(p => p.vendedor_id === v.id && new Date(p.fecha) >= inicioMes).reduce((s, p) => s + p.total, 0);
            const monto = Math.max(500000, Math.round(ventasMesV * (_rint(80, 130) / 100) / 100000) * 100000);
            return { id: 'DEMO-meta-' + v.id, mes: mesActual, vendedor_id: v.id, monto, comision: _rint(2, 5), activa: true, _demo: true };
        });

        // Gastos demo (cascada de Rentabilidad)
        const CATS_GASTO = ['Combustible', 'Almuerzo', 'Peaje', 'Mantenimiento', 'Insumos', 'Varios'];
        const gastos = [];
        for (let i = 0; i < 70; i++) {
            const gd = new Date();
            gd.setDate(gd.getDate() - Math.floor(Math.pow(Math.random(), 1.6) * 90));
            gd.setHours(_rint(8, 19), 0, 0, 0);
            gastos.push({ id: _uuid(), fecha: gd.toISOString(), vendedor_id: _pick(vendedores).id, monto: _rint(2, 16) * 10000, categoria: _pick(CATS_GASTO), _demo: true });
        }

        return { pedidos, pagos, metas, gastos, ts: Date.now() };
    }

    // --- Aplica un bundle demo a la sesión actual (memoria + IndexedDB) ---
    let _aplicado = false;
    async function _aplicarDemo(bundle, { recargarDashboard } = {}) {
        if (!bundle) return;
        // Respaldar los pedidos reales una sola vez
        if (!window._demoActivo) {
            window._demoBackupPedidos = (typeof todosLosPedidos !== 'undefined' ? todosLosPedidos : []) || [];
        }
        window._demoActivo = true;
        window._demoGastos = bundle.gastos || [];

        // Parar realtime para que no sobreescriba los pedidos demo en memoria
        try { if (typeof unsubscribePedidos === 'function' && unsubscribePedidos) unsubscribePedidos(); } catch (_) {}

        if (typeof todosLosPedidos !== 'undefined') {
            todosLosPedidos = (window._demoBackupPedidos || []).concat(bundle.pedidos || []);
        }

        // Metas y cobros demo en IndexedDB (junto a los reales, marcados _demo)
        const metasPrev = (await HDVStorage.getItem('hdv_metas')) || [];
        await HDVStorage.setItem('hdv_metas', metasPrev.filter(m => !m._demo).concat(bundle.metas || []));
        const pagosPrev = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
        await HDVStorage.setItem('hdv_pagos_credito', pagosPrev.filter(p => !p._demo).concat(bundle.pagos || []));

        _aplicado = true;
        _actualizarEstadoDemoUI();

        if (recargarDashboard) {
            if (typeof aplicarFiltrosPedidos === 'function') aplicarFiltrosPedidos();
            if (typeof cargarDashboard === 'function') await cargarDashboard();
        }
    }

    // --- Generar (botón): construye, persiste y aplica ---
    async function generarDatosDemo() {
        const btn = document.getElementById('btnGenerarDemo');
        if (btn) btn.loading = true;
        try {
            const bundle = await _construirBundle();
            _guardarBundle(bundle);              // persiste (sobrevive recarga/logout)
            await _aplicarDemo(bundle, { recargarDashboard: true });
            if (typeof cambiarSeccion === 'function') cambiarSeccion('dashboard');
            if (typeof mostrarToast === 'function') mostrarToast(`Datos demo activados: ${bundle.pedidos.length} pedidos (quedan hasta que los quites)`, 'success');
        } catch (e) {
            console.error('[Demo] Error generando:', e);
            if (typeof mostrarToast === 'function') mostrarToast('No se pudieron generar los datos demo', 'error');
        } finally {
            if (btn) btn.loading = false;
        }
    }

    // --- Quitar (botón): limpia persistencia + IndexedDB y recarga ---
    async function quitarDatosDemo() {
        const btn = document.getElementById('btnQuitarDemo');
        if (btn) btn.loading = true;
        try {
            try { localStorage.removeItem(KEY_FLAG); localStorage.removeItem(KEY_BUNDLE); } catch (_) {}
            const metasPrev = (await HDVStorage.getItem('hdv_metas')) || [];
            await HDVStorage.setItem('hdv_metas', metasPrev.filter(m => !m._demo));
            const pagosPrev = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
            await HDVStorage.setItem('hdv_pagos_credito', pagosPrev.filter(p => !p._demo));
            window._demoActivo = false;
            window._demoGastos = null;
            if (typeof mostrarToast === 'function') mostrarToast('Datos demo eliminados — recargando…', 'success');
            setTimeout(() => location.reload(), 600);
        } catch (e) {
            console.error('[Demo] Error quitando:', e);
            if (typeof mostrarToast === 'function') mostrarToast('Error al quitar datos demo', 'error');
            if (btn) btn.loading = false;
        }
    }

    // --- Rehidratación automática al cargar (si quedó activo) ---
    function _rehidratarDemoSiActivo() {
        _actualizarEstadoDemoUI();
        if (!_demoEstaActivo()) return;
        const bundle = _leerBundle();
        if (!bundle) return;

        const aplicar = () => { if (!_aplicado) _aplicarDemo(bundle, { recargarDashboard: true }); };

        // Disparador principal: tras la carga inicial de pedidos (reales ya en memoria)
        document.addEventListener('hdv:pedidos-rt', (e) => {
            if (e.detail && e.detail.cambio === null) aplicar();
        });
        // Respaldo: si el evento ya ocurrió o tarda, aplicar de todas formas
        setTimeout(aplicar, 8000);
    }

    // Wire-up CSP-safe (sin onclick inline)
    function _wire() {
        const g = document.getElementById('btnGenerarDemo');
        const q = document.getElementById('btnQuitarDemo');
        if (g) g.addEventListener('click', generarDatosDemo);
        if (q) q.addEventListener('click', quitarDatosDemo);
        _rehidratarDemoSiActivo();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wire);
    else _wire();
})();
