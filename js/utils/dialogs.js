// ============================================
// DIALOGS.JS — Unified toast, confirm, input modals
// Shared between vendedor (index.html) and admin (admin.html)
// ============================================

const _toastQueue = {};
let _toastDebounceTimer = {};

function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
    if (!window._hdvAppReady && (tipo === 'info' || tipo === 'success')) return;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const key = tipo + ':' + mensaje.replace(/[0-9]+/g, '#');
    if (!_toastQueue[key]) _toastQueue[key] = [];
    _toastQueue[key].push(mensaje);

    clearTimeout(_toastDebounceTimer[key]);
    _toastDebounceTimer[key] = setTimeout(() => {
        const mensajes = _toastQueue[key] || [];
        delete _toastQueue[key];
        delete _toastDebounceTimer[key];

        if (mensajes.length === 0) return;

        let textoFinal;
        if (mensajes.length === 1) {
            textoFinal = mensajes[0];
        } else {
            textoFinal = `(${mensajes.length}) ${mensajes[0]}`;
        }

        _renderToast(container, textoFinal, tipo, duracion);
    }, 500);
}

function _renderToast(container, mensaje, tipo, duracion) {
    const variantMap = { success: 'success', error: 'danger', info: 'neutral', warning: 'warning' };
    const iconMap = { success: 'check2-circle', error: 'exclamation-octagon', info: 'info-circle', warning: 'exclamation-triangle' };
    const alert = document.createElement('sl-alert');
    alert.variant = variantMap[tipo] || 'neutral';
    alert.closable = true;
    alert.duration = duracion;
    alert.open = true;
    alert.style.marginBottom = '8px';
    alert.innerHTML = `<sl-icon name="${iconMap[tipo] || 'info-circle'}" slot="icon"></sl-icon>${escapeHTML(mensaje)}`;
    container.appendChild(alert);
    alert.addEventListener('sl-after-hide', () => alert.remove(), { once: true });
}

function mostrarExito(msg) {
    mostrarToast(msg, 'success');
}

function mostrarConfirmModal(mensaje, opciones = {}) {
    return new Promise((resolve) => {
        const dialog = document.createElement('sl-dialog');
        dialog.noHeader = true;
        dialog.style.setProperty('--width', '24rem');

        const iconBg = opciones.destructivo ? 'bg-red-100' : 'bg-blue-100';
        const iconColor = opciones.destructivo ? 'text-red-500' : 'text-blue-500';
        const iconName = opciones.destructivo ? 'alert-triangle' : 'help-circle';

        if (opciones.titulo) {
            dialog.noHeader = false;
            dialog.label = opciones.titulo;
            dialog.style.setProperty('--width', '36rem');
        }

        const contenido = opciones.html ? mensaje : `<div class="text-center mb-5">
                <div class="w-14 h-14 mx-auto mb-3 rounded-full ${iconBg} flex items-center justify-center">
                    <i data-lucide="${iconName}" class="w-6 h-6 ${iconColor}"></i>
                </div>
                <p class="text-gray-800 font-semibold text-sm whitespace-pre-line leading-relaxed">${escapeHTML(mensaje)}</p>
            </div>`;

        dialog.innerHTML = `${contenido}
            <div slot="footer" class="flex gap-3 w-full">
                ${opciones.ocultarCancelar ? '' : '<sl-button class="confirm-cancel-btn flex-1" variant="default" size="medium">Cancelar</sl-button>'}
                <sl-button class="confirm-ok-btn flex-1" variant="${opciones.destructivo ? 'danger' : 'primary'}" size="medium">${opciones.textoConfirmar || 'Confirmar'}</sl-button>
            </div>`;

        document.body.appendChild(dialog);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const cerrar = (result) => {
            dialog.hide().then(() => dialog.remove());
            resolve(result);
        };
        const cancelBtn = dialog.querySelector('.confirm-cancel-btn');
        if (cancelBtn) cancelBtn.onclick = () => cerrar(false);
        dialog.querySelector('.confirm-ok-btn').onclick = () => cerrar(true);
        dialog.addEventListener('sl-request-close', (e) => {
            e.preventDefault();
            cerrar(false);
        });

        dialog.show();
    });
}

