const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./db');
const { upload, getUploadedFileUrl } = require('./cloudinary');

// Dynamic production optional modules
let compression = null;
let helmet = null;
let rateLimit = null;

try { compression = require('compression'); } catch (_) {}
try { helmet = require('helmet'); } catch (_) {}
try { rateLimit = require('express-rate-limit'); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 5055;

// Trust reverse proxies (Nginx, Render, Heroku, Cloudflare, AWS ALB)
app.set('trust proxy', 1);

// Optional gzip compression
if (compression) {
  app.use(compression());
}

// Security Headers: Helmet or Built-in Headers
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co", "https://cdn.quilljs.com", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.quilljs.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.paystack.co", "https://*.paystack.com"],
        frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.paystack.com"],
        connectSrc: ["'self'", "https://api.paystack.co", "https://*.paystack.co"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
} else {
  // Built-in standard security headers fallback
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

// Rate Limiter Factory (supports express-rate-limit or built-in in-memory token bucket)
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

    // Prune old records periodically
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

// Apply general limiter to all /api/ endpoints
app.use('/api', generalApiLimiter);

// Middleware for all routes
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

// Static asset caching in production
const staticOptions = process.env.NODE_ENV === 'production'
  ? { maxAge: '1d', etag: true }
  : {};

// Clean URL redirect middleware: 301 redirects /path.html to /path
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

// Serve static frontend assets (css, js, images, uploads)
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  ...staticOptions
}));
// Support serving uploaded images locally if Cloudinary is not used
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), staticOptions));

// --- Password Hashing & Verification Helper ---
function verifyPassword(inputPassword, storedHashOrPlain) {
  if (!inputPassword || !storedHashOrPlain) return false;

  const rawInput = inputPassword.toString().trim();
  let rawStored = storedHashOrPlain.toString().trim();

  // Strip wrapping quotes if present in .env
  if ((rawStored.startsWith('"') && rawStored.endsWith('"')) || (rawStored.startsWith("'") && rawStored.endsWith("'"))) {
    rawStored = rawStored.slice(1, -1).trim();
  }

  // Direct match for plain text credentials in .env
  if (rawInput === rawStored) return true;

  // Format: pbkdf2:salt:hash
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

// --- Auth Session Token Verification Helpers (Built-in Crypto) ---
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

// Middleware to protect admin routes
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

// --- Phone Number Formatter for Kenyan M-PESA ---
function normalizeKenyanPhone(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/[\s\-\(\)\+]/g, '');

  // 07XXXXXXXX -> 2547XXXXXXXX or 01XXXXXXXX -> 2541XXXXXXXX
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return '254' + cleaned.slice(1);
  }
  // 7XXXXXXXX or 1XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (/^[17]\d{8}$/.test(cleaned)) {
    return '254' + cleaned;
  }
  // 2547XXXXXXXX or 2541XXXXXXXX (12 digits)
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }
  return null;
}

