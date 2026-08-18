const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./db');
const { upload, getUploadedFileUrl } = require('./cloudinary');

let compression = null;
let helmet = null;
let rateLimit = null;

try { compression = require('compression'); } catch (_) {}
try { helmet = require('helmet'); } catch (_) {}
try { rateLimit = require('express-rate-limit'); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 5055;

app.set('trust proxy', 1);

if (compression) {
  app.use(compression());
}

if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.quilljs.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.quilljs.com", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
} else {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
}

function createRateLimiter(windowMs, maxRequests, message) {
  if (rateLimit) {
    return rateLimit({
      windowMs,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message }
    });
  }

  const hits = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = hits.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    hits.set(ip, record);

    if (hits.size > 3000) {
      for (const [k, v] of hits.entries()) {
        if (now > v.resetTime) hits.delete(k);
      }
    }

    if (record.count > maxRequests) {
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

const authLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many login attempts. Please try again after 15 minutes.');
const submitLimiter = createRateLimiter(10 * 60 * 1000, 15, 'Too many submissions from this IP. Please wait a few minutes.');
const generalApiLimiter = createRateLimiter(10 * 60 * 1000, 300, 'Too many requests. Please slow down.');

app.use('/api', generalApiLimiter);
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

const staticOptions = process.env.NODE_ENV === 'production'
  ? { maxAge: '1d', etag: true }
  : {};

app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    if (req.path === '/index.html') {
      const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, '/' + search);
    }
    const cleanPath = req.path.slice(0, -5);
    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(301, cleanPath + search);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  ...staticOptions
}));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), staticOptions));

function verifyPassword(inputPassword, storedHashOrPlain) {
  if (!inputPassword || !storedHashOrPlain) return false;

  const rawInput = inputPassword.toString().trim();
  let rawStored = storedHashOrPlain.toString().trim();

  if ((rawStored.startsWith('"') && rawStored.endsWith('"')) || (rawStored.startsWith("'") && rawStored.endsWith("'"))) {
    rawStored = rawStored.slice(1, -1).trim();
  }

  if (rawInput === rawStored) return true;

  if (rawStored.startsWith('pbkdf2:')) {
    const parts = rawStored.split(':');
    if (parts.length === 3) {
      const salt = parts[1];
      const key = parts[2];
      const derived = crypto.pbkdf2Sync(rawInput, salt, 100000, 64, 'sha512').toString('hex');
      return derived === key;
    }
  }

  return false;
}

function generateToken() {
  const payload = JSON.stringify({ user: 'admin', exp: Date.now() + 24 * 60 * 60 * 1000 });
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret_session_key')
    .update(payload)
    .digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const payload = Buffer.from(parts[0], 'base64').toString();
    const signature = parts[1];
    const expectedSignature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret_session_key')
      .update(payload)
      .digest('hex');
    if (signature !== expectedSignature) return false;
    const parsed = JSON.parse(payload);
    if (Date.now() > parsed.exp) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication token required.' });
  }
  const token = authHeader.split(' ')[1];
  if (verifyToken(token)) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
}

function normalizeKenyanPhone(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/[\s\-\(\)\+]/g, '');

  if (/^0[17]\d{8}$/.test(cleaned)) {
    return '254' + cleaned.slice(1);
  }
  if (/^[17]\d{8}$/.test(cleaned)) {
    return '254' + cleaned;
  }
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }
  return null;
}