function mostrarInputModal(opciones = {}) {
    return new Promise((resolve) => {
        const dialog = document.createElement('sl-dialog');
        dialog.style.setProperty('--width', '28rem');

        const iconClass = opciones.destructivo ? 'bg-red-500/20' : 'bg-blue-500/20';
        const iconColor = opciones.destructivo ? 'text-red-400' : 'text-blue-400';
        const iconName = opciones.destructivo ? 'alert-triangle' : opciones.icono || 'edit-3';

        dialog.innerHTML = `<span slot="label">
            <span class="flex items-center gap-3">
                <span class="w-10 h-10 rounded-xl ${iconClass} flex items-center justify-center shrink-0">
                    <i data-lucide="${iconName}" class="w-5 h-5 ${iconColor}"></i>
                </span>
                <span>${opciones.titulo || 'Ingrese datos'}</span>
            </span>
        </span>`;

        let camposHTML = '';
        if (opciones.subtitulo) {
            camposHTML += `<p class="text-sm text-gray-500 mb-4">${opciones.subtitulo}</p>`;
        }
        for (const campo of (opciones.campos || [])) {
            const req = campo.requerido ? 'required' : '';
            const labelHTML = `<label class="block text-sm font-semibold text-gray-600 mb-1.5">${campo.label}${campo.requerido ? ' <span class="text-red-400">*</span>' : ''}</label>`;
            if (campo.tipo === 'select') {
                const optsHTML = (campo.opciones || []).map(o =>
                    `<sl-option value="${escapeHTML(o.value)}" ${o.value === campo.valor ? 'selected' : ''}>${escapeHTML(o.label)}</sl-option>`
                ).join('');
                camposHTML += `<div class="mb-3">${labelHTML}<sl-select id="modal_field_${campo.key}" size="small" hoist placeholder="-- Seleccionar --" ${campo.valor ? `value="${escapeHTML(campo.valor)}"` : ''} ${req}>${optsHTML}</sl-select></div>`;
            } else if (campo.tipo === 'select-search') {
                const optsHTML = (campo.opciones || []).map(o =>
                    `<option value="${escapeHTML(o.value)}" ${o.value === campo.valor ? 'selected' : ''}>${escapeHTML(o.label)}</option>`
                ).join('');
                camposHTML += `<div class="mb-3">${labelHTML}
                    <sl-input type="text" id="modal_search_${campo.key}" placeholder="Buscar..." size="small" class="mb-1"></sl-input>
                    <select id="modal_field_${campo.key}" size="5" class="w-full border border-gray-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500" ${req}>${optsHTML}</select>
                </div>`;
            } else if (campo.tipo === 'textarea') {
                camposHTML += `<div class="mb-3">${labelHTML}<sl-textarea id="modal_field_${campo.key}" rows="3" placeholder="${campo.placeholder || ''}" ${req} value="${campo.valor || ''}"></sl-textarea></div>`;
            } else {
                camposHTML += `<div class="mb-3">${labelHTML}<sl-input type="${campo.tipo || 'text'}" id="modal_field_${campo.key}" value="${campo.valor ?? ''}" placeholder="${campo.placeholder || ''}" size="small" ${req} ${campo.tipo === 'number' ? 'min="0" inputmode="numeric"' : ''}></sl-input></div>`;
            }
        }

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = camposHTML;
        dialog.appendChild(contentDiv);

        const footer = document.createElement('div');
        footer.slot = 'footer';
        footer.className = 'flex gap-3 w-full';
        footer.innerHTML = `
            <sl-button class="modal-cancel-btn flex-1" variant="default" size="medium">Cancelar</sl-button>
            <sl-button class="modal-ok-btn flex-1" variant="${opciones.destructivo ? 'danger' : 'primary'}" size="medium">${opciones.textoConfirmar || 'Confirmar'}</sl-button>`;
        dialog.appendChild(footer);

        document.body.appendChild(dialog);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // select-search filtering
        for (const campo of (opciones.campos || [])) {
            if (campo.tipo === 'select-search') {
                const searchInput = dialog.querySelector(`#modal_search_${campo.key}`);
                const selectEl = dialog.querySelector(`#modal_field_${campo.key}`);
                const allOpts = (campo.opciones || []);
                searchInput.addEventListener('sl-input', () => {
                    const q = searchInput.value.toLowerCase();
                    selectEl.innerHTML = allOpts.filter(o => o.label.toLowerCase().includes(q))
                        .map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
                });
            }
        }

        const cerrar = (result) => {
            dialog.hide().then(() => dialog.remove());
            resolve(result);
        };

        const confirmar = () => {
            const datos = {};
            for (const campo of (opciones.campos || [])) {
                const el = dialog.querySelector(`#modal_field_${campo.key}`);
                if (!el) continue;
                const val = el.value;
                if (campo.requerido && !(val || '').trim()) {
                    if (el.focus) el.focus();
                    return;
                }
                datos[campo.key] = campo.tipo === 'number' ? (parseFloat(val) || 0) : val;
            }
            cerrar(datos);
        };

        dialog.querySelector('.modal-cancel-btn').onclick = () => cerrar(null);
        dialog.querySelector('.modal-ok-btn').onclick = confirmar;
        dialog.addEventListener('sl-request-close', (e) => {
            e.preventDefault();
            cerrar(null);
        });
        dialog.querySelectorAll('sl-input').forEach(inp => {
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
        });

        dialog.show().then(() => {
            const primerInput = dialog.querySelector('sl-input, sl-textarea');
            if (primerInput) primerInput.focus();
        });
    });
}
