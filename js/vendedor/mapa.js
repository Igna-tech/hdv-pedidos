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

    const ZONA_COLORES = [
        '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
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

    function _crearIcono(color, deuda) {
        const ring = deuda > 0 ? `<circle cx="20" cy="4" r="5" fill="#ef4444"/>` : '';
        return L.divIcon({
            html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:24px;height:32px;overflow:visible;">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="${color}"/>
                <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
                ${ring}
            </svg>`,
            className: '',
            iconSize: [24, 32],
            iconAnchor: [12, 32],
            popupAnchor: [0, -34],
        });
    }

    function _deudaCliente(clienteId) {
        const pedidos = HDVStorage.getCached('hdv_pedidos') || [];
        const pagosCredito = HDVStorage.getCached('hdv_pagos_credito') || [];
        let deuda = 0;

        pedidos.filter(p => {
            const d = p.datos || {};
            const tipoPago = d.tipoPago || p.tipoPago || '';
            const estado = p.estado || '';
            const cId = (d.cliente || {}).id;
            return cId === clienteId && tipoPago === 'credito' &&
                   estado !== 'cobrado_sin_factura' && estado !== 'anulado';
        }).forEach(p => {
            const d = p.datos || {};
            const total = d.total || 0;
            const pagado = pagosCredito.filter(pg => pg.pedidoId === p.id)
                .reduce((s, pg) => s + (pg.monto || 0), 0);
            deuda += Math.max(0, total - pagado);
        });

        return deuda;
    }

    function _diasDesdeUltimoPedido(clienteId) {
        const pedidos = HDVStorage.getCached('hdv_pedidos') || [];
        const dePedidos = pedidos
            .filter(p => {
                const d = p.datos || {};
                return (d.cliente || {}).id === clienteId;
            })
            .sort((a, b) => new Date(b.fecha || b.creado_en) - new Date(a.fecha || a.creado_en));

        if (!dePedidos.length) return null;
        const fecha = dePedidos[0].fecha || dePedidos[0].creado_en;
        if (!fecha) return null;
        return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
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
                    const dias = _diasDesdeUltimoPedido(c.id);
                    return dias === null || dias > 14;
                });
            case 'sin-ubicacion':
                return clts.filter(c => !c.lat || !c.lng);
            default:
                return clts.filter(c => c.lat && c.lng);
        }
    }

    // ── Filtros chips ─────────────────────────────────────────

    function _renderFiltroChips() {
        const opts = [
            { key: 'todos',          label: 'Todos' },
            { key: 'ruta',           label: 'Mi Ruta' },
            { key: 'deuda',          label: 'Con deuda' },
            { key: 'sin-visita',     label: 'Sin visita' },
            { key: 'sin-ubicacion',  label: 'Sin ubicar' },
        ];
        return opts.map(o => `<button data-action="setFiltroMapa" data-arg="${o.key}"
            class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${_filtroActivo === o.key ? 'bg-indigo-500 text-white shadow' : 'bg-white/90 text-slate-700 border border-slate-200'}">
            ${escapeHTML(o.label)}
        </button>`).join('');
    }

    function _actualizarFiltrosUI() {
        const el = document.getElementById('mapaFiltrosChips');
        if (el) el.innerHTML = _renderFiltroChips();
    }

    // ── Bottom sheet ──────────────────────────────────────────

    function _mostrarBottomSheet(clienteId) {
        const cliente = (window.clientes || []).find(c => c.id === clienteId);
        if (!cliente) return;

        const deuda = _deudaCliente(clienteId);
        const dias = _diasDesdeUltimoPedido(clienteId);
        const color = _getColorZona(cliente.zona);
        const diasStr = dias === null ? 'Sin pedidos' : dias === 0 ? 'Hoy' : `Hace ${dias} día${dias === 1 ? '' : 's'}`;
        const deudaStr = deuda > 0 ? `Gs. ${deuda.toLocaleString('es-PY')}` : 'Sin deuda';

        const sheet = document.getElementById('mapaBottomSheet');
        if (!sheet) return;

        sheet.innerHTML = `
            <div class="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
            <div class="flex items-center gap-3 mb-4">
                <div class="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-base shrink-0"
                     style="background:${color}">
                    ${escapeHTML(cliente.nombre.charAt(0).toUpperCase())}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-slate-900 truncate leading-tight">${escapeHTML(cliente.nombre)}</p>
                    ${cliente.zona ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white" style="background:${color}">${escapeHTML(cliente.zona)}</span>` : ''}
                </div>
                <button data-action="cerrarBottomSheetMapa"
                    class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="grid grid-cols-2 gap-2 mb-4">
                ${cliente.telefono ? `
                <a href="tel:${escapeHTML(cliente.telefono)}"
                   class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 transition-colors active:bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z"/>
                    </svg>
                    <span class="text-xs font-semibold text-slate-700 truncate">${escapeHTML(cliente.telefono)}</span>
                </a>` : `<div class="bg-slate-50 rounded-xl px-3 py-2.5"></div>`}

                <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <div>
                        <p class="text-[10px] text-slate-400 leading-none mb-0.5">Último pedido</p>
                        <p class="text-xs font-semibold text-slate-700">${escapeHTML(diasStr)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-2 ${deuda > 0 ? 'bg-red-50' : 'bg-slate-50'} rounded-xl px-3 py-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 ${deuda > 0 ? 'text-red-400' : 'text-slate-400'} shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div>
                        <p class="text-[10px] ${deuda > 0 ? 'text-red-400' : 'text-slate-400'} leading-none mb-0.5">Deuda</p>
                        <p class="text-xs font-semibold ${deuda > 0 ? 'text-red-600' : 'text-slate-700'}">${escapeHTML(deudaStr)}</p>
                    </div>
                </div>

                ${cliente.direccion ? `
                <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <p class="text-xs text-slate-600 truncate">${escapeHTML(cliente.direccion)}</p>
                </div>` : ''}
            </div>

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
        `;

        sheet.classList.remove('translate-y-full', 'hidden');
        sheet.classList.add('translate-y-0');
    }

    function _ocultarBottomSheet() {
        const sheet = document.getElementById('mapaBottomSheet');
        if (!sheet) return;
        sheet.classList.remove('translate-y-0');
        sheet.classList.add('translate-y-full');
        setTimeout(() => sheet.classList.add('hidden'), 300);
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
        _markersLayer.clearLayers();
        _marcadores = {};

        const filtrados = _clientesFiltrados();

        if (_filtroActivo === 'sin-ubicacion') {
            _renderListaSinUbicacion(filtrados);
        } else {
            _ocultarListaSinUbicacion();
            filtrados.forEach(c => {
                const color = _getColorZona(c.zona);
                const deuda = _deudaCliente(c.id);
                const icono = _crearIcono(color, deuda);
                const marker = L.marker([c.lat, c.lng], { icon: icono })
                    .on('click', () => _mostrarBottomSheet(c.id));
                _markersLayer.addLayer(marker);
                _marcadores[c.id] = marker;
            });
        }

        // Badge sin ubicar
        const sinUbicar = (window.clientes || []).filter(c => !c.lat || !c.lng).length;
        const badge = document.getElementById('mapaSinUbicarBadge');
        if (badge) {
            if (sinUbicar > 0 && _filtroActivo !== 'sin-ubicacion') {
                badge.textContent = `📍 Sin ubicar: ${sinUbicar}`;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        _actualizarFiltrosUI();
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

    function _centrarEnMiUbicacion() {
        if (!navigator.geolocation) {
            mostrarToast('Tu navegador no soporta geolocalización', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (_mapa) _mapa.setView([pos.coords.latitude, pos.coords.longitude], 16);
            },
            () => mostrarToast('No se pudo obtener tu ubicación', 'warning'),
            { timeout: 8000 }
        );
    }

    // ── Filtro público ────────────────────────────────────────

    function setFiltroMapa(filtro) {
        _filtroActivo = filtro;
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
        }

        setTimeout(() => {
            _mapa.invalidateSize();
            _renderMarcadores();

            const cltsConCoords = (window.clientes || []).filter(c => c.lat && c.lng);
            if (cltsConCoords.length > 0) {
                try {
                    const bounds = L.latLngBounds(cltsConCoords.map(c => [c.lat, c.lng]));
                    _mapa.fitBounds(bounds, { padding: [50, 80], maxZoom: 14 });
                } catch (_) { /* bounds inválidos */ }
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
    };
})();

// Globals para ACTION_DISPATCH
function mostrarMapa()            { HDVMapa.mostrarMapa(); }
function ocultarMapa()            { HDVMapa.ocultarMapa(); }