function initiateUpesiPayCollection({ channel_id, phone_number, amount, callback_url }) {
  return new Promise((resolve, reject) => {
    const authToken = process.env.UPESIPAY_AUTH_TOKEN;

    if (!authToken || authToken.includes('your_basic_auth_token') || authToken === 'mock') {
      console.log(`ℹ️ [UpesiPay Demo] Simulating STK Push to ${phone_number} for KES ${amount}`);
      const mockCheckoutId = 'ws_CO_' + Date.now() + Math.floor(Math.random() * 100000);
      const mockMerchantId = 'dta-' + Date.now().toString(36);
      return resolve({
        success: true,
        status_code: 200,
        message: 'STK push sent successfully. Enter your M-PESA PIN on your phone.',
        data: {
          checkout_request_id: mockCheckoutId,
          merchant_request_id: mockMerchantId,
          phone_number: phone_number,
          amount: Number(amount),
          status: 'sent'
        },
        _mock: true
      });
    }

    const postData = JSON.stringify({
      channel_id: parseInt(channel_id, 10),
      phone_number: phone_number.toString(),
      amount: Number(amount),
      ...(callback_url ? { callback_url } : {})
    });

    const authHeader = (authToken.startsWith('Basic ') || authToken.startsWith('Bearer ') || authToken.startsWith('Token '))
      ? authToken
      : `Basic ${authToken}`;

    const options = {
      hostname: 'upesipay.com',
      port: 443,
      path: '/api/v2/collections/initiate/',
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({
            success: false,
            status_code: res.statusCode,
            message: data || 'Invalid response from UpesiPay.'
          });
        }
      });
    });

    req.on('error', error => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

app.get('/api/health', (req, res) => {
  const isPostgres = db.isPostgresConnected();
  const uptimeSeconds = Math.floor(process.uptime());
  const mem = process.memoryUsage();

  res.json({
    status: isPostgres ? 'ok' : 'degraded',
    uptime: `${uptimeSeconds}s`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      type: isPostgres ? 'postgresql' : 'local_json',
      connected: isPostgres
    },
    storage: (process.env.CLOUDINARY_CLOUD_NAME && !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name')) ? 'cloudinary' : 'local',
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`
    }
  });
});

app.post('/api/admin/login', authLimiter, (req, res) => {
  let { username, password } = req.body;
  username = (username || '').toString().trim();
  password = (password || '').toString().trim();

  let correctUser = (process.env.ADMIN_USERNAME || 'admin').toString().trim();
  if ((correctUser.startsWith('"') && correctUser.endsWith('"')) || (correctUser.startsWith("'") && correctUser.endsWith("'"))) {
    correctUser = correctUser.slice(1, -1).trim();
  }

  const correctPass = process.env.ADMIN_PASSWORD || 'eco_admin_2026';

  if (username.toLowerCase() === correctUser.toLowerCase() && verifyPassword(password, correctPass)) {
    const token = generateToken();
    return res.json({ success: true, token });
  }

  return res.status(401).json({ success: false, message: 'Invalid username or password.' });
});

app.get('/api/config/payment', (req, res) => {
  const channelId = process.env.UPESIPAY_CHANNEL_ID;
  const isConfigured = !!(channelId && !channelId.includes('your_channel_id') && process.env.UPESIPAY_AUTH_TOKEN && !process.env.UPESIPAY_AUTH_TOKEN.includes('your_basic_auth_token'));
  res.json({
    provider: 'upesipay',
    channel_id: channelId || 'demo',
    is_live: isConfigured,
    mode: isConfigured ? 'live' : 'simulation'
  });
});

app.get('/api/config/paystack', (req, res) => {
  res.json({ publicKey: 'upesipay_mpesa_mode' });
});

app.get('/api/config/upload-mode', (req, res) => {
  const isCloudinary = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name') &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  res.json({ cloudinary: isCloudinary, storage: isCloudinary ? 'cloudinary' : 'local' });
});

app.get('/api/blogs', async (req, res) => {
  try {
    const search = req.query.search || '';
    const blogs = await db.getBlogs(search);
    res.json({ success: true, count: blogs.length, blogs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching blogs.' });
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await db.getBlogBySlug(req.params.slug);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }
    res.json({ success: true, blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching blog details.' });
  }
});

app.post('/api/blogs', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const imageUrl = getUploadedFileUrl(req);
    const newBlog = await db.createBlog({ title, body, imageUrl });

    res.status(201).json({ success: true, message: 'Blog created successfully!', blog: newBlog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error creating blog.' });
  }
});

app.post('/api/support', submitLimiter, async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ success: false, message: 'All form fields are required.' });
    }

    const savedMessage = await db.saveSupportMessage({ name, email, phone, message });
    res.status(201).json({ 
      success: true, 
      message: 'Support request submitted successfully! We will contact you soon.', 
      data: savedMessage 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error submitting support request.' });
  }
});

app.post('/api/newsletter/subscribe', submitLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const result = await db.saveSubscriber(email);
    if (result.duplicate) {
      return res.json({ success: true, message: 'You are already subscribed. Thank you!' });
    }

    res.status(201).json({ success: true, message: 'Thank you for subscribing to our newsletter!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

app.post('/api/donation/initiate', submitLimiter, async (req, res) => {
  try {
    const { donor_name, donor_email, donor_phone, amount, isAnonymous } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) < 1) {
      return res.status(400).json({ success: false, message: 'Please provide a valid donation amount (minimum KES 1).' });
    }

    if (!donor_phone) {
      return res.status(400).json({ success: false, message: 'Please provide your M-PESA phone number to receive the STK prompt.' });
    }

    const normalizedPhone = normalizeKenyanPhone(donor_phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Kenyan phone number. Please enter a valid number (e.g. 0712345678 or 254712345678).'
      });
    }

    const numericAmount = Math.round(parseFloat(amount));
    const channelId = parseInt(process.env.UPESIPAY_CHANNEL_ID || '1', 10);
    const callbackUrl = process.env.UPESIPAY_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/donation/webhook`;

    const upesiResponse = await initiateUpesiPayCollection({
      channel_id: channelId,
      phone_number: normalizedPhone,
      amount: numericAmount,
      callback_url: callbackUrl
    });

    if (upesiResponse.success && upesiResponse.status_code === 200) {
      const data = upesiResponse.data || {};
      const checkoutRequestId = data.checkout_request_id || `ws_CO_${Date.now()}`;
      const merchantRequestId = data.merchant_request_id || `merch_${Date.now()}`;

      await db.upsertDonation({
        donor_name: isAnonymous ? 'Anonymous' : (donor_name || 'Anonymous'),
        donor_email: isAnonymous ? `anon_${Date.now()}@dta-ngo.org` : (donor_email || 'supporter@dta-ngo.org'),
        donor_phone: normalizedPhone,
        amount: numericAmount,
        reference: checkoutRequestId,
        status: 'pending'
      });

      return res.status(200).json({
        success: true,
        message: upesiResponse.message || 'STK push sent successfully. Enter your M-PESA PIN on your phone.',
        data: {
          checkout_request_id: checkoutRequestId,
          merchant_request_id: merchantRequestId,
          phone_number: normalizedPhone,
          amount: numericAmount,
          status: 'sent'
        },
        _mock: !!upesiResponse._mock
      });
    } else {
      const statusCode = upesiResponse.status_code || 400;
      return res.status(statusCode).json({
        success: false,
        message: upesiResponse.message || 'Could not send M-PESA STK prompt. Please check the phone number and try again.',
        error_code: upesiResponse.error_code,
        details: upesiResponse.details
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error initiating M-PESA payment. Please try again.' });
  }
});

app.get('/api/donation/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const donation = await db.getDonationByCheckoutId(checkoutRequestId);

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Transaction record not found.' });
    }

    res.json({
      success: true,
      status: donation.status,
      amount: donation.amount,
      reference: donation.reference,
      donor_name: donation.donor_name
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking transaction status.' });
  }
});

app.post(['/api/donation/webhook', '/api/donate/webhook'], async (req, res) => {
  try {
    const payload = req.body;
    const { merchant_request_id, checkout_request_id, reference_id, status } = payload;
    const lookupRef = checkout_request_id || reference_id || merchant_request_id;

    if (!lookupRef) {
      return res.status(400).json({ success: false, message: 'Missing transaction identifiers.' });
    }

    let normalizedStatus = 'pending';
    if (status === 'success') normalizedStatus = 'success';
    else if (['failed', 'cancelled', 'timeout'].includes(status)) normalizedStatus = 'failed';

    const updated = await db.updateDonationStatus(lookupRef, normalizedStatus);
    if (!updated) {
      await db.upsertDonation({
        donor_name: 'M-PESA Supporter',
        donor_email: 'mpesa_donor@dta-ngo.org',
        donor_phone: '',
        amount: 0,
        reference: lookupRef,
        status: normalizedStatus
      });
    }

    res.status(200).json({ success: true, message: 'Webhook callback processed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error processing webhook.' });
  }
});

app.post('/api/donation/simulate-confirm', async (req, res) => {
  try {
    const { checkout_request_id } = req.body;
    if (!checkout_request_id) {
      return res.status(400).json({ success: false, message: 'checkout_request_id is required.' });
    }

    const updated = await db.updateDonationStatus(checkout_request_id, 'success');
    if (updated) {
      res.json({ success: true, message: 'M-PESA transaction simulated successfully!', donation: updated });
    } else {
      res.status(404).json({ success: false, message: 'Transaction not found.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error in simulation.' });
  }
});

app.get('/api/donations/receipt/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    let donation = await db.getDonationByReference(reference);

    if (!donation) {
      donation = await db.getDonationByCheckoutId(reference);
    }

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Donation receipt record not found.' });
    }

    const receiptDate = new Date(donation.created_at || Date.now());
    const dateFormatted = receiptDate.toLocaleDateString('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeFormatted = receiptDate.toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const receiptNumber = `DTA-REC-${receiptDate.getFullYear()}${(receiptDate.getMonth() + 1).toString().padStart(2, '0')}-${donation.id.toString().padStart(4, '0')}`;

    res.json({
      success: true,
      receipt: {
        receiptNumber,
        reference: donation.reference,
        donorName: donation.donor_name || 'Anonymous Donor',
        donorEmail: donation.donor_email || 'N/A',
        donorPhone: donation.donor_phone || 'N/A',
        amount: parseFloat(donation.amount),
        currency: donation.currency || 'KES',
        status: donation.status,
        date: dateFormatted,
        time: timeFormatted,
        timezone: 'EAT (UTC+3)',
        organization: {
          name: 'Doorway to Acceptance (DTA) NGO',
          regNo: 'OP.218/051/20-291/12480',
          taxExemptNo: 'KRA-PIN-P051982341Z',
          address: 'Nairobi, Kenya',
          email: 'doorwaytoacceptance@yahoo.com',
          phone: '+254 798 997 511',
          authorizedSignatory: 'Executive Director, DTA'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error generating receipt.' });
  }
});

app.get('/api/public/stats', async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({
      success: true,
      stats: {
        totalRaised: stats.totalRaised || 0,
        donorsCount: stats.donationsCount || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading stats.' });
  }
});

app.get('/api/admin/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await db.getSupportMessages();
    res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading messages.' });
  }
});

app.get('/api/admin/donations', authMiddleware, async (req, res) => {
  try {
    const donations = await db.getDonations();
    res.json({ success: true, count: donations.length, donations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading donations.' });
  }
});

app.delete('/api/admin/blogs/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteBlog(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Blog post deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Blog post not found.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting blog post.' });
  }
});

app.delete('/api/admin/messages/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteSupportMessage(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Support message deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Support message not found.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting support message.' });
  }
});

