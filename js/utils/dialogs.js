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

const _TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
};

// Toast estilo Sonner: apilado, entrada suave, swipe-to-dismiss. CSS en src/input.css (.hdv-toast)
function _renderToast(container, mensaje, tipo, duracion) {
    const t = document.createElement('div');
    t.className = 'hdv-toast hdv-toast-' + (tipo || 'info');
    t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    t.innerHTML = `<span class="hdv-toast-ico">${_TOAST_ICONS[tipo] || _TOAST_ICONS.info}</span><span class="hdv-toast-msg">${escapeHTML(mensaje)}</span>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));

    let hideTimer = setTimeout(dismiss, duracion || 3500);
    function dismiss() {
        clearTimeout(hideTimer);
        t.classList.add('out');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
        setTimeout(() => t.remove(), 400);
    }
    // Swipe horizontal para descartar
    let startX = 0, dragging = false, dx = 0;
    t.addEventListener('pointerdown', (e) => { dragging = true; startX = e.clientX; t.style.transition = 'none'; try { t.setPointerCapture(e.pointerId); } catch (_) {} clearTimeout(hideTimer); });
    t.addEventListener('pointermove', (e) => { if (!dragging) return; dx = e.clientX - startX; if (dx < 0) dx = 0; t.style.transform = `translateX(${dx}px)`; t.style.opacity = String(Math.max(0, 1 - dx / 200)); });
    t.addEventListener('pointerup', () => { dragging = false; t.style.transition = ''; if (dx > 90) dismiss(); else { t.style.transform = ''; t.style.opacity = ''; hideTimer = setTimeout(dismiss, 2500); } dx = 0; });
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
