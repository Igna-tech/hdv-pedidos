import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';

const ESTADO_LABELS: Record<string, string> = {
  pedido_pendiente: 'PENDIENTE',
  entregado: 'ENTREGADO',
  cobrado_sin_factura: 'COBRADO',
  facturado_mock: 'FACTURADO',
  nota_credito_mock: 'NOTA DE CRÉDITO',
  anulado: 'ANULADO',
};

// ============================================
// Helpers: base64url
// ============================================

function fromBase64url(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from([...bin].map(c => c.charCodeAt(0)));
}

function toBase64url(buf: Uint8Array): string {
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
  return out;
}

// ============================================
// HMAC-SHA-256 helper
// ============================================

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ============================================
// VAPID JWT (RFC 8292) — firma con ECDSA P-256
// ============================================

async function buildVapidAuth(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = url.origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const enc = new TextEncoder();
  const headerB64 = toBase64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = toBase64url(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const toBeSigned = `${headerB64}.${payloadB64}`;

  // Reconstruir JWK de P-256 desde bytes crudos del public key
  const pubBytes = fromBase64url(vapidPublicKey); // 65 bytes: 04 || x(32) || y(32)
  const x = toBase64url(pubBytes.slice(1, 33));
  const y = toBase64url(pubBytes.slice(33, 65));

  const jwk = { kty: 'EC', crv: 'P-256', x, y, d: vapidPrivateKey, ext: true, key_ops: ['sign'] };
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(toBeSigned)
  );

  const jwt = `${toBeSigned}.${toBase64url(new Uint8Array(sigBytes))}`;
  return `vapid t=${jwt},k=${vapidPublicKey}`;
}

// ============================================
// RFC 8291: aes128gcm payload encryption
// ============================================

async function encryptPayload(
  plaintext: Uint8Array,
  p256dhBase64: string,
  authBase64: string
): Promise<{ body: Uint8Array }> {
  const enc = new TextEncoder();

  const uaPublic = fromBase64url(p256dhBase64);   // 65 bytes
  const authSecret = fromBase64url(authBase64);   // 16 bytes

  // Ephemeral ECDH P-256 key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  ); // 65 bytes

  // Import UA public key for ECDH
  const uaPubKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret (32 bytes)
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPubKey },
      ephemeral.privateKey,
      256
    )
  );

  // Random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 Section 3.4: derive IKM
  // key_info = "WebPush: info\x00" + uaPublic(65) + asPublic(65)
  const keyInfo = concat(enc.encode('WebPush: info\x00'), uaPublic, asPublic);
  const PRK_key = await hmac(authSecret, sharedSecret);
  const IKM = (await hmac(PRK_key, concat(keyInfo, new Uint8Array([1])))).slice(0, 32);

  // Content encryption keys via HKDF
  const PRK = await hmac(salt, IKM);
  const cekInfo = concat(enc.encode('Content-Encoding: aes128gcm\x00'), new Uint8Array([1]));
  const CEK = (await hmac(PRK, cekInfo)).slice(0, 16);
  const nonceInfo = concat(enc.encode('Content-Encoding: nonce\x00'), new Uint8Array([1]));
  const NONCE = (await hmac(PRK, nonceInfo)).slice(0, 12);

  // Pad: plaintext + 0x02 (RFC 8291 end-of-record delimiter)
  const padded = concat(plaintext, new Uint8Array([2]));

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey(
    'raw', CEK, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: NONCE, tagLength: 128 }, aesKey, padded)
  );

  // Header: salt(16) + rs(4, big-endian=4096) + keyidlen(1) + keyid(asPublic, 65 bytes)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);

  return { body };
}

// ============================================
// Edge Function handler
// ============================================

Deno.serve(async (req: Request) => {
  // Siempre retornar 200 para evitar reintentos infinitos de pg_net
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
    if (!WEBHOOK_SECRET || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      console.warn('[Push] Unauthorized request');
      return new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 200 });
    }

    const body = await req.json();
    const { pedido_id, vendedor_id, nuevo_estado, datos } = body;

    if (!pedido_id || !vendedor_id || !nuevo_estado) {
      return new Response(JSON.stringify({ ok: false, reason: 'missing_fields' }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: subs, error: subError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', vendedor_id);

    if (subError || !subs || subs.length === 0) {
      console.log('[Push] Sin suscripciones para vendedor:', vendedor_id);
      return new Response(JSON.stringify({ ok: true, pushed: 0 }), { status: 200 });
    }

    const clienteNombre = datos?.cliente?.nombre || 'un cliente';
    const estadoLabel = ESTADO_LABELS[nuevo_estado] || nuevo_estado.toUpperCase();
    const mensaje = `Pedido ${pedido_id} de ${clienteNombre} → ${estadoLabel}`;
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify({ pedido_id, nuevo_estado, mensaje })
    );

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@hdv.com';

    let pushed = 0;
    const toDelete: string[] = [];

    for (const sub of subs) {
      try {
        const vapidAuth = await buildVapidAuth(
          sub.endpoint, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
        );
        const { body: encBody } = await encryptPayload(payloadBytes, sub.p256dh, sub.auth_key);

        const pushRes = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': vapidAuth,
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
          },
          body: encBody,
        });

        if (pushRes.status === 410 || pushRes.status === 404) {
          toDelete.push(sub.endpoint);
        } else if (pushRes.status < 300) {
          pushed++;
        } else {
          console.warn('[Push] Status inesperado:', pushRes.status, sub.endpoint);
        }
      } catch (err) {
        console.error('[Push] Error enviando a', sub.endpoint, err);
      }
    }

    if (toDelete.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', toDelete);
    }

    return new Response(
      JSON.stringify({ ok: true, pushed, deleted: toDelete.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[Push] Error general:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