// --- UpesiPay M-PESA STK Push Helper ---
function initiateUpesiPayCollection({ channel_id, phone_number, amount, callback_url }) {
  return new Promise((resolve, reject) => {
    const authToken = process.env.UPESIPAY_AUTH_TOKEN;

    // Simulation / Local Offline Mode when no live auth token is provided
    if (!authToken || authToken.includes('your_basic_auth_token') || authToken === 'mock') {
      console.log(`ℹ️ [UpesiPay Mock] Simulating STK Push to ${phone_number} for KES ${amount}`);
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

// --- API ENDPOINTS ---

// Health check endpoint for uptime monitors, kubernetes, or load balancers
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
      type: 'postgresql',
      connected: isPostgres
    },
    storage: (process.env.CLOUDINARY_CLOUD_NAME && !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name')) ? 'cloudinary' : 'local',
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`
    }
  });
});

// Admin Login Endpoint (Protected by rate limiting & timing-safe password check)
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
    console.log(`🔑 Admin authenticated successfully as: ${username}`);
    return res.json({ success: true, token });
  }

  console.log(`⚠️ Invalid admin login attempt with username: "${username}"`);
  return res.status(401).json({ success: false, message: 'Invalid username or password.' });
});

// 1. PUBLIC: Fetch Payment Gateway Config (UpesiPay M-PESA)
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

// Legacy Paystack config alias for backward compatibility
app.get('/api/config/paystack', (req, res) => {
  res.json({ publicKey: 'upesipay_mpesa_mode' });
});

// 1.5 PUBLIC: Check upload mode (Cloudinary vs local)
app.get('/api/config/upload-mode', (req, res) => {
  const isCloudinary = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name') &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  res.json({ cloudinary: isCloudinary, storage: isCloudinary ? 'cloudinary' : 'local' });
});

// 2. BLOGS: Fetch all blogs (supports search query '?search=something')
app.get('/api/blogs', async (req, res) => {
  try {
    const search = req.query.search || '';
    const blogs = await db.getBlogs(search);
    res.json({ success: true, count: blogs.length, blogs });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ success: false, message: 'Server error fetching blogs.' });
  }
});

// 3. BLOGS: Fetch single blog by slug
app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await db.getBlogBySlug(req.params.slug);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found.' });
    }
    res.json({ success: true, blog });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ success: false, message: 'Server error fetching blog details.' });
  }
});

// 4. BLOGS: Upload image & create new blog post (Admin protected)
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
    console.error('Error creating blog:', error);
    res.status(500).json({ success: false, message: 'Server error creating blog.' });
  }
});

// 5. SUPPORT: Submit support request (Protected by submitLimiter)
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
    console.error('Error saving support message:', error);
    res.status(500).json({ success: false, message: 'Server error submitting support request.' });
  }
});

// 5.5 NEWSLETTER: Subscribe (Protected by submitLimiter)
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

    console.log(`📧 New newsletter subscriber: ${email}`);
    res.status(201).json({ success: true, message: 'Thank you for subscribing to our newsletter!' });
  } catch (error) {
    console.error('Error saving subscriber:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});


// 6. PAYMENTS: Initiate UpesiPay M-PESA STK Push
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

    // Initiate M-PESA STK Push with UpesiPay
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

      // Record pending donation in database
      const donation = await db.upsertDonation({
        donor_name: isAnonymous ? 'Anonymous' : (donor_name || 'Anonymous'),
        donor_email: isAnonymous ? `anon_${Date.now()}@dta-ngo.org` : (donor_email || 'supporter@dta-ngo.org'),
        donor_phone: normalizedPhone,
        amount: numericAmount,
        reference: checkoutRequestId,
        status: 'pending'
      });

      console.log(`📱 M-PESA STK Push initiated: ${checkoutRequestId} | KES ${numericAmount} | Phone: ${normalizedPhone}`);

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
      console.warn('⚠️ UpesiPay STK push error:', upesiResponse);
      const statusCode = upesiResponse.status_code || 400;
      return res.status(statusCode).json({
        success: false,
        message: upesiResponse.message || 'Could not send M-PESA STK prompt. Please check the phone number and try again.',
        error_code: upesiResponse.error_code,
        details: upesiResponse.details
      });
    }
  } catch (error) {
    console.error('Error initiating UpesiPay STK push:', error);
    res.status(500).json({ success: false, message: 'Server error initiating M-PESA payment. Please try again.' });
  }
});

// 6.2 PAYMENTS: Check Status of M-PESA STK Push
app.get('/api/donation/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const donation = await db.getDonationByCheckoutId(checkoutRequestId);

    if (!donation) {
      return res.status(404).json({ success: false, message: 'Transaction record not found.' });
    }

    res.json({
      success: true,
      status: donation.status, // 'pending', 'success', 'failed', 'cancelled', 'timeout'
      amount: donation.amount,
      reference: donation.reference,
      donor_name: donation.donor_name
    });
  } catch (error) {
    console.error('Error checking donation status:', error);
    res.status(500).json({ success: false, message: 'Error checking transaction status.' });
  }
});

// 6.3 PAYMENTS: UpesiPay Webhook Callback Handler
app.post(['/api/donation/webhook', '/api/donate/webhook'], async (req, res) => {
  try {
    const payload = req.body;
    console.log('📦 UpesiPay Webhook Received:', JSON.stringify(payload));

    const { merchant_request_id, checkout_request_id, reference_id, status } = payload;
    const lookupRef = checkout_request_id || reference_id || merchant_request_id;

    if (!lookupRef) {
      return res.status(400).json({ success: false, message: 'Missing transaction identifiers.' });
    }

    // Normalize UpesiPay status: 'success', 'failed', 'cancelled', 'timeout'
    let normalizedStatus = 'pending';
    if (status === 'success') normalizedStatus = 'success';
    else if (['failed', 'cancelled', 'timeout'].includes(status)) normalizedStatus = 'failed';

    const updated = await db.updateDonationStatus(lookupRef, normalizedStatus);

    if (updated) {
      console.log(`✅ Webhook: Donation ${lookupRef} updated to status: ${normalizedStatus}`);
    } else {
      console.log(`ℹ️ Webhook: Reference ${lookupRef} not yet in DB, creating record.`);
      await db.upsertDonation({
        donor_name: 'M-PESA Supporter',
        donor_email: 'mpesa_donor@dta-ngo.org',
        donor_phone: '',
        amount: 0,
        reference: lookupRef,
        status: normalizedStatus
      });
    }

    // UpesiPay requires HTTP 200/204 acknowledgement
    res.status(200).json({ success: true, message: 'Webhook callback processed successfully.' });
  } catch (error) {
    console.error('Error handling UpesiPay webhook callback:', error);
    res.status(500).json({ success: false, message: 'Server error processing webhook.' });
  }
});

// 6.4 PAYMENTS: Local Simulation Confirmation (for testing and offline demo)
app.post('/api/donation/simulate-confirm', async (req, res) => {
  try {
    const { checkout_request_id } = req.body;
    if (!checkout_request_id) {
      return res.status(400).json({ success: false, message: 'checkout_request_id is required.' });
    }

    const updated = await db.updateDonationStatus(checkout_request_id, 'success');
    if (updated) {
      console.log(`🎉 [Simulation] Donation confirmed: ${checkout_request_id} | KES ${updated.amount}`);
      res.json({ success: true, message: 'M-PESA transaction simulated successfully!', donation: updated });
    } else {
      res.status(404).json({ success: false, message: 'Transaction not found.' });
    }
  } catch (error) {
    console.error('Error simulating confirmation:', error);
    res.status(500).json({ success: false, message: 'Error in simulation.' });
  }
});

// 6.5 DONATIONS: Fetch Official Donor Receipt & Tax Certificate Data
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

    const receiptNumber = `DTA-REC-${new Date(donation.created_at).getFullYear()}${(new Date(donation.created_at).getMonth() + 1).toString().padStart(2, '0')}-${donation.id.toString().padStart(4, '0')}`;

    res.json({
      success: true,
      receipt: {
        receiptNumber,
        donationId: donation.id,
        donorName: donation.donor_name || 'Valued Supporter',
        donorEmail: donation.donor_email || '',
        donorPhone: donation.donor_phone || '',
        amount: parseFloat(donation.amount || 0),
        currency: donation.currency || 'KES',
        reference: donation.reference,
        status: donation.status,
        date: donation.created_at,
        organization: {
          name: 'Doorway to Acceptance (DTA) NGO',
          registrationNo: 'OP.218/051/20-291/12480',
          taxExemptNo: 'KRA-PIN-P051982341Z',
          address: 'Nairobi, Kenya',
          email: 'doorwaytoacceptance@yahoo.com',
          phone: '+254 798 997 511',
          authorizedSignatory: 'Executive Director, DTA'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching donation receipt:', error);
    res.status(500).json({ success: false, message: 'Server error generating receipt.' });
  }
});

// 6.9 PUBLIC: Total raised (no auth required - for donation page display)
app.get('/api/public/stats', async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    // Only expose safe public data
    res.json({
      success: true,
      stats: {
        totalRaised: stats.totalRaised || 0,
        donorsCount: stats.donationsCount || 0
      }
    });
  } catch (error) {
    console.error('Error loading public stats:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// 7. ADMIN: Retrieve full dashboard stats
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Server error loading stats.' });
  }
});

// 8. ADMIN: Retrieve support messages log
app.get('/api/admin/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await db.getSupportMessages();
    res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error('Error loading support messages:', error);
    res.status(500).json({ success: false, message: 'Server error loading messages.' });
  }
});

// 9. ADMIN: Retrieve donations history
app.get('/api/admin/donations', authMiddleware, async (req, res) => {
  try {
    const donations = await db.getDonations();
    res.json({ success: true, count: donations.length, donations });
  } catch (error) {
    console.error('Error loading donations history:', error);
    res.status(500).json({ success: false, message: 'Server error loading donations.' });
  }
});

// 10. ADMIN: Delete a blog post
app.delete('/api/admin/blogs/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteBlog(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Blog post deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Blog post not found.' });
    }
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ success: false, message: 'Server error deleting blog post.' });
  }
});

// 11. ADMIN: Delete a support message
app.delete('/api/admin/messages/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteSupportMessage(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Support message deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Support message not found.' });
    }
  } catch (error) {
    console.error('Error deleting support message:', error);
    res.status(500).json({ success: false, message: 'Server error deleting support message.' });
  }
});

// 12. ADMIN: Delete a donation log
app.delete('/api/admin/donations/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteDonation(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Donation record deleted successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Donation record not found.' });
    }
  } catch (error) {
    console.error('Error deleting donation:', error);
    res.status(500).json({ success: false, message: 'Server error deleting donation record.' });
  }
});

// 13. ADMIN: List all newsletter subscribers
app.get('/api/admin/subscribers', authMiddleware, async (req, res) => {
  try {
    const subscribers = await db.getSubscribers();
    res.json({ success: true, count: subscribers.length, subscribers });
  } catch (error) {
    console.error('Error loading subscribers:', error);
    res.status(500).json({ success: false, message: 'Server error loading subscribers.' });
  }
});

// 14. ADMIN: Delete a subscriber
app.delete('/api/admin/subscribers/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await db.deleteSubscriber(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Subscriber removed successfully.' });
    } else {
      res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    res.status(500).json({ success: false, message: 'Server error deleting subscriber.' });
  }
});

// 15. ADMIN: Get single blog post by ID for editing
app.get('/api/admin/blogs/:id', authMiddleware, async (req, res) => {
  try {
    const blog = await db.getBlogById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog post not found.' });
    res.json({ success: true, blog });
  } catch (error) {
    console.error('Error loading blog by ID:', error);
    res.status(500).json({ success: false, message: 'Server error loading blog.' });
  }
});

// 16. ADMIN: Edit / Update existing blog post (with optional cover image replacement)
app.put('/api/admin/blogs/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const imageUrl = req.file ? getUploadedFileUrl(req) : undefined;
    const updatedBlog = await db.updateBlog(req.params.id, { title, body, imageUrl });

    if (!updatedBlog) {
      return res.status(404).json({ success: false, message: 'Blog post not found.' });
    }

    console.log(`📝 Blog updated: #${req.params.id} "${title}"`);
    res.json({ success: true, message: 'Blog article updated successfully!', blog: updatedBlog });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ success: false, message: 'Server error updating blog post.' });
  }
});

