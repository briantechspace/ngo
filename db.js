const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL environment variable is not defined.');
}

// PostgreSQL Connection Pool
const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ngo_db';
const requiresSsl = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase.co') || dbUrl.includes('render.com');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false
});

let isDbConnected = false;

pool.on('connect', () => {
  isDbConnected = true;
});

pool.on('error', (err) => {
  console.error('❌ Unexpected idle client error on PostgreSQL pool:', err.message);
  isDbConnected = false;
});

// Seed data for initial database bootstrap if tables are empty
const INITIAL_BLOGS = [
  {
    title: "Preventing SGBV: Educating and Empowering the Next Generation of Girls",
    slug: "preventing-sgbv-educating-empowering-next-generation",
    body: `<p>At Doorway to Acceptance (DTA), we believe that education is the first line of defense against Sexual and Gender-Based Violence (SGBV). Education extends far beyond the classroom; it builds the foundation for confidence and leadership.</p>
           <p>Our Life Skills and Mentorship programmes in local schools and communities teach girls about their rights, building self-esteem and resistance to exploitation. By addressing the root causes of vulnerability—such as poverty and gender inequality—early on, we construct safer societies.</p>
           <blockquote>"When you educate a girl, you give her the keys to unlock her own safety, dignity, and independence." - SYLVIA WAMBUI, Founder & Director</blockquote>
           <p>Join us in expanding this initiative to schools across rural Kenya!</p>`,
    image_url: "/images/blog_sgbv.jpg"
  },
  {
    title: "Climate-Smart Livelihoods: Establishing Women-Led Green Enterprises",
    slug: "climate-smart-livelihoods-women-led-green-enterprises",
    body: `<p>Climate change impacts women first and most severely through food insecurity, water scarcity, and loss of traditional livelihoods. DTA works to bridge this gap by establishing climate-smart enterprises.</p>
           <p>Through our Green Futures Programme, women are launching sustainable beekeeping, regenerative agriculture, and aquaculture projects. These initiatives protect local biodiversity while generating stable, independent income streams that keep families secure.</p>
           <p>By connecting economic empowerment with environmental conservation, we help communities adapt to climate change while lifting women out of dependency.</p>`,
    image_url: "/images/blog_climate.jpg"
  },
  {
    title: "Walking with Survivors: The Journey to Long-Term Healing and Reintegration",
    slug: "walking-with-survivors-journey-long-term-healing",
    body: `<p>While violence prevention remains at the heart of our mission, supporting survivors on their recovery journey is equally crucial. DTA takes a survivor-centered, trauma-informed approach to reintegration.</p>
           <p>In partnership with healthcare providers and legal counselors, we connect survivors to medical care, emergency safeguarding, and psychosocial counseling. Furthermore, our peer support networks and skills development programs empower survivors to reclaim their independence and rebuild their lives with dignity.</p>
           <p>Healing is a journey—not a single event—and DTA walks alongside every woman and girl on that path.</p>`,
    image_url: "/images/blog_survivors.jpg"
  }
];

