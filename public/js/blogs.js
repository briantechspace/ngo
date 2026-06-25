// Mock seed data for standalone browser presentation fallbacks (running under file://)
const fallbackBlogs = [
  {
    id: 1,
    title: "Preventing SGBV: Educating and Empowering the Next Generation of Girls",
    slug: "preventing-sgbv-educating-empowering-next-generation",
    body: `<p>At Doorway to Acceptance (DTA), we believe that education is the first line of defense against Sexual and Gender-Based Violence (SGBV). Education extends far beyond the classroom; it builds the foundation for confidence and leadership.</p>
           <p>Our Life Skills and Mentorship programmes in local schools and communities teach girls about their rights, building self-esteem and resistance to exploitation. By addressing the root causes of vulnerability—such as poverty and gender inequality—early on, we construct safer societies.</p>
           <blockquote>"When you educate a girl, you give her the keys to unlock her own safety, dignity, and independence." - DTA Executive Director</blockquote>
           <p>Join us in expanding this initiative to schools across rural Kenya!</p>`,
    image_url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  },
  {
    id: 2,
    title: "Climate-Smart Livelihoods: Establishing Women-Led Green Enterprises",
    slug: "climate-smart-livelihoods-women-led-green-enterprises",
    body: `<p>Climate change impacts women first and most severely through food insecurity, water scarcity, and loss of traditional livelihoods. DTA works to bridge this gap by establishing climate-smart enterprises.</p>
           <p>Through our Green Futures Programme, women are launching sustainable beekeeping, regenerative agriculture, and aquaculture projects. These initiatives protect local biodiversity while generating stable, independent income streams that keep families secure.</p>
           <p>By connecting economic empowerment with environmental conservation, we help communities adapt to climate change while lifting women out of dependency.</p>`,
    image_url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=800",
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  },
  {
    id: 3,
    title: "Walking with Survivors: The Journey to Long-Term Healing and Reintegration",
    slug: "walking-with-survivors-journey-long-term-healing",
    body: `<p>While violence prevention remains at the heart of our mission, supporting survivors on their recovery journey is equally crucial. DTA takes a survivor-centered, trauma-informed approach to reintegration.</p>
           <p>In partnership with healthcare providers and legal counselors, we connect survivors to medical care, emergency safeguarding, and psychosocial counseling. Furthermore, our peer support networks and skills development programs empower survivors to reclaim their independence and rebuild their lives with dignity.</p>
           <p>Healing is a journey—not a single event—and DTA walks alongside every woman and girl on that path.</p>`,
    image_url: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=800",
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  }
];

document.addEventListener('DOMContentLoaded', () => {
  const isBlogsPage = document.getElementById('blogs-grid-container') !== null;
  const isBlogDetailPage = document.getElementById('blog-detail-content-area') !== null;
  const isHomePage = document.getElementById('recent-blogs-container') !== null;

  if (isHomePage) {
    loadHomeRecentBlogs();
  }

  if (isBlogsPage) {
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    
    const searchInput = document.getElementById('blogs-search-input');
    if (searchParam && searchInput) {
      searchInput.value = searchParam;
    }
    
    loadBlogs(searchParam || '');
    
    const searchForm = document.getElementById('blogs-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        loadBlogs(query);
        
        // Update URL query string without reloading page
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + 
          (query ? `?search=${encodeURIComponent(query)}` : '');
        window.history.pushState({ path: newUrl }, '', newUrl);
      });
    }
  }

  if (isBlogDetailPage) {
    loadBlogDetail();
  }
});

// Helper: Format Dates
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

// Helper: Truncate Text
function truncateText(htmlText, limit = 120) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const text = doc.body.textContent || "";
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '...';
}

// 1. HOME: Load 3 recent blogs
async function loadHomeRecentBlogs() {
  const container = document.getElementById('recent-blogs-container');
  if (!container) return;

  try {
    const res = await fetch('/api/blogs');
    const data = await res.json();

    if (data.success && data.blogs.length > 0) {
      container.innerHTML = '';
      const recent = data.blogs.slice(0, 3);
      recent.forEach(blog => {
        const card = createBlogCard(blog);
        container.appendChild(card);
      });
    } else {
      container.innerHTML = '<p class="text-muted">No blogs published yet.</p>';
    }
  } catch (error) {
    console.warn('⚠️ Fetching blogs failed. Loading local static presentation fallbacks.', error);
    container.innerHTML = '';
    const recent = fallbackBlogs.slice(0, 3);
    recent.forEach(blog => {
      const card = createBlogCard(blog);
      container.appendChild(card);
    });
  }
}

