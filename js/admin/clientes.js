// ============================================
// HDV Admin - Modulo de Clientes
// CRUD clientes, perfil, precios especiales, inactivos
// Depende de globals: productosData, clientesFiltrados, registrarCambio
// ============================================

let paginaClientes = 1;
let clientesPorPagina = 20;
let ordenClientes = { campo: 'nombre', asc: true };
let chartPerfilClienteInstance = null;
let clientePerfilActual = null;

// ============================================
// GESTIONAR CLIENTES
// ============================================
function filtrarClientes() {
    const filtro = document.getElementById('buscarCliente')?.value.toLowerCase() || '';
    const zonaFiltro = document.getElementById('filtroZonaCliente')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosClientes')?.checked || false;
    clientesFiltrados = productosData.clientes.filter(c => {
        const match = (c.razon_social || c.nombre || '').toLowerCase().includes(filtro) ||
                      (c.ruc || '').toLowerCase().includes(filtro) ||
                      (c.id || '').toLowerCase().includes(filtro) ||
                      (c.direccion || c.zona || '').toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !c.oculto;
        const zonaMatch = !zonaFiltro || (c.zona || '') === zonaFiltro;
        return match && visible && zonaMatch;
    });
    paginaClientes = 1;
    mostrarClientesGestion();
}

function poblarFiltroZonas() {
    const sel = document.getElementById('filtroZonaCliente');
    if (!sel) return;
    const zonas = [...new Set(productosData.clientes.map(c => c.zona).filter(Boolean))].sort();
    sel.innerHTML = '<sl-option value="">Todas las zonas</sl-option>';
    zonas.forEach(z => { sel.innerHTML += `<sl-option value="${escapeHTML(z)}">${escapeHTML(z)}</sl-option>`; });
}

