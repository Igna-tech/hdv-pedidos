// ============================================
// HDV Vendedor — Módulo de Mapa de Clientes
// Leaflet.js + CartoDB Dark Tiles
// ============================================

const HDVMapa = (() => {
    let _mapa = null;
    let _markersLayer = null;
    let _marcadores = {};
    let _filtroActivo = 'todos';
    let _modoColocacion = false;
    let _clienteParaUbicar = null;
    let _selId = null;        // cliente seleccionado (marcador resaltado)
    let _userMarker = null;   // punto azul "mi ubicación"
    let _userLatLng = null;   // última posición conocida

    const ZONA_COLORES = [
        '#5681AE','#10b981','#f59e0b','#ef4444','#3D5A78',
        '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'
    ];
    let _zonaColorMap = {};

    // ── Helpers ─────────────────────────────────────────────

    function _buildZonaColors() {
        const zonas = [...new Set((window.clientes || []).map(c => c.zona).filter(Boolean))].sort();
        _zonaColorMap = {};
        zonas.forEach((z, i) => { _zonaColorMap[z] = ZONA_COLORES[i % ZONA_COLORES.length]; });
    }

    function _getColorZona(zona) {
        if (!zona) return '#64748b';
        return _zonaColorMap[zona] || '#64748b';
    }

    // Estado del cliente para el color del marcador
    const NIVEL_COLOR = { deuda: '#ef4444', 'sin-visita': '#f59e0b', activo: '#10b981' };
    function _nivelCliente(c) {
        if (_deudaCliente(c.id) > 0) return 'deuda';
        const d = _diasSinContacto(c.id);
        if (d === null || d >= 15) return 'sin-visita';
        return 'activo';
    }

    function _crearIcono(nivel, inicial, seleccionado) {
        const color = NIVEL_COLOR[nivel] || '#64748b';
        return L.divIcon({
            html: `<div class="hdv-mk${seleccionado ? ' hdv-mk--sel' : ''}" style="--c:${color}"><span>${escapeHTML(inicial || '?')}</span></div>`,
            className: 'hdv-mk-wrap',
            iconSize: [30, 30],
            iconAnchor: [15, 28],
            popupAnchor: [0, -30],
        });
    }

    // Cache de stats por cliente: deuda + última compra (1 solo barrido por render)
    // Lee la forma plana (vendedor) o envuelta en .datos (admin/sync).
    let _statsCache = null;
    function _buildStatsCache() {
        const pedidos = HDVStorage.getCached('hdv_pedidos') || [];
        const pagos = HDVStorage.getCached('hdv_pagos_credito') || [];
        const visitas = HDVStorage.getCached('hdv_visitas_clientes') || {};
        const pagadoPorPedido = {};
        pagos.forEach(pg => { pagadoPorPedido[pg.pedidoId] = (pagadoPorPedido[pg.pedidoId] || 0) + (pg.monto || 0); });
        const cache = {};
        const get = (id) => cache[id] || (cache[id] = { deuda: 0, last: 0, visita: 0 });
        pedidos.forEach(p => {
            const d = p.datos || p;
            const cId = (d.cliente || {}).id;
            if (!cId) return;
            const c = get(cId);
            const fecha = p.fecha || d.fecha || p.creado_en;
            if (fecha) { const t = new Date(fecha).getTime(); if (t && t > c.last) c.last = t; }
            const tipoPago = d.tipoPago || p.tipoPago || '';
            const estado = p.estado || d.estado || '';
            if (tipoPago === 'credito' && estado !== 'cobrado_sin_factura' && estado !== 'anulado') {
                const total = d.total || p.total || 0;
                c.deuda += Math.max(0, total - (pagadoPorPedido[p.id] || 0));
            }
        });
        Object.keys(visitas).forEach(id => { get(id).visita = visitas[id] || 0; });
        _statsCache = cache;
    }

    function _deudaCliente(clienteId) {
        if (!_statsCache) _buildStatsCache();
        return _statsCache[clienteId] ? _statsCache[clienteId].deuda : 0;
    }

    function _diasDesdeUltimoPedido(clienteId) {
        if (!_statsCache) _buildStatsCache();
        const last = _statsCache[clienteId] && _statsCache[clienteId].last;
        return last ? Math.floor((Date.now() - last) / 86400000) : null;
    }

    // Días desde el último CONTACTO (pedido o visita marcada) — para "sin visita"
    function _diasSinContacto(clienteId) {
        if (!_statsCache) _buildStatsCache();
        const s = _statsCache[clienteId];
        const t = Math.max((s && s.last) || 0, (s && s.visita) || 0);
        return t ? Math.floor((Date.now() - t) / 86400000) : null;
    }

    async function _marcarVisita(clienteId) {
        let visitas = {};
        try { visitas = (await HDVStorage.getItem('hdv_visitas_clientes', { clone: false })) || {}; } catch (e) {}
        visitas[clienteId] = Date.now();
        try { await HDVStorage.setItem('hdv_visitas_clientes', visitas); } catch (e) {}
        if (typeof mostrarToast === 'function') mostrarToast('Visita registrada ✓ (vale 15 días)', 'success');
        _renderMarcadores();
        _mostrarBottomSheet(clienteId);
    }

    function _clientesFiltrados() {
        const clts = window.clientes || [];
        switch (_filtroActivo) {
            case 'ruta': {
                const pedidos = HDVStorage.getCached('hdv_pedidos') || [];
                const idsRuta = new Set(
                    pedidos.filter(p => p.estado === 'pedido_pendiente')
                        .map(p => ((p.datos || {}).cliente || {}).id).filter(Boolean)
                );
                return clts.filter(c => idsRuta.has(c.id) && c.lat && c.lng);
            }
            case 'deuda':
                return clts.filter(c => c.lat && c.lng && _deudaCliente(c.id) > 0);
            case 'sin-visita':
                return clts.filter(c => {
                    if (!c.lat || !c.lng) return false;
                    const dias = _diasSinContacto(c.id);
                    return dias === null || dias >= 15;
                });
            case 'sin-ubicacion':
                return clts.filter(c => !c.lat || !c.lng);
            default:
                return clts.filter(c => c.lat && c.lng);
        }
    }

    // ── Filtro (dropdown compacto que abre hacia arriba) ──────
    const _FILTRO_OPTS = [
        { key: 'todos',         label: 'Todos',      icon: 'users' },
        { key: 'deuda',         label: 'Con deuda',  icon: 'alert-circle' },
        { key: 'sin-visita',    label: 'Sin visita', icon: 'clock' },
        { key: 'sin-ubicacion', label: 'Sin ubicar', icon: 'map-pin-off' },
    ];

    function _filtroCounts() {
        const clts = (window.clientes || []);
        const conUbic = clts.filter(c => c.lat && c.lng);
        return {
            todos: conUbic.length,
            deuda: conUbic.filter(c => _deudaCliente(c.id) > 0).length,
            'sin-visita': conUbic.filter(c => { const d = _diasSinContacto(c.id); return d === null || d >= 15; }).length,
            'sin-ubicacion': clts.filter(c => !c.lat || !c.lng).length,
        };
    }

    function _actualizarFiltrosUI() {
        const counts = _filtroCounts();
        const active = _FILTRO_OPTS.find(o => o.key === _filtroActivo) || _FILTRO_OPTS[0];
        const lbl = document.getElementById('mapaFiltroLabel');
        const cnt = document.getElementById('mapaFiltroCount');
        if (lbl) lbl.textContent = active.label;
        if (cnt) cnt.textContent = counts[active.key] || 0;
        const menu = document.getElementById('mapaFiltroMenu');
        if (menu) {
            menu.innerHTML = _FILTRO_OPTS.map(o => {
                const act = _filtroActivo === o.key;
                return `<button data-action="setFiltroMapa" data-arg="${o.key}" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${act ? 'bg-steel text-white' : 'text-slate-600 active:bg-slate-100'}">
                    <i data-lucide="${o.icon}" class="w-4 h-4 shrink-0"></i>
                    <span class="text-sm font-semibold flex-1">${escapeHTML(o.label)}</span>
                    <span class="text-[11px] font-bold ${act ? 'text-white/80' : 'text-slate-400'}">${counts[o.key] || 0}</span>
                </button>`;
            }).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    function _toggleMapaFiltro(forceClose) {
        const menu = document.getElementById('mapaFiltroMenu');
        const chev = document.getElementById('mapaFiltroChevron');
        if (!menu) return;
        const abierto = !menu.classList.contains('invisible');
        if (abierto || forceClose === true) {
            menu.classList.add('opacity-0', 'translate-y-2', 'invisible');
            if (chev) chev.classList.remove('rotate-180');
        } else {
            _actualizarFiltrosUI();
            menu.classList.remove('opacity-0', 'translate-y-2', 'invisible');
            if (chev) chev.classList.add('rotate-180');
        }
    }

    // ── Bottom sheet ──────────────────────────────────────────

    function _distanciaKm(lat1, lng1, lat2, lng2) {
        const R = 6371, toR = Math.PI / 180;
        const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _mostrarBottomSheet(clienteId) {
        const cliente = (window.clientes || []).find(c => c.id === clienteId);
        if (!cliente) return;

        _selId = clienteId;
        _renderMarcadores(); // resalta el marcador seleccionado

        const deuda = _deudaCliente(clienteId);
        const dias = _diasDesdeUltimoPedido(clienteId);
        const color = _getColorZona(cliente.zona);
        const diasStr = dias === null ? 'Sin pedidos' : dias === 0 ? 'Hoy' : `Hace ${dias} día${dias === 1 ? '' : 's'}`;
        const deudaStr = deuda > 0 ? `Gs. ${deuda.toLocaleString('es-PY')}` : 'Sin deuda';
        const nivel = _nivelCliente(cliente);
        const nivelMeta = { deuda: { t: 'Con deuda', c: 'bg-red-100 text-red-700' }, 'sin-visita': { t: 'Sin visita', c: 'bg-amber-100 text-amber-700' }, activo: { t: 'Activo', c: 'bg-green-100 text-green-700' } }[nivel];
        let distStr = '';
        if (_userLatLng && cliente.lat && cliente.lng) {
            const km = _distanciaKm(_userLatLng.lat, _userLatLng.lng, cliente.lat, cliente.lng);
            distStr = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
        }
        const _visitas = HDVStorage.getCached('hdv_visitas_clientes') || {};
        const _vts = _visitas[clienteId];
        const visitaDias = _vts ? Math.floor((Date.now() - _vts) / 86400000) : null;
        const visitadoOk = visitaDias !== null && visitaDias < 15;

        const sheet = document.getElementById('mapaBottomSheet');
        if (!sheet) return;

        sheet.innerHTML = `
            <div class="hdv-sheet-grab -mt-1 pt-2 pb-1"><div class="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"></div></div>
            <div class="flex items-center gap-3 mb-4">
                <div class="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-base shrink-0"
                     style="background:${color}">
                    ${escapeHTML(cliente.nombre.charAt(0).toUpperCase())}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-slate-900 truncate leading-tight">${escapeHTML(cliente.nombre)}</p>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${nivelMeta.c}">${nivelMeta.t}</span>
                        ${cliente.zona ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style="background:${color}">${escapeHTML(cliente.zona)}</span>` : ''}
                        ${distStr ? `<span class="text-[10px] text-slate-400 font-medium">a ${distStr}</span>` : ''}
                    </div>
                </div>
                <button data-action="cerrarBottomSheetMapa"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-3 px-0.5">
                ${cliente.telefono ? `<a href="tel:${escapeHTML(cliente.telefono)}" class="flex items-center gap-1 font-semibold text-slate-700 active:text-slate-900">
                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z"/></svg>${escapeHTML(cliente.telefono)}</a>` : ''}
                <span class="flex items-center gap-1 text-slate-500"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${escapeHTML(diasStr)}</span>
                <span class="flex items-center gap-1 font-semibold ${deuda > 0 ? 'text-red-600' : 'text-slate-500'}"><svg class="w-3.5 h-3.5 ${deuda > 0 ? 'text-red-400' : 'text-slate-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 9v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${escapeHTML(deudaStr)}</span>
            </div>
            ${cliente.direccion ? `<p class="flex items-center gap-1 text-[11px] text-slate-400 truncate mb-3 px-0.5"><svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span class="truncate">${escapeHTML(cliente.direccion)}</span></p>` : ''}

            <div class="flex gap-2">
                <button data-action="crearPedidoDesdeMapaCliente" data-arg="${escapeHTML(clienteId)}"
                    class="flex-1 bg-indigo-600 active:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    Crear pedido
                </button>
                ${deuda > 0 ? `
                <button data-action="cobrarDesdeMapaCliente" data-arg="${escapeHTML(clienteId)}"
                    class="flex-1 bg-emerald-500 active:bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    Cobrar
                </button>` : ''}
                <a href="https://maps.google.com/?q=${cliente.lat},${cliente.lng}" target="_blank" rel="noopener noreferrer"
                    class="flex items-center justify-center gap-1.5 bg-slate-100 active:bg-slate-200 text-slate-700 px-3 rounded-xl text-xs font-semibold transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                    </svg>
                    Nav
                </a>
            </div>

            <button data-action="marcarVisitaMapa" data-arg="${escapeHTML(clienteId)}"
                class="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${visitadoOk ? 'bg-green-50 text-green-700 active:bg-green-100' : 'bg-slate-100 text-slate-700 active:bg-slate-200'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                ${visitadoOk ? `Visitado hace ${visitaDias}d · marcar de nuevo` : 'Marcar visita'}
            </button>
        `;

        sheet.style.transform = '';
        sheet.classList.remove('translate-y-full', 'hidden');
        sheet.classList.add('translate-y-0');
    }

    function _ocultarBottomSheet() {
        if (_selId) { _selId = null; _renderMarcadores(); } // quita el resaltado
        const sheet = document.getElementById('mapaBottomSheet');
        if (!sheet) return;
        sheet.style.transform = '';
        sheet.classList.remove('translate-y-0');
        sheet.classList.add('translate-y-full');
        setTimeout(() => sheet.classList.add('hidden'), 300);
    }

    // Arrastre del bottom-sheet (swipe hacia abajo para cerrar) — una sola vez
    let _sheetDragSet = false;
    let _filtroDocSet = false;
    function _setupSheetDrag() {
        if (_sheetDragSet) return;
        const sheet = document.getElementById('mapaBottomSheet');
        if (!sheet) return;
        let startY = null, curY = 0;
        const fromGrab = (e) => { const t = e.target; return t && t.closest && t.closest('.hdv-sheet-grab'); };
        const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;
        const down = (e) => { if (!fromGrab(e)) return; startY = getY(e); curY = 0; sheet.style.transition = 'none'; };
        const move = (e) => { if (startY === null) return; curY = Math.max(0, getY(e) - startY); sheet.style.transform = `translateY(${curY}px)`; };
        const up = () => { if (startY === null) return; startY = null; sheet.style.transition = ''; if (curY > 70) _ocultarBottomSheet(); else sheet.style.transform = 'translateY(0)'; };
        sheet.addEventListener('touchstart', down, { passive: true });
        sheet.addEventListener('touchmove', move, { passive: true });
        sheet.addEventListener('touchend', up);
        sheet.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        _sheetDragSet = true;
    }

    // ── Sin ubicación list ────────────────────────────────────

    function _renderListaSinUbicacion(clientesSin) {
        const wrapper = document.getElementById('mapaSinUbicacionWrapper');
        const mapEl = document.getElementById('hdvMapContainer');

        if (!clientesSin.length) {
            mostrarToast('Todos los clientes tienen ubicación', 'success');
            setFiltroMapa('todos');
            return;
        }

        if (wrapper) wrapper.classList.remove('hidden');
        if (mapEl) mapEl.classList.add('hidden');

        const countEl = document.getElementById('mapaSinUbicarCount');
        if (countEl) countEl.textContent = `${clientesSin.length} sin ubicar`;

        const list = document.getElementById('mapaSinUbicacionList');
        if (!list) return;

        list.innerHTML = clientesSin.map(c => `
            <button data-action="iniciarColocacionPin" data-arg="${escapeHTML(c.id)}"
                class="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-indigo-50 border-b border-slate-100 text-left transition-colors">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                     style="background:${_getColorZona(c.zona)}">
                    ${escapeHTML(c.nombre.charAt(0).toUpperCase())}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-slate-800 text-sm truncate">${escapeHTML(c.nombre)}</p>
                    ${c.zona ? `<p class="text-xs text-slate-400">${escapeHTML(c.zona)}</p>` : ''}
                    ${c.direccion ? `<p class="text-xs text-slate-400 truncate">${escapeHTML(c.direccion)}</p>` : ''}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
            </button>
        `).join('');
    }

    function _ocultarListaSinUbicacion() {
        const wrapper = document.getElementById('mapaSinUbicacionWrapper');
        const mapEl = document.getElementById('hdvMapContainer');
        if (wrapper) wrapper.classList.add('hidden');
        if (mapEl) mapEl.classList.remove('hidden');
    }

    // ── Marcadores ────────────────────────────────────────────

    function _renderMarcadores() {
        if (!_mapa || !_markersLayer) return;
        _statsCache = null; // refrescar deuda/días (1 solo barrido para todo el render)
        _markersLayer.clearLayers();
        _marcadores = {};

        const filtrados = _clientesFiltrados();

        if (_filtroActivo === 'sin-ubicacion') {
            _renderListaSinUbicacion(filtrados);
        } else {
            _ocultarListaSinUbicacion();
            filtrados.forEach(c => {
                const nivel = _nivelCliente(c);
                const inicial = (c.nombre || '?').charAt(0).toUpperCase();
                const icono = _crearIcono(nivel, inicial, c.id === _selId);
                const marker = L.marker([c.lat, c.lng], { icon: icono })
                    .on('click', () => _mostrarBottomSheet(c.id));
                _markersLayer.addLayer(marker);
                _marcadores[c.id] = marker;
            });
        }

        _actualizarFiltrosUI();
        _actualizarResumenMapa();
    }

    // Mini-barra de resumen arriba del mapa
    function _actualizarResumenMapa() {
        const el = document.getElementById('mapaResumen');
        if (!el) return;
        const clts = (window.clientes || []).filter(c => c.lat && c.lng);
        const deuda = clts.filter(c => _deudaCliente(c.id) > 0).length;
        const sinVisita = clts.filter(c => { const d = _diasDesdeUltimoPedido(c.id); return d === null || d >= 15; }).length;
        el.innerHTML = `<span class="font-bold text-slate-700">${clts.length}</span> clientes
            · <span class="font-bold text-red-500">${deuda}</span> con deuda
            · <span class="font-bold text-amber-500">${sinVisita}</span> sin visitar`;
    }

    // ── Colocación de pin ─────────────────────────────────────

    function _iniciarColocacionPin(clienteId) {
        const cliente = (window.clientes || []).find(c => c.id === clienteId);
        if (!cliente) return;

        _clienteParaUbicar = clienteId;
        _modoColocacion = true;

        _ocultarListaSinUbicacion();

        const crosshair = document.getElementById('mapaCrosshair');
        const instruccion = document.getElementById('mapaInstruccion');
        const confirmarBtn = document.getElementById('mapaConfirmarPin');

        if (crosshair) crosshair.classList.remove('hidden');
        if (confirmarBtn) confirmarBtn.classList.remove('hidden');
        if (instruccion) {
            instruccion.innerHTML = `
                <div class="bg-indigo-600 text-white rounded-2xl px-4 py-3 mx-3 shadow-xl flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">Ubicando: ${escapeHTML(cliente.nombre)}</p>
                        <p class="text-xs text-indigo-200">Mové el mapa hasta la ubicación exacta</p>
                    </div>
                    <button data-action="cancelarColocacionPin"
                        class="text-indigo-200 hover:text-white p-1 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>`;
            instruccion.classList.remove('hidden');
        }

        if (_mapa) {
            const cltsConCoords = (window.clientes || []).filter(c => c.lat && c.lng);
            if (cltsConCoords.length > 0) {
                _mapa.setView([cltsConCoords[0].lat, cltsConCoords[0].lng], 15);
            } else {
                _mapa.setView([-25.2867, -57.647], 15);
            }
        }
    }

    async function _confirmarPin() {
        if (!_mapa || !_clienteParaUbicar) return;

        const center = _mapa.getCenter();
        const lat = parseFloat(center.lat.toFixed(7));
        const lng = parseFloat(center.lng.toFixed(7));

        const btn = document.getElementById('mapaConfirmarPin');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

        try {
            const { success, error } = await SupabaseService.updateClienteUbicacion(_clienteParaUbicar, lat, lng);
            if (!success) throw error || new Error('Error al guardar');

            if (window.clientes) {
                const idx = window.clientes.findIndex(c => c.id === _clienteParaUbicar);
                if (idx !== -1) {
                    window.clientes[idx].lat = lat;
                    window.clientes[idx].lng = lng;
                    window.clientes[idx].ubicacion_actualizada_en = new Date().toISOString();
                }
            }

            mostrarToast('Ubicación guardada correctamente', 'success');
            _cancelarColocacionPin();
            setFiltroMapa('todos');
        } catch (e) {
            console.error('[HDVMapa] confirmarPin:', e);
            mostrarToast('Error al guardar la ubicación', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Confirmar ubicación aquí`; }
        }
    }

    function _cancelarColocacionPin() {
        _modoColocacion = false;
        _clienteParaUbicar = null;

        document.getElementById('mapaCrosshair')?.classList.add('hidden');
        document.getElementById('mapaInstruccion')?.classList.add('hidden');
        document.getElementById('mapaConfirmarPin')?.classList.add('hidden');
    }

    // ── Geolocalización ───────────────────────────────────────

    function _marcarMiUbicacion(lat, lng) {
        _userLatLng = { lat, lng };
        if (!_mapa) return;
        const icon = L.divIcon({ html: '<div class="hdv-userloc"></div>', className: 'hdv-userloc-wrap', iconSize: [18, 18], iconAnchor: [9, 9] });
        if (_userMarker) _userMarker.setLatLng([lat, lng]);
        else _userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(_mapa);
    }

    function _centrarEnMiUbicacion() {
        if (!navigator.geolocation) {
            mostrarToast('Tu navegador no soporta geolocalización', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                _marcarMiUbicacion(latitude, longitude);
                if (_mapa) _mapa.setView([latitude, longitude], 16);
            },
            () => mostrarToast('No se pudo obtener tu ubicación', 'warning'),
            { timeout: 8000 }
        );
    }

    // Enfocar un cliente desde otra sección ("Ver en mapa")
    function _focusCliente(clienteId) {
        const c = (window.clientes || []).find(x => x.id === clienteId);
        if (!c || !c.lat || !c.lng) { mostrarToast('Ese cliente no tiene ubicación en el mapa', 'warning'); return; }
        _filtroActivo = 'todos';
        _renderMarcadores();
        if (_mapa) _mapa.setView([c.lat, c.lng], 16, { animate: true });
        setTimeout(() => _mostrarBottomSheet(clienteId), 350);
    }

    function _toggleLeyenda() {
        document.getElementById('mapaLeyenda')?.classList.toggle('hidden');
    }

    function _encuadrar() {
        if (!_mapa) return;
        const cl = (window.clientes || []).filter(c => c.lat && c.lng);
        if (!cl.length) { mostrarToast('No hay clientes ubicados', 'info'); return; }
        try { _mapa.fitBounds(L.latLngBounds(cl.map(c => [c.lat, c.lng])), { padding: [50, 80], maxZoom: 15, animate: true }); } catch (_) {}
    }

    // ── Filtro público ────────────────────────────────────────

    function setFiltroMapa(filtro) {
        _filtroActivo = filtro;
        _toggleMapaFiltro(true);
        _ocultarBottomSheet();
        _renderMarcadores();

        if (_filtroActivo !== 'sin-ubicacion' && _mapa) {
            const filtrados = _clientesFiltrados();
            if (filtrados.length > 0) {
                try {
                    const bounds = L.latLngBounds(filtrados.map(c => [c.lat, c.lng]));
                    _mapa.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                } catch (_) { /* bounds inválidos */ }
            }
        }
    }

    // ── Init/destroy ──────────────────────────────────────────

    function mostrarMapa() {
        if (typeof L === 'undefined') {
            mostrarToast('Mapa no disponible — cargando...', 'warning');
            return;
        }

        const wrapper = document.getElementById('vistaMapaWrapper');
        const productsContainer = document.getElementById('productsContainer');
        if (!wrapper) return;

        const header = document.querySelector('header');
        const headerH = header ? header.offsetHeight : 60;
        wrapper.style.top = headerH + 'px';
        wrapper.classList.remove('hidden');
        if (productsContainer) productsContainer.style.display = 'none';

        _buildZonaColors();

        if (!_mapa) {
            _mapa = L.map('hdvMapContainer', {
                zoomControl: false,
                attributionControl: true,
            }).setView([-25.2867, -57.647], 13);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20,
            }).addTo(_mapa);

            L.control.zoom({ position: 'bottomright' }).addTo(_mapa);
            _markersLayer = L.layerGroup().addTo(_mapa);
            // Recordar última posición/zoom (con debounce)
            let _vpT = null;
            _mapa.on('moveend', () => {
                clearTimeout(_vpT);
                _vpT = setTimeout(() => {
                    try { const c = _mapa.getCenter(); HDVStorage.setItem('hdv_mapa_viewport', { lat: c.lat, lng: c.lng, z: _mapa.getZoom() }); } catch (e) {}
                }, 600);
            });
        }

        _setupSheetDrag();
        if (!_filtroDocSet) {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('mapaFiltroMenu');
                if (!menu || menu.classList.contains('invisible')) return;
                if (e.target.closest('#mapaFiltroMenu') || e.target.closest('[data-action="toggleMapaFiltro"]')) return;
                _toggleMapaFiltro(true);
            });
            _filtroDocSet = true;
        }
        setTimeout(() => {
            _mapa.invalidateSize();
            _renderMarcadores();

            // Restaurar viewport guardado; si no hay, encuadrar a los clientes
            let vp = null;
            try { vp = HDVStorage.getCached && HDVStorage.getCached('hdv_mapa_viewport'); } catch (e) {}
            if (vp && vp.lat && vp.lng) {
                _mapa.setView([vp.lat, vp.lng], vp.z || 14);
            } else {
                const cltsConCoords = (window.clientes || []).filter(c => c.lat && c.lng);
                if (cltsConCoords.length > 0) {
                    try {
                        const bounds = L.latLngBounds(cltsConCoords.map(c => [c.lat, c.lng]));
                        _mapa.fitBounds(bounds, { padding: [50, 80], maxZoom: 14 });
                    } catch (_) { /* bounds inválidos */ }
                }
            }
        }, 150);
    }

    function ocultarMapa() {
        document.getElementById('vistaMapaWrapper')?.classList.add('hidden');
        const pc = document.getElementById('productsContainer');
        if (pc) pc.style.display = '';
        _ocultarBottomSheet();
        _cancelarColocacionPin();
        _ocultarListaSinUbicacion();
    }

    return {
        mostrarMapa,
        ocultarMapa,
        setFiltroMapa,
        iniciarColocacionPin:  _iniciarColocacionPin,
        confirmarPin:          _confirmarPin,
        cancelarColocacionPin: _cancelarColocacionPin,
        cerrarBottomSheet:     _ocultarBottomSheet,
        centrarEnMiUbicacion:  _centrarEnMiUbicacion,
        focusCliente:          _focusCliente,
        toggleLeyenda:         _toggleLeyenda,
        encuadrar:             _encuadrar,
        marcarVisita:          _marcarVisita,
        toggleFiltro:          _toggleMapaFiltro,
    };
})();

// Globals para ACTION_DISPATCH
function mostrarMapa()            { HDVMapa.mostrarMapa(); }
function ocultarMapa()            { HDVMapa.ocultarMapa(); }
