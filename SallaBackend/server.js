import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import admin from 'firebase-admin';
import fs from 'fs';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8080;
const SALLA_API_BASE = process.env.SALLA_API_BASE || 'https://api.salla.dev/admin/v2';
const SALLA_ACCESS_TOKEN = process.env.SALLA_ACCESS_TOKEN;
const SALLA_STORE_URL = process.env.SALLA_STORE_URL;

if (!SALLA_ACCESS_TOKEN) {
  console.warn('Missing SALLA_ACCESS_TOKEN. Add it to .env before production.');
}

if (!admin.apps.length) {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path && fs.existsSync(path)) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path, 'utf8'))) });
  } else {
    admin.initializeApp();
  }
}

async function verifyFirebase(req, res, next) {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Missing Firebase bearer token' });
  try {
    req.user = await admin.auth().verifyIdToken(idToken);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid Firebase token', details: error.message });
  }
}

const salla = axios.create({
  baseURL: SALLA_API_BASE,
  headers: {
    Authorization: `Bearer ${SALLA_ACCESS_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  },
  timeout: 20000
});

function normalizeSallaProduct(product) {
  return {
    id: Number(product.id),
    name: product.name || '',
    description: product.description || product.short_description || null,
    price: Number(product.price?.amount ?? product.price ?? 0),
    sale_price: Number(product.sale_price?.amount ?? product.sale_price ?? 0) || null,
    regular_price: Number(product.regular_price?.amount ?? product.regular_price ?? 0) || null,
    status: product.status || null,
    url: product.url || null,
    main_image: product.main_image || product.image?.url || product.image || null,
    quantity: Number(product.quantity ?? product.stock_quantity ?? 0),
    sku: product.sku || null
  };
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/salla/products', verifyFirebase, async (req, res) => {
  try {
    const { page = 1, per_page = 20 } = req.query;
    const response = await salla.get('/products', { params: { page, per_page } });
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    res.json(rows.map(normalizeSallaProduct));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Salla products request failed', details: error.response?.data || error.message });
  }
});

app.get('/api/salla/categories', verifyFirebase, async (req, res) => {
  try {
    const { page = 1, per_page = 50 } = req.query;
    const response = await salla.get('/categories', { params: { page, per_page } });
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    res.json(rows.map(c => ({ id: Number(c.id), name: c.name || '', url: c.url || null, image: c.image || c.image_url || null })));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Salla categories request failed', details: error.response?.data || error.message });
  }
});

app.post('/api/checkout', verifyFirebase, async (req, res) => {
  const { receiver, shipTo, items, createDraft = false } = req.body || {};
  if (!receiver || !shipTo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'receiver, shipTo and items are required' });
  }

  const products = items.map(item => ({
    identifier_type: 'id',
    identifier: Number(item.sallaProductId),
    quantity: Number(item.quantity || 1),
    options: (item.selectedOptions || []).map(opt => ({ id: Number(opt.id), value: opt.value.map(String) }))
  }));

  const payload = {
    receiver,
    delivery_method: 'shipping',
    ship_to: {
      country: Number(shipTo.country),
      city: Number(shipTo.city),
      district: Number(shipTo.district),
      address: shipTo.address,
      postal_code: shipTo.postal_code || undefined
    },
    payment: {
      status: 'pending',
      accepted_methods: ['credit_card', 'bank', 'apple_pay', 'mada']
    },
    products
  };

  try {
    const endpoint = createDraft ? '/orders/draft' : '/orders';
    const response = await salla.post(endpoint, payload);
    const data = response.data?.data || response.data || {};
    const orderId = Number(data.id || data.order_id || 0);
    const referenceId = data.reference_id ? String(data.reference_id) : null;
    const checkoutUrl = data.checkout_url || data.payment_url || data.url || (SALLA_STORE_URL && referenceId ? `${SALLA_STORE_URL}/orders/${referenceId}` : null);
    res.json({ orderId, referenceId, checkoutUrl: checkoutUrl || '', raw: JSON.stringify(response.data) });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Salla checkout request failed', details: error.response?.data || error.message });
  }
});

app.post('/webhook', (req, res) => {
  console.log('Salla Webhook:', JSON.stringify(req.body, null, 2));

  if (req.body?.data?.access_token) {
    console.log('ACCESS TOKEN:', req.body.data.access_token);
  }

  res.sendStatus(200);
});


app.listen(PORT, () => console.log(`Laveen Salla backend running on :${PORT}`));
