// ============================================
// HDV - Capa de Servicios Supabase (Repository Pattern)
// Centraliza TODAS las queries a Supabase
// Usa supabaseClient global de supabase-init.js
// ============================================

const SupabaseService = (() => {

    // ============================================
    // PEDIDOS
    // ============================================

    async function fetchPedidos(limit = 500, offset = 0) {
        try {
            const { data, error } = await supabaseClient
                .from('pedidos')
                .select('id, estado, fecha, datos, vendedor_id, creado_en, actualizado_en')
                .order('fecha', { ascending: false })
                .range(offset, offset + limit - 1);
            if (error) throw error;
            if (data && data.length === limit) {
                console.warn(`[SupabaseService] fetchPedidos: se alcanzo el limite de ${limit} registros, pueden faltar datos`);
            }
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchPedidos:', error);
            return { data: [], error };
        }
    }

    async function fetchPedidoDatos(pedidoId) {
        try {
            const { data, error } = await supabaseClient
                .from('pedidos')
                .select('datos')
                .eq('id', pedidoId)
                .single();
            if (error) throw error;
            return { data: data?.datos || null, error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchPedidoDatos:', error);
            return { data: null, error };
        }
    }

    async function upsertPedido(pedido) {
        try {
            const row = {
                id: pedido.id,
                estado: pedido.estado || 'pedido_pendiente',
                fecha: pedido.fecha || null,
                datos: pedido,
                actualizado_en: new Date().toISOString()
            };
            if (pedido.vendedor_id) {
                row.vendedor_id = pedido.vendedor_id;
            } else if (window.hdvUsuario?.id) {
                row.vendedor_id = window.hdvUsuario.id;
            }
            const { error } = await supabaseClient
                .from('pedidos')
                .upsert(row, { onConflict: 'id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertPedido:', error);
            return { success: false, error };
        }
    }

    async function updateEstadoPedido(pedidoId, nuevoEstado) {
        try {
            const { data: row, error: fetchErr } = await supabaseClient
                .from('pedidos')
                .select('datos')
                .eq('id', pedidoId)
                .single();
            if (fetchErr) throw fetchErr;

            const datosActualizados = { ...(row?.datos || {}), estado: nuevoEstado };
            const { error } = await supabaseClient
                .from('pedidos')
                .update({
                    estado: nuevoEstado,
                    datos: datosActualizados,
                    actualizado_en: new Date().toISOString()
                })
                .eq('id', pedidoId);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] updateEstadoPedido:', error);
            return { success: false, error };
        }
    }

    async function deletePedido(pedidoId) {
        try {
            const { error } = await supabaseClient
                .from('pedidos')
                .delete()
                .eq('id', pedidoId);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] deletePedido:', error);
            return { success: false, error };
        }
    }

    // ============================================
    // CATALOGO (categorias + clientes + productos + variantes)
    // ============================================

    async function fetchCategorias() {
        try {
            const { data, error } = await supabaseClient
                .from('categorias')
                .select('*');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchCategorias:', error);
            return { data: [], error };
        }
    }

    async function fetchClientes(limit = 1000, offset = 0) {
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .range(offset, offset + limit - 1);
            if (error) throw error;
            if (data && data.length === limit) {
                console.warn(`[SupabaseService] fetchClientes: se alcanzo el limite de ${limit} registros, pueden faltar datos`);
            }
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchClientes:', error);
            return { data: [], error };
        }
    }

    async function fetchProductosConVariantes(limit = 1000, offset = 0) {
        try {
            const { data, error } = await supabaseClient
                .from('productos')
                .select('*, producto_variantes(*)')
                .range(offset, offset + limit - 1);
            if (error) throw error;
            if (data && data.length === limit) {
                console.warn(`[SupabaseService] fetchProductosConVariantes: se alcanzo el limite de ${limit} registros, pueden faltar datos`);
            }
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchProductosConVariantes:', error);
            return { data: [], error };
        }
    }

    async function fetchCatalogo() {
        try {
            const [catRes, cliRes, prodRes] = await Promise.all([
                fetchCategorias(),
                fetchClientes(),
                fetchProductosConVariantes()
            ]);
            if (catRes.error) throw catRes.error;
            if (cliRes.error) throw cliRes.error;
            if (prodRes.error) throw prodRes.error;

            return {
                data: {
                    categorias: catRes.data,
                    clientes: cliRes.data,
                    productos: prodRes.data
                },
                error: null
            };
        } catch (error) {
            console.error('[SupabaseService] fetchCatalogo:', error);
            return { data: null, error };
        }
    }

    async function upsertCategorias(catRows) {
        try {
            const { error } = await supabaseClient
                .from('categorias')
                .upsert(catRows, { onConflict: 'id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertCategorias:', error);
            return { success: false, error };
        }
    }

    async function deleteCategorias(ids) {
        try {
            const { error } = await supabaseClient
                .from('categorias')
                .delete()
                .in('id', ids);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] deleteCategorias:', error);
            return { success: false, error };
        }
    }

    async function fetchCategoriasIds() {
        try {
            const { data, error } = await supabaseClient
                .from('categorias')
                .select('id');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchCategoriasIds:', error);
            return { data: [], error };
        }
    }

    async function upsertClientes(cliRows) {
        try {
            const { error } = await supabaseClient
                .from('clientes')
                .upsert(cliRows, { onConflict: 'id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertClientes:', error);
            return { success: false, error };
        }
    }

    async function deleteClientes(ids) {
        try {
            const { error } = await supabaseClient
                .from('clientes')
                .delete()
                .in('id', ids);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] deleteClientes:', error);
            return { success: false, error };
        }
    }

    async function fetchClientesIds() {
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('id');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchClientesIds:', error);
            return { data: [], error };
        }
    }

    async function upsertProductos(prodRows) {
        try {
            const { error } = await supabaseClient
                .from('productos')
                .upsert(prodRows, { onConflict: 'id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertProductos:', error);
            return { success: false, error };
        }
    }

    async function deleteProductos(ids) {
        try {
            const { error } = await supabaseClient
                .from('productos')
                .delete()
                .in('id', ids);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] deleteProductos:', error);
            return { success: false, error };
        }
    }

    async function fetchProductosIds() {
        try {
            const { data, error } = await supabaseClient
                .from('productos')
                .select('id');
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchProductosIds:', error);
            return { data: [], error };
        }
    }

    // ============================================
    // PRODUCTO VARIANTES
    // ============================================

    async function deleteVariantesByProductoIds(productoIds) {
        try {
            const { error } = await supabaseClient
                .from('producto_variantes')
                .delete()
                .in('producto_id', productoIds);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] deleteVariantesByProductoIds:', error);
            return { success: false, error };
        }
    }

    async function insertVariantes(varRows) {
        try {
            const { error } = await supabaseClient
                .from('producto_variantes')
                .insert(varRows);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] insertVariantes:', error);
            return { success: false, error };
        }
    }

    async function updateVariante(varianteId, campos) {
        try {
            const { error } = await supabaseClient
                .from('producto_variantes')
                .update(campos)
                .eq('id', varianteId);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] updateVariante:', error);
            return { success: false, error };
        }
    }

    async function upsertVariante(varRow) {
        try {
            const { error } = await supabaseClient
                .from('producto_variantes')
                .upsert(varRow);
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertVariante:', error);
            return { success: false, error };
        }
    }

    // ============================================
    // CONFIGURACION (documentos JSONB genéricos)
    // ============================================

    async function fetchConfig(docId) {
        try {
            const { data, error } = await supabaseClient
                .from('configuracion')
                .select('datos')
                .eq('doc_id', docId)
                .maybeSingle();
            if (error) throw error;
            return { data: data?.datos ?? null, error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchConfig:', error);
            return { data: null, error };
        }
    }

    async function upsertConfig(docId, datos) {
        try {
            const { error } = await supabaseClient
                .from('configuracion')
                .upsert({
                    doc_id: docId,
                    datos: datos,
                    actualizado_en: new Date().toISOString()
                }, { onConflict: 'doc_id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertConfig:', error);
            return { success: false, error };
        }
    }

    // ============================================
    // CONFIGURACION EMPRESA (fila unica id=1)
    // ============================================

    async function fetchConfigEmpresa() {
        try {
            const { data, error } = await supabaseClient
                .from('configuracion_empresa')
                .select('*')
                .eq('id', 1)
                .single();
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchConfigEmpresa:', error);
            return { data: null, error };
        }
    }

    async function upsertConfigEmpresa(datos) {
        try {
            const row = { id: 1, ...datos, actualizado_en: new Date().toISOString() };
            const { error } = await supabaseClient
                .from('configuracion_empresa')
                .upsert(row, { onConflict: 'id' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertConfigEmpresa:', error);
            return { success: false, error };
        }
    }

    // ============================================
    // REPORTES MENSUALES
    // ============================================

    async function upsertReporteMensual(mes, datos) {
        try {
            const { error } = await supabaseClient
                .from('reportes_mensuales')
                .upsert({
                    mes: mes,
                    datos: datos,
                    creado_en: new Date().toISOString()
                }, { onConflict: 'mes' });
            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            console.error('[SupabaseService] upsertReporteMensual:', error);
            return { success: false, error };
        }
    }

    async function fetchReporteMensual(mes) {
        try {
            const { data, error } = await supabaseClient
                .from('reportes_mensuales')
                .select('datos')
                .eq('mes', mes)
                .single();
            if (error) throw error;
            return { data: data?.datos || null, error: null };
        } catch (error) {
            console.error('[SupabaseService] fetchReporteMensual:', error);
            return { data: null, error };
        }
    }

    // ============================================
    // CONEXION (health check)
    // ============================================

    async function healthCheck() {
        try {
            const { error } = await supabaseClient
                .from('categorias')
                .select('id')
                .limit(1);
            return !error;
        } catch {
            return false;
        }
    }

    // ============================================
    // REALTIME helpers
    // ============================================

    function subscribeTo(channelName, table, callback, filter) {
        const opts = { event: '*', schema: 'public', table };
        if (filter) opts.filter = filter;
        const channel = supabaseClient
            .channel(channelName)
            .on('postgres_changes', opts, callback)
            .subscribe();
        return () => supabaseClient.removeChannel(channel);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    return {
        // Pedidos
        fetchPedidos,
        fetchPedidoDatos,
        upsertPedido,
        updateEstadoPedido,
        deletePedido,

        // Catalogo
        fetchCatalogo,
        fetchCategorias,
        fetchClientes,
        fetchProductosConVariantes,

        // Categorias CRUD
        upsertCategorias,
        deleteCategorias,
        fetchCategoriasIds,

        // Clientes CRUD
        upsertClientes,
        deleteClientes,
        fetchClientesIds,

        // Productos CRUD
        upsertProductos,
        deleteProductos,
        fetchProductosIds,

        // Variantes
        deleteVariantesByProductoIds,
        insertVariantes,
        updateVariante,
        upsertVariante,

        // Configuracion
        fetchConfig,
        upsertConfig,

        // Configuracion Empresa
        fetchConfigEmpresa,
        upsertConfigEmpresa,

        // Reportes
        upsertReporteMensual,
        fetchReporteMensual,

        // Utils
        healthCheck,
        subscribeTo
    };

})();

console.log('[SupabaseService] Capa de servicios inicializada');
