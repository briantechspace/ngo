const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./db');
const { upload, getUploadedFileUrl } = require('./cloudinary');

const app = express();
const PORT = process.env.PORT || 5055;

// Raw body capture for Paystack webhook HMAC verification
// Must be registered BEFORE bodyParser.json()
app.use('/api/donate/webhook', bodyParser.raw({ type: 'application/json' }));

// Middleware for all other routes
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));
// Support serving uploaded images locally if Cloudinary is not used
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

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

// --- Paystack Verification Helper ---
function verifyPaystackPayment(reference) {
  return new Promise((resolve, reject) => {
    // If secret key is not set, allow mock verification for developers
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey || secretKey.includes('your_secret_key')) {
      console.log(`ℹ️ [Paystack Mock] Verifying reference: ${reference}`);
      // Simulate successful payment validation (amount passed in body, convert to kobo)
      return resolve({
        status: true,
        data: {
          status: 'success',
          reference: reference,
          amount: 0, // Will use body amount directly in the verify route for mock
          currency: 'KES',
          customer: { email: 'mock_donor@example.com' },
          _mock: true
        }
      });
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    };

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const responseData = JSON.parse(data);
          resolve(responseData);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', error => {
      reject(error);
    });

    req.end();
  });
}

// --- API ENDPOINTS ---

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const correctUser = process.env.ADMIN_USERNAME || 'admin';
  const correctPass = process.env.ADMIN_PASSWORD || 'eco_admin_2026';

  if (username === correctUser && password === correctPass) {
    const token = generateToken();
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
});

// 1. PUBLIC: Fetch Paystack Public Key
app.get('/api/config/paystack', (req, res) => {
  const publicKey = process.env.PAYSTACK_PUBLIC_KEY;
  // If not configured, send a developer key placeholder
  if (!publicKey || publicKey.includes('your_public_key')) {
    return res.json({ publicKey: 'pk_test_developer_mock_key' });
  }
  res.json({ publicKey });
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

// 4. BLOGS: Upload image & create new blog post (Admin protected ideally)
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

// 5. SUPPORT: Submit support request
app.post('/api/support', async (req, res) => {
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

// 5.5 NEWSLETTER: Subscribe (public)
app.post('/api/newsletter/subscribe', async (req, res) => {
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


// 6. PAYMENTS: Verify Paystack Transaction Reference & Log Donation
app.post('/api/donate/verify', async (req, res) => {
  try {
    const { reference, donor_name, donor_email, donor_phone, amount } = req.body;

    if (!reference || !amount) {
      return res.status(400).json({ success: false, message: 'Reference and amount are required.' });
    }

    // Call Paystack API to verify transaction
    const verification = await verifyPaystackPayment(reference);

    if (verification.status && verification.data.status === 'success') {
      // For live transactions: Paystack returns amount in kobo → divide by 100
      // For mock/simulation: use the amount passed from the frontend directly
      const verifiedAmount = verification.data._mock
        ? parseFloat(amount)
        : verification.data.amount / 100;

      const donation = await db.upsertDonation({
        donor_name: donor_name || 'Anonymous',
        donor_email: donor_email || 'anonymous@dta-ngo.org',
        donor_phone: donor_phone || '',
        amount: verifiedAmount,
        reference: reference,
        status: 'success'
      });

      console.log(`✅ Donation logged: ${reference} | KES ${verifiedAmount} | ${donor_name || 'Anonymous'}`);

      return res.json({ 
        success: true, 
        message: 'Donation verified and recorded successfully!', 
        donation 
      });
    } else {
      // Save failed donation for audit trail
      await db.upsertDonation({
        donor_name: donor_name || 'Anonymous',
        donor_email: donor_email || 'anonymous@dta-ngo.org',
        donor_phone: donor_phone || '',
        amount: parseFloat(amount) || 0,
        reference: reference,
        status: 'failed'
      });

      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed. Please contact us if your card was charged.' 
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Server error verifying payment.' });
  }
});

// 6.5 PAYMENTS: Paystack Webhook Handler
// NOTE: This route uses bodyParser.raw() (registered above) so req.body is a Buffer
// This is required by Paystack to correctly verify the HMAC-SHA512 signature
app.post('/api/donate/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // req.body is a raw Buffer here - convert to string for HMAC
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);

    // Verify webhook HMAC signature
    if (secretKey && !secretKey.includes('your_secret_key')) {
      const expectedHash = crypto.createHmac('sha512', secretKey)
        .update(rawBody)
        .digest('hex');

      if (expectedHash !== signature) {
        console.warn('⚠️ Paystack webhook signature mismatch - possible replay attack or wrong secret.');
        return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
      }
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: 'Invalid JSON payload.' });
    }

    console.log(`📦 Paystack webhook received: ${event.event}`);

    if (event.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;
      const amount = data.amount / 100; // convert kobo → KES
      const donor_email = (data.customer && data.customer.email) ? data.customer.email : 'anonymous@dta-ngo.org';

      // Extract donor metadata (name & phone) passed during checkout
      const metadata = data.metadata || {};
      let donor_name = 'Anonymous';
      let donor_phone = '';

      if (metadata.custom_fields && Array.isArray(metadata.custom_fields)) {
        const nameField = metadata.custom_fields.find(f => f.variable_name === 'donor_name');
        const phoneField = metadata.custom_fields.find(f => f.variable_name === 'donor_phone');
        if (nameField && nameField.value) donor_name = nameField.value;
        if (phoneField && phoneField.value && phoneField.value !== 'N/A') donor_phone = phoneField.value;
      }

      console.log(`✅ Webhook: Donation confirmed ${reference} | KES ${amount} | ${donor_name}`);

      // Upsert donation - webhook is authoritative (overrides any pending status)
      await db.upsertDonation({
        donor_name,
        donor_email,
        donor_phone,
        amount,
        reference,
        status: 'success'
      });
    } else if (event.event === 'charge.failed') {
      const data = event.data;
      console.log(`❌ Webhook: Donation failed ${data.reference}`);
      // Update existing donation record to failed if present
      await db.upsertDonation({
        donor_name: 'Unknown',
        donor_email: (data.customer && data.customer.email) ? data.customer.email : 'anonymous@dta-ngo.org',
        donor_phone: '',
        amount: data.amount ? data.amount / 100 : 0,
        reference: data.reference,
        status: 'failed'
      });
    }

    // Always respond 200 quickly to Paystack
    res.status(200).json({ success: true, message: 'Webhook received.' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ success: false, message: 'Webhook server error' });
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

// Fallback to home page for any other route (single page routing support or static files)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Start Server
app.listen(PORT, () => {
  console.log(`🚀 NGO Backend running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});
