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
      title: "Empowering Women Farmers in the Fight Against Climate Change",
      slug: "empowering-women-farmers-climate-change",
      body: `<p>Climate change is not gender-neutral. Across the globe, women are disproportionately affected by shifting weather patterns, droughts, and environmental degradation. However, they are also the most powerful agents of change.</p>
             <p>In our latest green initiative, we trained over 200 women farmers in sustainable agroforestry techniques. By integrating crop cultivation with tree planting, these women have not only restored soil fertility but also established a sustainable source of income through fruit and nut harvesting.</p>
             <blockquote>"When you empower a woman, you empower an entire community to stand resilient against the environmental crises of our time." - Executive Director</blockquote>
             <p>Through partnerships and community funding, we aim to scale this program to 1,000 women by the end of next year. Join us in making a difference!</p>`,
      image_url: "/images/blog-women-farmers.jpg",
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      id: 2,
      title: "The Impact of Climate Action: Planting 10,000 Saplings",
      slug: "impact-climate-action-10000-saplings",
      body: `<p>Reforestation is one of the most effective tools we have to combat rising global temperatures. Last month, our dedicated volunteers, school children, and local women groups gathered to plant 10,000 native saplings in critical water catchment areas.</p>
             <p>This massive planting drive will help restore biodiversity, prevent soil erosion, and safeguard local water supplies. Beyond the ecological benefits, the project has fostered a deep sense of environmental stewardship among youth.</p>
             <p>We are tracking the survival rate of these saplings using drone mapping to ensure long-term sustainability. Every donation we receive goes directly toward procuring saplings, tools, and supporting the community members who care for them.</p>`,
      image_url: "/images/blog-saplings.jpg",
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    {
      id: 3,
      title: "How Communities Lead the Green Revolution",
      slug: "communities-lead-green-revolution",
      body: `<p>Top-down policies are essential, but the real battle against climate change is won on the ground by local communities. When community members are given ownership of their natural resources, conservation efforts succeed.</p>
             <p>Our advocacy programs educate communities on waste management, clean energy alternatives, and forest protection. By aligning economic incentives with ecological conservation, we make sustainability a natural choice.</p>
             <p>Read on to learn about our community workshops and how you can bring these climate mitigation techniques to your local town or school group.</p>`,
      image_url: "/images/blog-community.jpg",
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
    }
  ],
  support_messages: [
    {
      id: 1,
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+2348012345678",
      message: "I am interested in volunteering for the climate action drive next month. Please let me know how I can sign up!",
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    }
  ],
  donations: [
    {
      id: 1,
      donor_name: "Sarah Jenkins",
      donor_email: "sarah.j@example.com",
      amount: 5000.00,
      currency: "NGN",
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