function ordenarClientes(campo) {
    if (ordenClientes.campo === campo) ordenClientes.asc = !ordenClientes.asc;
    else { ordenClientes.campo = campo; ordenClientes.asc = true; }
    clientesFiltrados.sort((a, b) => {
        let va = campo === 'nombre' ? (a.razon_social || a.nombre || '') : (a[campo] || '');
        let vb = campo === 'nombre' ? (b.razon_social || b.nombre || '') : (b[campo] || '');
        va = va.toLowerCase(); vb = vb.toLowerCase();
        return ordenClientes.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    mostrarClientesGestion();
}

function mostrarClientesGestion() {
    const tbody = document.getElementById('tablaClientesCuerpo');
    if (!tbody) return;
    tbody.innerHTML = '';
    poblarFiltroZonas();
    mostrarClientesPendientes();

    const total = clientesFiltrados.length;
    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="5">${generarAdminEmptyState(SVG_ADMIN_EMPTY_CLIENTS, 'Sin clientes encontrados', 'Agrega clientes o ajusta los filtros de busqueda')}</td></tr>`;
        const pag = document.getElementById('paginacionClientes');
        if (pag) pag.innerHTML = '';
        return;
    }
    const inicio = (paginaClientes - 1) * clientesPorPagina;
    const paginados = clientesFiltrados.slice(inicio, inicio + clientesPorPagina);

    paginados.forEach(c => {
        const oculto = c.oculto || false;
        const precios = c.precios_personalizados ? Object.keys(c.precios_personalizados).length : 0;
        const nombre = c.razon_social || c.nombre || 'Sin nombre';
        const tel = c.telefono || '';
        const tr = document.createElement('tr');
        tr.className = `hover:bg-gray-50 cursor-pointer ${oculto ? 'opacity-40' : ''}`;
        tr.innerHTML = `
            <td class="px-4 py-3" onclick="abrirPerfilCliente('${escapeHTML(c.id)}')">
                <p class="font-medium text-gray-800">${escapeHTML(nombre)}</p>
                <p class="text-xs text-gray-500">${escapeHTML(c.ruc || '')} ${c.encargado ? '| ' + escapeHTML(c.encargado) : ''}</p>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${escapeHTML(c.zona || c.direccion || '-')}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${escapeHTML(tel || '-')}</td>
            <td class="px-4 py-3">${precios > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">${precios}</span>` : '<span class="text-xs text-gray-300">0</span>'}</td>`;
        tbody.appendChild(tr);
    });

    const totalPaginas = Math.ceil(total / clientesPorPagina);
    const pagEl = document.getElementById('paginacionClientes');
    if (pagEl) {
        pagEl.innerHTML = `<span>${total} clientes | Pagina ${paginaClientes} de ${totalPaginas}</span>
        <div class="flex gap-2">
            <sl-button onclick="paginaClientes=1;mostrarClientesGestion()" variant="default" size="small" ${paginaClientes <= 1 ? 'disabled' : ''}>&lt;&lt;</sl-button>
            <sl-button onclick="paginaClientes--;mostrarClientesGestion()" variant="default" size="small" ${paginaClientes <= 1 ? 'disabled' : ''}>&lt;</sl-button>
            <sl-button onclick="paginaClientes++;mostrarClientesGestion()" variant="default" size="small" ${paginaClientes >= totalPaginas ? 'disabled' : ''}>&gt;</sl-button>
            <sl-button onclick="paginaClientes=${totalPaginas};mostrarClientesGestion()" variant="default" size="small" ${paginaClientes >= totalPaginas ? 'disabled' : ''}>&gt;&gt;</sl-button>
        </div>`;
    }
}

async function mostrarClientesPendientes() {
    const pendientes = ((await HDVStorage.getItem('hdv_clientes_pendientes')) || [])
        .filter(c => c.estado === 'pendiente_aprobacion');

    // Buscar o crear el banner de pendientes en la seccion clientes
    let banner = document.getElementById('bannerClientesPendientes');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bannerClientesPendientes';
        const seccion = document.getElementById('seccion-clientes');
        if (seccion) seccion.insertBefore(banner, seccion.firstChild);
    }

    if (pendientes.length === 0) { banner.innerHTML = ''; return; }

    banner.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-bold text-yellow-800 flex items-center gap-1.5"><i data-lucide="clock" class="w-4 h-4"></i> Clientes pendientes de aprobacion (${pendientes.length})</h4>
            </div>
            <div class="space-y-2">
                ${pendientes.map(c => `
                    <div class="bg-white border border-yellow-100 rounded-lg p-3 flex justify-between items-center">
                        <div>
                            <p class="font-bold text-gray-800 text-sm">${escapeHTML(c.nombre)}</p>
                            <p class="text-xs text-gray-500">Tel: ${escapeHTML(c.telefono || '-')} | Zona: ${escapeHTML(c.zona || '-')}${c.direccion ? ' | Dir: ' + escapeHTML(c.direccion) : ''}</p>
                            <p class="text-xs text-gray-400">${new Date(c.fechaSolicitud).toLocaleDateString('es-PY')}</p>
                        </div>
                        <div class="flex gap-2">
                            <sl-button onclick="aprobarClientePendiente('${c.id}')" variant="success" size="small">Aprobar</sl-button>
                            <sl-button onclick="rechazarClientePendiente('${c.id}')" variant="danger" size="small">Rechazar</sl-button>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
}

async function aprobarClientePendiente(id) {
    const pendientes = (await HDVStorage.getItem('hdv_clientes_pendientes')) || [];
    const cliente = pendientes.find(c => c.id === id);
    if (!cliente) return;
    // Generar ID definitivo
    const ultimoId = Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0), 0);
    const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
    const clienteAprobado = { ...cliente, id: nuevoId, estado: 'activo', precios_personalizados: {} };
    delete clienteAprobado.fechaSolicitud;
    productosData.clientes.push(clienteAprobado);
    registrarCambio();
    // Marcar como aprobado
    const idx = pendientes.findIndex(c => c.id === id);
    if (idx >= 0) pendientes.splice(idx, 1);
    await HDVStorage.setItem('hdv_clientes_pendientes', pendientes);
    clientesFiltrados = [...productosData.clientes];
    mostrarClientesGestion();
}

async function rechazarClientePendiente(id) {
    if (!await mostrarConfirmModal('¿Rechazar esta solicitud de cliente?', { destructivo: true, textoConfirmar: 'Rechazar' })) return;
    const pendientes = (await HDVStorage.getItem('hdv_clientes_pendientes')) || [];
    const nuevos = pendientes.filter(c => c.id !== id);
    await HDVStorage.setItem('hdv_clientes_pendientes', nuevos);
    mostrarClientesPendientes();
}

function enviarWhatsAppCliente(telefono, nombre) {
    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    const msg = `Hola ${nombre}, le saludamos de HDV Distribuciones. `;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

function toggleOcultarCliente(id) {
    const c = productosData.clientes.find(x => x.id === id);
    if (c) { c.oculto = !c.oculto; registrarCambio(); filtrarClientes(); }
}

async function eliminarCliente(id) {
    if (!await mostrarConfirmModal('¿Eliminar este cliente y sus precios personalizados?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.clientes = productosData.clientes.filter(c => c.id !== id);
    clientesFiltrados = clientesFiltrados.filter(c => c.id !== id);
    registrarCambio();
    mostrarClientesGestion();
}

// Modal Cliente (crear/editar)
function abrirModalCliente(clienteId) {
    const titulo = document.getElementById('modalClienteTitulo');
    const formId = document.getElementById('formClienteId');
    if (clienteId) {
        const c = productosData.clientes.find(x => x.id === clienteId);
        if (!c) return;
        titulo.textContent = 'Editar Cliente';
        formId.value = c.id;
        document.getElementById('nuevoClienteRazon').value = c.razon_social || c.nombre || '';
        document.getElementById('nuevoClienteRUC').value = c.ruc || '';
        document.getElementById('nuevoClienteTelefono').value = c.telefono || '';
        document.getElementById('nuevoClienteDireccion').value = c.direccion || '';
        document.getElementById('nuevoClienteZona').value = c.zona || '';
        document.getElementById('nuevoClienteEncargado').value = c.encargado || '';
        document.getElementById('nuevoClienteTipoDoc').value = c.tipo_documento || 'RUC';
    } else {
        titulo.textContent = 'Nuevo Cliente';
        formId.value = '';
        ['nuevoClienteRazon','nuevoClienteRUC','nuevoClienteTelefono','nuevoClienteDireccion','nuevoClienteZona','nuevoClienteEncargado'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('nuevoClienteTipoDoc').value = 'RUC';
    }
    document.getElementById('modalCliente')?.show();
}

function editarCliente(id) { abrirModalCliente(id); }

function cerrarModalCliente() {
    document.getElementById('modalCliente')?.hide();
}

async function guardarClienteModal() {
    const id = document.getElementById('formClienteId')?.value;
    const razon = document.getElementById('nuevoClienteRazon')?.value.trim();
    const ruc = document.getElementById('nuevoClienteRUC')?.value.trim();
    const telefono = document.getElementById('nuevoClienteTelefono')?.value.trim();
    const direccion = document.getElementById('nuevoClienteDireccion')?.value.trim();
    const zona = document.getElementById('nuevoClienteZona')?.value.trim();
    const encargado = document.getElementById('nuevoClienteEncargado')?.value.trim();
    const tipoDocumento = document.getElementById('nuevoClienteTipoDoc')?.value || 'RUC';

    if (!razon) { mostrarToast('Ingresa la razon social', 'error'); return; }

    await withButtonLock('btnGuardarCliente', async () => {
        if (id) {
            // Edicion
            const c = productosData.clientes.find(x => x.id === id);
            if (c) {
                c.nombre = razon; c.razon_social = razon;
                c.ruc = ruc; c.telefono = telefono;
                c.direccion = direccion; c.zona = zona || direccion;
                c.encargado = encargado;
                c.tipo_documento = tipoDocumento;
                c.pais_documento = c.pais_documento || 'PRY';
            }
        } else {
            // Creacion
            const ultimoId = productosData.clientes.length > 0 ?
                Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0)) : 0;
            const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
            productosData.clientes.push({
                id: nuevoId, nombre: razon, razon_social: razon, ruc: ruc || '',
                telefono: telefono || '', direccion: direccion || '', zona: zona || direccion || '',
                encargado: encargado || '', tipo: 'mayorista_estandar', precios_personalizados: {},
                tipo_documento: tipoDocumento, pais_documento: 'PRY'
            });
        }

        clientesFiltrados = [...productosData.clientes];
        registrarCambio();
        mostrarClientesGestion();
        cerrarModalCliente();
    }, 'Guardando...')();
}

// ============================================
// PERFIL DE CLIENTE (Master-Detail)
// ============================================

async function abrirPerfilCliente(clienteId) {
    const cliente = productosData.clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    clientePerfilActual = cliente;
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clienteId);
    const nombre = cliente.razon_social || cliente.nombre || clienteId;

    await _cargarVendedorNombreCache();

    // Header
    const nombreEl = document.getElementById('perfilClienteNombre');
    nombreEl.textContent = nombre;
    const ultimoPedidoGlobal = pedidosCliente.length > 0
        ? pedidosCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] : null;
    const diasInactivo = ultimoPedidoGlobal
        ? Math.floor((new Date() - new Date(ultimoPedidoGlobal.fecha)) / 86400000) : 999;
    const badgeEl = document.getElementById('perfilInactivoBadge');
    if (badgeEl) {
        if (diasInactivo >= 15 && ultimoPedidoGlobal) {
            const nivel = diasInactivo >= 60 ? 'PERDIDO' : diasInactivo >= 30 ? 'EN RIESGO' : 'ATENCION';
            const color = diasInactivo >= 60 ? 'bg-gray-800 text-white' : diasInactivo >= 30 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
            badgeEl.className = `text-xs px-2 py-0.5 rounded-full font-bold ml-2 ${color}`;
            badgeEl.textContent = `${nivel} (${diasInactivo}d)`;
            badgeEl.style.display = '';
        } else {
            badgeEl.style.display = 'none';
        }
    }
    document.getElementById('perfilClienteInfo').textContent = `${cliente.id} | ${cliente.zona || ''} | Tel: ${cliente.telefono || '-'} | RUC: ${cliente.ruc || '-'}`;

    // WhatsApp button
    const waBtn = document.getElementById('perfilWhatsAppBtn');
    if (cliente.telefono) {
        waBtn.style.display = '';
        waBtn.onclick = () => enviarWhatsAppCliente(cliente.telefono, nombre);
    } else {
        waBtn.style.display = 'none';
    }

    // Botones Editar / Ocultar / Eliminar
    const editarBtn = document.getElementById('perfilClienteEditarBtn');
    if (editarBtn) editarBtn.onclick = () => { cerrarPerfilCliente(); editarCliente(clienteId); };

    const ocultarBtn = document.getElementById('perfilClienteOcultarBtn');
    if (ocultarBtn) {
        ocultarBtn.textContent = cliente.oculto ? 'Mostrar' : 'Ocultar';
        ocultarBtn.className = cliente.oculto
            ? 'bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold'
            : 'bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-bold';
        ocultarBtn.onclick = () => { cerrarPerfilCliente(); toggleOcultarCliente(clienteId); };
    }

    const eliminarBtn = document.getElementById('perfilClienteEliminarBtn');
    if (eliminarBtn) eliminarBtn.onclick = () => { cerrarPerfilCliente(); eliminarCliente(clienteId); };

    // Stats
    const totalComprado = pedidosCliente.reduce((s, p) => s + (p.total || 0), 0);
    const ultimoPedido = pedidosCliente.length > 0 ?
        pedidosCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] : null;
    const preciosEsp = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;

    document.getElementById('perfilTotalComprado').textContent = formatearGuaranies(totalComprado);
    document.getElementById('perfilTotalPedidos').textContent = pedidosCliente.length;
    document.getElementById('perfilUltimoPedido').textContent = ultimoPedido ? new Date(ultimoPedido.fecha).toLocaleDateString('es-PY') : '-';
    document.getElementById('perfilPreciosEsp').textContent = preciosEsp;

    cambiarTabPerfil('precios');
    document.getElementById('modalPerfilCliente')?.show();
}

function cerrarPerfilCliente() {
    document.getElementById('modalPerfilCliente')?.hide();
    clientePerfilActual = null;
}

function cambiarTabPerfil(tab) {
    ['precios', 'historial', 'estadisticas'].forEach(t => {
        const el = document.getElementById('perfilTab-' + t);
        const btn = document.getElementById('tabPerfil-' + t);
        if (el) el.style.display = t === tab ? '' : 'none';
        if (btn) {
            btn.className = t === tab
                ? 'px-6 py-3 text-sm font-bold border-b-2 border-gray-800 text-gray-800'
                : 'px-6 py-3 text-sm font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-600';
        }
    });
    if (!clientePerfilActual) return;
    if (tab === 'precios') renderizarPerfilPrecios();
    if (tab === 'historial') renderizarPerfilHistorial();
    if (tab === 'estadisticas') renderizarPerfilEstadisticas();
}

function renderizarPerfilPrecios() {
    const container = document.getElementById('perfilTab-precios');
    const cliente = clientePerfilActual;
    if (!container || !cliente) return;

    let html = `<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-gray-700">Precios Especiales</h4>
        <div class="flex gap-2 flex-wrap">
            <sl-button onclick="aplicarDescuentoCategoria()" variant="neutral" size="small">% Categoria</sl-button>
            <sl-button onclick="copiarPreciosDeCliente()" variant="neutral" size="small">Copiar de otro</sl-button>
            <sl-button onclick="importarPreciosCSV()" variant="neutral" size="small">Importar CSV</sl-button>
            <sl-button onclick="agregarPrecioEspecial()" variant="primary" size="small">+ Agregar</sl-button>
        </div></div>`;

    const precios = cliente.precios_personalizados || {};
    const keys = Object.keys(precios);
    if (keys.length === 0) {
        html += '<p class="text-gray-400 italic text-sm">Sin precios especiales configurados</p>';
    } else {
        html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-left">Presentacion</th><th class="px-4 py-2 text-left">Precio Base</th><th class="px-4 py-2 text-left">Precio Especial</th><th class="px-4 py-2">Accion</th></tr></thead><tbody class="divide-y">';
        keys.forEach(prodId => {
            const prod = productosData.productos.find(p => p.id === prodId);
            (precios[prodId] || []).forEach(pe => {
                const pres = prod?.presentaciones.find(p => p.tamano === pe.tamano);
                const precioBase = pres?.precio_base || 0;
                html += `<tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 font-medium">${escapeHTML(prod?.nombre || prodId)}</td>
                    <td class="px-4 py-2 text-gray-500">${escapeHTML(pe.tamano)}</td>
                    <td class="px-4 py-2 text-gray-400">${formatearGuaranies(precioBase)}</td>
                    <td class="px-4 py-2 font-bold text-blue-700">${formatearGuaranies(pe.precio)}</td>
                    <td class="px-4 py-2 text-center"><sl-button onclick="eliminarPrecioEspecial('${escapeHTML(prodId)}','${escapeHTML(pe.tamano)}')" variant="text" size="small">x</sl-button></td>
                </tr>`;
            });
        });
        html += '</tbody></table>';
    }
    container.innerHTML = html;
}

async function agregarPrecioEspecial() {
    if (!clientePerfilActual) return;

    // Paso 1: seleccionar producto con busqueda
    const prodOpts = (productosData.productos || [])
        .filter(p => !p.oculto && p.estado !== 'discontinuado')
        .map(p => ({ value: p.id, label: `${p.nombre} (${p.presentaciones.map(pr => pr.tamano).join(', ')})` }));

    const datosP = await mostrarInputModal({
        titulo: 'Agregar Precio Especial',
        subtitulo: `Cliente: ${clientePerfilActual.razon_social || clientePerfilActual.nombre}`,
        icono: 'tag',
        campos: [
            { key: 'productoId', label: 'Producto', tipo: 'select-search', opciones: prodOpts, requerido: true }
        ],
        textoConfirmar: 'Siguiente'
    });
    if (!datosP) return;
    const prod = productosData.productos.find(p => p.id === datosP.productoId);
    if (!prod) { mostrarToast('Producto no encontrado', 'error'); return; }

    // Paso 2: seleccionar presentacion y precio
    const presOpts = prod.presentaciones.map(p => ({
        value: p.tamano,
        label: `${p.tamano} — Precio base: ${formatearGuaranies(p.precio_base)}`
    }));

    const camposPrecio = [
        { key: 'precio', label: 'Precio especial (Gs.)', tipo: 'number', placeholder: '0', requerido: true }
    ];
    if (prod.presentaciones.length > 1) {
        camposPrecio.unshift({ key: 'tamano', label: 'Presentacion', tipo: 'select', opciones: presOpts, requerido: true });
    }

    const datosPrec = await mostrarInputModal({
        titulo: `Precio Especial — ${prod.nombre}`,
        icono: 'tag',
        campos: camposPrecio,
        textoConfirmar: 'Guardar Precio'
    });
    if (!datosPrec) return;

    const tamano = datosPrec.tamano || prod.presentaciones[0]?.tamano;
    const precio = datosPrec.precio;
    if (precio <= 0) { mostrarToast('Precio invalido', 'error'); return; }

    if (!clientePerfilActual.precios_personalizados) clientePerfilActual.precios_personalizados = {};
    if (!clientePerfilActual.precios_personalizados[prod.id]) clientePerfilActual.precios_personalizados[prod.id] = [];
    const existing = clientePerfilActual.precios_personalizados[prod.id].findIndex(p => p.tamano === tamano);
    if (existing >= 0) clientePerfilActual.precios_personalizados[prod.id][existing].precio = precio;
    else clientePerfilActual.precios_personalizados[prod.id].push({ tamano, precio });

    registrarCambio();
    renderizarPerfilPrecios();
    mostrarToast('Precio especial guardado', 'success');
}

function eliminarPrecioEspecial(prodId, tamano) {
    if (!clientePerfilActual) return;
    const precios = clientePerfilActual.precios_personalizados;
    if (precios && precios[prodId]) {
        precios[prodId] = precios[prodId].filter(p => p.tamano !== tamano);
        if (precios[prodId].length === 0) delete precios[prodId];
        registrarCambio();
        renderizarPerfilPrecios();
    }
}

async function aplicarDescuentoCategoria() {
    if (!clientePerfilActual) return;
    const categorias = productosData.categorias || [];
    const catOpts = categorias.filter(c => c.estado !== 'discontinuado').map(c => ({ value: c.id, label: c.nombre }));

    const datos = await mostrarInputModal({
        titulo: 'Descuento por Categoria',
        subtitulo: `Aplicar descuento a todos los productos de una categoria para ${clientePerfilActual.razon_social || clientePerfilActual.nombre}`,
        icono: 'percent',
        campos: [
            { key: 'categoriaId', label: 'Categoria', tipo: 'select', opciones: catOpts, requerido: true },
            { key: 'descuento', label: 'Descuento (%)', tipo: 'number', placeholder: '10', requerido: true }
        ],
        textoConfirmar: 'Aplicar Descuento'
    });
    if (!datos || !datos.descuento) return;
    if (datos.descuento <= 0 || datos.descuento > 50) { mostrarToast('Descuento debe ser entre 1% y 50%', 'error'); return; }

    const prodsCat = (productosData.productos || []).filter(p => p.categoria === datos.categoriaId && !p.oculto && p.estado !== 'discontinuado');
    if (prodsCat.length === 0) { mostrarToast('No hay productos en esa categoria', 'warning'); return; }

    if (!clientePerfilActual.precios_personalizados) clientePerfilActual.precios_personalizados = {};
    let count = 0;
    prodsCat.forEach(prod => {
        (prod.presentaciones || []).filter(pr => pr.activo !== false).forEach(pres => {
            const precioDesc = Math.round(pres.precio_base * (1 - datos.descuento / 100));
            if (!clientePerfilActual.precios_personalizados[prod.id]) clientePerfilActual.precios_personalizados[prod.id] = [];
            const arr = clientePerfilActual.precios_personalizados[prod.id];
            const idx = arr.findIndex(p => p.tamano === pres.tamano);
            if (idx >= 0) arr[idx].precio = precioDesc;
            else arr.push({ tamano: pres.tamano, precio: precioDesc });
            count++;
        });
    });

    registrarCambio();
    renderizarPerfilPrecios();
    mostrarExito(`${count} precios actualizados con ${datos.descuento}% descuento`);
}

async function copiarPreciosDeCliente() {
    if (!clientePerfilActual) return;
    const clienteOpts = (productosData.clientes || [])
        .filter(c => c.id !== clientePerfilActual.id && !c.oculto && c.precios_personalizados && Object.keys(c.precios_personalizados).length > 0)
        .map(c => ({ value: c.id, label: `${c.razon_social || c.nombre} (${Object.keys(c.precios_personalizados).length} productos)` }));

    if (clienteOpts.length === 0) { mostrarToast('No hay otros clientes con precios especiales', 'warning'); return; }

    const datos = await mostrarInputModal({
        titulo: 'Copiar Precios de Otro Cliente',
        subtitulo: `Los precios existentes seran reemplazados`,
        icono: 'copy',
        campos: [
            { key: 'clienteOrigen', label: 'Copiar de', tipo: 'select-search', opciones: clienteOpts, requerido: true }
        ],
        textoConfirmar: 'Copiar Precios'
    });
    if (!datos) return;

    const origen = productosData.clientes.find(c => c.id === datos.clienteOrigen);
    if (!origen || !origen.precios_personalizados) return;

    clientePerfilActual.precios_personalizados = JSON.parse(JSON.stringify(origen.precios_personalizados));
    registrarCambio();
    renderizarPerfilPrecios();
    const total = Object.values(clientePerfilActual.precios_personalizados).reduce((s, arr) => s + arr.length, 0);
    mostrarExito(`${total} precios copiados de ${origen.razon_social || origen.nombre}`);
}

async function importarPreciosCSV() {
    if (!clientePerfilActual) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) { mostrarToast('CSV vacio o invalido', 'error'); return; }

        if (!clientePerfilActual.precios_personalizados) clientePerfilActual.precios_personalizados = {};
        let count = 0;
        let errores = 0;
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
            if (cols.length < 3) { errores++; continue; }
            const [prodId, presentacion, precioStr] = cols;
            const precio = parseInt(precioStr);
            if (!prodId || !presentacion || !precio || precio <= 0) { errores++; continue; }

            const prod = productosData.productos.find(p => p.id === prodId || p.nombre === prodId);
            if (!prod) { errores++; continue; }

            if (!clientePerfilActual.precios_personalizados[prod.id]) clientePerfilActual.precios_personalizados[prod.id] = [];
            const arr = clientePerfilActual.precios_personalizados[prod.id];
            const idx = arr.findIndex(p => p.tamano === presentacion);
            if (idx >= 0) arr[idx].precio = precio;
            else arr.push({ tamano: presentacion, precio });
            count++;
        }

        registrarCambio();
        renderizarPerfilPrecios();
        mostrarToast(`${count} precios importados${errores > 0 ? `, ${errores} filas con error` : ''}`, count > 0 ? 'success' : 'warning');
    };
    input.click();
}

async function renderizarPerfilHistorial() {
    const container = document.getElementById('perfilTab-historial');
    if (!container || !clientePerfilActual) return;
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    let pedidosCliente = pedidos.filter(p => p.cliente?.id === clientePerfilActual.id)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const hoy = new Date();
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
    const desdeVal = document.getElementById('historialDesde')?.value || '';
    const hastaVal = document.getElementById('historialHasta')?.value || '';
    const tipoPagoVal = document.getElementById('historialTipoPago')?.value || '';
    const estadoVal = document.getElementById('historialEstado')?.value || '';

    if (desdeVal) pedidosCliente = pedidosCliente.filter(p => (p.fecha || '').slice(0, 10) >= desdeVal);
    if (hastaVal) pedidosCliente = pedidosCliente.filter(p => (p.fecha || '').slice(0, 10) <= hastaVal);
    if (tipoPagoVal) pedidosCliente = pedidosCliente.filter(p => (p.tipoPago || 'contado') === tipoPagoVal);
    if (estadoVal) pedidosCliente = pedidosCliente.filter(p => p.estado === estadoVal);

    const totalFiltrado = pedidosCliente.reduce((s, p) => s + (p.total || 0), 0);

    let html = `<div class="flex flex-wrap gap-2 mb-4 items-end">
        <div><label class="text-xs text-gray-500">Desde</label><sl-input id="historialDesde" type="date" size="small" value="${escapeHTML(desdeVal)}"></sl-input></div>
        <div><label class="text-xs text-gray-500">Hasta</label><sl-input id="historialHasta" type="date" size="small" value="${escapeHTML(hastaVal)}"></sl-input></div>
        <div><label class="text-xs text-gray-500">Tipo Pago</label>
            <sl-select id="historialTipoPago" size="small" value="${escapeHTML(tipoPagoVal)}" placeholder="Todos" clearable>
                <sl-option value="contado">Contado</sl-option>
                <sl-option value="credito">Credito</sl-option>
            </sl-select></div>
        <div><label class="text-xs text-gray-500">Estado</label>
            <sl-select id="historialEstado" size="small" value="${escapeHTML(estadoVal)}" placeholder="Todos" clearable>
                <sl-option value="pedido_pendiente">Pendiente</sl-option>
                <sl-option value="entregado">Entregado</sl-option>
                <sl-option value="facturado_mock">Facturado</sl-option>
                <sl-option value="cobrado_sin_factura">Cobrado</sl-option>
                <sl-option value="anulado">Anulado</sl-option>
            </sl-select></div>
        <sl-button onclick="renderizarPerfilHistorial()" variant="neutral" size="small">Filtrar</sl-button>
        <sl-button onclick="exportarHistorialClienteCSV()" variant="text" size="small">CSV</sl-button>
    </div>`;

    html += `<p class="text-xs text-gray-500 mb-3">${pedidosCliente.length} pedidos | Total: ${formatearGuaranies(totalFiltrado)}</p>`;

    if (pedidosCliente.length === 0) {
        html += '<p class="text-gray-400 italic text-sm">Sin pedidos para los filtros seleccionados</p>';
    } else {
        html += '<div class="space-y-3">' + pedidosCliente.map(p => {
            const items = (p.items || []).map(i => `${escapeHTML(i.nombre)} x${i.cantidad}`).join(', ');
            const { clases: estadoColor, label: estadoLabel } = obtenerEstadoUI(p.estado, '700');
            return `<div class="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 transition-colors" onclick="mostrarDetallePedidoCliente('${p.id}')">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs text-gray-400">${new Date(p.fecha).toLocaleDateString('es-PY')} | ${escapeHTML(p.id)}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full font-bold ${estadoColor}">${estadoLabel}</span>
                </div>
                <p class="text-sm text-gray-600">${items || 'Sin items'}</p>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-xs text-gray-400">${escapeHTML(p.tipoPago || 'contado')}${p.vendedor_id ? ' | ' + escapeHTML(_getNombreVendedorCache(p.vendedor_id)) : ''}</span>
                    <span class="font-bold text-gray-800">${formatearGuaranies(p.total)}</span>
                </div>
            </div>`;
        }).join('') + '</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('sl-input[type="date"], sl-select').forEach(el => {
        el.addEventListener('sl-change', () => renderizarPerfilHistorial());
    });
}

let _vendedorNombreCache = null;
async function _cargarVendedorNombreCache() {
    if (_vendedorNombreCache) return;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo');
        _vendedorNombreCache = {};
        (data || []).forEach(p => { _vendedorNombreCache[p.id] = p.nombre_completo || 'Sin nombre'; });
    } catch (e) { _vendedorNombreCache = {}; }
}
function _getNombreVendedorCache(id) {
    return (_vendedorNombreCache && _vendedorNombreCache[id]) || '';
}

async function mostrarDetallePedidoCliente(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const p = pedidos.find(x => x.id === pedidoId);
    if (!p) return;

    await _cargarVendedorNombreCache();
    const { clases: estadoColor, label: estadoLabel } = obtenerEstadoUI(p.estado, '700');
    const vendNombre = _getNombreVendedorCache(p.vendedor_id);

    let html = `<div class="mb-4">
        <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-gray-800">${escapeHTML(p.id)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-bold ${estadoColor}">${estadoLabel}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm">
            <p><span class="text-gray-500">Fecha:</span> ${new Date(p.fecha).toLocaleString('es-PY')}</p>
            <p><span class="text-gray-500">Tipo pago:</span> ${escapeHTML(p.tipoPago || 'contado')}</p>
            ${vendNombre ? `<p><span class="text-gray-500">Vendedor:</span> ${escapeHTML(vendNombre)}</p>` : ''}
            ${p.numFactura ? `<p><span class="text-gray-500">Factura:</span> ${escapeHTML(p.numFactura)}</p>` : ''}
            ${p.notas ? `<p class="col-span-2"><span class="text-gray-500">Notas:</span> ${escapeHTML(p.notas)}</p>` : ''}
        </div>
    </div>
    <table class="w-full text-sm"><thead class="bg-gray-50"><tr>
        <th class="px-3 py-2 text-left">Producto</th>
        <th class="px-3 py-2 text-left">Presentacion</th>
        <th class="px-3 py-2 text-right">Precio</th>
        <th class="px-3 py-2 text-right">Cant.</th>
        <th class="px-3 py-2 text-right">Subtotal</th>
    </tr></thead><tbody>`;
    (p.items || []).forEach(i => {
        html += `<tr class="border-b"><td class="px-3 py-2">${escapeHTML(i.nombre || '')}</td>
            <td class="px-3 py-2">${escapeHTML(i.presentacion || i.tamano || '')}</td>
            <td class="px-3 py-2 text-right">${formatearGuaranies(i.precio || 0)}</td>
            <td class="px-3 py-2 text-right">${i.cantidad || 0}</td>
            <td class="px-3 py-2 text-right font-bold">${formatearGuaranies(i.subtotal || (i.precio * i.cantidad) || 0)}</td></tr>`;
    });
    html += `</tbody><tfoot><tr class="bg-gray-50 font-bold">
        <td colspan="4" class="px-3 py-2 text-right">TOTAL:</td>
        <td class="px-3 py-2 text-right">${formatearGuaranies(p.total)}</td>
    </tr></tfoot></table>`;

    const result = await mostrarConfirmModal(html, { textoConfirmar: 'Cerrar', titulo: 'Detalle del Pedido', ocultarCancelar: true, html: true });
}

function exportarHistorialClienteCSV() {
    if (!clientePerfilActual) return;
    const container = document.getElementById('perfilTab-historial');
    if (!container) return;

    HDVStorage.getItem('hdv_pedidos', { clone: false }).then(allPedidos => {
        let pedidos = (allPedidos || []).filter(p => p.cliente?.id === clientePerfilActual.id)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const desdeVal = document.getElementById('historialDesde')?.value || '';
        const hastaVal = document.getElementById('historialHasta')?.value || '';
        const tipoPagoVal = document.getElementById('historialTipoPago')?.value || '';
        const estadoVal = document.getElementById('historialEstado')?.value || '';

        if (desdeVal) pedidos = pedidos.filter(p => (p.fecha || '').slice(0, 10) >= desdeVal);
        if (hastaVal) pedidos = pedidos.filter(p => (p.fecha || '').slice(0, 10) <= hastaVal);
        if (tipoPagoVal) pedidos = pedidos.filter(p => (p.tipoPago || 'contado') === tipoPagoVal);
        if (estadoVal) pedidos = pedidos.filter(p => p.estado === estadoVal);

        let csv = '﻿';
        csv += 'Fecha,ID,Estado,Tipo Pago,Items,Total\n';
        pedidos.forEach(p => {
            const items = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join('; ');
            csv += `${(p.fecha || '').slice(0, 10)},"${p.id}","${p.estado || ''}","${p.tipoPago || 'contado'}","${items}",${p.total || 0}\n`;
        });

        const nombre = clientePerfilActual.razon_social || clientePerfilActual.nombre || clientePerfilActual.id;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Historial_${nombre.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        mostrarExito('CSV descargado');
    });
}

async function renderizarPerfilEstadisticas() {
    if (!clientePerfilActual) return;
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clientePerfilActual.id);
    const hoy = new Date();

    // Top 5 productos con ultima compra y tendencia
    const conteoProductos = {};
    pedidosCliente.forEach(p => {
        (p.items || []).forEach(item => {
            const key = item.nombre || item.productoId;
            if (!conteoProductos[key]) conteoProductos[key] = { total: 0, ultimaFecha: null, reciente: 0, anterior: 0 };
            const info = conteoProductos[key];
            info.total += (item.cantidad || 1);
            if (!info.ultimaFecha || p.fecha > info.ultimaFecha) info.ultimaFecha = p.fecha;
            const hace3m = new Date(hoy); hace3m.setMonth(hace3m.getMonth() - 3);
            const hace6m = new Date(hoy); hace6m.setMonth(hace6m.getMonth() - 6);
            const pFecha = new Date(p.fecha);
            if (pFecha >= hace3m) info.reciente += (item.cantidad || 1);
            else if (pFecha >= hace6m) info.anterior += (item.cantidad || 1);
        });
    });
    const top5 = Object.entries(conteoProductos).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    const topEl = document.getElementById('perfilTopProductos');
    if (topEl) {
        topEl.innerHTML = top5.length === 0 ? '<p class="text-gray-400 italic text-sm">Sin datos</p>' :
            top5.map(([nombre, info], i) => {
                const tendencia = info.reciente > info.anterior ? '↑' : info.reciente < info.anterior ? '↓' : '=';
                const tColor = tendencia === '↑' ? 'text-green-600' : tendencia === '↓' ? 'text-red-600' : 'text-gray-400';
                const ultimaStr = info.ultimaFecha ? new Date(info.ultimaFecha).toLocaleDateString('es-PY') : '-';
                return `<div class="flex justify-between items-center py-1.5 ${i < 4 ? 'border-b border-gray-100' : ''}">
                    <div><span class="text-sm text-gray-700">${i + 1}. ${escapeHTML(nombre)}</span>
                    <span class="text-xs text-gray-400 ml-1">Ult: ${ultimaStr}</span></div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold ${tColor}">${tendencia}</span>
                        <span class="text-sm font-bold text-gray-800">${info.total} unid.</span>
                    </div>
                </div>`;
            }).join('');
    }

    // Grafico ultimos 6 meses
    const meses = [];
    const montos = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const mesKey = d.toISOString().slice(0, 7);
        const mesNombre = d.toLocaleDateString('es-PY', { month: 'short' });
        const total = pedidosCliente.filter(p => p.fecha && p.fecha.startsWith(mesKey))
            .reduce((s, p) => s + (p.total || 0), 0);
        meses.push(mesNombre);
        montos.push(total);
    }

    const canvas = document.getElementById('chartPerfilCliente');
    if (canvas && typeof Chart !== 'undefined') {
        if (chartPerfilClienteInstance) chartPerfilClienteInstance.destroy();
        chartPerfilClienteInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: meses, datasets: [{ label: 'Compras (Gs.)', data: montos, backgroundColor: '#3b82f6', borderRadius: 6 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v/1000) + 'k' } } } }
        });
    }

    // Desglose por periodo
    const desglose = document.getElementById('perfilDesglosePeriodo');
    if (desglose) {
        const mesActual = hoy.toISOString().slice(0, 7);
        const totalMes = pedidosCliente.filter(p => p.fecha?.startsWith(mesActual)).reduce((s, p) => s + (p.total || 0), 0);
        const hace6m = new Date(hoy); hace6m.setMonth(hace6m.getMonth() - 6);
        const total6m = pedidosCliente.filter(p => new Date(p.fecha) >= hace6m).reduce((s, p) => s + (p.total || 0), 0);
        const hace1a = new Date(hoy); hace1a.setFullYear(hace1a.getFullYear() - 1);
        const total1a = pedidosCliente.filter(p => new Date(p.fecha) >= hace1a).reduce((s, p) => s + (p.total || 0), 0);
        desglose.innerHTML = `
            <div class="bg-blue-50 rounded-lg p-3 text-center"><p class="text-xs text-blue-600 font-bold">ESTE MES</p><p class="text-lg font-bold text-blue-800">${formatearGuaranies(totalMes)}</p></div>
            <div class="bg-green-50 rounded-lg p-3 text-center"><p class="text-xs text-green-600 font-bold">ULTIMOS 6 MESES</p><p class="text-lg font-bold text-green-800">${formatearGuaranies(total6m)}</p></div>
            <div class="bg-purple-50 rounded-lg p-3 text-center"><p class="text-xs text-purple-600 font-bold">ULTIMO ANO</p><p class="text-lg font-bold text-purple-800">${formatearGuaranies(total1a)}</p></div>`;
    }
}

// ============================================
// CLIENTES EN RIESGO (INACTIVOS)
// ============================================

async function cargarClientesInactivos() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const clientesData = productosData.clientes || [];
    const filtro = document.getElementById('filtroInactivos')?.value || 'todos';
    const hoy = new Date();

    // Calcular ultimo pedido y frecuencia por cliente
    const analisis = clientesData.filter(c => !c.oculto).map(cliente => {
        const pedidosCliente = pedidos.filter(p => p.cliente?.id === cliente.id);
        const ultimoPedido = pedidosCliente.length > 0
            ? pedidosCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]
            : null;

        const diasInactivo = ultimoPedido
            ? Math.floor((hoy - new Date(ultimoPedido.fecha)) / 86400000)
            : 999;

        const totalHistorico = pedidosCliente.reduce((sum, p) => sum + (p.total || 0), 0);
        const cantidadPedidos = pedidosCliente.length;

        // Calcular promedio mensual (ultimos 3 meses)
        const hace3Meses = new Date(hoy);
        hace3Meses.setMonth(hace3Meses.getMonth() - 3);
        const pedidosRecientes = pedidosCliente.filter(p => new Date(p.fecha) >= hace3Meses);
        const promedioMensual = pedidosRecientes.length > 0
            ? Math.round(pedidosRecientes.reduce((s, p) => s + (p.total || 0), 0) / 3)
            : Math.round(totalHistorico / Math.max(1, cantidadPedidos));

        let nivel = 'activo';
        if (diasInactivo >= 60) nivel = 'perdido';
        else if (diasInactivo >= 30) nivel = 'riesgo';
        else if (diasInactivo >= 15) nivel = 'atencion';

        return {
            cliente,
            ultimoPedido,
            diasInactivo,
            totalHistorico,
            cantidadPedidos,
            promedioMensual,
            nivel
        };
    });

    // Filtrar solo inactivos (15+ dias)
    let inactivos = analisis.filter(a => a.nivel !== 'activo');
    inactivos.sort((a, b) => b.diasInactivo - a.diasInactivo);

    if (filtro !== 'todos') {
        inactivos = inactivos.filter(a => a.nivel === filtro);
    }

    // Stats
    const atencion = analisis.filter(a => a.nivel === 'atencion').length;
    const riesgo = analisis.filter(a => a.nivel === 'riesgo').length;
    const perdidos = analisis.filter(a => a.nivel === 'perdido').length;
    const ingresoRiesgo = analisis
        .filter(a => a.nivel !== 'activo')
        .reduce((sum, a) => sum + a.promedioMensual, 0);

    document.getElementById('inactivosAtencion').textContent = atencion;
    document.getElementById('inactivosRiesgo').textContent = riesgo;
    document.getElementById('inactivosPerdidos').textContent = perdidos;
    document.getElementById('inactivosIngreso').textContent = formatearGuaranies(ingresoRiesgo);

    // Renderizar lista
    const container = document.getElementById('inactivosContainer');
    if (inactivos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:120px;height:120px">
                <circle cx="100" cy="80" r="40" stroke="#86efac" stroke-width="3" fill="#f0fdf4"/>
                <path d="M82 80l12 12 24-24" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M60 145h80" stroke="#bbf7d0" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p style="color:#166534">Todos los clientes estan activos</p>
            <p class="empty-sub">No hay clientes en riesgo de inactividad</p>
        </div>`;
        return;
    }

    container.innerHTML = inactivos.map(a => {
        const nombre = a.cliente.razon_social || a.cliente.nombre || a.cliente.id;
        const zona = a.cliente.zona || '-';
        const tel = a.cliente.telefono || '';
        const badgeColor = a.nivel === 'perdido' ? 'bg-gray-800 text-white' :
                           a.nivel === 'riesgo' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
        const badgeText = a.nivel === 'perdido' ? 'PERDIDO' :
                          a.nivel === 'riesgo' ? 'EN RIESGO' : 'ATENCION';
        const ultimaFecha = a.ultimoPedido ? new Date(a.ultimoPedido.fecha).toLocaleDateString('es-PY') : 'Nunca';

        return `
        <div class="p-4 hover:bg-gray-50 transition-colors">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <p class="font-bold text-gray-800">${escapeHTML(nombre)}</p>
                        <span class="text-xs px-2 py-0.5 rounded-full font-bold ${badgeColor}">${badgeText}</span>
                    </div>
                    <p class="text-sm text-gray-500">Zona: ${escapeHTML(zona)} | ${a.cantidadPedidos} pedidos historicos</p>
                    <p class="text-xs text-gray-400 mt-1">Ultimo pedido: ${ultimaFecha} (hace ${a.diasInactivo} dias) | Total historico: ${formatearGuaranies(a.totalHistorico)}</p>
                    <p class="text-xs text-blue-600 mt-1">Promedio mensual estimado: ${formatearGuaranies(a.promedioMensual)}</p>
                </div>
                <div class="flex gap-2 ml-4">
                    ${tel ? `<sl-button onclick="enviarWhatsAppReactivacion('${escapeHTML(tel)}', '${escapeHTML(nombre.replace(/'/g, ''))}')" variant="success" size="small"><i data-lucide="send" class="w-3 h-3"></i> WhatsApp</sl-button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function enviarWhatsAppReactivacion(telefono, nombre) {
    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    const mensaje = `Hola ${nombre}, desde HDV Distribuciones le saludamos! Hace un tiempo que no nos visita y queremos ofrecerle nuestras ultimas promociones. Estamos para servirle! Contactenos para su proximo pedido.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// ============================================
// DEBOUNCED SEARCH WRAPPER (300ms)
// ============================================
const filtrarClientesDebounced = debounce(filtrarClientes, 300);

// ============================================
// SHOELACE EVENT LISTENERS (sl-change replaces native onchange)
// ============================================
(function _initClientesShoelaceListeners() {
    document.getElementById('filtroZonaCliente')?.addEventListener('sl-change', () => filtrarClientes());
    document.getElementById('mostrarOcultosClientes')?.addEventListener('sl-change', () => filtrarClientes());
    document.getElementById('filtroInactivos')?.addEventListener('sl-change', () => cargarClientesInactivos());
})();