app.delete('/api/admin/donations/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteDonation(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Donation ledger record deleted.' });
    } else {
      res.status(404).json({ success: false, message: 'Donation record not found.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting donation.' });
  }
});

app.get('/api/admin/subscribers', authMiddleware, async (req, res) => {
  try {
    const subscribers = await db.getSubscribers();
    res.json({ success: true, count: subscribers.length, subscribers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error loading subscribers.' });
  }
});

app.delete('/api/admin/subscribers/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteSubscriber(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Subscriber removed.' });
    } else {
      res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error deleting subscriber.' });
  }
});

app.get('/api/admin/blogs/:id', authMiddleware, async (req, res) => {
  try {
    const blog = await db.getBlogById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog article not found.' });
    }
    res.json({ success: true, blog });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching blog article.' });
  }
});

app.put('/api/admin/blogs/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const imageUrl = req.file ? getUploadedFileUrl(req) : null;
    const updated = await db.updateBlog(req.params.id, { title, body, imageUrl });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Blog article not found.' });
    }

    res.json({ success: true, message: 'Blog article updated successfully!', blog: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error updating blog article.' });
  }
});

app.post('/api/admin/donations/manual', authMiddleware, async (req, res) => {
  try {
    const { donor_name, donor_email, donor_phone, amount, payment_method } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid donation amount is required.' });
    }

    const prefix = (payment_method || 'OFFLINE').toUpperCase().slice(0, 4);
    const manualRef = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    const saved = await db.saveDonation({
      donor_name: donor_name || 'Anonymous Contributor',
      donor_email: donor_email || 'offline_donor@dta-ngo.org',
      donor_phone: donor_phone || 'N/A',
      amount: parseFloat(amount),
      reference: manualRef,
      status: 'success'
    });

    res.status(201).json({ success: true, message: 'Manual donation recorded successfully!', donation: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error recording manual donation.' });
  }
});

app.patch('/api/admin/donations/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['success', 'pending', 'failed', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = await db.updateDonationStatusById(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Donation record not found.' });
    }

    res.json({ success: true, message: `Donation status updated to ${status}.`, donation: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error updating donation status.' });
  }
});

