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
// Conectar globals a hdvState via property proxies en window.
// El getter retorna la referencia interna de hdvState, por lo que
// mutaciones en-lugar (.push, .splice, etc.) funcionan sin llamar al setter.
// Asignaciones directas (productosData = X) pasan por hdvState.set.
// Ningun otro archivo necesita cambios — la API de globals no cambia.
// ============================================
[
    ['todosLosPedidos',    () => hdvState.getPedidos(),            v => hdvState.setPedidos(v)],
    ['productosData',      () => hdvState.getProductosData(),      v => hdvState.setProductosData(v)],
    ['productosFiltrados', () => hdvState.getProductosFiltrados(), v => hdvState.setProductosFiltrados(v)],
    ['clientesFiltrados',  () => hdvState.getClientesFiltrados(),  v => hdvState.setClientesFiltrados(v)],
    ['productos',          () => hdvState.getProductos(),          v => hdvState.setProductos(v)],
    ['categorias',         () => hdvState.getCategorias(),         v => hdvState.setCategorias(v)],
    ['clientes',           () => hdvState.getClientes(),           v => hdvState.setClientes(v)],
    ['clienteActual',      () => hdvState.getClienteActual(),      v => hdvState.setClienteActual(v)],
    ['carrito',            () => hdvState.getCarrito(),            v => hdvState.setCarrito(v)],
].forEach(([name, get, set]) => {
    Object.defineProperty(window, name, { get, set, configurable: true, enumerable: true });
});

