const { Pool } = require('pg');
require('dotenv').config();

const useMockDb = process.env.USE_MOCK_DB === 'true' || !process.env.DATABASE_URL;

let pool = null;

if (!useMockDb) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // For SSL connections if required (e.g. Render, Heroku, Supabase)
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    
    // Test the connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('⚠️ PostgreSQL connection failed. Falling back to in-memory Mock Database.', err.message);
        pool = null;
      } else {
        console.log('✅ PostgreSQL Database connected successfully at:', res.rows[0].now);
      }
    });
  } catch (e) {
    console.error('⚠️ Could not initialize PostgreSQL Pool. Falling back to in-memory Mock Database.', e.message);
    pool = null;
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
             <blockquote>"When you educate a girl, you give her the keys to unlock her own safety, dignity, and independence." - DTA Executive Director</blockquote>
             <p>Join us in expanding this initiative to schools across rural Kenya!</p>`,
      image_url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800",
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      id: 2,
      title: "Climate-Smart Livelihoods: Establishing Women-Led Green Enterprises",
      slug: "climate-smart-livelihoods-women-led-green-enterprises",
      body: `<p>Climate change impacts women first and most severely through food insecurity, water scarcity, and loss of traditional livelihoods. DTA works to bridge this gap by establishing climate-smart enterprises.</p>
             <p>Through our Green Futures Programme, women are launching sustainable beekeeping, regenerative agriculture, and aquaculture projects. These initiatives protect local biodiversity while generating stable, independent income streams that keep families secure.</p>
             <p>By connecting economic empowerment with environmental conservation, we help communities adapt to climate change while lifting women out of dependency.</p>`,
      image_url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=800",
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    {
      id: 3,
      title: "Walking with Survivors: The Journey to Long-Term Healing and Reintegration",
      slug: "walking-with-survivors-journey-long-term-healing",
      body: `<p>While violence prevention remains at the heart of our mission, supporting survivors on their recovery journey is equally crucial. DTA takes a survivor-centered, trauma-informed approach to reintegration.</p>
             <p>In partnership with healthcare providers and legal counselors, we connect survivors to medical care, emergency safeguarding, and psychosocial counseling. Furthermore, our peer support networks and skills development programs empower survivors to reclaim their independence and rebuild their lives with dignity.</p>
             <p>Healing is a journey—not a single event—and DTA walks alongside every woman and girl on that path.</p>`,
      image_url: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=800",
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
  ]
};

// Helper to generate a URL slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-'); // collapse dashes
}

// Database Methods
const db = {
  // BLOGS
  async getBlogs(searchQuery = '') {
    if (pool) {
      let queryText = 'SELECT * FROM blogs ORDER BY created_at DESC';
      let params = [];
      if (searchQuery) {
        queryText = 'SELECT * FROM blogs WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY created_at DESC';
        params = [`%${searchQuery}%`];
      }
      const res = await pool.query(queryText, params);
      return res.rows;
    } else {
      if (!searchQuery) {
        return [...mockDb.blogs].sort((a, b) => b.created_at - a.created_at);
      }
      const lowerQuery = searchQuery.toLowerCase();
      return mockDb.blogs
        .filter(b => b.title.toLowerCase().includes(lowerQuery) || b.body.toLowerCase().includes(lowerQuery))
        .sort((a, b) => b.created_at - a.created_at);
    }
  },

  async getBlogBySlug(slug) {
    if (pool) {
      const res = await pool.query('SELECT * FROM blogs WHERE slug = $1', [slug]);
      return res.rows[0] || null;
    } else {
      return mockDb.blogs.find(b => b.slug === slug) || null;
    }
  },

  async createBlog({ title, body, imageUrl }) {
    const slug = `${generateSlug(title)}-${Date.now().toString().slice(-4)}`;
    if (pool) {
      const res = await pool.query(
        'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [title, slug, body, imageUrl]
      );
      return res.rows[0];
    } else {
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
    }
  },

  // SUPPORT MESSAGES
  async saveSupportMessage({ name, email, phone, message }) {
    if (pool) {
      const res = await pool.query(
        'INSERT INTO support_messages (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, email, phone, message]
      );
      return res.rows[0];
    } else {
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
    }
  },

  async getSupportMessages() {
    if (pool) {
      const res = await pool.query('SELECT * FROM support_messages ORDER BY created_at DESC');
      return res.rows;
    } else {
      return [...mockDb.support_messages].sort((a, b) => b.created_at - a.created_at);
    }
  },

  // DONATIONS
  async saveDonation({ donor_name, donor_email, amount, reference, status = 'pending' }) {
    if (pool) {
      const res = await pool.query(
        'INSERT INTO donations (donor_name, donor_email, amount, reference, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [donor_name || 'Anonymous', donor_email, amount, reference, status]
      );
      return res.rows[0];
    } else {
      const newDonation = {
        id: mockDb.donations.length + 1,
        donor_name: donor_name || 'Anonymous',
        donor_email,
        amount: parseFloat(amount),
        currency: 'NGN',
        reference,
        status,
        created_at: new Date()
      };
      mockDb.donations.push(newDonation);
      return newDonation;
    }
  },

  async updateDonationStatus(reference, status) {
    if (pool) {
      const res = await pool.query(
        'UPDATE donations SET status = $1 WHERE reference = $2 RETURNING *',
        [status, reference]
      );
      return res.rows[0] || null;
    } else {
      const donation = mockDb.donations.find(d => d.reference === reference);
      if (donation) {
        donation.status = status;
        return donation;
      }
      return null;
    }
  },

  async getDonations() {
    if (pool) {
      const res = await pool.query('SELECT * FROM donations ORDER BY created_at DESC');
      return res.rows;
    } else {
      return [...mockDb.donations].sort((a, b) => b.created_at - a.created_at);
    }
  },

  // DASHBOARD STATS
  async getDashboardStats() {
    if (pool) {
      const blogsCount = await pool.query('SELECT COUNT(*) FROM blogs');
      const messagesCount = await pool.query('SELECT COUNT(*) FROM support_messages');
      const donationsCount = await pool.query('SELECT COUNT(*) FROM donations WHERE status = \'success\'');
      const totalAmount = await pool.query('SELECT SUM(amount) FROM donations WHERE status = \'success\'');
      
      return {
        blogsCount: parseInt(blogsCount.rows[0].count),
        messagesCount: parseInt(messagesCount.rows[0].count),
        donationsCount: parseInt(donationsCount.rows[0].count),
        totalRaised: parseFloat(totalAmount.rows[0].sum || 0)
      };
    } else {
      const successfulDonations = mockDb.donations.filter(d => d.status === 'success');
      const totalRaised = successfulDonations.reduce((sum, d) => sum + d.amount, 0);
      return {
        blogsCount: mockDb.blogs.length,
        messagesCount: mockDb.support_messages.length,
        donationsCount: successfulDonations.length,
        totalRaised
      };
    }
  }
};

module.exports = db;
