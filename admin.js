// HDV Admin v4.0 - Pipeline: NUEVO→REVISADO→PREPARADO→EN RUTA→ENTREGADO
let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosFiltrados = [];
let clientesFiltrados = [];
let clienteActualPrecios = null;
let tipoReporte = 'zona';
let vistaPipeline = 'kanban';
let filtroEstadoPipe = '';
let editandoPedidoId = null;
let parcialPedidoId = null;

// Pipeline states config
const ESTADOS = {
    nuevo:        { label:'NUEVO', color:'#f59e0b', bg:'#fef3c7', icon:'🟡', next:'revisado' },
    revisado:     { label:'REVISADO', color:'#3b82f6', bg:'#dbeafe', icon:'🔵', next:'preparado' },
    preparado:    { label:'PREPARADO', color:'#8b5cf6', bg:'#ede9fe', icon:'🟣', next:'en_ruta' },
    en_ruta:      { label:'EN RUTA', color:'#f97316', bg:'#ffedd5', icon:'🚛', next:null },
    entregado:    { label:'ENTREGADO', color:'#10b981', bg:'#d1fae5', icon:'✅', next:null },
    no_entregado: { label:'NO ENTREGADO', color:'#ef4444', bg:'#fee2e2', icon:'❌', next:null },
    parcial:      { label:'PARCIAL', color:'#f59e0b', bg:'#fef3c7', icon:'⚠️', next:null }
};
const PIPE_ORDER = ['nuevo','revisado','preparado','en_ruta'];
const PIPE_ALL = ['nuevo','revisado','preparado','en_ruta','entregado','no_entregado','parcial'];

function getEstado(p) {
    const e = p.estado || 'pendiente';
    if (e === 'pendiente') return 'nuevo';
    if (ESTADOS[e]) return e;
    return 'nuevo';
}

// ============================================
// TOAST & CONFIRM
// ============================================
function toast(msg, tipo='success', dur=3500) {
    const c=document.getElementById('toastContainer'); const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    const d=document.createElement('div'); d.className=`toast toast-${tipo}`;
    d.innerHTML=`<span>${icons[tipo]||''}</span><span style="flex:1">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(d); requestAnimationFrame(()=>d.classList.add('show'));
    setTimeout(()=>{d.classList.remove('show');setTimeout(()=>d.remove(),400);},dur);
}

function confirmar(titulo,msg,icono='⚠️',textoOk='Confirmar',tipoBtn='btn-danger') {
    return new Promise(resolve=>{
        const o=document.getElementById('confirmOverlay');
        document.getElementById('confirmIcon').textContent=icono;
        document.getElementById('confirmTitle').textContent=titulo;
        document.getElementById('confirmMsg').textContent=msg;
        const b=document.getElementById('confirmOk'); b.className=`btn ${tipoBtn}`; b.textContent=textoOk;
        o.classList.add('show');
        const cancel=()=>{o.classList.remove('show');resolve(false);};
        const ok=()=>{o.classList.remove('show');resolve(true);};
        document.getElementById('confirmCancel').onclick=cancel; b.onclick=ok;
        o.onclick=e=>{if(e.target===o)cancel();};
    });
}

// ============================================
// ACTIVITY LOG
// ============================================
function registrarActividad(tipo,texto){const h=JSON.parse(localStorage.getItem('hdv_actividad')||'[]');h.unshift({tipo,texto,fecha:new Date().toISOString()});if(h.length>200)h.length=200;localStorage.setItem('hdv_actividad',JSON.stringify(h));}
function obtenerActividad(n=10){return JSON.parse(localStorage.getItem('hdv_actividad')||'[]').slice(0,n);}
function renderActividad(items,id){const c=document.getElementById(id);if(!items.length){c.innerHTML='<div class="dash-empty">Sin actividad</div>';return;}const cls={pedido:'act-pedido',producto:'act-producto',cliente:'act-cliente',credito:'act-credito',stock:'act-stock',sistema:'act-sistema'};const em={pedido:'📦',producto:'🏷️',cliente:'👥',credito:'💳',stock:'📊',sistema:'⚙️'};c.innerHTML=items.map(a=>`<div class="activity-item"><div class="activity-icon ${cls[a.tipo]||'act-sistema'}">${em[a.tipo]||'⚙️'}</div><div><div class="activity-text">${a.texto}</div><div class="activity-time">${tiempoRelativo(new Date(a.fecha))}</div></div></div>`).join('');}
function tiempoRelativo(f){const d=Math.floor((new Date()-f)/1000);if(d<60)return'Hace un momento';if(d<3600)return`Hace ${Math.floor(d/60)} min`;if(d<86400)return`Hace ${Math.floor(d/3600)}h`;if(d<172800)return'Ayer';return f.toLocaleDateString('es-PY',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function limpiarHistorial(){confirmar('Borrar Historial','¿Eliminar todo el historial?','📋','Borrar').then(ok=>{if(ok){localStorage.removeItem('hdv_actividad');toast('Historial eliminado');if(document.getElementById('actividadCompleta'))renderActividad([],'actividadCompleta');if(document.getElementById('dashActividad'))renderActividad([],'dashActividad');}});}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async()=>{
    await cargarDatosIniciales();
    cargarPedidos();
    setInterval(cargarPedidos, 30000);
    const hoy=new Date(), hace30=new Date(hoy.getTime()-30*86400000);
    document.getElementById('reporteFechaHasta').valueAsDate=hoy;
    document.getElementById('reporteFechaDesde').valueAsDate=hace30;
    cargarDashboard();
});

async function cargarDatosIniciales(){
    try{
        const r=await fetch('productos.json'); productosData=await r.json();
        productosFiltrados=[...productosData.productos];
        const fc=document.getElementById('filterPipeCliente'), fz=document.getElementById('filterPipeZona'), pc=document.getElementById('preciosCliente'), nc=document.getElementById('nuevoCategoria');
        productosData.clientes.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.nombre} — ${c.zona}`;fc.appendChild(o.cloneNode(true));pc.appendChild(o);});
        const zonas=[...new Set(productosData.clientes.map(c=>c.zona))];
        zonas.forEach(z=>{const o=document.createElement('option');o.value=z;o.textContent=z;fz.appendChild(o);});
        productosData.categorias.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre;nc.appendChild(o);});
    }catch(e){console.error('Error:',e);}
}

// ============================================
// PIPELINE CORE
// ============================================
function cargarPedidos(){
    todosLosPedidos=JSON.parse(localStorage.getItem('hdv_pedidos')||'[]');
    // Migrate old states
    todosLosPedidos.forEach(p=>{if(!p.estado||p.estado==='pendiente')p.estado='nuevo';});
    renderPipeline();
}

function guardarPedidosLS(){localStorage.setItem('hdv_pedidos',JSON.stringify(todosLosPedidos));}

function getPedidosFiltrados(){
    let f=todosLosPedidos;
    const cl=document.getElementById('filterPipeCliente')?.value;
    const zn=document.getElementById('filterPipeZona')?.value;
    if(cl) f=f.filter(p=>p.cliente.id===cl);
    if(zn){const cz=productosData.clientes.filter(c=>c.zona===zn).map(c=>c.id);f=f.filter(p=>cz.includes(p.cliente.id));}
    if(filtroEstadoPipe) f=f.filter(p=>getEstado(p)===filtroEstadoPipe);
    return f;
}

function renderPipelineStats(containerId){
    const counts={};PIPE_ALL.forEach(e=>counts[e]=0);
    todosLosPedidos.forEach(p=>counts[getEstado(p)]=(counts[getEstado(p)]||0)+1);
    const c=document.getElementById(containerId);
    c.innerHTML=PIPE_ORDER.map(e=>{
        const s=ESTADOS[e]; const active=filtroEstadoPipe===e?'active':'';
        return`<div class="pipe-stat ${active}" style="background:${s.bg};color:${s.color}" onclick="filtrarPorEstado('${e}')"><div class="pipe-stat-count">${counts[e]||0}</div><div class="pipe-stat-label">${s.icon} ${s.label}</div></div>`;
    }).join('')+`<div class="pipe-stat" style="background:#d1fae5;color:#10b981" onclick="filtrarPorEstado('entregado')"><div class="pipe-stat-count">${counts.entregado||0}</div><div class="pipe-stat-label">✅ ENTREGADO</div></div>`;
}

function filtrarPorEstado(e){filtroEstadoPipe=filtroEstadoPipe===e?'':e;renderPipeline();}

function setVistapipeline(vista,btn){
    vistaPipeline=vista;
    document.querySelectorAll('.view-toggle-btn').forEach(b=>b.classList.remove('active'));
    if(btn)btn.classList.add('active');
    renderPipeline();
}

function renderPipeline(){
    renderPipelineStats('pipelineStats');
    renderPipelineStats('dashPipelineStats');
    const v=document.getElementById('pipelineView');
    if(vistaPipeline==='kanban')renderKanban(v);
    else renderListaPipeline(v);
    // Update badges
    const nuevos=todosLosPedidos.filter(p=>getEstado(p)==='nuevo').length;
    const preparados=todosLosPedidos.filter(p=>getEstado(p)==='preparado').length;
    const bn=document.getElementById('badgeNuevos');
    if(nuevos>0){bn.textContent=nuevos;bn.style.display='inline';}else bn.style.display='none';
    const bc=document.getElementById('badgeChecklist');
    if(preparados>0){bc.textContent=preparados;bc.style.display='inline';}else bc.style.display='none';
}

// ============================================
// KANBAN VIEW
// ============================================
function renderKanban(container){
    const pedidos=getPedidosFiltrados();
    const cols={};PIPE_ORDER.forEach(e=>cols[e]=[]);
    pedidos.forEach(p=>{const e=getEstado(p);if(cols[e])cols[e].push(p);});
    container.innerHTML=`<div class="kanban">${PIPE_ORDER.map(estado=>{
        const s=ESTADOS[estado];const items=cols[estado]||[];
        return`<div class="kanban-col"><div class="kanban-col-header" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}<span class="kanban-col-count">${items.length}</span></div><div class="kanban-col-body">${items.length===0?'<div class="dash-empty" style="padding:20px">Sin pedidos</div>':items.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(p=>renderKanbanCard(p,estado)).join('')}</div></div>`;
    }).join('')}</div>`;
}

function renderKanbanCard(p,estado){
    const s=ESTADOS[estado];const cl=productosData.clientes.find(c=>c.id===p.cliente.id);
    const itemsPreview=p.items.slice(0,3).map(i=>`${i.nombre} ×${i.cantidad}`).join(', ')+(p.items.length>3?' ...':'');
    const nota=p.nota_edicion?`<div class="kanban-card-note">✏️ ${p.nota_edicion}</div>`:'';
    let acciones='';
    if(estado==='nuevo') acciones=`<button class="btn btn-primary btn-sm" onclick="editarPedido('${p.id}')">✏️ Revisar</button><button class="btn btn-sm" style="background:${ESTADOS.revisado.bg};color:${ESTADOS.revisado.color}" onclick="avanzarEstado('${p.id}')">→ Revisado</button>`;
    else if(estado==='revisado') acciones=`<button class="btn btn-primary btn-sm" onclick="editarPedido('${p.id}')">✏️</button><button class="btn btn-sm" style="background:${ESTADOS.preparado.bg};color:${ESTADOS.preparado.color}" onclick="avanzarEstado('${p.id}')">→ Preparado</button>`;
    else if(estado==='preparado') acciones=`<button class="btn btn-sm" style="background:${ESTADOS.en_ruta.bg};color:${ESTADOS.en_ruta.color}" onclick="avanzarEstado('${p.id}')">🚛 A Ruta</button><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄</button>`;
    else if(estado==='en_ruta') acciones=`<button class="btn btn-success btn-sm" onclick="confirmarEntrega('${p.id}')">✅ Entregado</button><button class="btn btn-sm" style="background:#fef3c7;color:#92400e" onclick="abrirEntregaParcial('${p.id}')">⚠️ Parcial</button><button class="btn btn-danger btn-sm" onclick="marcarNoEntregado('${p.id}')">❌</button><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄</button>`;
    return`<div class="kanban-card" style="border-left-color:${s.color}"><div class="kanban-card-name">${p.cliente.nombre}</div><div class="kanban-card-info">📍 ${cl?.zona||''} • ${tiempoRelativo(new Date(p.fecha))}</div>${nota}<div class="kanban-card-items">${itemsPreview}</div><div class="kanban-card-total">Gs. ${p.total.toLocaleString()}</div><div class="kanban-card-actions">${acciones}<button class="btn btn-danger btn-sm" onclick="eliminarPedido('${p.id}')" style="margin-left:auto">🗑️</button></div></div>`;
}

