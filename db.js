const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ngo_db';
const requiresSsl = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase.co') || dbUrl.includes('render.com');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 3000
});

let isPostgresOnline = false;

const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'local_db.json');

const INITIAL_BLOGS = [
  {
    id: 1,
    title: "Preventing SGBV: Educating and Empowering the Next Generation of Girls",
    slug: "preventing-sgbv-educating-empowering-next-generation",
    body: `<p>At Doorway to Acceptance (DTA), we believe that education is the first line of defense against Sexual and Gender-Based Violence (SGBV). Education extends far beyond the classroom; it builds the foundation for confidence and leadership.</p>
           <p>Our Life Skills and Mentorship programmes in local schools and communities teach girls about their rights, building self-esteem and resistance to exploitation. By addressing the root causes of vulnerability—such as poverty and gender inequality—early on, we construct safer societies.</p>
           <blockquote>"When you educate a girl, you give her the keys to unlock her own safety, dignity, and independence." - SYLVIA WAMBUI, Founder & Director</blockquote>
           <p>Join us in expanding this initiative to schools across rural Kenya!</p>`,
    image_url: "/images/blog_sgbv.jpg",
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    title: "Climate-Smart Livelihoods: Establishing Women-Led Green Enterprises",
    slug: "climate-smart-livelihoods-women-led-green-enterprises",
    body: `<p>Climate change impacts women first and most severely through food insecurity, water scarcity, and loss of traditional livelihoods. DTA works to bridge this gap by establishing climate-smart enterprises.</p>
           <p>Through our Green Futures Programme, women are launching sustainable beekeeping, regenerative agriculture, and aquaculture projects. These initiatives protect local biodiversity while generating stable, independent income streams that keep families secure.</p>
           <p>By connecting economic empowerment with environmental conservation, we help communities adapt to climate change while lifting women out of dependency.</p>`,
    image_url: "/images/blog_climate.jpg",
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 3,
    title: "Walking with Survivors: The Journey to Long-Term Healing and Reintegration",
    slug: "walking-with-survivors-journey-long-term-healing",
    body: `<p>While violence prevention remains at the heart of our mission, supporting survivors on their recovery journey is equally crucial. DTA takes a survivor-centered, trauma-informed approach to reintegration.</p>
           <p>In partnership with healthcare providers and legal counselors, we connect survivors to medical care, emergency safeguarding, and psychosocial counseling. Furthermore, our peer support networks and skills development programs empower survivors to reclaim their independence and rebuild their lives with dignity.</p>
           <p>Healing is a journey—not a single event—and DTA walks alongside every woman and girl on that path.</p>`,
    image_url: "/images/blog_survivors.jpg",
    created_at: new Date(Date.now() - 172800000).toISOString()
  }
];

function ensureLocalDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initialData = {
      blogs: INITIAL_BLOGS,
      support_messages: [],
      donations: [],
      subscribers: []
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

function readLocalDb() {
  ensureLocalDb();
  try {
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { blogs: INITIAL_BLOGS, support_messages: [], donations: [], subscribers: [] };
  }
}

function writeLocalDb(data) {
  ensureLocalDb();
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2));
}

async function bootstrapPostgresSchema() {
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

  await pool.query(schemaSql);
  const checkBlogs = await pool.query('SELECT COUNT(*) FROM blogs');
  if (parseInt(checkBlogs.rows[0].count, 10) === 0) {
    for (const blog of INITIAL_BLOGS) {
      await pool.query(
        'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4)',
        [blog.title, blog.slug, blog.body, blog.image_url]
      );
    }
  }
}

