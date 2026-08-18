const { Pool } = require('pg');
require('dotenv').config();

const useMockDb = process.env.USE_MOCK_DB === 'true' || !process.env.DATABASE_URL;

let pool = null;
let isDbReady = false;

async function bootstrapSchema(clientPool) {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS blogs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        body TEXT NOT NULL,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS donations (
        id SERIAL PRIMARY KEY,
        donor_name VARCHAR(255) DEFAULT 'Anonymous',
        donor_email VARCHAR(255) NOT NULL,
        donor_phone VARCHAR(50),
        amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'KES',
        reference VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);
    CREATE INDEX IF NOT EXISTS idx_blogs_title ON blogs(title);
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
  `;

  try {
    await clientPool.query(schemaSql);
    console.log('✅ PostgreSQL Schema bootstrapped / verified successfully.');

    // Seed initial blogs if table is empty
    const checkBlogs = await clientPool.query('SELECT COUNT(*) FROM blogs');
    if (parseInt(checkBlogs.rows[0].count) === 0) {
      for (const blog of mockDb.blogs) {
        await clientPool.query(
          'INSERT INTO blogs (title, slug, body, image_url, created_at) VALUES ($1, $2, $3, $4, $5)',
          [blog.title, blog.slug, blog.body, blog.image_url, blog.created_at]
        );
      }
      console.log('🌱 Seeded initial NGO blog stories into PostgreSQL.');
    }
  } catch (err) {
    console.error('⚠️ Database schema bootstrap warning:', err.message);
  }
}

if (!useMockDb) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 4000
    });

    pool.on('error', (err) => {
      console.warn('⚠️ Unexpected idle client error on PostgreSQL pool:', err.message);
      isDbReady = false;
    });

    // Test the connection & bootstrap schema
    pool.query('SELECT NOW()', async (err, res) => {
      if (err) {
        console.warn('⚠️ PostgreSQL connection failed (localhost:5432 unreachable). Falling back to in-memory Mock Database.');
        isDbReady = false;
        pool = null;
      } else {
        console.log('✅ PostgreSQL Database connected successfully at:', res.rows[0].now);
        isDbReady = true;
        await bootstrapSchema(pool);
      }
    });
  } catch (e) {
    console.warn('⚠️ Could not initialize PostgreSQL Pool. Falling back to in-memory Mock Database.');
    pool = null;
    isDbReady = false;
  }
} else {
  console.log('ℹ️ Using In-Memory Mock Database (USE_MOCK_DB is true or DATABASE_URL not set).');
}

// --- In-Memory Mock Database Store ---
const mockDb = {
  blogs: [
    {
      id: 1,
      title: "Preventing SGBV: Educating and Empowering the Next Generation of Girls",
      slug: "preventing-sgbv-educating-empowering-next-generation",
      body: `<p>At Doorway to Acceptance (DTA), we believe that education is the first line of defense against Sexual and Gender-Based Violence (SGBV). Education extends far beyond the classroom; it builds the foundation for confidence and leadership.</p>
             <p>Our Life Skills and Mentorship programmes in local schools and communities teach girls about their rights, building self-esteem and resistance to exploitation. By addressing the root causes of vulnerability—such as poverty and gender inequality—early on, we construct safer societies.</p>
             <blockquote>"When you educate a girl, you give her the keys to unlock her own safety, dignity, and independence." - SYLVIA WAMBUI, Founder & Director</blockquote>
             <p>Join us in expanding this initiative to schools across rural Kenya!</p>`,
      image_url: "/images/blog_sgbv.jpg",
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      id: 2,
      title: "Climate-Smart Livelihoods: Establishing Women-Led Green Enterprises",
      slug: "climate-smart-livelihoods-women-led-green-enterprises",
      body: `<p>Climate change impacts women first and most severely through food insecurity, water scarcity, and loss of traditional livelihoods. DTA works to bridge this gap by establishing climate-smart enterprises.</p>
             <p>Through our Green Futures Programme, women are launching sustainable beekeeping, regenerative agriculture, and aquaculture projects. These initiatives protect local biodiversity while generating stable, independent income streams that keep families secure.</p>
             <p>By connecting economic empowerment with environmental conservation, we help communities adapt to climate change while lifting women out of dependency.</p>`,
      image_url: "/images/blog_climate.jpg",
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    {
      id: 3,
      title: "Walking with Survivors: The Journey to Long-Term Healing and Reintegration",
      slug: "walking-with-survivors-journey-long-term-healing",
      body: `<p>While violence prevention remains at the heart of our mission, supporting survivors on their recovery journey is equally crucial. DTA takes a survivor-centered, trauma-informed approach to reintegration.</p>
             <p>In partnership with healthcare providers and legal counselors, we connect survivors to medical care, emergency safeguarding, and psychosocial counseling. Furthermore, our peer support networks and skills development programs empower survivors to reclaim their independence and rebuild their lives with dignity.</p>
             <p>Healing is a journey—not a single event—and DTA walks alongside every woman and girl on that path.</p>`,
      image_url: "/images/blog_survivors.jpg",
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
    }
  ],
  support_messages: [
    {
      id: 1,
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+254712345678",
      message: "I am interested in volunteering for the DTA Girls First mentorship drive next month. Please let me know how I can sign up!",
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    }
  ],
  donations: [
    {
      id: 1,
      donor_name: "Sarah Jenkins",
      donor_email: "sarah.j@example.com",
      amount: 5000.00,
      currency: "KES",
      reference: "mock-ref-1782387780",
      status: "success",
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    }
  ],
  subscribers: []
};

// Helper to generate a URL slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Database Methods
const db = {
  // BLOGS
  async getBlogs(searchQuery = '') {
    if (pool && isDbReady) {
      try {
        let queryText = 'SELECT * FROM blogs ORDER BY created_at DESC';
        let params = [];
        if (searchQuery) {
          queryText = 'SELECT * FROM blogs WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY created_at DESC';
          params = [`%${searchQuery}%`];
        }
        const res = await pool.query(queryText, params);
        return res.rows;
      } catch (err) {
        console.warn('⚠️ getBlogs fallback to mock due to DB error:', err.message);
      }
    }
    
    if (!searchQuery) {
      return [...mockDb.blogs].sort((a, b) => b.created_at - a.created_at);
    }
    const lowerQuery = searchQuery.toLowerCase();
    return mockDb.blogs
      .filter(b => b.title.toLowerCase().includes(lowerQuery) || b.body.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.created_at - a.created_at);
  },

  async getBlogBySlug(slug) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM blogs WHERE slug = $1', [slug]);
        return res.rows[0] || null;
      } catch (err) {
        console.warn('⚠️ getBlogBySlug fallback to mock:', err.message);
      }
    }
    return mockDb.blogs.find(b => b.slug === slug) || null;
  },

  async createBlog({ title, body, imageUrl }) {
    const slug = `${generateSlug(title)}-${Date.now().toString().slice(-4)}`;
    if (pool && isDbReady) {
      try {
        const res = await pool.query(
          'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
          [title, slug, body, imageUrl]
        );
        return res.rows[0];
      } catch (err) {
        console.warn('⚠️ createBlog fallback to mock:', err.message);
      }
    }
    const newBlog = {
      id: mockDb.blogs.length + 1,
      title,
      slug,
      body,
      image_url: imageUrl || '/images/blog-placeholder.jpg',
      created_at: new Date()
    };
    mockDb.blogs.push(newBlog);
    return newBlog;
  },

  // SUPPORT MESSAGES
  async saveSupportMessage({ name, email, phone, message }) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query(
          'INSERT INTO support_messages (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, email, phone, message]
        );
        return res.rows[0];
      } catch (err) {
        console.warn('⚠️ saveSupportMessage fallback to mock:', err.message);
      }
    }
    const newMessage = {
      id: mockDb.support_messages.length + 1,
      name,
      email,
      phone,
      message,
      created_at: new Date()
    };
    mockDb.support_messages.push(newMessage);
    return newMessage;
  },

  async getSupportMessages() {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM support_messages ORDER BY created_at DESC');
        return res.rows;
      } catch (err) {
        console.warn('⚠️ getSupportMessages fallback to mock:', err.message);
      }
    }
    return [...mockDb.support_messages].sort((a, b) => b.created_at - a.created_at);
  },

  // DONATIONS
  async saveDonation({ donor_name, donor_email, donor_phone, amount, reference, status = 'pending' }) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query(
          'INSERT INTO donations (donor_name, donor_email, donor_phone, amount, reference, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [donor_name || 'Anonymous', donor_email, donor_phone || '', amount, reference, status]
        );
        return res.rows[0];
      } catch (err) {
        console.warn('⚠️ saveDonation fallback to mock:', err.message);
      }
    }
    const newDonation = {
      id: mockDb.donations.length + 1,
      donor_name: donor_name || 'Anonymous',
      donor_email,
      donor_phone: donor_phone || '',
      amount: parseFloat(amount),
      currency: 'KES',
      reference,
      status,
      created_at: new Date()
    };
    mockDb.donations.push(newDonation);
    return newDonation;
  },

  async upsertDonation({ donor_name, donor_email, donor_phone, amount, reference, status }) {
    if (pool && isDbReady) {
      try {
        const checkRes = await pool.query('SELECT * FROM donations WHERE reference = $1', [reference]);
        if (checkRes.rowCount > 0) {
          const updateRes = await pool.query(
            'UPDATE donations SET status = $1, donor_name = $2, donor_email = $3, donor_phone = $4, amount = $5 WHERE reference = $6 RETURNING *',
            [status, donor_name || 'Anonymous', donor_email, donor_phone || '', amount, reference]
          );
          return updateRes.rows[0];
        } else {
          const insertRes = await pool.query(
            'INSERT INTO donations (donor_name, donor_email, donor_phone, amount, reference, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [donor_name || 'Anonymous', donor_email, donor_phone || '', amount, reference, status]
          );
          return insertRes.rows[0];
        }
      } catch (err) {
        console.warn('⚠️ upsertDonation fallback to mock:', err.message);
      }
    }

    const existing = mockDb.donations.find(d => d.reference === reference);
    if (existing) {
      existing.status = status;
      existing.donor_name = donor_name || 'Anonymous';
      existing.donor_email = donor_email;
      existing.donor_phone = donor_phone || '';
      existing.amount = parseFloat(amount);
      return existing;
    } else {
      const newDonation = {
        id: mockDb.donations.length + 1,
        donor_name: donor_name || 'Anonymous',
        donor_email,
        donor_phone: donor_phone || '',
        amount: parseFloat(amount),
        currency: 'KES',
        reference,
        status,
        created_at: new Date()
      };
      mockDb.donations.push(newDonation);
      return newDonation;
    }
  },

  async getDonationByReference(reference) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM donations WHERE reference = $1', [reference]);
        return res.rows[0] || null;
      } catch (err) {
        console.warn('⚠️ getDonationByReference fallback to mock:', err.message);
      }
    }
    return mockDb.donations.find(d => d.reference === reference) || null;
  },

  async getDonationByCheckoutId(checkoutRequestId) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM donations WHERE reference = $1 OR reference LIKE $2', [checkoutRequestId, `%${checkoutRequestId}%`]);
        return res.rows[0] || null;
      } catch (err) {
        console.warn('⚠️ getDonationByCheckoutId fallback to mock:', err.message);
      }
    }
    return mockDb.donations.find(d => d.reference === checkoutRequestId || (d.checkout_request_id && d.checkout_request_id === checkoutRequestId)) || null;
  },

  async updateDonationStatus(reference, status) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query(
          'UPDATE donations SET status = $1 WHERE reference = $2 RETURNING *',
          [status, reference]
        );
        return res.rows[0] || null;
      } catch (err) {
        console.warn('⚠️ updateDonationStatus fallback to mock:', err.message);
      }
    }
    const donation = mockDb.donations.find(d => d.reference === reference || (d.checkout_request_id && d.checkout_request_id === reference));
    if (donation) {
      donation.status = status;
      return donation;
    }
    return null;
  },

  async getDonations() {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM donations ORDER BY created_at DESC');
        return res.rows;
      } catch (err) {
        console.warn('⚠️ getDonations fallback to mock:', err.message);
      }
    }
    return [...mockDb.donations].sort((a, b) => b.created_at - a.created_at);
  },

  // DASHBOARD STATS
  async getDashboardStats() {
    if (pool && isDbReady) {
      try {
        const blogsCount = await pool.query('SELECT COUNT(*) FROM blogs');
        const messagesCount = await pool.query('SELECT COUNT(*) FROM support_messages');
        const donationsCount = await pool.query('SELECT COUNT(*) FROM donations WHERE status = \'success\'');
        const totalAmount = await pool.query('SELECT SUM(amount) FROM donations WHERE status = \'success\'');
        const subscribersCount = await pool.query('SELECT COUNT(*) FROM subscribers');

        return {
          blogsCount: parseInt(blogsCount.rows[0].count),
          messagesCount: parseInt(messagesCount.rows[0].count),
          donationsCount: parseInt(donationsCount.rows[0].count),
          totalRaised: parseFloat(totalAmount.rows[0].sum || 0),
          subscribersCount: parseInt(subscribersCount.rows[0].count)
        };
      } catch (err) {
        console.warn('⚠️ getDashboardStats fallback to mock:', err.message);
      }
    }

    const successfulDonations = mockDb.donations.filter(d => d.status === 'success');
    const totalRaised = successfulDonations.reduce((sum, d) => sum + d.amount, 0);
    return {
      blogsCount: mockDb.blogs.length,
      messagesCount: mockDb.support_messages.length,
      donationsCount: successfulDonations.length,
      totalRaised,
      subscribersCount: mockDb.subscribers.length
    };
  },

  // DELETIONS
  async deleteBlog(id) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('DELETE FROM blogs WHERE id = $1 RETURNING *', [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.warn('⚠️ deleteBlog fallback to mock:', err.message);
      }
    }
    const index = mockDb.blogs.findIndex(b => b.id === parseInt(id));
    if (index !== -1) {
      mockDb.blogs.splice(index, 1);
      return true;
    }
    return false;
  },

  async deleteSupportMessage(id) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('DELETE FROM support_messages WHERE id = $1 RETURNING *', [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.warn('⚠️ deleteSupportMessage fallback to mock:', err.message);
      }
    }
    const index = mockDb.support_messages.findIndex(m => m.id === parseInt(id));
    if (index !== -1) {
      mockDb.support_messages.splice(index, 1);
      return true;
    }
    return false;
  },

  async deleteDonation(id) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('DELETE FROM donations WHERE id = $1 RETURNING *', [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.warn('⚠️ deleteDonation fallback to mock:', err.message);
      }
    }
    const index = mockDb.donations.findIndex(d => d.id === parseInt(id));
    if (index !== -1) {
      mockDb.donations.splice(index, 1);
      return true;
    }
    return false;
  },

  // NEWSLETTER SUBSCRIBERS
  async saveSubscriber(email) {
    const normalizedEmail = email.toLowerCase().trim();
    if (pool && isDbReady) {
      try {
        const res = await pool.query(
          'INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING *',
          [normalizedEmail]
        );
        if (res.rowCount === 0) {
          return { duplicate: true, email: normalizedEmail };
        }
        return res.rows[0];
      } catch (err) {
        console.warn('⚠️ saveSubscriber fallback to mock:', err.message);
      }
    }
    const exists = mockDb.subscribers.find(s => s.email === normalizedEmail);
    if (exists) return { duplicate: true, email: normalizedEmail };
    const newSub = {
      id: mockDb.subscribers.length + 1,
      email: normalizedEmail,
      subscribed_at: new Date()
    };
    mockDb.subscribers.push(newSub);
    return newSub;
  },

  async getSubscribers() {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
        return res.rows;
      } catch (err) {
        console.warn('⚠️ getSubscribers fallback to mock:', err.message);
      }
    }
    return [...mockDb.subscribers].sort((a, b) => b.subscribed_at - a.subscribed_at);
  },

  async deleteSubscriber(id) {
    if (pool && isDbReady) {
      try {
        const res = await pool.query('DELETE FROM subscribers WHERE id = $1 RETURNING *', [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.warn('⚠️ deleteSubscriber fallback to mock:', err.message);
      }
    }
    const index = mockDb.subscribers.findIndex(s => s.id === parseInt(id));
    if (index !== -1) {
      mockDb.subscribers.splice(index, 1);
      return true;
    }
    return false;
  },

  // HEALTH & LIFECYCLE
  isPostgresConnected() {
    return !!pool && isDbReady;
  },

  async closePool() {
    if (pool) {
      console.log('🛑 Closing PostgreSQL connection pool...');
      try {
        await pool.end();
      } catch (_) {}
      pool = null;
      isDbReady = false;
    }
  }
};

module.exports = db;