// ============================================
// LIST VIEW
// ============================================
function renderListaPipeline(container){
    const pedidos=getPedidosFiltrados().sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    if(pedidos.length===0){container.innerHTML='<div class="card"><div class="empty-state"><div style="font-size:48px;margin-bottom:15px">📦</div>No hay pedidos</div></div>';return;}
    container.innerHTML='<div class="card" style="padding:0">'+pedidos.map(p=>{
        const estado=getEstado(p);const s=ESTADOS[estado];const cl=productosData.clientes.find(c=>c.id===p.cliente.id);
        const nota=p.nota_edicion?`<div style="background:#fef3c7;padding:6px 12px;border-radius:6px;font-size:12px;color:#92400e;margin-top:8px">✏️ ${p.nota_edicion}</div>`:'';
        let acciones='';
        if(estado==='nuevo') acciones=`<button class="btn btn-primary btn-sm" onclick="editarPedido('${p.id}')">✏️ Revisar</button><button class="btn btn-sm" style="background:${ESTADOS.revisado.bg};color:${ESTADOS.revisado.color}" onclick="avanzarEstado('${p.id}')">→ Revisado</button>`;
        else if(estado==='revisado') acciones=`<button class="btn btn-primary btn-sm" onclick="editarPedido('${p.id}')">✏️</button><button class="btn btn-sm" style="background:${ESTADOS.preparado.bg};color:${ESTADOS.preparado.color}" onclick="avanzarEstado('${p.id}')">→ Preparado</button>`;
        else if(estado==='preparado') acciones=`<button class="btn btn-sm" style="background:${ESTADOS.en_ruta.bg};color:${ESTADOS.en_ruta.color}" onclick="avanzarEstado('${p.id}')">🚛 A Ruta</button><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄 Remito</button>`;
        else if(estado==='en_ruta') acciones=`<button class="btn btn-success btn-sm" onclick="confirmarEntrega('${p.id}')">✅ Entregado</button><button class="btn btn-sm" style="background:#fef3c7;color:#92400e" onclick="abrirEntregaParcial('${p.id}')">⚠️ Parcial</button><button class="btn btn-danger btn-sm" onclick="marcarNoEntregado('${p.id}')">❌</button><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄 Remito</button>`;
        if(PIPE_ORDER.includes(estado)) acciones+=`<button class="btn btn-secondary btn-sm" onclick="retrocederEstado('${p.id}')" style="margin-left:4px">←</button>`;
        return`<div class="pedido-card"><div class="pedido-header"><div><h3 style="margin-bottom:5px">${p.cliente.nombre}</h3><div style="font-size:13px;color:#6b7280">📍 ${cl?.zona||''} • ${new Date(p.fecha).toLocaleString('es-PY')}</div>${nota}</div><span class="pedido-status" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span></div><div style="margin-bottom:12px">${p.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px"><span>${i.nombre} <span style="color:#6b7280">(${i.presentacion} × ${i.cantidad})</span></span><strong>Gs. ${i.subtotal.toLocaleString()}</strong></div>`).join('')}</div><div style="display:flex;justify-content:space-between;padding-top:12px;border-top:2px solid #e5e7eb;font-size:18px;font-weight:700"><span>TOTAL</span><span>Gs. ${p.total.toLocaleString()}</span></div><div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">${acciones}<button class="btn btn-danger btn-sm" onclick="eliminarPedido('${p.id}')" style="margin-left:auto">🗑️</button></div></div>`;
    }).join('')+'</div>';
}

// ============================================
// STATE TRANSITIONS
// ============================================
async function avanzarEstado(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    const estado=getEstado(p);const s=ESTADOS[estado];
    if(!s.next){toast('No se puede avanzar más','warning');return;}
    p.estado=s.next;guardarPedidosLS();
    registrarActividad('pedido',`${p.cliente.nombre}: ${s.label} → ${ESTADOS[s.next].label}`);
    toast(`Pedido → ${ESTADOS[s.next].icon} ${ESTADOS[s.next].label}`,'info');
    renderPipeline();cargarDashboard();
}

async function retrocederEstado(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    const estado=getEstado(p);
    const idx=PIPE_ORDER.indexOf(estado);
    if(idx<=0){toast('No se puede retroceder','warning');return;}
    const prev=PIPE_ORDER[idx-1];
    p.estado=prev;guardarPedidosLS();
    registrarActividad('pedido',`${p.cliente.nombre}: retrocedido a ${ESTADOS[prev].label}`);
    toast(`Pedido ← ${ESTADOS[prev].icon} ${ESTADOS[prev].label}`,'info');
    renderPipeline();cargarDashboard();
}

async function confirmarEntrega(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    if(!await confirmar('Confirmar Entrega',`¿Confirmar entrega completa a ${p.cliente.nombre}?\n\nTotal: Gs. ${p.total.toLocaleString()}\n\nSe descontará del stock automáticamente.`,'✅','Sí, Entregado','btn-success'))return;
    p.estado='entregado';p.fecha_entrega=new Date().toISOString();
    descontarStockPedido(p);
    guardarPedidosLS();
    registrarActividad('pedido',`✅ ENTREGADO: ${p.cliente.nombre} — Gs. ${p.total.toLocaleString()}`);
    toast(`✅ Entrega confirmada — Stock actualizado`,'success');
    renderPipeline();cargarDashboard();
}

async function marcarNoEntregado(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    if(!await confirmar('No Entregado',`¿Marcar pedido de ${p.cliente.nombre} como NO ENTREGADO?\n\nVolverá a NUEVO para la próxima entrega.`,'❌'))return;
    p.estado='no_entregado';p.fecha_no_entrega=new Date().toISOString();
    // Create copy as new order for next delivery
    const copia={...p,id:'PED'+Date.now(),estado:'nuevo',fecha:new Date().toISOString(),nota_edicion:'Reintento — no entregado el '+new Date().toLocaleDateString('es-PY'),items:p.items.map(i=>({...i}))};
    todosLosPedidos.push(copia);
    guardarPedidosLS();
    registrarActividad('pedido',`❌ NO ENTREGADO: ${p.cliente.nombre} — Se creó nuevo pedido`);
    toast('Pedido no entregado — Nuevo pedido creado','warning');
    renderPipeline();cargarDashboard();
}

function descontarStockPedido(pedido){
    pedido.items.forEach(item=>{
        const prod=productosData.productos.find(p=>p.id===item.productoId||p.nombre===item.nombre);
        if(!prod)return;
        const pres=prod.presentaciones.find(pr=>pr.tamano===item.presentacion);
        if(pres){
            pres.stock=(pres.stock||0)-item.cantidad;
            if(pres.stock<0)pres.stock=0;
        }
    });
    registrarActividad('stock',`Stock descontado: ${pedido.items.length} items de pedido ${pedido.cliente.nombre}`);
}

// ============================================
// EDIT PEDIDO
// ============================================
function editarPedido(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    editandoPedidoId=id;
    document.getElementById('editPedidoCliente').textContent=p.cliente.nombre;
    document.getElementById('editPedidoNota').value=p.nota_edicion||'';
    renderEditItems(p);
    document.getElementById('modalEditarPedido').classList.add('show');
}

function renderEditItems(p){
    const c=document.getElementById('editPedidoItems');
    c.innerHTML=p.items.map((item,i)=>`<div class="edit-item" data-idx="${i}"><div class="edit-item-name"><strong>${item.nombre}</strong><div style="font-size:12px;color:#6b7280">${item.presentacion} — Gs. ${item.precio_unitario.toLocaleString()} c/u</div></div><input type="number" class="edit-item-qty" value="${item.cantidad}" min="0" data-idx="${i}" onchange="recalcularEditTotal()"><button class="edit-item-remove" onclick="removerItemEdit(${i})">×</button></div>`).join('');
    recalcularEditTotal();
}

function recalcularEditTotal(){
    const p=todosLosPedidos.find(x=>x.id===editandoPedidoId);if(!p)return;
    let total=0;
    document.querySelectorAll('.edit-item-qty').forEach(input=>{
        const idx=parseInt(input.dataset.idx);const item=p.items[idx];
        if(item)total+=item.precio_unitario*(parseInt(input.value)||0);
    });
    document.getElementById('editPedidoTotal').textContent=`Gs. ${total.toLocaleString()}`;
}

function removerItemEdit(idx){
    const p=todosLosPedidos.find(x=>x.id===editandoPedidoId);if(!p)return;
    if(p.items.length<=1){toast('Debe tener al menos 1 item','warning');return;}
    p.items.splice(idx,1);
    renderEditItems(p);
}

function guardarEdicionPedido(){
    const p=todosLosPedidos.find(x=>x.id===editandoPedidoId);if(!p)return;
    const nota=document.getElementById('editPedidoNota').value.trim();
    // Update quantities
    document.querySelectorAll('.edit-item-qty').forEach(input=>{
        const idx=parseInt(input.dataset.idx);const cant=parseInt(input.value)||0;
        if(p.items[idx]){p.items[idx].cantidad=cant;p.items[idx].subtotal=cant*p.items[idx].precio_unitario;}
    });
    // Remove zero quantity items
    p.items=p.items.filter(i=>i.cantidad>0);
    if(p.items.length===0){toast('No puedes dejar un pedido vacío','error');return;}
    p.total=p.items.reduce((s,i)=>s+i.subtotal,0);
    if(nota)p.nota_edicion=nota;
    // Auto advance to revisado if still nuevo
    if(getEstado(p)==='nuevo')p.estado='revisado';
    guardarPedidosLS();
    registrarActividad('pedido',`Pedido de ${p.cliente.nombre} editado${nota?' — '+nota:''}`);
    toast('Pedido editado y marcado como revisado','success');
    cerrarModalEditar();renderPipeline();cargarDashboard();
}

function cerrarModalEditar(){document.getElementById('modalEditarPedido').classList.remove('show');editandoPedidoId=null;}

// ============================================
// PARTIAL DELIVERY
// ============================================
function abrirEntregaParcial(id){
    const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;
    parcialPedidoId=id;
    document.getElementById('parcialCliente').textContent=p.cliente.nombre;
    const c=document.getElementById('parcialItems');
    c.innerHTML=p.items.map((item,i)=>`<div class="edit-item"><div class="edit-item-name"><strong>${item.nombre}</strong><div style="font-size:12px;color:#6b7280">${item.presentacion} — Pedido: ${item.cantidad} uds</div></div><input type="number" class="parcial-qty" value="${item.cantidad}" min="0" max="${item.cantidad}" data-idx="${i}" data-precio="${item.precio_unitario}" onchange="recalcularParcialTotal()"></div>`).join('');
    recalcularParcialTotal();
    document.getElementById('modalParcial').classList.add('show');
}

function recalcularParcialTotal(){
    let total=0;
    document.querySelectorAll('.parcial-qty').forEach(input=>{total+=parseInt(input.value||0)*parseFloat(input.dataset.precio);});
    document.getElementById('parcialTotal').textContent=`Gs. ${total.toLocaleString()}`;
}

async function confirmarEntregaParcial(){
    const p=todosLosPedidos.find(x=>x.id===parcialPedidoId);if(!p)return;
    if(!await confirmar('Entrega Parcial',`¿Confirmar entrega parcial a ${p.cliente.nombre}?`,'⚠️','Confirmar Parcial','btn-primary'))return;
    const entregados=[];const noEntregados=[];
    document.querySelectorAll('.parcial-qty').forEach(input=>{
        const idx=parseInt(input.dataset.idx);const cantEntregada=parseInt(input.value)||0;const item=p.items[idx];
        if(cantEntregada>0)entregados.push({...item,cantidad:cantEntregada,subtotal:cantEntregada*item.precio_unitario});
        if(cantEntregada<item.cantidad)noEntregados.push({...item,cantidad:item.cantidad-cantEntregada,subtotal:(item.cantidad-cantEntregada)*item.precio_unitario});
    });
    if(entregados.length===0){toast('No marcaste ningún item como entregado','warning');return;}
    // Mark current as parcial
    p.estado='parcial';p.items=entregados;p.total=entregados.reduce((s,i)=>s+i.subtotal,0);p.fecha_entrega=new Date().toISOString();
    // Deduct stock for delivered items
    entregados.forEach(item=>{
        const prod=productosData.productos.find(pr=>pr.id===item.productoId||pr.nombre===item.nombre);
        if(!prod)return;const pres=prod.presentaciones.find(pr=>pr.tamano===item.presentacion);
        if(pres){pres.stock=(pres.stock||0)-item.cantidad;if(pres.stock<0)pres.stock=0;}
    });
    // Create new order for remaining items
    if(noEntregados.length>0){
        const nuevo={...p,id:'PED'+Date.now(),estado:'nuevo',items:noEntregados,total:noEntregados.reduce((s,i)=>s+i.subtotal,0),fecha:new Date().toISOString(),nota_edicion:'Items pendientes de entrega parcial del '+new Date().toLocaleDateString('es-PY')};
        todosLosPedidos.push(nuevo);
    }
    guardarPedidosLS();
    registrarActividad('pedido',`⚠️ PARCIAL: ${p.cliente.nombre} — Entregado Gs. ${p.total.toLocaleString()}${noEntregados.length>0?' — Pendientes: '+noEntregados.length+' items':''}`);
    toast('Entrega parcial registrada','success');
    cerrarModalParcial();renderPipeline();cargarDashboard();
}