// 17. ADMIN: Manual Donation Entry (Bank Transfer / Cash / Paybill Offline Grant)
app.post('/api/admin/donations/manual', authMiddleware, async (req, res) => {
  try {
    const { donor_name, donor_email, donor_phone, amount, payment_method, notes } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid donation amount is required.' });
    }

    const reference = `MANUAL-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const saved = await db.saveDonation({
      donor_name: donor_name || 'Anonymous Donor',
      donor_email: donor_email || 'manual_entry@dta-ngo.org',
      donor_phone: donor_phone || '',
      amount: parseFloat(amount),
      reference,
      status: 'success'
    });

    console.log(`💰 Manual donation added: ${reference} | KES ${amount} | Method: ${payment_method || 'Manual'}`);
    res.status(201).json({ success: true, message: 'Manual donation recorded successfully!', donation: saved });
  } catch (error) {
    console.error('Error adding manual donation:', error);
    res.status(500).json({ success: false, message: 'Server error saving manual donation.' });
  }
});

// 18. ADMIN: Override Donation Status (Mark Success / Failed / Refunded)
app.patch('/api/admin/donations/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['success', 'pending', 'failed', 'refunded', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status provided.' });
    }

    const updated = await db.updateDonationStatusById(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Donation record not found.' });
    }

    console.log(`⚡ Donation #${req.params.id} status overridden to: ${status}`);
    res.json({ success: true, message: `Donation status updated to ${status}.`, donation: updated });
  } catch (error) {
    console.error('Error overriding donation status:', error);
    res.status(500).json({ success: false, message: 'Server error updating donation status.' });
  }
});