// Bootstrap Schema and Required Tables
async function bootstrapSchema() {
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
    CREATE INDEX IF NOT EXISTS idx_donations_ref ON donations(reference);
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
  `;

  try {
    await pool.query(schemaSql);
    console.log('✅ PostgreSQL Tables & Indexes verified.');

    // Seed initial blogs if table is newly initialized
    const checkBlogs = await pool.query('SELECT COUNT(*) FROM blogs');
    if (parseInt(checkBlogs.rows[0].count, 10) === 0) {
      for (const blog of INITIAL_BLOGS) {
        await pool.query(
          'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4)',
          [blog.title, blog.slug, blog.body, blog.image_url]
        );
      }
      console.log('🌱 Seeded initial NGO blog articles into PostgreSQL.');
    }
  } catch (err) {
    console.error('❌ PostgreSQL Schema Initialization Error:', err.message);
    throw err;
  }
}

// Initial Database Connection & Bootstrap
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    isDbConnected = true;
    console.log(`✅ PostgreSQL Connected Successfully at ${res.rows[0].now}`);
    await bootstrapSchema();
  } catch (err) {
    console.error('❌ PostgreSQL Connection Failed:', err.message);
    console.error('👉 Ensure PostgreSQL is running on your system and DATABASE_URL in .env is correct.');
  }
})();

// Helper to generate URL slug
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Pure PostgreSQL Database Interface
const db = {
  isPostgresConnected() {
    return isDbConnected;
  },

  async closePool() {
    try {
      await pool.end();
      console.log('PostgreSQL pool closed.');
    } catch (e) {
      console.error('Error closing pool:', e.message);
    }
  },

  // --- BLOGS ---
  async getBlogs(searchQuery = '') {
    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.trim()}%`;
      const res = await pool.query(
        'SELECT * FROM blogs WHERE title ILIKE $1 OR body ILIKE $1 ORDER BY created_at DESC',
        [q]
      );
      return res.rows;
    }
    const res = await pool.query('SELECT * FROM blogs ORDER BY created_at DESC');
    return res.rows;
  },

  async getBlogBySlug(slug) {
    const res = await pool.query('SELECT * FROM blogs WHERE slug = $1', [slug]);
    return res.rows[0] || null;
  },

  async createBlog({ title, body, imageUrl }) {
    const slug = `${generateSlug(title)}-${Date.now().toString().slice(-4)}`;
    const res = await pool.query(
      'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, slug, body, imageUrl || '/images/blog_sgbv.jpg']
    );
    return res.rows[0];
  },

  async getBlogById(id) {
    const res = await pool.query('SELECT * FROM blogs WHERE id = $1', [parseInt(id, 10)]);
    return res.rows[0] || null;
  },

  async updateBlog(id, { title, body, imageUrl }) {
    const slug = generateSlug(title);
    let query = 'UPDATE blogs SET title = $1, body = $2 WHERE id = $3 RETURNING *';
    let params = [title, body, parseInt(id, 10)];

    if (imageUrl) {
      query = 'UPDATE blogs SET title = $1, body = $2, image_url = $3 WHERE id = $4 RETURNING *';
      params = [title, body, imageUrl, parseInt(id, 10)];
    }

    const res = await pool.query(query, params);
    return res.rows[0] || null;
  },

  async deleteBlog(id) {
    const res = await pool.query('DELETE FROM blogs WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
    return res.rowCount > 0;
  },

  // --- SUPPORT MESSAGES ---
  async saveSupportMessage({ name, email, phone, message }) {
    const res = await pool.query(
      'INSERT INTO support_messages (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, message]
    );
    return res.rows[0];
  },

  async getSupportMessages() {
    const res = await pool.query('SELECT * FROM support_messages ORDER BY created_at DESC');
    return res.rows;
  },

  async deleteSupportMessage(id) {
    const res = await pool.query('DELETE FROM support_messages WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
    return res.rowCount > 0;
  },

  // --- DONATIONS ---
  async saveDonation({ donor_name, donor_email, donor_phone, amount, reference, status = 'pending' }) {
    const res = await pool.query(
      'INSERT INTO donations (donor_name, donor_email, donor_phone, amount, reference, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [donor_name || 'Anonymous', donor_email, donor_phone || '', parseFloat(amount), reference, status]
    );
    return res.rows[0];
  },

  async upsertDonation({ donor_name, donor_email, donor_phone, amount, reference, status }) {
    const checkRes = await pool.query('SELECT * FROM donations WHERE reference = $1', [reference]);
    if (checkRes.rowCount > 0) {
      const updateRes = await pool.query(
        'UPDATE donations SET status = $1, donor_name = $2, donor_email = $3, donor_phone = $4, amount = $5 WHERE reference = $6 RETURNING *',
        [status, donor_name || 'Anonymous', donor_email, donor_phone || '', parseFloat(amount), reference]
      );
      return updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        'INSERT INTO donations (donor_name, donor_email, donor_phone, amount, reference, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [donor_name || 'Anonymous', donor_email, donor_phone || '', parseFloat(amount), reference, status]
      );
      return insertRes.rows[0];
    }
  },

  async getDonationByReference(reference) {
    const res = await pool.query('SELECT * FROM donations WHERE reference = $1', [reference]);
    return res.rows[0] || null;
  },

  async getDonationByCheckoutId(checkoutRequestId) {
    const res = await pool.query(
      'SELECT * FROM donations WHERE reference = $1 OR reference LIKE $2',
      [checkoutRequestId, `%${checkoutRequestId}%`]
    );
    return res.rows[0] || null;
  },

  async updateDonationStatus(reference, status) {
    const res = await pool.query(
      'UPDATE donations SET status = $1 WHERE reference = $2 OR reference LIKE $3 RETURNING *',
      [status, reference, `%${reference}%`]
    );
    return res.rows[0] || null;
  },

  async updateDonationStatusById(id, status) {
    const res = await pool.query(
      'UPDATE donations SET status = $1 WHERE id = $2 RETURNING *',
      [status, parseInt(id, 10)]
    );
    return res.rows[0] || null;
  },

  async getDonations() {
    const res = await pool.query('SELECT * FROM donations ORDER BY created_at DESC');
    return res.rows;
  },

  async deleteDonation(id) {
    const res = await pool.query('DELETE FROM donations WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
    return res.rowCount > 0;
  },

  // --- SUBSCRIBERS ---
  async saveSubscriber(email) {
    try {
      const res = await pool.query(
        'INSERT INTO subscribers (email) VALUES ($1) RETURNING *',
        [email.toLowerCase().trim()]
      );
      return { success: true, subscriber: res.rows[0] };
    } catch (err) {
      if (err.code === '23505') { // Unique constraint violation in PostgreSQL
        return { success: true, duplicate: true };
      }
      throw err;
    }
  },

  async getSubscribers() {
    const res = await pool.query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
    return res.rows;
  },

  async deleteSubscriber(id) {
    const res = await pool.query('DELETE FROM subscribers WHERE id = $1 RETURNING *', [parseInt(id, 10)]);
    return res.rowCount > 0;
  },

  // --- DASHBOARD STATS ---
  async getDashboardStats() {
    const [blogsCount, messagesCount, donationsRes, subscribersCount, recentDonations] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM blogs'),
      pool.query('SELECT COUNT(*) FROM support_messages'),
      pool.query("SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_raised FROM donations WHERE status = 'success'"),
      pool.query('SELECT COUNT(*) FROM subscribers'),
      pool.query("SELECT * FROM donations WHERE status = 'success' ORDER BY created_at DESC LIMIT 5")
    ]);

    return {
      blogsCount: parseInt(blogsCount.rows[0].count, 10),
      messagesCount: parseInt(messagesCount.rows[0].count, 10),
      donationsCount: parseInt(donationsRes.rows[0].total_count, 10),
      totalRaised: parseFloat(donationsRes.rows[0].total_raised),
      subscribersCount: parseInt(subscribersCount.rows[0].count, 10),
      recentDonations: recentDonations.rows
    };
  }
};

module.exports = db;