function cerrarModalParcial(){document.getElementById('modalParcial').classList.remove('show');parcialPedidoId=null;}

// ============================================
// DELETE PEDIDO
// ============================================
async function eliminarPedido(id){
    if(!await confirmar('Eliminar Pedido','¿Eliminar este pedido?','🗑️'))return;
    const p=todosLosPedidos.find(x=>x.id===id);
    todosLosPedidos=todosLosPedidos.filter(x=>x.id!==id);guardarPedidosLS();
    if(p)registrarActividad('pedido',`Pedido de ${p.cliente.nombre} eliminado`);
    toast('Pedido eliminado','warning');renderPipeline();cargarDashboard();
}

// ============================================
// VENTAS FINALIZADAS
// ============================================
function renderVentas(){
    const desde=document.getElementById('ventasDesde')?.value;const hasta=document.getElementById('ventasHasta')?.value;const cl=document.getElementById('ventasCliente')?.value;
    let ventas=todosLosPedidos.filter(p=>getEstado(p)==='entregado'||getEstado(p)==='parcial');
    if(desde)ventas=ventas.filter(p=>(p.fecha_entrega||p.fecha)>=desde);
    if(hasta)ventas=ventas.filter(p=>(p.fecha_entrega||p.fecha)<=hasta+'T23:59:59');
    if(cl)ventas=ventas.filter(p=>p.cliente.id===cl);
    const hoy=new Date(),inicioSemana=new Date(hoy);inicioSemana.setDate(hoy.getDate()-hoy.getDay());
    const inicioMes=new Date(hoy.getFullYear(),hoy.getMonth(),1);
    const semana=ventas.filter(p=>new Date(p.fecha_entrega||p.fecha)>=inicioSemana);
    const mes=ventas.filter(p=>new Date(p.fecha_entrega||p.fecha)>=inicioMes);
    document.getElementById('ventasSemana').textContent=`Gs. ${semana.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('ventasMes').textContent=`Gs. ${mes.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('ventasCant').textContent=ventas.length;
    const c=document.getElementById('ventasList');
    if(ventas.length===0){c.innerHTML='<div class="empty-state">No hay ventas finalizadas en este período</div>';return;}
    c.innerHTML=ventas.sort((a,b)=>new Date(b.fecha_entrega||b.fecha)-new Date(a.fecha_entrega||a.fecha)).map(p=>{
        const s=ESTADOS[getEstado(p)];const cl=productosData.clientes.find(x=>x.id===p.cliente.id);
        return`<div class="pedido-card"><div class="pedido-header"><div><h3 style="margin-bottom:5px">${p.cliente.nombre}</h3><div style="font-size:13px;color:#6b7280">📍 ${cl?.zona||''} • Entregado: ${new Date(p.fecha_entrega||p.fecha).toLocaleString('es-PY')}</div></div><div style="display:flex;gap:6px;align-items:center"><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄 Remito</button><span class="pedido-status" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span></div></div><div style="margin-bottom:12px">${p.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px"><span>${i.nombre} (${i.presentacion} × ${i.cantidad})</span><strong>Gs. ${i.subtotal.toLocaleString()}</strong></div>`).join('')}</div><div style="font-size:18px;font-weight:700;text-align:right;padding-top:12px;border-top:2px solid #e5e7eb">Gs. ${p.total.toLocaleString()}</div></div>`;
    }).join('');
}

function initVentas(){
    const s=document.getElementById('ventasCliente');
    if(s.options.length<=1)productosData.clientes.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre;s.appendChild(o);});
    const hoy=new Date(),hace30=new Date(hoy.getTime()-30*86400000);
    if(!document.getElementById('ventasDesde').value)document.getElementById('ventasDesde').valueAsDate=hace30;
    if(!document.getElementById('ventasHasta').value)document.getElementById('ventasHasta').valueAsDate=hoy;
    renderVentas();
}

// ============================================
// NO ENTREGADOS HISTORY
// ============================================
function renderNoEntregados(){
    const items=todosLosPedidos.filter(p=>getEstado(p)==='no_entregado'||getEstado(p)==='parcial');
    const c=document.getElementById('noEntregadosList');
    if(items.length===0){c.innerHTML='<div class="empty-state">🎉 No hay pedidos no entregados</div>';return;}
    c.innerHTML=items.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(p=>{
        const s=ESTADOS[getEstado(p)];const cl=productosData.clientes.find(x=>x.id===p.cliente.id);
        return`<div class="pedido-card" style="border-left:4px solid ${s.color}"><div class="pedido-header"><div><h3>${p.cliente.nombre}</h3><div style="font-size:13px;color:#6b7280">📍 ${cl?.zona||''} • ${new Date(p.fecha).toLocaleString('es-PY')}</div></div><span class="pedido-status" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span></div><div>${p.items.map(i=>`<div style="font-size:14px;padding:4px 0">${i.nombre} (${i.presentacion} × ${i.cantidad}) — Gs. ${i.subtotal.toLocaleString()}</div>`).join('')}</div><div style="font-size:16px;font-weight:700;text-align:right;margin-top:10px">Gs. ${p.total.toLocaleString()}</div></div>`;
    }).join('');
}

// ============================================
// DASHBOARD
// ============================================
function cargarDashboard(){
    const hora=new Date().getHours();
    document.getElementById('dashSaludo').textContent=`${hora<12?'Buenos días':hora<18?'Buenas tardes':'Buenas noches'} 👋`;
    document.getElementById('dashFechaHoy').textContent=new Date().toLocaleDateString('es-PY',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    renderPipelineStats('dashPipelineStats');
    // Only ENTREGADO + PARCIAL count as sales
    const hoy=new Date(),inicioSemana=new Date(hoy);inicioSemana.setDate(hoy.getDate()-hoy.getDay());const inicioMes=new Date(hoy.getFullYear(),hoy.getMonth(),1);
    const completados=todosLosPedidos.filter(p=>getEstado(p)==='entregado'||getEstado(p)==='parcial');
    const semana=completados.filter(p=>new Date(p.fecha_entrega||p.fecha)>=inicioSemana);
    const mes=completados.filter(p=>new Date(p.fecha_entrega||p.fecha)>=inicioMes);
    document.getElementById('dashVentasSemana').textContent=`Gs. ${semana.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('dashVentasSemanaSub').textContent=`${semana.length} entregas completadas`;
    document.getElementById('dashVentasMes').textContent=`Gs. ${mes.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('dashVentasMesSub').textContent=`${mes.length} entregas completadas`;
    // Credits
    const creditosPend=todosLosPedidos.filter(p=>p.tipo_pago==='credito'&&(p.estado_pago||'pendiente_pago')==='pendiente_pago');
    document.getElementById('dashCreditosTotal').textContent=`Gs. ${creditosPend.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('dashCreditosSub').textContent=`${creditosPend.length} créditos`;
    const bc=document.getElementById('badgeCreditos');if(creditosPend.length>0){bc.textContent=creditosPend.length;bc.style.display='inline';}else bc.style.display='none';
    // Stock alerts
    const alertas=[];
    productosData.productos.forEach(prod=>{if(prod.oculto)return;prod.presentaciones.forEach(pres=>{const stock=pres.stock||0;const min=pres.stock_minimo||10;if(stock===0)alertas.push({nombre:`${prod.nombre} (${pres.tamano})`,tipo:'agotado'});else if(stock<=min)alertas.push({nombre:`${prod.nombre} (${pres.tamano})`,tipo:'bajo',stock});});});
    const sd=document.getElementById('dashStockAlertas');
    if(alertas.length===0)sd.innerHTML='<div class="dash-empty" style="color:#10b981">✅ Stock OK</div>';
    else sd.innerHTML=`<ul class="dash-list">${alertas.slice(0,6).map(a=>`<li><span>${a.nombre}</span><span class="alert-badge ${a.tipo==='agotado'?'alert-danger':'alert-warning'}">${a.tipo==='agotado'?'🔴 Agotado':`🟡 ${a.stock}`}</span></li>`).join('')}</ul>${alertas.length>6?`<p style="text-align:center;color:#6b7280;font-size:12px;margin-top:8px">+${alertas.length-6} más</p>`:''}`;
    const bs=document.getElementById('badgeStock');if(alertas.length>0){bs.textContent=alertas.length;bs.style.display='inline';}else bs.style.display='none';
    // New orders
    const nuevos=todosLosPedidos.filter(p=>getEstado(p)==='nuevo');
    const nd=document.getElementById('dashNuevos');
    if(nuevos.length===0)nd.innerHTML='<div class="dash-empty">✅ Todos revisados</div>';
    else nd.innerHTML=`<ul class="dash-list">${nuevos.slice(0,5).map(p=>`<li><div><strong>${p.cliente.nombre}</strong><div style="font-size:12px;color:#9ca3af">${p.items.length} items • ${tiempoRelativo(new Date(p.fecha))}</div></div><strong style="color:#2563eb">Gs. ${p.total.toLocaleString()}</strong></li>`).join('')}</ul>${nuevos.length>5?`<p style="text-align:center;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="cambiarSeccion('pipeline')">Ver todos (${nuevos.length})</button></p>`:''}`;
    // Credits list
    const cd=document.getElementById('dashCreditosLista');
    if(creditosPend.length===0)cd.innerHTML='<div class="dash-empty" style="color:#10b981">✅ Sin créditos</div>';
    else cd.innerHTML=`<ul class="dash-list">${creditosPend.slice(0,5).map(p=>{const d=Math.floor((new Date()-new Date(p.fecha))/86400000);return`<li><div><strong>${p.cliente.nombre}</strong><div style="font-size:12px;color:${d>15?'#ef4444':'#9ca3af'}">Hace ${d} días</div></div><strong style="color:#ef4444">Gs. ${p.total.toLocaleString()}</strong></li>`;}).join('')}</ul>`;
    renderActividad(obtenerActividad(5),'dashActividad');
}

// ============================================
// EXPORT
// ============================================
function exportarPedidosExcel(){
    let csv='Fecha,Cliente,Zona,Estado,Producto,Presentacion,Cantidad,Precio,Subtotal,Total\n';
    todosLosPedidos.forEach(p=>{const c=productosData.clientes.find(x=>x.id===p.cliente.id);p.items.forEach((i,idx)=>{csv+=`"${p.fecha}","${p.cliente.nombre}","${c?.zona||''}","${getEstado(p)}","${i.nombre}","${i.presentacion}",${i.cantidad},${i.precio_unitario},${i.subtotal},${idx===0?p.total:''}\n`;});});
    descargarCSV(csv,`pedidos_${new Date().toISOString().split('T')[0]}.csv`);toast('Exportado','info');
}

// ============================================
// REPORTES (Solo ventas finalizadas)
// ============================================
function generarReporte(){
    const desde=new Date(document.getElementById('reporteFechaDesde').value);const hasta=new Date(document.getElementById('reporteFechaHasta').value);hasta.setHours(23,59,59);
    const pedidos=todosLosPedidos.filter(p=>{const e=getEstado(p);if(e!=='entregado'&&e!=='parcial')return false;const f=new Date(p.fecha_entrega||p.fecha);return f>=desde&&f<=hasta;});
    if(pedidos.length===0){toast('No hay ventas en ese rango','warning');return;}
    const comp=document.getElementById('comparacionPeriodo').value;
    if(comp!=='ninguno')compararPeriodos(desde,hasta,comp);else document.getElementById('comparacionCard').style.display='none';
    mostrarEstadisticasReporte(pedidos);
    if(tipoReporte==='margen')reporteMargen(pedidos);
    else if(tipoReporte==='zona')reportePorZona(pedidos);
    else if(tipoReporte==='producto')reportePorProducto(pedidos);
    else if(tipoReporte==='cliente')reportePorCliente(pedidos);
}
function mostrarEstadisticasReporte(p){const t=p.reduce((s,x)=>s+x.total,0);document.getElementById('rTotalVentas').textContent=`Gs. ${t.toLocaleString()}`;document.getElementById('rTotalPedidos').textContent=p.length;document.getElementById('rTicketPromedio').textContent=`Gs. ${Math.round(t/p.length).toLocaleString()}`;document.getElementById('statsReporte').style.display='block';}
function reportePorZona(p){const z={};p.forEach(x=>{const c=productosData.clientes.find(y=>y.id===x.cliente.id);const zona=c?.zona||'Sin zona';if(!z[zona])z[zona]={n:0,t:0};z[zona].n++;z[zona].t+=x.total;});const d=Object.entries(z).map(([k,v])=>({zona:k,...v,prom:Math.round(v.t/v.n)})).sort((a,b)=>b.t-a.t);mostrarGrafico(d.map(x=>x.zona),d.map(x=>x.t),'Ventas por Zona');mostrarTablaReporte(['Zona','Pedidos','Total','Promedio'],d.map(x=>[x.zona,x.n,`Gs. ${x.t.toLocaleString()}`,`Gs. ${x.prom.toLocaleString()}`]),'Ventas por Zona');}
function reportePorProducto(p){const pr={};p.forEach(x=>{x.items.forEach(i=>{const k=`${i.nombre} (${i.presentacion})`;if(!pr[k])pr[k]={c:0,t:0};pr[k].c+=i.cantidad;pr[k].t+=i.subtotal;});});const d=Object.entries(pr).map(([k,v])=>({prod:k,...v})).sort((a,b)=>b.t-a.t);mostrarTablaReporte(['Producto','Unidades','Total'],d.map(x=>[x.prod,x.c,`Gs. ${x.t.toLocaleString()}`]),'Ventas por Producto');}
function reportePorCliente(p){const c={};p.forEach(x=>{const n=x.cliente.nombre;const cl=productosData.clientes.find(y=>y.id===x.cliente.id);if(!c[n])c[n]={n:0,t:0,z:cl?.zona||''};c[n].n++;c[n].t+=x.total;});const d=Object.entries(c).map(([k,v])=>({cliente:k,...v,prom:Math.round(v.t/v.n)})).sort((a,b)=>b.t-a.t);mostrarTablaReporte(['Cliente','Zona','Pedidos','Total','Promedio'],d.map(x=>[x.cliente,x.z,x.n,`Gs. ${x.t.toLocaleString()}`,`Gs. ${x.prom.toLocaleString()}`]),'Ventas por Cliente');}
function reporteMargen(p){const pr={};p.forEach(x=>{x.items.forEach(i=>{const k=i.nombre;if(!pr[k])pr[k]={c:0,ing:0,cost:0};pr[k].c+=i.cantidad;pr[k].ing+=i.subtotal;pr[k].cost+=i.subtotal*0.7;});});const d=Object.entries(pr).map(([k,v])=>({prod:k,...v,gan:v.ing-v.cost,mar:((v.ing-v.cost)/v.ing*100).toFixed(1)})).sort((a,b)=>b.gan-a.gan);mostrarGrafico(d.slice(0,10).map(x=>x.prod),d.slice(0,10).map(x=>x.gan),'Top 10 por Ganancia');mostrarTablaReporte(['Producto','Uds','Ingresos','Costo Est.','Ganancia','Margen'],d.map(x=>[x.prod,x.c,`Gs. ${x.ing.toLocaleString()}`,`Gs. ${Math.round(x.cost).toLocaleString()}`,`Gs. ${Math.round(x.gan).toLocaleString()}`,`${x.mar}%`]),'Análisis de Margen');}
function compararPeriodos(da,ha,tipo){const dias=Math.ceil((ha-da)/86400000);let dA,hA;if(tipo==='anterior'){hA=new Date(da.getTime()-1);dA=new Date(hA.getTime()-dias*86400000);}else{dA=new Date(da);dA.setMonth(dA.getMonth()-1);hA=new Date(ha);hA.setMonth(hA.getMonth()-1);}const pA=todosLosPedidos.filter(p=>{const e=getEstado(p);if(e!=='entregado'&&e!=='parcial')return false;const f=new Date(p.fecha_entrega||p.fecha);return f>=da&&f<=ha;});const pB=todosLosPedidos.filter(p=>{const e=getEstado(p);if(e!=='entregado'&&e!=='parcial')return false;const f=new Date(p.fecha_entrega||p.fecha);return f>=dA&&f<=hA;});const vA=pA.reduce((s,p)=>s+p.total,0);const vB=pB.reduce((s,p)=>s+p.total,0);const cv=vB>0?((vA-vB)/vB*100).toFixed(1):0;document.getElementById('statsComparacion').innerHTML=`<div class="stat-card" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe)"><div class="stat-label">Actual</div><div class="stat-value">Gs. ${vA.toLocaleString()}</div><div style="color:${cv>=0?'#10b981':'#ef4444'};font-weight:600;margin-top:5px">${cv>=0?'↑':'↓'} ${Math.abs(cv)}%</div></div><div class="stat-card"><div class="stat-label">Anterior</div><div class="stat-value">Gs. ${vB.toLocaleString()}</div></div><div class="stat-card"><div class="stat-label">Entregas</div><div class="stat-value">${pA.length} vs ${pB.length}</div></div>`;document.getElementById('comparacionCard').style.display='block';}
function mostrarTablaReporte(h,rows,t){document.getElementById('tituloReporte').textContent=t;document.getElementById('reporteHeader').innerHTML='<tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr>';document.getElementById('reporteBody').innerHTML=rows.map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('');document.getElementById('resultadosReporte').style.display='block';}
function exportarReporteExcel(){const t=document.getElementById('tablaReporte');let csv='';Array.from(t.querySelectorAll('thead th')).forEach(th=>csv+=th.textContent+',');csv+='\n';Array.from(t.querySelectorAll('tbody tr')).forEach(tr=>{Array.from(tr.querySelectorAll('td')).forEach(td=>csv+=`"${td.textContent}",`);csv+='\n';});descargarCSV(csv,`reporte_${tipoReporte}.csv`);toast('Exportado','info');}

// ============================================
// CRÉDITOS
// ============================================
function cargarCreditos(){const f=document.getElementById('filterClienteCredito');f.innerHTML='<option value="">Todos</option>';productosData.clientes.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.nombre}`;f.appendChild(o);});aplicarFiltrosCreditos();}
function aplicarFiltrosCreditos(){const cl=document.getElementById('filterClienteCredito').value;const es=document.getElementById('filterEstadoCredito').value;let cr=todosLosPedidos.filter(p=>p.tipo_pago==='credito');if(cl)cr=cr.filter(p=>p.cliente.id===cl);if(es!=='todos')cr=cr.filter(p=>(p.estado_pago||'pendiente_pago')===es);mostrarCreditos(cr);actualizarEstadisticasCreditos(cr);}
function mostrarCreditos(creditos){const c=document.getElementById('creditosList');if(creditos.length===0){c.innerHTML='<div class="empty-state"><div style="font-size:48px;margin-bottom:15px">💳</div>Sin créditos</div>';return;}c.innerHTML='';const pend=creditos.filter(p=>(p.estado_pago||'pendiente_pago')==='pendiente_pago');if(pend.length>0){const bar=document.createElement('div');bar.style.cssText='display:flex;gap:10px;padding:16px 20px;border-bottom:2px solid #e5e7eb;flex-wrap:wrap;align-items:center';bar.innerHTML=`<span style="font-size:14px;color:#6b7280;flex:1">${pend.length} pendiente${pend.length>1?'s':''}</span><button class="btn btn-success btn-sm" onclick="enviarRecordatoriosMasivos()">📋 Copiar Resumen</button>`;c.appendChild(bar);}creditos.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));creditos.forEach(p=>{const es=p.estado_pago||'pendiente_pago';const cl=productosData.clientes.find(x=>x.id===p.cliente.id);const dias=Math.floor((new Date()-new Date(p.fecha))/86400000);let ac='';if(es==='pendiente_pago'){ac=dias>30?'credit-age-critical':dias>15?'credit-age-danger':dias>7?'credit-age-warning':'credit-age-ok';}const div=document.createElement('div');div.className=`pedido-card ${ac}`;div.innerHTML=`<div class="pedido-header"><div><h3 style="margin-bottom:5px">${p.cliente.nombre}</h3><div style="font-size:13px;color:#6b7280">📍 ${cl?.zona||''} • ${new Date(p.fecha).toLocaleString('es-PY')}${es==='pendiente_pago'?` • <strong style="color:${dias>15?'#ef4444':'#6b7280'}">⏳ ${dias}d</strong>`:''}</div></div><span class="pedido-status" style="background:${es==='pagado'?'#d1fae5':'#fee2e2'};color:${es==='pagado'?'#065f46':'#991b1b'}">${es==='pagado'?'PAGADO':'PENDIENTE'}</span></div><div style="margin-bottom:12px">${p.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px"><span>${i.nombre} (${i.presentacion} × ${i.cantidad})</span><strong>Gs. ${i.subtotal.toLocaleString()}</strong></div>`).join('')}</div><div style="font-size:18px;font-weight:700;text-align:right;padding-top:12px;border-top:2px solid #e5e7eb;color:#2563eb">Gs. ${p.total.toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">${es==='pendiente_pago'?`<button class="btn btn-success btn-sm" onclick="marcarCreditoPagado('${p.id}')">✓ Pagado</button><button class="btn btn-primary btn-sm" onclick="enviarRecordatorioCredito('${p.id}')">📱 Recordar</button>`:`<button class="btn btn-secondary btn-sm" onclick="marcarCreditoPendiente('${p.id}')">↩ Pendiente</button>`}</div>`;c.appendChild(div);});}
function actualizarEstadisticasCreditos(cr){const p=cr.filter(x=>(x.estado_pago||'pendiente_pago')==='pendiente_pago');document.getElementById('totalCreditosPendientes').textContent=`Gs. ${p.reduce((s,x)=>s+x.total,0).toLocaleString()}`;document.getElementById('cantidadCreditos').textContent=cr.length;document.getElementById('clientesConCredito').textContent=[...new Set(cr.map(x=>x.cliente.id))].length;}
function marcarCreditoPagado(id){const p=todosLosPedidos.find(x=>x.id===id);if(p){p.estado_pago='pagado';guardarPedidosLS();aplicarFiltrosCreditos();cargarDashboard();registrarActividad('credito',`Crédito de ${p.cliente.nombre} pagado`);toast('Pagado','success');}}
function marcarCreditoPendiente(id){const p=todosLosPedidos.find(x=>x.id===id);if(p){p.estado_pago='pendiente_pago';guardarPedidosLS();aplicarFiltrosCreditos();cargarDashboard();toast('Pendiente','info');}}
function enviarRecordatorioCredito(id){const p=todosLosPedidos.find(x=>x.id===id);if(!p)return;const cl=productosData.clientes.find(c=>c.id===p.cliente.id);const dias=Math.floor((new Date()-new Date(p.fecha))/86400000);const tel=cl?.telefono?.replace(/^0/,'')||'';let msg=`Hola ${p.cliente.nombre} 👋\n\nLe recordamos su saldo pendiente con *HDV*:\n\n📋 Pedido del ${new Date(p.fecha).toLocaleDateString('es-PY')}\n💰 *Total: Gs. ${p.total.toLocaleString()}*\n⏳ Hace ${dias} días\n\n¡Gracias! 🙏`;if(tel)window.open(`https://wa.me/595${tel}?text=${encodeURIComponent(msg)}`,'_blank');else{navigator.clipboard.writeText(msg);toast('Copiado (sin teléfono)','info');}registrarActividad('credito',`Recordatorio: ${p.cliente.nombre}`);}
function enviarRecordatoriosMasivos(){const p=todosLosPedidos.filter(x=>x.tipo_pago==='credito'&&(x.estado_pago||'pendiente_pago')==='pendiente_pago');if(!p.length){toast('Sin créditos','info');return;}const por={};p.forEach(x=>{if(!por[x.cliente.id])por[x.cliente.id]={n:x.cliente.nombre,t:0,c:0};por[x.cliente.id].t+=x.total;por[x.cliente.id].c++;});let r='📋 *CRÉDITOS PENDIENTES*\n\n';Object.values(por).forEach(c=>{r+=`• ${c.n}: Gs. ${c.t.toLocaleString()} (${c.c})\n`;});r+=`\n💰 *TOTAL: Gs. ${p.reduce((s,x)=>s+x.total,0).toLocaleString()}*`;navigator.clipboard.writeText(r);toast(`Resumen copiado (${Object.keys(por).length} clientes)`,'success');}
function exportarCreditosExcel(){let csv='Fecha,Cliente,Total,Estado\n';todosLosPedidos.filter(p=>p.tipo_pago==='credito').forEach(p=>{csv+=`"${p.fecha}","${p.cliente.nombre}",${p.total},"${p.estado_pago||'pendiente_pago'}"\n`;});descargarCSV(csv,`creditos.csv`);toast('Exportado','info');}

// ============================================
// STOCK
// ============================================
let stockFiltrado=[];
function cargarStock(){stockFiltrado=[];productosData.productos.forEach(p=>{p.presentaciones.forEach((pr,i)=>{if(!pr.stock)pr.stock=0;if(!pr.stock_minimo)pr.stock_minimo=10;stockFiltrado.push({productoId:p.id,nombre:p.nombre,presentacion:pr.tamano,presIdx:i,stock:pr.stock||0,stock_minimo:pr.stock_minimo||10});});});mostrarStock();}
function filtrarStock(){const f=(document.getElementById('buscarStock').value||'').toLowerCase();stockFiltrado=[];productosData.productos.forEach(p=>{if(f&&!p.nombre.toLowerCase().includes(f))return;p.presentaciones.forEach((pr,i)=>{stockFiltrado.push({productoId:p.id,nombre:p.nombre,presentacion:pr.tamano,presIdx:i,stock:pr.stock||0,stock_minimo:pr.stock_minimo||10});});});mostrarStock();}
function mostrarStock(){const t=document.getElementById('stockBody');t.innerHTML='';stockFiltrado.forEach(i=>{const e=i.stock===0?'🔴 Agotado':i.stock<=i.stock_minimo?'🟡 Bajo':'🟢 OK';const c=i.stock===0?'#ef4444':i.stock<=i.stock_minimo?'#f59e0b':'#10b981';const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${i.nombre}</strong></td><td>${i.presentacion}</td><td><input type="number" value="${i.stock}" min="0" onchange="actualizarStock('${i.productoId}',${i.presIdx},'stock',this.value)" style="width:90px"></td><td><input type="number" value="${i.stock_minimo}" min="0" onchange="actualizarStock('${i.productoId}',${i.presIdx},'stock_minimo',this.value)" style="width:90px"></td><td><span style="color:${c};font-weight:600">${e}</span></td><td><button onclick="ajustarStock('${i.productoId}',${i.presIdx},10)" class="btn btn-primary btn-sm">+10</button> <button onclick="ajustarStock('${i.productoId}',${i.presIdx},-10)" class="btn btn-secondary btn-sm">-10</button></td>`;t.appendChild(tr);});}
function actualizarStock(pid,idx,campo,val){const p=productosData.productos.find(x=>x.id===pid);if(p&&p.presentaciones[idx])p.presentaciones[idx][campo]=parseInt(val)||0;filtrarStock();}
function ajustarStock(pid,idx,cant){const p=productosData.productos.find(x=>x.id===pid);if(p&&p.presentaciones[idx]){p.presentaciones[idx].stock=(p.presentaciones[idx].stock||0)+cant;if(p.presentaciones[idx].stock<0)p.presentaciones[idx].stock=0;filtrarStock();}}
function guardarStock(){descargarJSON(productosData,'productos.json');registrarActividad('stock','Stock guardado');toast('Stock guardado. Sube a GitHub.','success');}
function exportarStockExcel(){let csv='Producto,Presentacion,Stock,Minimo,Estado\n';stockFiltrado.forEach(i=>{csv+=`"${i.nombre}","${i.presentacion}",${i.stock},${i.stock_minimo},"${i.stock===0?'Agotado':i.stock<=i.stock_minimo?'Bajo':'OK'}"\n`;});descargarCSV(csv,'stock.csv');toast('Exportado','info');}

// ============================================
// PRODUCTOS
// ============================================
function filtrarProductos(){const f=(document.getElementById('buscarProducto').value||'').toLowerCase();const o=document.getElementById('mostrarOcultosProductos')?.checked;productosFiltrados=productosData.productos.filter(p=>(p.nombre.toLowerCase().includes(f)||p.id.toLowerCase().includes(f))&&(o||!p.oculto));mostrarProductosGestion();}
function mostrarProductosGestion(){const t=document.getElementById('productosBody');t.innerHTML='';productosFiltrados.forEach(prod=>{const cat=productosData.categorias.find(c=>c.id===prod.categoria)?.nombre||'';const presHTML=prod.presentaciones.map((p,i)=>`<div style="display:flex;gap:6px;margin-bottom:5px;align-items:center"><input type="text" value="${p.tamano}" onchange="actualizarPresentacion('${prod.id}',${i},'tamano',this.value)" style="width:80px;padding:5px;border:2px solid #e5e7eb;border-radius:6px;font-size:12px"><input type="number" value="${p.precio_base}" onchange="actualizarPresentacion('${prod.id}',${i},'precio',this.value)" style="width:100px;padding:5px;border:2px solid #e5e7eb;border-radius:6px;font-size:12px"><button onclick="eliminarPresentacion('${prod.id}',${i})" style="width:24px;height:24px;border:1px solid #ef4444;background:white;color:#ef4444;border-radius:4px;cursor:pointer;font-size:14px">×</button></div>`).join('');const o=prod.oculto||false;const tr=document.createElement('tr');tr.style.opacity=o?'0.5':'1';tr.innerHTML=`<td><strong>${prod.id}</strong></td><td><input type="text" value="${prod.nombre}" onchange="actualizarProducto('${prod.id}','nombre',this.value)"></td><td><select onchange="actualizarProducto('${prod.id}','categoria',this.value)">${productosData.categorias.map(c=>`<option value="${c.id}" ${c.id===prod.categoria?'selected':''}>${c.nombre}</option>`).join('')}</select></td><td><input type="text" value="${prod.subcategoria}" onchange="actualizarProducto('${prod.id}','subcategoria',this.value)"></td><td>${presHTML}<button onclick="agregarPresentacion('${prod.id}')" class="btn btn-primary" style="padding:4px 8px;font-size:11px">+</button></td><td><button onclick="toggleOcultarProducto('${prod.id}')" style="width:28px;height:28px;border:2px solid ${o?'#10b981':'#f59e0b'};background:white;color:${o?'#10b981':'#f59e0b'};border-radius:6px;cursor:pointer;margin-right:4px">${o?'👁️':'🙈'}</button><button onclick="eliminarProducto('${prod.id}')" style="width:28px;height:28px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer">🗑️</button></td>`;t.appendChild(tr);});}
function actualizarProducto(id,campo,val){const p=productosData.productos.find(x=>x.id===id);if(p)p[campo]=val;}
function actualizarPresentacion(id,idx,campo,val){const p=productosData.productos.find(x=>x.id===id);if(p&&p.presentaciones[idx]){if(campo==='precio')p.presentaciones[idx].precio_base=parseInt(val)||0;else p.presentaciones[idx].tamano=val;}}
function eliminarPresentacion(id,idx){const p=productosData.productos.find(x=>x.id===id);if(p&&p.presentaciones.length>1){p.presentaciones.splice(idx,1);mostrarProductosGestion();}else toast('Mínimo 1 presentación','warning');}
function agregarPresentacion(id){const p=productosData.productos.find(x=>x.id===id);if(p){p.presentaciones.push({tamano:'',precio_base:0});mostrarProductosGestion();}}
async function eliminarProducto(id){if(!await confirmar('Eliminar','¿Eliminar este producto?','🗑️'))return;const p=productosData.productos.find(x=>x.id===id);productosData.productos=productosData.productos.filter(x=>x.id!==id);productosFiltrados=productosFiltrados.filter(x=>x.id!==id);mostrarProductosGestion();if(p)registrarActividad('producto',`"${p.nombre}" eliminado`);toast('Eliminado','warning');}
function mostrarModalNuevoProducto(){document.getElementById('modalNuevoProducto').classList.add('show');}
function cerrarModal(){document.getElementById('modalNuevoProducto').classList.remove('show');}
function agregarNuevoProducto(){const n=document.getElementById('nuevoNombre').value;const c=document.getElementById('nuevoCategoria').value;const s=document.getElementById('nuevoSubcategoria').value;const pr=document.getElementById('nuevoPresentaciones').value;const p=parseInt(document.getElementById('nuevoPrecio').value)||0;if(!n||!c||!s||!pr){toast('Completa campos','warning');return;}const uid=productosData.productos.length>0?parseInt(productosData.productos[productosData.productos.length-1].id.replace('P','')): 0;productosData.productos.push({id:`P${String(uid+1).padStart(3,'0')}`,nombre:n,categoria:c,subcategoria:s,presentaciones:pr.split(',').map(x=>({tamano:x.trim(),precio_base:p}))});productosFiltrados=[...productosData.productos];mostrarProductosGestion();cerrarModal();['nuevoNombre','nuevoSubcategoria','nuevoPresentaciones','nuevoPrecio'].forEach(x=>document.getElementById(x).value='');registrarActividad('producto',`"${n}" agregado`);toast(`"${n}" agregado`,'success');}
function guardarProductos(){descargarJSON(productosData,'productos.json');registrarActividad('producto','Productos guardados');toast('Guardado. Sube a GitHub.','success');}
function toggleOcultarProducto(id){const p=productosData.productos.find(x=>x.id===id);if(p){p.oculto=!p.oculto;mostrarProductosGestion();descargarJSON(productosData,'productos.json');registrarActividad('producto',`"${p.nombre}" ${p.oculto?'ocultado':'mostrado'}`);toast(`${p.oculto?'Ocultado':'Mostrado'}`,'info');}}

// ============================================
// CLIENTES
// ============================================
function filtrarClientes(){const f=(document.getElementById('buscarCliente').value||'').toLowerCase();const o=document.getElementById('mostrarOcultosClientes')?.checked;clientesFiltrados=productosData.clientes.filter(c=>{const m=(c.nombre&&c.nombre.toLowerCase().includes(f))||(c.razon_social&&c.razon_social.toLowerCase().includes(f))||(c.ruc&&c.ruc.toLowerCase().includes(f))||(c.telefono&&c.telefono.includes(f))||(c.zona&&c.zona.toLowerCase().includes(f))||c.id.toLowerCase().includes(f);return m&&(o||!c.oculto);});mostrarClientesGestion();}
function mostrarClientesGestion(){const t=document.getElementById('clientesBody');t.innerHTML='';clientesFiltrados.forEach(c=>{const cp=c.precios_personalizados?Object.keys(c.precios_personalizados).length:0;const o=c.oculto||false;const tr=document.createElement('tr');tr.style.opacity=o?'0.5':'1';tr.innerHTML=`<td><strong>${c.id}</strong></td><td><input type="text" value="${c.razon_social||c.nombre||''}" onchange="actualizarCliente('${c.id}','razon_social',this.value)" style="min-width:180px"></td><td><input type="text" value="${c.ruc||''}" onchange="actualizarCliente('${c.id}','ruc',this.value)" style="min-width:110px"></td><td><input type="tel" value="${c.telefono||''}" onchange="actualizarCliente('${c.id}','telefono',this.value)" style="min-width:110px"></td><td><input type="text" value="${c.direccion||c.zona||''}" onchange="actualizarCliente('${c.id}','direccion',this.value)" style="min-width:180px"></td><td><input type="text" value="${c.encargado||''}" onchange="actualizarCliente('${c.id}','encargado',this.value)" style="min-width:130px"></td><td style="text-align:center">${cp>0?`<span style="color:#2563eb;font-weight:600">${cp}</span>`:'-'}</td><td><button onclick="toggleOcultarCliente('${c.id}')" style="width:28px;height:28px;border:2px solid ${o?'#10b981':'#f59e0b'};background:white;color:${o?'#10b981':'#f59e0b'};border-radius:6px;cursor:pointer;margin-right:4px">${o?'👁️':'🙈'}</button><button onclick="eliminarCliente('${c.id}')" style="width:28px;height:28px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer">🗑️</button></td>`;t.appendChild(tr);});}
function actualizarCliente(id,campo,val){const c=productosData.clientes.find(x=>x.id===id);if(c)c[campo]=val;}
async function eliminarCliente(id){if(!await confirmar('Eliminar','¿Eliminar cliente?','🗑️'))return;const c=productosData.clientes.find(x=>x.id===id);productosData.clientes=productosData.clientes.filter(x=>x.id!==id);clientesFiltrados=clientesFiltrados.filter(x=>x.id!==id);mostrarClientesGestion();if(c)registrarActividad('cliente',`"${c.nombre}" eliminado`);toast('Eliminado','warning');}
function toggleOcultarCliente(id){const c=productosData.clientes.find(x=>x.id===id);if(c){c.oculto=!c.oculto;mostrarClientesGestion();descargarJSON(productosData,'productos.json');registrarActividad('cliente',`"${c.nombre}" ${c.oculto?'ocultado':'mostrado'}`);toast(`${c.oculto?'Ocultado':'Mostrado'}`,'info');}}
function mostrarModalNuevoCliente(){document.getElementById('modalNuevoCliente').classList.add('show');}
function cerrarModalCliente(){document.getElementById('modalNuevoCliente').classList.remove('show');}
function agregarNuevoCliente(){const r=document.getElementById('nuevoClienteRazon').value.trim();const ruc=document.getElementById('nuevoClienteRUC').value.trim();const tel=document.getElementById('nuevoClienteTelefono').value.trim();const dir=document.getElementById('nuevoClienteDireccion').value.trim();const enc=document.getElementById('nuevoClienteEncargado').value.trim();if(!r||!ruc||!tel||!dir){toast('Completa campos','warning');return;}const uid=productosData.clientes.length>0?parseInt(productosData.clientes[productosData.clientes.length-1].id.replace('C','')):0;productosData.clientes.push({id:`C${String(uid+1).padStart(3,'0')}`,nombre:r,razon_social:r,ruc,telefono:tel,direccion:dir,encargado:enc,zona:dir,tipo:'mayorista_estandar',precios_personalizados:{}});clientesFiltrados=[...productosData.clientes];mostrarClientesGestion();cerrarModalCliente();['nuevoClienteRazon','nuevoClienteRUC','nuevoClienteTelefono','nuevoClienteDireccion','nuevoClienteEncargado'].forEach(x=>document.getElementById(x).value='');registrarActividad('cliente',`"${r}" agregado`);toast(`"${r}" agregado`,'success');}
function guardarClientes(){descargarJSON(productosData,'productos.json');registrarActividad('cliente','Clientes guardados');toast('Guardado. Sube a GitHub.','success');}

// ============================================
// PRECIOS POR CLIENTE
// ============================================
function cargarPreciosCliente(){const cid=document.getElementById('preciosCliente').value;if(!cid){document.getElementById('preciosCard').style.display='none';return;}clienteActualPrecios=productosData.clientes.find(c=>c.id===cid);const t=document.getElementById('preciosBody');t.innerHTML='';productosData.productos.forEach(prod=>{prod.presentaciones.forEach((pres,idx)=>{const pp=clienteActualPrecios.precios_personalizados?.[prod.id]?.find(p=>p.tamano===pres.tamano)?.precio||'';const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${prod.nombre}</strong></td><td>${pres.tamano}</td><td>Gs. ${pres.precio_base.toLocaleString()}</td><td><input type="number" id="precio_${prod.id}_${idx}" value="${pp}" placeholder="Vacío = base" data-producto="${prod.id}" data-tamano="${pres.tamano}"></td>`;t.appendChild(tr);});});document.getElementById('preciosCard').style.display='block';}
function guardarPreciosPersonalizados(){if(!clienteActualPrecios)return;const np={};document.querySelectorAll('[data-producto]').forEach(i=>{const pid=i.dataset.producto;const tam=i.dataset.tamano;const pr=parseInt(i.value)||0;if(pr>0){if(!np[pid])np[pid]=[];np[pid].push({tamano:tam,precio:pr});}});const c=productosData.clientes.find(x=>x.id===clienteActualPrecios.id);c.precios_personalizados=np;descargarJSON(productosData,'productos.json');registrarActividad('cliente',`Precios de ${c.nombre} actualizados`);toast('Precios guardados. Sube a GitHub.','success');}

// ============================================
// CATÁLOGO, RUTAS, HERRAMIENTAS (preserved from v3.1)
// ============================================
let catalogoImagenActualId=null;
function inicializarCatalogo(){const s=document.getElementById('filtroCatalogoCat');if(s.options.length<=1)productosData.categorias.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.nombre;s.appendChild(o);});renderCatalogo();}
function renderCatalogo(){const f=(document.getElementById('buscarCatalogo')?.value||'').toLowerCase();const cat=document.getElementById('filtroCatalogoCat')?.value||'';const mo=document.getElementById('catalogoMostrarOcultos')?.checked;const imgs=JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}');const g=document.getElementById('catalogoGrid');let prods=productosData.productos.filter(p=>(!mo?!p.oculto:true)&&(!cat||p.categoria===cat)&&(!f||p.nombre.toLowerCase().includes(f)));if(!prods.length){g.innerHTML='<div class="dash-empty" style="grid-column:1/-1;padding:60px">Sin productos</div>';return;}g.innerHTML=prods.map(p=>{const img=imgs[p.id];const cn=productosData.categorias.find(c=>c.id===p.categoria)?.nombre||'';return`<div class="catalogo-item ${p.oculto?'catalogo-oculto':''}" onclick="abrirModalImagen('${p.id}')"><div class="catalogo-img">${img?`<img src="${img}">` :'📦'}</div><div class="catalogo-info"><div class="catalogo-nombre">${p.nombre}</div><div class="catalogo-cat">${cn}</div><div class="catalogo-precios">${p.presentaciones.map(pr=>`<span class="catalogo-precio">${pr.tamano} Gs.${pr.precio_base.toLocaleString()}</span>`).join('')}</div></div></div>`;}).join('');}
function abrirModalImagen(id){catalogoImagenActualId=id;const imgs=JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}');const img=imgs[id];const p=document.getElementById('imgPreview');const b=document.getElementById('btnEliminarImg');if(img){p.innerHTML=`<img src="${img}" style="max-width:200px;max-height:200px;border-radius:12px">`;b.style.display='inline-block';}else{p.innerHTML='📦';p.style.cssText='width:200px;height:200px;background:#f3f4f6;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:64px;color:#d1d5db';b.style.display='none';}document.getElementById('catalogoImgInput').value='';document.getElementById('modalImagenCatalogo').classList.add('show');}
function cerrarModalImagen(){document.getElementById('modalImagenCatalogo').classList.remove('show');}
function previsualizarImagen(e){const f=e.target.files[0];if(!f)return;if(f.size>3*1024*1024){toast('Máx 3MB','warning');e.target.value='';return;}const r=new FileReader();r.onload=ev=>{document.getElementById('imgPreview').innerHTML=`<img src="${ev.target.result}" style="max-width:200px;max-height:200px;border-radius:12px">`;};r.readAsDataURL(f);}
function guardarImagenCatalogo(){if(!catalogoImagenActualId)return;const fi=document.getElementById('catalogoImgInput');if(fi.files[0]){const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{const cv=document.createElement('canvas');const mx=400;let w=img.width,h=img.height;if(w>mx||h>mx){if(w>h){h=Math.round(h*mx/w);w=mx;}else{w=Math.round(w*mx/h);h=mx;}}cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);try{const imgs=JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}');imgs[catalogoImagenActualId]=cv.toDataURL('image/jpeg',0.7);localStorage.setItem('hdv_catalogo_imgs',JSON.stringify(imgs));toast('Imagen guardada','success');cerrarModalImagen();renderCatalogo();}catch(er){toast('Sin espacio','error');}};img.src=e.target.result;};r.readAsDataURL(fi.files[0]);}else cerrarModalImagen();}
function eliminarImagenCatalogo(){if(!catalogoImagenActualId)return;const imgs=JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}');delete imgs[catalogoImagenActualId];localStorage.setItem('hdv_catalogo_imgs',JSON.stringify(imgs));toast('Eliminada','info');cerrarModalImagen();renderCatalogo();}

// RUTAS
function inicializarRutas(){const s=document.getElementById('filtroZonaRuta');if(s.options.length<=1)[...new Set(productosData.clientes.map(c=>c.zona))].forEach(z=>{const o=document.createElement('option');o.value=z;o.textContent=z;s.appendChild(o);});const sc=document.getElementById('rutaCliente');if(!sc.options.length)productosData.clientes.filter(c=>!c.oculto).forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.nombre} — ${c.zona}`;sc.appendChild(o);});const h=new Date();const si=document.getElementById('filtroSemanaRuta');if(!si.value){const y=h.getFullYear();const ns=Math.ceil(((h-new Date(y,0,1))/86400000+new Date(y,0,1).getDay()+1)/7);si.value=`${y}-W${String(ns).padStart(2,'0')}`;}document.getElementById('rutaFecha').valueAsDate=h;renderRutas();}
function obtenerRutas(){return JSON.parse(localStorage.getItem('hdv_rutas')||'[]');}
function guardarRutasLS(r){localStorage.setItem('hdv_rutas',JSON.stringify(r));}
function renderRutas(){const rutas=obtenerRutas();const sem=document.getElementById('filtroSemanaRuta').value;const zona=document.getElementById('filtroZonaRuta').value;let fi,ff;if(sem){const[y,w]=sem.split('-W').map(Number);fi=getDateOfISOWeek(w,y);ff=new Date(fi);ff.setDate(ff.getDate()+6);}const dias=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];const colD=['#6b7280','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];const bgD=['#f3f4f6','#dbeafe','#d1fae5','#fef3c7','#ede9fe','#fee2e2','#fce7f3'];let flt=rutas;if(fi&&ff)flt=rutas.filter(r=>{const f=new Date(r.fecha);return f>=fi&&f<=ff;});if(zona)flt=flt.filter(r=>{const c=productosData.clientes.find(x=>x.id===r.clienteId);return c&&c.zona===zona;});const pd={};flt.sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.hora||'').localeCompare(b.hora||'')).forEach(r=>{if(!pd[r.fecha])pd[r.fecha]=[];pd[r.fecha].push(r);});const co=document.getElementById('rutasContainer');const hoyStr=new Date().toISOString().split('T')[0];if(!Object.keys(pd).length){co.innerHTML='<div class="card"><div class="dash-empty">📍 Sin visitas<br><br><button class="btn btn-primary" onclick="mostrarModalNuevaRuta()">+ Primera Visita</button></div></div>';}else{co.innerHTML=Object.entries(pd).map(([fecha,vis])=>{const d=new Date(fecha+'T12:00:00');const dn=d.getDay();const eh=fecha===hoyStr;return`<div class="ruta-card" style="${eh?'border:2px solid #3b82f6':''}"><div class="ruta-dia" style="background:${bgD[dn]};color:${colD[dn]}"><span class="ruta-dia-nombre">${dias[dn]}</span><span class="ruta-dia-num">${d.getDate()}</span></div><div style="flex:1">${eh?'<div style="font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;margin-bottom:6px">— Hoy —</div>':''}${vis.map(v=>{const cl=productosData.clientes.find(c=>c.id===v.clienteId);return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px"><div class="ruta-check ${v.completada?'done':''}" onclick="toggleVisitaCompletada('${v.id}')">${v.completada?'✓':''}</div><div style="flex:1;${v.completada?'text-decoration:line-through;opacity:0.6':''}"><strong>${cl?.nombre||'?'}</strong><div style="font-size:12px;color:#6b7280">🕐 ${v.hora||''} • 📍 ${cl?.zona||''}</div>${v.notas?`<div style="font-size:11px;color:#9ca3af;font-style:italic">📝 ${v.notas}</div>`:''}</div>${cl?.telefono?`<button onclick="window.open('https://wa.me/595${cl.telefono.replace(/^0/,'')}','_blank')" class="btn btn-success btn-sm">📱</button>`:''}<button onclick="eliminarVisita('${v.id}')" class="btn btn-danger btn-sm">✕</button></div>`;}).join('')}</div></div>`;}).join('');}document.getElementById('rutasTotalVisitas').textContent=flt.length;document.getElementById('rutasCompletadas').textContent=flt.filter(r=>r.completada).length;document.getElementById('rutasPendientes').textContent=flt.filter(r=>!r.completada).length;}
function getDateOfISOWeek(w,y){const s=new Date(y,0,1+(w-1)*7);const d=s.getDay();if(d<=4)s.setDate(s.getDate()-s.getDay()+1);else s.setDate(s.getDate()+8-s.getDay());return s;}
function mostrarModalNuevaRuta(){document.getElementById('modalNuevaRuta').classList.add('show');}
function cerrarModalRuta(){document.getElementById('modalNuevaRuta').classList.remove('show');}
function guardarNuevaRuta(){const cid=document.getElementById('rutaCliente').value;const f=document.getElementById('rutaFecha').value;const h=document.getElementById('rutaHora').value;const n=document.getElementById('rutaNotas').value.trim();if(!cid||!f){toast('Selecciona cliente y fecha','warning');return;}const rutas=obtenerRutas();const cl=productosData.clientes.find(c=>c.id===cid);rutas.push({id:'R'+Date.now(),clienteId:cid,fecha:f,hora:h||'09:00',notas:n,completada:false});guardarRutasLS(rutas);registrarActividad('cliente',`Visita: ${cl?.nombre||cid} → ${f}`);toast(`Visita programada`,'success');cerrarModalRuta();document.getElementById('rutaNotas').value='';renderRutas();}
function toggleVisitaCompletada(id){const r=obtenerRutas();const v=r.find(x=>x.id===id);if(v){v.completada=!v.completada;guardarRutasLS(r);if(v.completada)toast('Completada ✓','success');renderRutas();}}
async function eliminarVisita(id){if(!await confirmar('Eliminar','¿Eliminar visita?','📍'))return;guardarRutasLS(obtenerRutas().filter(r=>r.id!==id));toast('Eliminada','warning');renderRutas();}

// HERRAMIENTAS
function crearBackup(){descargarJSON({fecha:new Date().toISOString(),version:'4.1',datos:{productos:productosData,pedidos:todosLosPedidos,actividad:JSON.parse(localStorage.getItem('hdv_actividad')||'[]'),catalogo_imgs:JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}'),rutas:JSON.parse(localStorage.getItem('hdv_rutas')||'[]')}},`hdv_backup_${new Date().toISOString().split('T')[0]}.json`);registrarActividad('sistema','Backup creado');toast('Backup descargado','success');}
function restaurarBackup(e){const f=e.target.files[0];if(!f)return;confirmar('Restaurar','Reemplazará todos los datos. ¿Continuar?','📤','Restaurar','btn-primary').then(ok=>{if(!ok){e.target.value='';return;}const r=new FileReader();r.onload=ev=>{try{const b=JSON.parse(ev.target.result);if(b.datos){productosData=b.datos.productos;localStorage.setItem('hdv_pedidos',JSON.stringify(b.datos.pedidos));if(b.datos.actividad)localStorage.setItem('hdv_actividad',JSON.stringify(b.datos.actividad));if(b.datos.catalogo_imgs)localStorage.setItem('hdv_catalogo_imgs',JSON.stringify(b.datos.catalogo_imgs));if(b.datos.rutas)localStorage.setItem('hdv_rutas',JSON.stringify(b.datos.rutas));registrarActividad('sistema','Backup restaurado');toast('Restaurado. Recargando...','success');setTimeout(()=>location.reload(),1500);}}catch(er){toast('Archivo inválido','error');}e.target.value='';};r.readAsText(f);});}
function descargarPlantillaExcel(){descargarCSV('Nombre,Categoria,Subcategoria,Presentacion,Precio\nEjemplo,cuidado_personal,Jabones,125g,5000\n','plantilla_productos.csv');toast('Descargada','info');}
function importarProductosExcel(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const ls=ev.target.result.split('\n').filter(l=>l.trim());ls.shift();let n=0;ls.forEach(l=>{const[nom,cat,sub,pres,pre]=l.split(',').map(s=>s.trim());if(!nom||!cat)return;const uid=productosData.productos.length>0?parseInt(productosData.productos[productosData.productos.length-1].id.replace('P','')):0;productosData.productos.push({id:`P${String(uid+n+1).padStart(3,'0')}`,nombre:nom,categoria:cat,subcategoria:sub||'General',presentaciones:[{tamano:pres||'Unidad',precio_base:parseInt(pre)||0}]});n++;});if(n>0){descargarJSON(productosData,'productos.json');registrarActividad('producto',`${n} importados`);toast(`${n} productos importados`,'success');}}catch(er){toast('Error: '+er.message,'error');}e.target.value='';};r.readAsText(f);}
function descargarPlantillaClientes(){descargarCSV('Razon Social,RUC,Telefono,Direccion,Encargado\nEjemplo S.A.,80012345-6,0981234567,"Av. Central",Juan\n','plantilla_clientes.csv');toast('Descargada','info');}
function importarClientesExcel(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const ls=ev.target.result.split('\n').filter(l=>l.trim());ls.shift();let n=0;ls.forEach(l=>{const[raz,ruc,tel,dir,enc]=l.split(',').map(s=>s.trim().replace(/^"|"$/g,''));if(!raz||!ruc)return;const uid=productosData.clientes.length>0?parseInt(productosData.clientes[productosData.clientes.length-1].id.replace('C','')):0;productosData.clientes.push({id:`C${String(uid+n+1).padStart(3,'0')}`,nombre:raz,razon_social:raz,ruc,telefono:tel||'',direccion:dir||'',encargado:enc||'',zona:dir||'',tipo:'mayorista_estandar',oculto:false,precios_personalizados:{}});n++;});if(n>0){descargarJSON(productosData,'productos.json');registrarActividad('cliente',`${n} importados`);toast(`${n} clientes importados`,'success');}}catch(er){toast('Error: '+er.message,'error');}e.target.value='';};r.readAsText(f);}
function limpiarPedidos(){confirmar('Borrar Pedidos','¿ELIMINAR TODOS los pedidos?','🗑️').then(ok=>{if(!ok)return;confirmar('Seguro?','No se puede deshacer.','⚠️').then(ok2=>{if(!ok2)return;localStorage.removeItem('hdv_pedidos');todosLosPedidos=[];registrarActividad('sistema','Pedidos eliminados');toast('Eliminados','warning');setTimeout(()=>location.reload(),1500);});});}
function limpiarStockLocal(){confirmar('Resetear Stock','¿Resetear stock local?','📊').then(ok=>{if(!ok)return;localStorage.removeItem('stock_local');registrarActividad('stock','Stock reseteado');toast('Reseteado','success');});}

// ============================================
// CHECKLIST DE CARGA
// ============================================
let checklistChecked={};
function renderChecklist(){
    const preparados=todosLosPedidos.filter(p=>getEstado(p)==='preparado');
    checklistChecked=JSON.parse(localStorage.getItem('hdv_checklist_checked')||'{}');
    // Group all items across all preparados
    const agrupado={};let totalUnidades=0;
    preparados.forEach(p=>{
        p.items.forEach(item=>{
            const key=`${item.nombre}|${item.presentacion}`;
            if(!agrupado[key])agrupado[key]={nombre:item.nombre,presentacion:item.presentacion,cantidad:0,pedidos:[]};
            agrupado[key].cantidad+=item.cantidad;
            agrupado[key].pedidos.push({clienteNombre:p.cliente.nombre,cantidad:item.cantidad,pedidoId:p.id});
            totalUnidades+=item.cantidad;
        });
    });
    const items=Object.values(agrupado).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const checkedCount=items.filter(i=>checklistChecked[`${i.nombre}|${i.presentacion}`]).length;
    const pct=items.length>0?Math.round(checkedCount/items.length*100):0;
    // Stats
    document.getElementById('checkPedidos').textContent=preparados.length;
    document.getElementById('checkProductos').textContent=items.length;
    document.getElementById('checkUnidades').textContent=totalUnidades;
    document.getElementById('checkProgreso').textContent=`${pct}%`;
    // Grid by category
    const grid=document.getElementById('checklistGrid');
    if(items.length===0){grid.innerHTML='<div class="card" style="grid-column:1/-1"><div class="empty-state"><div style="font-size:48px;margin-bottom:15px">📦</div>No hay pedidos PREPARADOS para cargar<br><br>Mové pedidos a estado PREPARADO desde el Pipeline.</div></div>';document.getElementById('checklistPorPedido').innerHTML='';return;}
    // Group by first letter for visual grouping
    const grupos={};items.forEach(i=>{const letra=i.nombre.charAt(0).toUpperCase();if(!grupos[letra])grupos[letra]=[];grupos[letra].push(i);});
    grid.innerHTML=Object.entries(grupos).sort((a,b)=>a[0].localeCompare(b[0])).map(([letra,prods])=>{
        const checkedInGroup=prods.filter(i=>checklistChecked[`${i.nombre}|${i.presentacion}`]).length;
        const pctG=Math.round(checkedInGroup/prods.length*100);
        return`<div class="checklist-cat"><div class="checklist-cat-header" style="background:#eff6ff;color:#2563eb"><span>${letra} — ${prods.length} productos</span><span>${checkedInGroup}/${prods.length}</span></div><div class="checklist-progress"><div class="checklist-progress-bar" style="width:${pctG}%"></div></div>${prods.map(i=>{
            const key=`${i.nombre}|${i.presentacion}`;const done=checklistChecked[key];
            return`<div class="checklist-item ${done?'checked':''}" onclick="toggleChecklistItem('${key.replace(/'/g,"\\'")}')"><div class="checklist-check ${done?'done':''}">${done?'✓':''}</div><div class="checklist-name"><strong>${i.nombre}</strong><div class="checklist-detail">${i.presentacion} • ${i.pedidos.length} pedido${i.pedidos.length>1?'s':''}: ${i.pedidos.map(p=>`${p.clienteNombre} (${p.cantidad})`).join(', ')}</div></div><div class="checklist-qty">${i.cantidad}</div></div>`;
        }).join('')}</div>`;
    }).join('');
    // Detail per order
    const ppDiv=document.getElementById('checklistPorPedido');
    ppDiv.innerHTML=preparados.map(p=>{
        const cl=productosData.clientes.find(c=>c.id===p.cliente.id);
        return`<div style="padding:14px 0;border-bottom:1px solid #f3f4f6"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><strong>${p.cliente.nombre}</strong><span style="font-size:12px;color:#6b7280;margin-left:8px">📍 ${cl?.zona||''}</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:#eff6ff;color:#2563eb" onclick="generarRemitoPDF('${p.id}')">📄 Remito</button><button class="btn btn-sm" style="background:${ESTADOS.en_ruta.bg};color:${ESTADOS.en_ruta.color}" onclick="avanzarEstado('${p.id}')">🚛 A Ruta</button></div></div><div style="font-size:13px;color:#6b7280;margin-top:6px">${p.items.map(i=>`${i.nombre} (${i.presentacion}) ×${i.cantidad}`).join(' • ')}</div><div style="font-size:15px;font-weight:700;color:#2563eb;margin-top:4px">Gs. ${p.total.toLocaleString()}</div></div>`;
    }).join('');
}