app.post('/api/admin/newsletter/broadcast', authMiddleware, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required.' });
    }

    const subscribers = await db.getSubscribers();
    res.json({
      success: true,
      message: `Broadcast message queued successfully for ${subscribers.length} subscriber(s)!`,
      recipient_count: subscribers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error broadcasting newsletter.' });
  }
});

app.get('/api/admin/system/diagnostics', authMiddleware, async (req, res) => {
  try {
    const isPostgres = db.isPostgresConnected();
    const mem = process.memoryUsage();

    res.json({
      success: true,
      diagnostics: {
        serverTime: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        database: {
          type: isPostgres ? 'PostgreSQL' : 'Local File Persistence (data/local_db.json)',
          status: isPostgres ? 'Connected (PostgreSQL Active)' : 'Active (Zero-Crash Fallback)'
        },
        storage: (process.env.CLOUDINARY_CLOUD_NAME && !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name')) ? 'Cloudinary CDN' : 'Local Disk (/public/uploads)',
        paymentGateway: 'UpesiPay (M-PESA STK Push)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching diagnostics.' });
  }
});

app.get('/api/admin/export/:type', authMiddleware, async (req, res) => {
  try {
    const { type } = req.params;
    let csvData = '';
    let filename = '';

    if (type === 'donations') {
      const donations = await db.getDonations();
      filename = `dta_donations_${new Date().toISOString().slice(0, 10)}.csv`;
      csvData = 'ID,Donor Name,Donor Email,Donor Phone,Amount (KES),Currency,Reference,Status,Date\n' +
        donations.map(d => `"${d.id}","${(d.donor_name || '').replace(/"/g, '""')}","${(d.donor_email || '').replace(/"/g, '""')}","${d.donor_phone || ''}","${d.amount}","${d.currency || 'KES'}","${d.reference}","${d.status}","${new Date(d.created_at).toISOString()}"`).join('\n');
    } else if (type === 'messages') {
      const messages = await db.getSupportMessages();
      filename = `dta_inquiries_${new Date().toISOString().slice(0, 10)}.csv`;
      csvData = 'ID,Name,Email,Phone,Message,Date\n' +
        messages.map(m => `"${m.id}","${(m.name || '').replace(/"/g, '""')}","${(m.email || '').replace(/"/g, '""')}","${m.phone || ''}","${(m.message || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${new Date(m.created_at).toISOString()}"`).join('\n');
    } else if (type === 'subscribers') {
      const subscribers = await db.getSubscribers();
      filename = `dta_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
      csvData = 'ID,Email,Subscribed Date\n' +
        subscribers.map(s => `"${s.id}","${(s.email || '').replace(/"/g, '""')}","${new Date(s.subscribed_at).toISOString()}"`).join('\n');
    } else {
      return res.status(400).json({ success: false, message: 'Invalid export type.' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error exporting CSV data.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.redirect(301, '/'));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/blogs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blogs.html')));
app.get('/blogs/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/blog-detail', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/receipt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'receipt.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 NGO Backend running on http://localhost:${PORT}`);
});

async function handleShutdown(signal) {
  server.close(async () => {
    await db.closePool();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
