-- ============================================
-- HDV Distribuciones - Schema Supabase
-- Snapshot generado: 2026-06-09
-- Estado: produccion activa (ngtoshttgnfgbiurnrix)
-- ============================================
-- IMPORTANTE: Este archivo es documentacion de referencia (Disaster Recovery).
-- Para cambios incrementales, usar supabase/migrations/.
-- ============================================

-- ============================================
-- EXTENSIONES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pg_net";       -- webhooks async (triggers alertas)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()

-- ============================================
-- FUNCIONES BASE
-- ============================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION public.update_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$;

-- Trigger: crear perfil automaticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nombre_completo', ''),
        'vendedor'
    );
    RETURN NEW;
END;
$$;

-- ============================================
-- TABLAS
-- ============================================

-- Categorias de productos
CREATE TABLE IF NOT EXISTS public.categorias (
    id          TEXT        PRIMARY KEY,
    nombre      TEXT        NOT NULL,
    subcategorias TEXT[]    DEFAULT '{}'::text[],
    estado      TEXT        DEFAULT 'activo',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id                   TEXT        PRIMARY KEY,
    nombre               TEXT        NOT NULL,
    razon_social         TEXT,
    ruc                  TEXT,
    telefono             TEXT,
    direccion            TEXT,
    zona                 TEXT,
    encargado            TEXT,
    tipo                 TEXT        DEFAULT 'mayorista_estandar',
    oculto               BOOLEAN     DEFAULT false,
    precios_personalizados JSONB     DEFAULT '{}'::jsonb,
    tipo_documento       TEXT        DEFAULT 'RUC',
    pais_documento       TEXT        DEFAULT 'PRY',
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_ruc_unique
    ON public.clientes (ruc) WHERE (ruc IS NOT NULL AND ruc <> '');
CREATE INDEX IF NOT EXISTS idx_clientes_zona ON public.clientes (zona);

-- Productos
CREATE TABLE IF NOT EXISTS public.productos (
    id               TEXT        PRIMARY KEY,
    nombre           TEXT        NOT NULL,
    categoria_id     TEXT        REFERENCES public.categorias(id),
    subcategoria     TEXT,
    imagen_url       TEXT,
    estado           TEXT        DEFAULT 'disponible',
    oculto           BOOLEAN     DEFAULT false,
    tipo_impuesto    TEXT        DEFAULT 'iva_10',
    unidad_medida_set TEXT       DEFAULT '77',
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria_id ON public.productos (categoria_id);

-- Variantes de productos
CREATE TABLE IF NOT EXISTS public.producto_variantes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id     TEXT        NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
    nombre_variante TEXT        NOT NULL,
    precio          INT         NOT NULL DEFAULT 0,
    costo           INT         DEFAULT 0,
    stock           INT         DEFAULT 0,
    activo          BOOLEAN     DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producto_variantes_producto_id ON public.producto_variantes (producto_id);
CREATE INDEX IF NOT EXISTS idx_variantes_producto ON public.producto_variantes (producto_id);

-- Perfiles de usuarios (vinculado a auth.users)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id),
    nombre_completo TEXT        NOT NULL DEFAULT '',
    rol             TEXT        NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
    activo          BOOLEAN     NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pedidos (operativo core)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id             TEXT        PRIMARY KEY,
    estado         TEXT        DEFAULT 'pedido_pendiente',
    fecha          TEXT,
    datos          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    creado_en      TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now(),
    vendedor_id    UUID        REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- estados validos: pedido_pendiente, entregado, cobrado_sin_factura,
--                  facturado_mock, nota_credito_mock, anulado

CREATE INDEX IF NOT EXISTS idx_pedidos_estado     ON public.pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha      ON public.pedidos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor   ON public.pedidos (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado_en  ON public.pedidos (creado_en DESC);

-- Configuracion (key-value para datos de negocio)
-- docs: pagos_credito, creditos_manuales, historial_creditos, promociones,
--       whatsapp_plantilla, gastos_vendedor_${id}, rendiciones_${id},
--       cuentas_bancarias, metas_vendedor
CREATE TABLE IF NOT EXISTS public.configuracion (
    doc_id         TEXT        PRIMARY KEY,
    datos          JSONB,
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- Configuracion empresa (fila unica, DELETE bloqueado por RLS)
CREATE TABLE IF NOT EXISTS public.configuracion_empresa (
    id                  INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ruc_empresa         TEXT        NOT NULL DEFAULT '',
    razon_social        TEXT        NOT NULL DEFAULT '',
    nombre_fantasia     TEXT        DEFAULT '',
    timbrado_numero     TEXT        NOT NULL DEFAULT '',
    timbrado_vencimiento DATE,
    establecimiento     TEXT        NOT NULL DEFAULT '001',
    punto_expedicion    TEXT        NOT NULL DEFAULT '001',
    direccion_fiscal    TEXT        DEFAULT '',
    telefono_empresa    TEXT        DEFAULT '',
    email_empresa       TEXT        DEFAULT '',
    actividad_economica TEXT        DEFAULT '',
    actualizado_en      TIMESTAMPTZ DEFAULT now()
);

-- Reportes mensuales
CREATE TABLE IF NOT EXISTS public.reportes_mensuales (
    mes        TEXT        PRIMARY KEY,
    datos      JSONB,
    creado_en  TIMESTAMPTZ DEFAULT now()
);

-- Audit logs (caja negra inmutable)
-- RLS: solo SELECT para admin. Sin INSERT/UPDATE/DELETE para usuarios.
-- Los triggers log_audit_event() (SECURITY DEFINER) escriben aqui.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tabla_afectada   TEXT        NOT NULL,
    registro_id      TEXT        NOT NULL,
    accion           TEXT        NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
    datos_anteriores JSONB,
    datos_nuevos     JSONB,
    usuario_id       UUID,
    creado_en        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tabla    ON public.audit_logs (tabla_afectada);
CREATE INDEX IF NOT EXISTS idx_audit_logs_registro ON public.audit_logs (registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario  ON public.audit_logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_creado   ON public.audit_logs (creado_en DESC);

-- Secretos de aplicacion (RLS blindado: zero politicas = inaccesible para anon/authenticated)
-- Solo funciones SECURITY DEFINER pueden leer. Para rotar:
--   UPDATE app_secrets SET value = 'nuevo', updated_at = NOW() WHERE key = 'nombre';
-- Keys actuales: alertas_url, webhook_secret
CREATE TABLE IF NOT EXISTS public.app_secrets (
    key         TEXT        PRIMARY KEY,
    value       TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Rate limiting persistente para alertas WhatsApp (resiste reinicios de Edge Function)
CREATE TABLE IF NOT EXISTS public.alertas_rate_limit (
    clave          TEXT        PRIMARY KEY,
    contador       INT         NOT NULL DEFAULT 0,
    ventana_inicio TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- VISTAS DE SEGURIDAD (ofuscacion de datos sensibles para vendedores)
-- ============================================

-- Clientes sin precios_personalizados (vendedores consultan esta vista)
CREATE OR REPLACE VIEW public.clientes_vendedor AS
    SELECT id, nombre, razon_social, ruc, telefono, direccion,
           zona, encargado, tipo, oculto, created_at, tipo_documento, pais_documento
    FROM public.clientes;

-- Variantes sin costo (vendedores no ven margenes)
CREATE OR REPLACE VIEW public.producto_variantes_vendedor AS
    SELECT id, producto_id, nombre_variante, precio, stock, activo, created_at
    FROM public.producto_variantes;

-- ============================================
-- FUNCIONES / RPCs
-- ============================================

-- Verifica si el usuario autenticado es admin activo
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    );
$$;

-- Retorna rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.obtener_mi_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
    SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

-- Retorna rol, nombre y activo de cualquier usuario (guard.js)
CREATE OR REPLACE FUNCTION public.obtener_rol_usuario(user_id uuid)
RETURNS TABLE(rol text, nombre_completo text, activo boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    RETURN QUERY
    SELECT p.rol, p.nombre_completo, p.activo
    FROM public.perfiles p
    WHERE p.id = user_id;
END;
$$;

-- Kill Switch: verifica si la cuenta del usuario esta activa
CREATE OR REPLACE FUNCTION public.verificar_estado_cuenta()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
    SELECT activo FROM public.perfiles WHERE id = auth.uid();
$$;

-- Catalogo seguro: retorna costo=0 para vendedores (defense-in-depth)
CREATE OR REPLACE FUNCTION public.obtener_catalogo_seguro()
RETURNS TABLE(
    producto_id text, producto_nombre text, categoria_id text,
    subcategoria text, imagen_url text, estado text, oculto boolean,
    tipo_impuesto text, variante_id uuid, nombre_variante text,
    precio integer, costo integer, stock integer, variante_activa boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
    es_admin_usuario BOOLEAN;
BEGIN
    SELECT (rol = 'admin') INTO es_admin_usuario
    FROM public.perfiles WHERE id = auth.uid();

    RETURN QUERY
    SELECT p.id, p.nombre, p.categoria_id, p.subcategoria, p.imagen_url,
           p.estado, p.oculto, p.tipo_impuesto,
           pv.id, pv.nombre_variante, pv.precio,
           CASE WHEN COALESCE(es_admin_usuario, false) THEN pv.costo ELSE 0 END,
           pv.stock, pv.activo
    FROM public.productos p
    LEFT JOIN public.producto_variantes pv ON pv.producto_id = p.id;
END;
$$;

-- Cambia estado de pedido (atomica, valida auth + propiedad)
CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido(p_id text, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) AND NOT EXISTS (
        SELECT 1 FROM public.pedidos WHERE id = p_id AND vendedor_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'No autorizado: no eres admin ni dueno de este pedido';
    END IF;
    UPDATE public.pedidos
    SET estado = p_estado,
        datos = jsonb_set(datos, '{estado}', to_jsonb(p_estado)),
        actualizado_en = NOW()
    WHERE id = p_id;
    RETURN FOUND;
END;
$$;

-- Reemplaza variantes atomicamente (admin only)
CREATE OR REPLACE FUNCTION public.reemplazar_variantes(p_producto_ids text[], p_variantes jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) THEN
        RAISE EXCEPTION 'No autorizado: solo admin puede modificar variantes';
    END IF;
    DELETE FROM public.producto_variantes WHERE producto_id = ANY(p_producto_ids);
    INSERT INTO public.producto_variantes (producto_id, nombre_variante, precio, costo, stock, activo)
    SELECT (v->>'producto_id')::TEXT, (v->>'nombre_variante')::TEXT,
           COALESCE((v->>'precio')::INT, 0), COALESCE((v->>'costo')::INT, 0),
           COALESCE((v->>'stock')::INT, 0), COALESCE((v->>'activo')::BOOLEAN, true)
    FROM jsonb_array_elements(p_variantes) AS v;
    RETURN true;
END;
$$;

-- Rate limiting atomico para alertas WhatsApp (B-04)
-- Retorna TRUE=permitido, FALSE=limitado
CREATE OR REPLACE FUNCTION public.verificar_rate_limit_alerta(
    p_clave TEXT, p_max INT DEFAULT 5, p_ventana_segundos INT DEFAULT 60
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_contador       INT;
    v_ventana_inicio TIMESTAMPTZ;
BEGIN
    SELECT contador, ventana_inicio INTO v_contador, v_ventana_inicio
    FROM alertas_rate_limit WHERE clave = p_clave FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO alertas_rate_limit (clave, contador, ventana_inicio)
        VALUES (p_clave, 1, NOW());
        RETURN TRUE;
    END IF;
    IF NOW() - v_ventana_inicio > make_interval(secs => p_ventana_segundos) THEN
        UPDATE alertas_rate_limit SET contador = 1, ventana_inicio = NOW() WHERE clave = p_clave;
        RETURN TRUE;
    END IF;
    IF v_contador < p_max THEN
        UPDATE alertas_rate_limit SET contador = contador + 1 WHERE clave = p_clave;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_rate_limit_alerta(TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_rate_limit_alerta(TEXT, INT, INT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.verificar_rate_limit_alerta(TEXT, INT, INT) TO authenticated;

-- ============================================
-- FUNCIONES DE TRIGGERS
-- ============================================

-- Audit log generico (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
    v_registro_id TEXT;
    v_old_json    JSONB;
    v_new_json    JSONB;
    v_user_id     UUID;
BEGIN
    BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;

    IF TG_OP = 'DELETE' THEN
        v_old_json := row_to_json(OLD)::jsonb;
        v_registro_id := COALESCE(v_old_json->>'id', v_old_json->>'doc_id', 'unknown');
    ELSE
        v_new_json := row_to_json(NEW)::jsonb;
        v_registro_id := COALESCE(v_new_json->>'id', v_new_json->>'doc_id', 'unknown');
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (tabla_afectada, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, v_registro_id, 'INSERT', NULL, v_new_json, v_user_id);
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_json := row_to_json(OLD)::jsonb;
        INSERT INTO public.audit_logs (tabla_afectada, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, v_registro_id, 'UPDATE', v_old_json, v_new_json, v_user_id);
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (tabla_afectada, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, v_registro_id, 'DELETE', v_old_json, NULL, v_user_id);
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Envia alerta WhatsApp via Edge Function alertas-seguridad (pg_net)
-- Lee URL y secret desde tabla app_secrets (blindada)
CREATE OR REPLACE FUNCTION public.notify_alerta_seguridad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    _payload jsonb;
    _url     text;
    _secret  text;
BEGIN
    _payload := jsonb_build_object(
        'type',       TG_OP,
        'table',      TG_TABLE_NAME,
        'schema',     TG_TABLE_SCHEMA,
        'record',     CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE row_to_json(NEW)::jsonb END,
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END
    );
    SELECT value INTO _url    FROM app_secrets WHERE key = 'alertas_url';
    SELECT value INTO _secret FROM app_secrets WHERE key = 'webhook_secret';
    IF _url IS NOT NULL AND _secret IS NOT NULL THEN
        PERFORM net.http_post(
            url     := _url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', _secret),
            body    := _payload
        );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Valida precios del pedido y marca fraude si detecta anomalias
-- Umbral: precio < 50% catalogo, descuento > 30%, qty > 9999, total < 40% calculado
CREATE OR REPLACE FUNCTION public.validar_precios_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
    _item            jsonb;
    _precio_catalogo int;
    _descuento       numeric;
    _total_calculado numeric := 0;
    _alerta          boolean := false;
    _detalle         text    := '';
BEGIN
    _descuento := COALESCE((NEW.datos->>'descuento')::numeric, 0);
    IF _descuento > 30 THEN
        _alerta := true;
        _detalle := _detalle || 'Descuento ' || _descuento || '% excede limite 30%. ';
    END IF;

    FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.datos->'items', '[]'::jsonb)) LOOP
        SELECT pv.precio INTO _precio_catalogo
        FROM public.producto_variantes pv
        WHERE pv.producto_id = _item->>'productoId'
          AND pv.nombre_variante = _item->>'presentacion'
          AND pv.activo = true
        LIMIT 1;

        IF _precio_catalogo IS NOT NULL AND (_item->>'precio')::int < (_precio_catalogo * 0.5) THEN
            _alerta := true;
            _detalle := _detalle || 'Precio ' || COALESCE(_item->>'nombre', '?')
                || ': Gs.' || (_item->>'precio') || ' < 50% catalogo (Gs.' || _precio_catalogo || '). ';
        END IF;

        IF COALESCE((_item->>'cantidad')::int, 0) > 9999 THEN
            _alerta := true;
            _detalle := _detalle || 'Cantidad anomala: ' || (_item->>'cantidad')
                || ' unidades de ' || COALESCE(_item->>'nombre', '?') || '. ';
        END IF;

        _total_calculado := _total_calculado +
            (COALESCE((_item->>'precio')::numeric, 0) * COALESCE((_item->>'cantidad')::numeric, 0));
    END LOOP;

    IF _total_calculado > 0
       AND COALESCE((NEW.datos->>'total')::numeric, 0) < (_total_calculado * 0.4) THEN
        _alerta := true;
        _detalle := _detalle || 'Total Gs.' || (NEW.datos->>'total')
            || ' < 40% del calculado Gs.' || _total_calculado::int || '. ';
    END IF;

    IF _alerta THEN
        NEW.datos := jsonb_set(NEW.datos, '{alerta_fraude}', 'true'::jsonb);
        NEW.datos := jsonb_set(NEW.datos, '{fraude_detalle}', to_jsonb(_detalle));
        NEW.datos := jsonb_set(NEW.datos, '{fraude_fecha}', to_jsonb(NOW()::text));
        NEW.estado := 'pedido_pendiente';
        NEW.datos := jsonb_set(NEW.datos, '{estado}', '"pedido_pendiente"'::jsonb);
    END IF;
    RETURN NEW;
END;
$$;

-- Bloquea mutaciones sobre pedidos en estado terminal para no-admin
CREATE OR REPLACE FUNCTION public.bloquear_mutacion_terminal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.estado IN ('facturado_mock', 'nota_credito_mock', 'anulado', 'cobrado_sin_factura', 'entregado')
    -- Excepción (lifecycle-v2): cerrar un crédito entregado al cobrarlo en su totalidad.
    AND NOT (OLD.estado = 'entregado' AND NEW.estado = 'cobrado_sin_factura')
    AND NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) THEN
        RAISE EXCEPTION 'No se puede modificar un pedido en estado terminal: %', OLD.estado;
    END IF;
    RETURN NEW;
END;
$$;

-- Sobreescribe fecha con timestamp servidor (anti-backdating)
CREATE OR REPLACE FUNCTION public.forzar_fecha_servidor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.fecha := NOW()::text;
    RETURN NEW;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auth: auto-crear perfil al registrar usuario
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Perfiles: auto-update timestamp
CREATE OR REPLACE TRIGGER set_actualizado_en
    BEFORE UPDATE ON public.perfiles
    FOR EACH ROW EXECUTE FUNCTION public.update_actualizado_en();

-- Pedidos: validacion de precios + anti-backdating (BEFORE)
CREATE OR REPLACE TRIGGER trg_validar_precios
    BEFORE INSERT OR UPDATE ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.validar_precios_pedido();

CREATE OR REPLACE TRIGGER trg_forzar_fecha_servidor
    BEFORE INSERT ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.forzar_fecha_servidor();

CREATE OR REPLACE TRIGGER trg_bloquear_mutacion_terminal
    BEFORE UPDATE ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_terminal();

-- Pedidos: audit + alertas WhatsApp (AFTER)
CREATE OR REPLACE TRIGGER trg_audit_pedidos
    AFTER INSERT OR UPDATE OR DELETE ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE OR REPLACE TRIGGER trg_alerta_fraude_pedidos_insert
    AFTER INSERT ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.notify_alerta_seguridad();

CREATE OR REPLACE TRIGGER trg_alerta_fraude_pedidos_update
    AFTER UPDATE ON public.pedidos
    FOR EACH ROW EXECUTE FUNCTION public.notify_alerta_seguridad();

-- Configuracion: audit
CREATE OR REPLACE TRIGGER trg_audit_configuracion
    AFTER INSERT OR UPDATE OR DELETE ON public.configuracion
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Clientes: audit
CREATE OR REPLACE TRIGGER trg_audit_clientes
    AFTER UPDATE OR DELETE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Audit logs: alerta WhatsApp en DELETEs criticos
CREATE OR REPLACE TRIGGER trg_alerta_audit_logs
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.notify_alerta_seguridad();

-- Perfiles: alerta Kill Switch
CREATE OR REPLACE TRIGGER trg_alerta_kill_switch
    AFTER UPDATE ON public.perfiles
    FOR EACH ROW EXECUTE FUNCTION public.notify_alerta_seguridad();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.categorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_variantes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_mensuales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_secrets         ENABLE ROW LEVEL SECURITY;  -- zero politicas = inaccesible
ALTER TABLE public.alertas_rate_limit  ENABLE ROW LEVEL SECURITY;

-- Categorias
CREATE POLICY "categorias_select" ON public.categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "categorias_insert" ON public.categorias FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "categorias_update" ON public.categorias FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "categorias_delete" ON public.categorias FOR DELETE TO authenticated USING (es_admin());

-- Clientes (SELECT solo admin — vendedores usan VIEW clientes_vendedor)
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT USING (es_admin());
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated USING (es_admin());

-- Productos
CREATE POLICY "productos_select" ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_insert" ON public.productos FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "productos_update" ON public.productos FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "productos_delete" ON public.productos FOR DELETE TO authenticated USING (es_admin());

-- Variantes
CREATE POLICY "variantes_select" ON public.producto_variantes FOR SELECT USING (true);
CREATE POLICY "variantes_insert" ON public.producto_variantes FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "variantes_update" ON public.producto_variantes FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "variantes_delete" ON public.producto_variantes FOR DELETE TO authenticated USING (es_admin());

-- Perfiles
CREATE POLICY "perfiles_select_own"   ON public.perfiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "perfiles_select_admin" ON public.perfiles FOR SELECT TO authenticated USING (es_admin());
CREATE POLICY "perfiles_insert_admin" ON public.perfiles FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "perfiles_update_own"   ON public.perfiles FOR UPDATE TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND rol = obtener_mi_rol());
CREATE POLICY "perfiles_update_admin" ON public.perfiles FOR UPDATE TO authenticated USING (es_admin());

-- Pedidos
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT TO authenticated
    USING (es_admin() OR vendedor_id = auth.uid());
CREATE POLICY "pedidos_insert" ON public.pedidos FOR INSERT TO authenticated
    WITH CHECK (es_admin() OR (vendedor_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND activo = true
    )));
CREATE POLICY "pedidos_update" ON public.pedidos FOR UPDATE TO authenticated
    USING (es_admin() OR vendedor_id = auth.uid())
    WITH CHECK (es_admin() OR vendedor_id = auth.uid());
CREATE POLICY "pedidos_delete" ON public.pedidos FOR DELETE USING (es_admin());

-- Configuracion (vendedores pueden escribir sus propios gastos/rendiciones)
CREATE POLICY "config_select" ON public.configuracion FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_insert" ON public.configuracion FOR INSERT TO authenticated
    WITH CHECK (es_admin()
        OR doc_id = ANY(ARRAY['pagos_credito', 'clientes_pendientes'])
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%');
CREATE POLICY "config_update" ON public.configuracion FOR UPDATE TO authenticated
    USING (es_admin()
        OR doc_id = ANY(ARRAY['pagos_credito', 'clientes_pendientes'])
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%')
    WITH CHECK (es_admin()
        OR doc_id = ANY(ARRAY['pagos_credito', 'clientes_pendientes'])
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%');
CREATE POLICY "config_delete" ON public.configuracion FOR DELETE TO authenticated USING (es_admin());

-- Configuracion empresa (DELETE bloqueado permanentemente)
CREATE POLICY "cfg_empresa_select"        ON public.configuracion_empresa FOR SELECT TO authenticated USING (true);
CREATE POLICY "cfg_empresa_insert"        ON public.configuracion_empresa FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "cfg_empresa_update"        ON public.configuracion_empresa FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "cfg_empresa_delete_blocked" ON public.configuracion_empresa FOR DELETE TO authenticated USING (false);

-- Reportes mensuales (solo admin)
CREATE POLICY "reportes_select" ON public.reportes_mensuales FOR SELECT USING (es_admin());
CREATE POLICY "reportes_insert" ON public.reportes_mensuales FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "reportes_update" ON public.reportes_mensuales FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "reportes_delete" ON public.reportes_mensuales FOR DELETE TO authenticated USING (es_admin());

-- Audit logs (solo SELECT admin — escritura solo via trigger SECURITY DEFINER)
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT USING (es_admin());

-- alertas_rate_limit (solo SELECT admin — escritura via RPC SECURITY DEFINER)
CREATE POLICY "admin_select_rate_limit" ON public.alertas_rate_limit
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true));

-- app_secrets: ZERO POLITICAS — inaccesible para anon/authenticated
-- Solo funciones SECURITY DEFINER pueden leer (notify_alerta_seguridad)

-- ============================================
-- REALTIME (publicar tablas para subscripciones)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.categorias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.productos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.producto_variantes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.configuracion;
ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