(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    isPostgresOnline = true;
    console.log(`✅ PostgreSQL connected: ${res.rows[0].now}`);
    await bootstrapPostgresSchema();
  } catch (err) {
    isPostgresOnline = false;
    ensureLocalDb();
    console.log('ℹ️  PostgreSQL not active on port 5432 - running in local file persistence mode (data/local_db.json).');
  }
})();

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const db = {
  isPostgresConnected() {
    return isPostgresOnline;
  },

  async closePool() {
    if (isPostgresOnline) {
      try {
        await pool.end();
      } catch (e) {
        console.error(e.message);
      }
    }
  },

  async getBlogs(searchQuery = '') {
    if (isPostgresOnline) {
      try {
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
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    let blogs = local.blogs || [];
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      blogs = blogs.filter(b => b.title.toLowerCase().includes(q) || b.body.toLowerCase().includes(q));
    }
    return blogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getBlogBySlug(slug) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM blogs WHERE slug = $1', [slug]);
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.blogs || []).find(b => b.slug === slug) || null;
  },

  async getBlogById(id) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM blogs WHERE id = $1', [parseInt(id, 10)]);
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.blogs || []).find(b => b.id === parseInt(id, 10)) || null;
  },

  async createBlog({ title, body, imageUrl }) {
    const slug = `${generateSlug(title)}-${Date.now().toString().slice(-4)}`;
    const finalImageUrl = imageUrl || '/images/blog_sgbv.jpg';

    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'INSERT INTO blogs (title, slug, body, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
          [title, slug, body, finalImageUrl]
        );
        return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const newId = local.blogs.length > 0 ? Math.max(...local.blogs.map(b => b.id || 0)) + 1 : 1;
    const newBlog = {
      id: newId,
      title,
      slug,
      body,
      image_url: finalImageUrl,
      created_at: new Date().toISOString()
    };
    local.blogs.unshift(newBlog);
    writeLocalDb(local);
    return newBlog;
  },

  async updateBlog(id, { title, body, imageUrl }) {
    const blogId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        let query = 'UPDATE blogs SET title = $1, body = $2 WHERE id = $3 RETURNING *';
        let params = [title, body, blogId];
        if (imageUrl) {
          query = 'UPDATE blogs SET title = $1, body = $2, image_url = $3 WHERE id = $4 RETURNING *';
          params = [title, body, imageUrl, blogId];
        }
        const res = await pool.query(query, params);
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const blog = (local.blogs || []).find(b => b.id === blogId);
    if (!blog) return null;

    blog.title = title;
    blog.body = body;
    if (imageUrl) blog.image_url = imageUrl;
    writeLocalDb(local);
    return blog;
  },

  async deleteBlog(id) {
    const blogId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        const res = await pool.query('DELETE FROM blogs WHERE id = $1 RETURNING *', [blogId]);
        return res.rowCount > 0;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const initialLen = local.blogs.length;
    local.blogs = local.blogs.filter(b => b.id !== blogId);
    writeLocalDb(local);
    return local.blogs.length < initialLen;
  },

  async saveSupportMessage({ name, email, phone, message }) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'INSERT INTO support_messages (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, email, phone, message]
        );
        return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const newId = local.support_messages.length > 0 ? Math.max(...local.support_messages.map(m => m.id || 0)) + 1 : 1;
    const newMsg = {
      id: newId,
      name,
      email,
      phone,
      message,
      created_at: new Date().toISOString()
    };
    local.support_messages.unshift(newMsg);
    writeLocalDb(local);
    return newMsg;
  },

  async getSupportMessages() {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM support_messages ORDER BY created_at DESC');
        return res.rows;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.support_messages || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async deleteSupportMessage(id) {
    const msgId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        const res = await pool.query('DELETE FROM support_messages WHERE id = $1 RETURNING *', [msgId]);
        return res.rowCount > 0;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const initialLen = local.support_messages.length;
    local.support_messages = local.support_messages.filter(m => m.id !== msgId);
    writeLocalDb(local);
    return local.support_messages.length < initialLen;
  },

  async saveDonation({ donor_name, donor_email, donor_phone, amount, reference, status = 'pending' }) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'INSERT INTO donations (donor_name, donor_email, donor_phone, amount, reference, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [donor_name || 'Anonymous', donor_email, donor_phone || '', parseFloat(amount), reference, status]
        );
        return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const newId = local.donations.length > 0 ? Math.max(...local.donations.map(d => d.id || 0)) + 1 : 1;
    const newDonation = {
      id: newId,
      donor_name: donor_name || 'Anonymous',
      donor_email: donor_email || '',
      donor_phone: donor_phone || '',
      amount: parseFloat(amount),
      currency: 'KES',
      reference,
      status,
      created_at: new Date().toISOString()
    };
    local.donations.unshift(newDonation);
    writeLocalDb(local);
    return newDonation;
  },

  async upsertDonation({ donor_name, donor_email, donor_phone, amount, reference, status }) {
    if (isPostgresOnline) {
      try {
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
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    let donation = (local.donations || []).find(d => d.reference === reference);
    if (donation) {
      donation.status = status;
      if (donor_name) donation.donor_name = donor_name;
      if (donor_email) donation.donor_email = donor_email;
      if (donor_phone) donation.donor_phone = donor_phone;
      if (amount) donation.amount = parseFloat(amount);
    } else {
      const newId = local.donations.length > 0 ? Math.max(...local.donations.map(d => d.id || 0)) + 1 : 1;
      donation = {
        id: newId,
        donor_name: donor_name || 'Anonymous',
        donor_email: donor_email || '',
        donor_phone: donor_phone || '',
        amount: parseFloat(amount || 0),
        currency: 'KES',
        reference,
        status,
        created_at: new Date().toISOString()
      };
      local.donations.unshift(donation);
    }
    writeLocalDb(local);
    return donation;
  },

  async getDonationByReference(reference) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM donations WHERE reference = $1', [reference]);
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.donations || []).find(d => d.reference === reference) || null;
  },

  async getDonationByCheckoutId(checkoutRequestId) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'SELECT * FROM donations WHERE reference = $1 OR reference LIKE $2',
          [checkoutRequestId, `%${checkoutRequestId}%`]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.donations || []).find(d => d.reference === checkoutRequestId || (d.reference && d.reference.includes(checkoutRequestId))) || null;
  },

  async updateDonationStatus(reference, status) {
    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'UPDATE donations SET status = $1 WHERE reference = $2 OR reference LIKE $3 RETURNING *',
          [status, reference, `%${reference}%`]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const donation = (local.donations || []).find(d => d.reference === reference || (d.reference && d.reference.includes(reference)));
    if (donation) {
      donation.status = status;
      writeLocalDb(local);
      return donation;
    }
    return null;
  },

  async updateDonationStatusById(id, status) {
    const donationId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'UPDATE donations SET status = $1 WHERE id = $2 RETURNING *',
          [status, donationId]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const donation = (local.donations || []).find(d => d.id === donationId);
    if (donation) {
      donation.status = status;
      writeLocalDb(local);
      return donation;
    }
    return null;
  },

  async getDonations() {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM donations ORDER BY created_at DESC');
        return res.rows;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.donations || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async deleteDonation(id) {
    const donationId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        const res = await pool.query('DELETE FROM donations WHERE id = $1 RETURNING *', [donationId]);
        return res.rowCount > 0;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const initialLen = local.donations.length;
    local.donations = local.donations.filter(d => d.id !== donationId);
    writeLocalDb(local);
    return local.donations.length < initialLen;
  },

  async saveSubscriber(email) {
    const cleanEmail = email.toLowerCase().trim();

    if (isPostgresOnline) {
      try {
        const res = await pool.query(
          'INSERT INTO subscribers (email) VALUES ($1) RETURNING *',
          [cleanEmail]
        );
        return { success: true, subscriber: res.rows[0] };
      } catch (err) {
        if (err.code === '23505') {
          return { success: true, duplicate: true };
        }
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const existing = (local.subscribers || []).find(s => s.email === cleanEmail);
    if (existing) {
      return { success: true, duplicate: true };
    }

    const newId = local.subscribers.length > 0 ? Math.max(...local.subscribers.map(s => s.id || 0)) + 1 : 1;
    const newSub = { id: newId, email: cleanEmail, subscribed_at: new Date().toISOString() };
    local.subscribers.unshift(newSub);
    writeLocalDb(local);
    return { success: true, subscriber: newSub };
  },

  async getSubscribers() {
    if (isPostgresOnline) {
      try {
        const res = await pool.query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
        return res.rows;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    return (local.subscribers || []).sort((a, b) => new Date(b.subscribed_at) - new Date(a.subscribed_at));
  },

  async deleteSubscriber(id) {
    const subId = parseInt(id, 10);
    if (isPostgresOnline) {
      try {
        const res = await pool.query('DELETE FROM subscribers WHERE id = $1 RETURNING *', [subId]);
        return res.rowCount > 0;
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const initialLen = local.subscribers.length;
    local.subscribers = local.subscribers.filter(s => s.id !== subId);
    writeLocalDb(local);
    return local.subscribers.length < initialLen;
  },

  async getDashboardStats() {
    if (isPostgresOnline) {
      try {
        const [blogsCount, messagesCount, donationsRes, subscribersCount, recentDonations] = await Promise.all([
          pool.query('SELECT COUNT(*) FROM blogs'),
          pool.query('SELECT COUNT(*) FROM support_messages'),
          pool.query("SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_raised FROM donations WHERE status = 'success'"),
          pool.query('SELECT COUNT(*) FROM subscribers'),
          pool.query('SELECT * FROM donations ORDER BY created_at DESC LIMIT 10')
        ]);

        return {
          blogsCount: parseInt(blogsCount.rows[0].count, 10),
          messagesCount: parseInt(messagesCount.rows[0].count, 10),
          donationsCount: parseInt(donationsRes.rows[0].total_count, 10),
          totalRaised: parseFloat(donationsRes.rows[0].total_raised),
          subscribersCount: parseInt(subscribersCount.rows[0].count, 10),
          recentDonations: recentDonations.rows
        };
      } catch (e) {
        isPostgresOnline = false;
      }
    }

    const local = readLocalDb();
    const successDonations = (local.donations || []).filter(d => d.status === 'success');
    const totalRaised = successDonations.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

    return {
      blogsCount: (local.blogs || []).length,
      messagesCount: (local.support_messages || []).length,
      donationsCount: successDonations.length,
      totalRaised,
      subscribersCount: (local.subscribers || []).length,
      recentDonations: (local.donations || []).slice(0, 10)
    };
  }
};

module.exports = db;