function toggleChecklistItem(key){
    checklistChecked[key]=!checklistChecked[key];
    localStorage.setItem('hdv_checklist_checked',JSON.stringify(checklistChecked));
    renderChecklist();
}

function copiarChecklist(){
    const preparados=todosLosPedidos.filter(p=>getEstado(p)==='preparado');
    const agrupado={};
    preparados.forEach(p=>p.items.forEach(i=>{const k=`${i.nombre}|${i.presentacion}`;if(!agrupado[k])agrupado[k]={nombre:i.nombre,pres:i.presentacion,cant:0};agrupado[k].cant+=i.cantidad;}));
    let txt='📦 CHECKLIST DE CARGA\n'+new Date().toLocaleDateString('es-PY')+'\n\n';
    Object.values(agrupado).sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach(i=>{txt+=`☐ ${i.nombre} (${i.pres}) — ${i.cant} uds\n`;});
    txt+=`\n📊 ${preparados.length} pedidos | ${Object.keys(agrupado).length} productos`;
    navigator.clipboard.writeText(txt);toast('Checklist copiada','success');
}

function imprimirChecklist(){
    const preparados=todosLosPedidos.filter(p=>getEstado(p)==='preparado');
    const agrupado={};
    preparados.forEach(p=>p.items.forEach(i=>{const k=`${i.nombre}|${i.presentacion}`;if(!agrupado[k])agrupado[k]={nombre:i.nombre,pres:i.presentacion,cant:0};agrupado[k].cant+=i.cantidad;}));
    const items=Object.values(agrupado).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const w=window.open('','','width=400,height=600');
    w.document.write(`<html><head><title>Checklist</title><style>body{font-family:monospace;font-size:13px;padding:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:6px;text-align:left}th{background:#eee}.hdr{text-align:center;margin-bottom:10px}@media print{body{padding:5mm}}</style></head><body><div class="hdr"><strong>HDV DISTRIBUCIONES</strong><br>CHECKLIST DE CARGA<br>${new Date().toLocaleDateString('es-PY')}</div><table><tr><th>☐</th><th>Producto</th><th>Pres.</th><th>Cant.</th></tr>${items.map(i=>`<tr><td>☐</td><td>${i.nombre}</td><td>${i.pres}</td><td><strong>${i.cant}</strong></td></tr>`).join('')}</table><p style="margin-top:10px">${preparados.length} pedidos | ${items.length} productos</p></body></html>`);
    w.document.close();w.focus();setTimeout(()=>w.print(),300);
}

