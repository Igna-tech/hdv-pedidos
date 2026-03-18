// ============================================
// HDV Core - Estado Global
// Getters/Setters para variables compartidas entre modulos.
// Cargado ANTES de admin.js y app.js.
// ============================================

const hdvState = (function () {
    // --- Admin state ---
    let _todosLosPedidos = [];
    let _productosData = { productos: [], categorias: [], clientes: [] };
    let _productosFiltrados = [];
    let _clientesFiltrados = [];

    // --- Vendedor state ---
    let _productos = [];
    let _categorias = [];
    let _clientes = [];
    let _clienteActual = null;
    let _carrito = [];

    return {
        // === Admin ===
        getPedidos() { return _todosLosPedidos; },
        setPedidos(v) { _todosLosPedidos = v; },

        getProductosData() { return _productosData; },
        setProductosData(v) { _productosData = v; },

        getProductosFiltrados() { return _productosFiltrados; },
        setProductosFiltrados(v) { _productosFiltrados = v; },

        getClientesFiltrados() { return _clientesFiltrados; },
        setClientesFiltrados(v) { _clientesFiltrados = v; },

        // === Vendedor ===
        getProductos() { return _productos; },
        setProductos(v) { _productos = v; },

        getCategorias() { return _categorias; },
        setCategorias(v) { _categorias = v; },

        getClientes() { return _clientes; },
        setClientes(v) { _clientes = v; },

        getClienteActual() { return _clienteActual; },
        setClienteActual(v) { _clienteActual = v; },

        getCarrito() { return _carrito; },
        setCarrito(v) { _carrito = v; },
    };
})();

// ============================================
// COMPATIBILIDAD: Exponer como variables globales mutables
// Los archivos originales (admin.js, app.js, checkout.js, etc.)
// siguen leyendo/escribiendo estas variables directamente.
// En fases futuras se migraran a hdvState.get/set.
// ============================================

// Admin globals (admin.js, admin-ventas.js, admin-devoluciones.js, admin-contabilidad.js)
var todosLosPedidos = [];
var productosData = { productos: [], categorias: [], clientes: [] };
var productosFiltrados = [];
var clientesFiltrados = [];

// Vendedor globals (app.js, checkout.js)
var productos = [];
var categorias = [];
var clientes = [];
var clienteActual = null;
var carrito = [];

