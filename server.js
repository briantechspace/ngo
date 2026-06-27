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

// Middleware
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
      // Simulate successful payment validation
      return resolve({
        status: true,
        data: {
          status: 'success',
          reference: reference,
          amount: 500000, // 5000 NGN in kobo
          currency: 'NGN',
          customer: { email: 'mock_donor@example.com' }
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

// 6. PAYMENTS: Verify Paystack Transaction Reference & Log Donation
app.post('/api/donate/verify', async (req, res) => {
  try {
    const { reference, donor_name, donor_email, donor_phone, amount } = req.body;

    if (!reference || !donor_email || !amount) {
      return res.status(400).json({ success: false, message: 'Reference, email, and amount are required.' });
    }

    // Call Paystack API to verify transaction
    const verification = await verifyPaystackPayment(reference);

    if (verification.status && verification.data.status === 'success') {
      // Amount verified (Paystack returns amount in kobo, convert back to currency units)
      const verifiedAmount = verification.data.amount / 100;
      
      const donation = await db.saveDonation({
        donor_name: donor_name || 'Anonymous',
        donor_email: donor_email,
        donor_phone: donor_phone,
        amount: verifiedAmount,
        reference: reference,
        status: 'success'
      });

      return res.json({ 
        success: true, 
        message: 'Donation verified and logged successfully!', 
        donation 
      });
    } else {
      // Save failed donation for audit logs
      await db.saveDonation({
        donor_name: donor_name || 'Anonymous',
        donor_email: donor_email,
        donor_phone: donor_phone,
        amount: amount,
        reference: reference,
        status: 'failed'
      });

      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed or was not completed.' 
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Server error verifying payment.' });
  }
});

// 7. ADMIN: Retrieve dashboard stats
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

// Fallback to home page for any other route (single page routing support or static files)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 NGO Backend running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});