async function avanzarTodosPreparados(){
    const preparados=todosLosPedidos.filter(p=>getEstado(p)==='preparado');
    if(preparados.length===0){toast('No hay pedidos preparados','info');return;}
    if(!await confirmar('Todos a Ruta',`¿Mover ${preparados.length} pedidos a EN RUTA?`,'🚛','Sí, todos a ruta','btn-primary'))return;
    preparados.forEach(p=>p.estado='en_ruta');
    guardarPedidosLS();
    localStorage.removeItem('hdv_checklist_checked');
    registrarActividad('pedido',`🚛 ${preparados.length} pedidos movidos a EN RUTA`);
    toast(`${preparados.length} pedidos en ruta`,'success');
    renderChecklist();renderPipeline();cargarDashboard();
}

// ============================================
// PDF REMITO / FACTURA
// ============================================
function generarRemitoPDF(pedidoId){
    const p=todosLosPedidos.find(x=>x.id===pedidoId);if(!p)return;
    const cl=productosData.clientes.find(c=>c.id===p.cliente.id);
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const w=210,mg=15;
    // Header
    doc.setFillColor(37,99,235);doc.rect(0,0,w,36,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(20);doc.setFont(undefined,'bold');
    doc.text('HDV DISTRIBUCIONES',mg,16);
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.text('Remito de Entrega',mg,24);
    doc.text(`N° ${p.id}`,w-mg,16,{align:'right'});
    doc.text(new Date().toLocaleDateString('es-PY',{day:'2-digit',month:'long',year:'numeric'}),w-mg,24,{align:'right'});
    // Client info
    doc.setTextColor(0,0,0);let y=46;
    doc.setFillColor(243,244,246);doc.rect(mg,y-6,w-mg*2,28,'F');
    doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text('CLIENTE',mg+4,y);
    doc.setFont(undefined,'normal');doc.setFontSize(10);
    doc.text(`Razón Social: ${cl?.razon_social||cl?.nombre||p.cliente.nombre}`,mg+4,y+7);
    doc.text(`RUC: ${cl?.ruc||'—'}`,mg+4,y+14);
    doc.text(`Dirección: ${cl?.direccion||cl?.zona||'—'}`,mg+4,y+21);
    doc.text(`Tel: ${cl?.telefono||'—'}`,w/2+10,y+14);
    // Estado
    y+=34;
    const estado=getEstado(p);const s=ESTADOS[estado];
    doc.setFontSize(9);doc.setTextColor(100,100,100);
    doc.text(`Estado: ${s.label}${p.nota_edicion?' | Nota: '+p.nota_edicion:''}`,mg,y);
    doc.text(`Pedido: ${new Date(p.fecha).toLocaleString('es-PY')}`,w-mg,y,{align:'right'});
    y+=6;
    // Items table
    const tableData=p.items.map((item,i)=>[i+1,item.nombre,item.presentacion,item.cantidad,`Gs. ${item.precio_unitario.toLocaleString()}`,`Gs. ${item.subtotal.toLocaleString()}`]);
    doc.autoTable({
        startY:y,
        head:[['#','Producto','Presentación','Cant.','P. Unit.','Subtotal']],
        body:tableData,
        theme:'striped',
        headStyles:{fillColor:[37,99,235],textColor:255,fontStyle:'bold',fontSize:9},
        bodyStyles:{fontSize:9},
        columnStyles:{0:{halign:'center',cellWidth:10},3:{halign:'center',cellWidth:15},4:{halign:'right',cellWidth:30},5:{halign:'right',cellWidth:32}},
        margin:{left:mg,right:mg}
    });
    // Total
    y=doc.lastAutoTable.finalY+6;
    doc.setFillColor(37,99,235);doc.rect(w/2,y-4,w/2-mg,14,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(14);doc.setFont(undefined,'bold');
    doc.text(`TOTAL: Gs. ${p.total.toLocaleString()}`,w-mg-4,y+5,{align:'right'});
    // Payment method
    y+=18;doc.setTextColor(0,0,0);doc.setFontSize(9);doc.setFont(undefined,'normal');
    doc.text(`Forma de Pago: ${p.tipo_pago==='credito'?'CRÉDITO':'CONTADO'}`,mg,y);
    // Signatures
    y+=20;const sigW=(w-mg*2-20)/2;
    doc.line(mg,y,mg+sigW,y);doc.line(w-mg-sigW,y,w-mg,y);
    doc.setFontSize(8);
    doc.text('Firma Entrega',mg+(sigW/2),y+5,{align:'center'});
    doc.text('Firma Recepción',w-mg-(sigW/2),y+5,{align:'center'});
    // Footer
    doc.setFontSize(7);doc.setTextColor(150,150,150);
    doc.text('HDV Distribuciones — Documento generado automáticamente',w/2,285,{align:'center'});
    // Download
    doc.save(`remito_${p.id}_${p.cliente.nombre.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
    registrarActividad('pedido',`📄 Remito generado: ${p.cliente.nombre}`);
    toast('Remito PDF descargado','success');
}

// ============================================
// VENTAS EXPORT & WEEKLY SUMMARY
// ============================================
function exportarVentasCSV(){
    const ventas=todosLosPedidos.filter(p=>getEstado(p)==='entregado'||getEstado(p)==='parcial');
    let csv='Fecha Entrega,Cliente,Zona,Estado,Producto,Presentacion,Cantidad,Precio Unit,Subtotal,Total Pedido,Pago\n';
    ventas.forEach(p=>{const cl=productosData.clientes.find(c=>c.id===p.cliente.id);p.items.forEach((i,idx)=>{csv+=`"${p.fecha_entrega||p.fecha}","${p.cliente.nombre}","${cl?.zona||''}","${getEstado(p)}","${i.nombre}","${i.presentacion}",${i.cantidad},${i.precio_unitario},${i.subtotal},${idx===0?p.total:''},"${p.tipo_pago||'contado'}"\n`;});});
    descargarCSV(csv,`ventas_${new Date().toISOString().split('T')[0]}.csv`);toast('Exportado','info');
}

function generarResumenSemanalPDF(){
    const ventas=todosLosPedidos.filter(p=>{const e=getEstado(p);return e==='entregado'||e==='parcial';});
    if(ventas.length===0){toast('Sin ventas para resumir','warning');return;}
    // Group by week
    const hoy=new Date();const inicioSemana=new Date(hoy);inicioSemana.setDate(hoy.getDate()-hoy.getDay());inicioSemana.setHours(0,0,0,0);
    const semana=ventas.filter(p=>new Date(p.fecha_entrega||p.fecha)>=inicioSemana);
    // Show weekly summary card
    const resDiv=document.getElementById('ventasResumenSemanal');
    if(semana.length===0){resDiv.style.display='none';toast('Sin ventas esta semana','warning');return;}
    // Group by client
    const porCliente={};semana.forEach(p=>{if(!porCliente[p.cliente.nombre])porCliente[p.cliente.nombre]={total:0,pedidos:0,zona:''};porCliente[p.cliente.nombre].total+=p.total;porCliente[p.cliente.nombre].pedidos++;const cl=productosData.clientes.find(c=>c.id===p.cliente.id);porCliente[p.cliente.nombre].zona=cl?.zona||'';});
    // Group by product
    const porProd={};semana.forEach(p=>{p.items.forEach(i=>{const k=`${i.nombre} (${i.presentacion})`;if(!porProd[k])porProd[k]={cant:0,total:0};porProd[k].cant+=i.cantidad;porProd[k].total+=i.subtotal;});});
    const totalSemana=semana.reduce((s,p)=>s+p.total,0);
    // Generate PDF
    const{jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});const w=210,mg=15;
    // Header
    doc.setFillColor(37,99,235);doc.rect(0,0,w,32,'F');
    doc.setTextColor(255);doc.setFontSize(18);doc.setFont(undefined,'bold');
    doc.text('RESUMEN SEMANAL DE VENTAS',mg,15);
    doc.setFontSize(10);doc.setFont(undefined,'normal');
    doc.text(`HDV Distribuciones — Semana del ${inicioSemana.toLocaleDateString('es-PY')}`,mg,24);
    doc.text(new Date().toLocaleDateString('es-PY'),w-mg,15,{align:'right'});
    // Summary
    let y=42;doc.setTextColor(0);doc.setFontSize(12);doc.setFont(undefined,'bold');
    doc.text(`Total Ventas: Gs. ${totalSemana.toLocaleString()}`,mg,y);
    doc.text(`${semana.length} entregas`,w-mg,y,{align:'right'});
    y+=10;
    // Table by client
    const clData=Object.entries(porCliente).sort((a,b)=>b[1].total-a[1].total).map(([nom,d])=>[nom,d.zona,d.pedidos,`Gs. ${d.total.toLocaleString()}`]);
    doc.autoTable({startY:y,head:[['Cliente','Zona','Entregas','Total']],body:clData,theme:'striped',headStyles:{fillColor:[37,99,235],textColor:255,fontStyle:'bold',fontSize:9},bodyStyles:{fontSize:9},columnStyles:{3:{halign:'right'}},margin:{left:mg,right:mg}});
    y=doc.lastAutoTable.finalY+10;
    // Table by product
    const prData=Object.entries(porProd).sort((a,b)=>b[1].total-a[1].total).slice(0,20).map(([nom,d])=>[nom,d.cant,`Gs. ${d.total.toLocaleString()}`]);
    doc.setFontSize(11);doc.setFont(undefined,'bold');doc.text('Top Productos',mg,y);y+=4;
    doc.autoTable({startY:y,head:[['Producto','Unidades','Total']],body:prData,theme:'striped',headStyles:{fillColor:[16,185,129],textColor:255,fontStyle:'bold',fontSize:9},bodyStyles:{fontSize:9},columnStyles:{1:{halign:'center'},2:{halign:'right'}},margin:{left:mg,right:mg}});
    // Footer
    doc.setFontSize(7);doc.setTextColor(150);doc.text('HDV Distribuciones — Resumen generado automáticamente',w/2,285,{align:'center'});
    doc.save(`resumen_semanal_${inicioSemana.toISOString().split('T')[0]}.pdf`);
    toast('Resumen PDF descargado','success');
    registrarActividad('sistema','📄 Resumen semanal PDF generado');
}

// ============================================
// UTILITIES
// ============================================
let chartInstance=null;
function mostrarGrafico(labels,datos,titulo){const ctx=document.getElementById('chartReporte').getContext('2d');if(chartInstance)chartInstance.destroy();chartInstance=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:titulo,data:datos,backgroundColor:'rgba(37,99,235,0.8)',borderColor:'rgba(37,99,235,1)',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},title:{display:true,text:titulo,font:{size:16,weight:'bold'}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'Gs. '+v.toLocaleString()}}}}});document.getElementById('graficoReporte').style.display='block';}
function descargarCSV(c,n){const b=new Blob([c],{type:'text/csv;charset=utf-8;'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=n;l.click();}
function descargarJSON(d,n){const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=n;l.click();}

// SERVICE WORKER
async function registrarServiceWorker(){if('serviceWorker' in navigator){try{const r=await navigator.serviceWorker.register('service-worker.js');r.addEventListener('updatefound',()=>{const n=r.installing;n.addEventListener('statechange',()=>{if(n.state==='installed'&&navigator.serviceWorker.controller){const b=document.getElementById('updateButton');if(b)b.style.display='block';}});});setInterval(()=>r.update(),30000);}catch(e){console.log('SW:',e);}}}
function actualizarAhora(){if('serviceWorker' in navigator){navigator.serviceWorker.getRegistration().then(r=>{if(r&&r.waiting)r.waiting.postMessage('SKIP_WAITING');});if('caches' in window)caches.keys().then(n=>n.forEach(x=>caches.delete(x)));setTimeout(()=>window.location.reload(true),500);}}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload());
window.addEventListener('load',()=>{registrarServiceWorker();
    window.addEventListener('online',()=>{document.getElementById('offlineBar').classList.remove('show');toast('Conexión restaurada','success');});
    window.addEventListener('offline',()=>{document.getElementById('offlineBar').classList.add('show');toast('Sin conexión — modo offline','warning',5000);});
    if(!navigator.onLine)document.getElementById('offlineBar').classList.add('show');
});

// ============================================
// SIDEBAR
// ============================================
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');}
function toggleMenuSection(el){el.parentElement.classList.toggle('collapsed');}
function cambiarSeccion(s){
    document.querySelectorAll('.menu-item').forEach(i=>i.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(i=>{if(i.getAttribute('onclick')&&i.getAttribute('onclick').includes(`'${s}'`))i.classList.add('active');});
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    const el=document.getElementById(`seccion-${s}`);if(el)el.classList.add('active');
    if(window.innerWidth<=768)document.getElementById('sidebar').classList.remove('open');
    if(s==='dashboard')cargarDashboard();
    if(s==='pipeline')renderPipeline();
    if(s==='ventas')initVentas();
    if(s==='no_entregados')renderNoEntregados();
    if(s==='productos'&&productosFiltrados.length>0)mostrarProductosGestion();
    if(s==='clientes'){clientesFiltrados=[...productosData.clientes];mostrarClientesGestion();}
    if(s==='creditos')cargarCreditos();
    if(s==='stock')cargarStock();
    if(s==='actividad')renderActividad(obtenerActividad(50),'actividadCompleta');
    if(s==='catalogo')inicializarCatalogo();
    if(s==='rutas')inicializarRutas();
    if(s==='checklist')renderChecklist();
}