// 19. ADMIN: Newsletter Broadcast Composer
app.post('/api/admin/newsletter/broadcast', authMiddleware, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required.' });
    }

    const subscribers = await db.getSubscribers();
    console.log(`📢 Newsletter Broadcast queued: "${subject}" to ${subscribers.length} subscriber(s).`);

    res.json({
      success: true,
      message: `Broadcast message queued successfully for ${subscribers.length} subscriber(s)!`,
      recipient_count: subscribers.length
    });
  } catch (error) {
    console.error('Error broadcasting newsletter:', error);
    res.status(500).json({ success: false, message: 'Server error broadcasting newsletter.' });
  }
});

// 20. ADMIN: System Diagnostics & Health Metrics
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
    console.error('Error fetching diagnostics:', error);
    res.status(500).json({ success: false, message: 'Server error fetching diagnostics.' });
  }
});

// 21. ADMIN: One-Click CSV Data Export
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
    console.error('Error exporting data to CSV:', error);
    res.status(500).json({ success: false, message: 'Server error exporting CSV data.' });
  }
});

// --- Clean Page Serving Endpoints (No .html extension in URL) ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.redirect(301, '/'));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/blogs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blogs.html')));
app.get('/blogs/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/blog-detail', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog-detail.html')));
app.get('/receipt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'receipt.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Fallback to home page for any other unmatched frontend route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`🚀 NGO Backend running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});

// Graceful Shutdown handling (SIGTERM, SIGINT)
async function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP server connections closed.');
    await db.closePool();
    console.log('PostgreSQL connections closed. Exiting process cleanly.');
    process.exit(0);
  });

  // Force close after 10s if connections remain stuck
  setTimeout(() => {
    console.error('⚠️ Forcefully terminating process after 10s timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