// 2. BLOGS LISTING: Fetch and render blogs
async function loadBlogs(searchQuery = '') {
  const gridContainer = document.getElementById('blogs-grid-container');
  const resultsInfo = document.getElementById('results-info-text');
  
  if (!gridContainer) return;
  gridContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Loading blogs...</p>';

  try {
    const url = searchQuery ? `/api/blogs?search=${encodeURIComponent(searchQuery)}` : '/api/blogs';
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      gridContainer.innerHTML = '';
      
      if (resultsInfo) {
        if (searchQuery) {
          resultsInfo.innerHTML = `Found <span>${data.count}</span> result(s) for "<span>${escapeHTML(searchQuery)}</span>"`;
          resultsInfo.style.display = 'block';
        } else {
          resultsInfo.style.display = 'none';
        }
      }

      if (data.blogs.length > 0) {
        data.blogs.forEach(blog => {
          const card = createBlogCard(blog);
          gridContainer.appendChild(card);
        });
      } else {
        gridContainer.innerHTML = `
          <div class="no-blogs-found" style="grid-column: 1/-1;">
            <h3>No articles found</h3>
            <p>Try searching with different keywords, or check back later.</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.warn('⚠️ Fetching blogs listing failed. Loading local static search and fallbacks.', error);
    gridContainer.innerHTML = '';
    
    if (resultsInfo) {
      if (searchQuery) {
        const matchesCount = fallbackBlogs.filter(b => 
          b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          b.body.toLowerCase().includes(searchQuery.toLowerCase())
        ).length;
        resultsInfo.innerHTML = `Found <span>${matchesCount}</span> result(s) for "<span>${escapeHTML(searchQuery)}</span>" (Offline Mode)`;
        resultsInfo.style.display = 'block';
      } else {
        resultsInfo.style.display = 'none';
      }
    }

    const filtered = searchQuery
      ? fallbackBlogs.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.body.toLowerCase().includes(searchQuery.toLowerCase()))
      : fallbackBlogs;

    if (filtered.length > 0) {
      filtered.forEach(blog => {
        const card = createBlogCard(blog);
        gridContainer.appendChild(card);
      });
    } else {
      gridContainer.innerHTML = `
        <div class="no-blogs-found" style="grid-column: 1/-1;">
          <h3>No articles found</h3>
          <p>Try searching with different keywords, or check back later.</p>
        </div>
      `;
    }
  }
}

// 3. BLOG DETAIL: Load single blog content
async function loadBlogDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');

  if (!slug) {
    window.location.href = '/blogs.html';
    return;
  }

  const titleEl = document.getElementById('blog-detail-title');
  const dateEl = document.getElementById('blog-detail-date');
  const bannerEl = document.getElementById('blog-detail-banner');
  const contentEl = document.getElementById('blog-detail-content-area');

  try {
    const res = await fetch(`/api/blogs/${slug}`);
    const data = await res.json();

    if (data.success && data.blog) {
      const blog = data.blog;
      
      document.title = `${blog.title} | Doorway to Acceptance (DTA)`;
      if (titleEl) titleEl.innerText = blog.title;
      if (dateEl) dateEl.innerText = formatDate(blog.created_at);
      
      if (bannerEl) {
        bannerEl.src = blog.image_url || '/images/blog-placeholder.jpg';
        bannerEl.alt = blog.title;
      }
      
      if (contentEl) {
        contentEl.innerHTML = blog.body;
      }
    } else {
      showNotification('Blog post not found.', 'error');
      setTimeout(() => window.location.href = '/blogs.html', 2000);
    }
  } catch (error) {
    console.warn('⚠️ Fetching blog details failed. Loading local static content matching slug.', error);
    const localBlog = fallbackBlogs.find(b => b.slug === slug);
    if (localBlog) {
      document.title = `${localBlog.title} | Doorway to Acceptance (DTA)`;
      if (titleEl) titleEl.innerText = localBlog.title;
      if (dateEl) dateEl.innerText = formatDate(localBlog.created_at);
      
      if (bannerEl) {
        bannerEl.src = localBlog.image_url;
        bannerEl.alt = localBlog.title;
      }
      
      if (contentEl) {
        contentEl.innerHTML = localBlog.body;
      }
    } else {
      if (contentEl) {
        contentEl.innerHTML = '<p style="color: var(--color-red-primary);">Failed to load article. Please check your network connection.</p>';
      }
    }
  }
}

// Card Builder Helper
function createBlogCard(blog) {
  const card = document.createElement('div');
  card.className = 'blog-card animate-fade';
  const imageUrl = blog.image_url || '/images/blog-placeholder.jpg';
  
  card.innerHTML = `
    <img src="${imageUrl}" alt="${escapeHTML(blog.title)}" class="blog-card-img" onerror="this.src='https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=600'">
    <div class="blog-card-content">
      <div class="blog-card-date">${formatDate(blog.created_at)}</div>
      <h3 class="blog-card-title">${escapeHTML(blog.title)}</h3>
      <p class="blog-card-excerpt">${escapeHTML(truncateText(blog.body, 125))}</p>
      <a href="/blog-detail.html?slug=${blog.slug}" class="blog-card-link">
        Read Full Story
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </a>
    </div>
  `;
  return card;
}

// Simple HTML escaping
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
