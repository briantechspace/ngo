// Mock seed data for standalone browser presentation fallbacks (running under file://)
const fallbackBlogs = [
  {
    id: 1,
    title: "Empowering Women Farmers in the Fight Against Climate Change",
    slug: "empowering-women-farmers-climate-change",
    body: `<p>Climate change is not gender-neutral. Across the globe, women are disproportionately affected by shifting weather patterns, droughts, and environmental degradation. However, they are also the most powerful agents of change.</p>
           <p>In our latest green initiative, we trained over 200 women farmers in sustainable agroforestry techniques. By integrating crop cultivation with tree planting, these women have not only restored soil fertility but also established a sustainable source of income through fruit and nut harvesting.</p>
           <blockquote>"When you empower a woman, you empower an entire community to stand resilient against the environmental crises of our time." - Executive Director</blockquote>
           <p>Through partnerships and community funding, we aim to scale this program to 1,000 women by the end of next year. Join us in making a difference!</p>`,
    image_url: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  },
  {
    id: 2,
    title: "The Impact of Climate Action: Planting 10,000 Saplings",
    slug: "impact-climate-action-10000-saplings",
    body: `<p>Regeneration is one of the most effective tools we have to combat rising global temperatures. Last month, our dedicated volunteers, school children, and local women groups gathered to plant 10,000 native saplings in critical water catchment areas.</p>
           <p>This massive planting drive will help restore biodiversity, prevent soil erosion, and safeguard local water supplies. Beyond the ecological benefits, the project has fostered a deep sense of environmental stewardship among youth.</p>
           <p>We are tracking the survival rate of these saplings using drone mapping to ensure long-term sustainability. Every donation we receive goes directly toward procuring saplings, tools, and supporting the community members who care for them.</p>`,
    image_url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=800",
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  },
  {
    id: 3,
    title: "How Communities Lead the Green Revolution",
    slug: "communities-lead-green-revolution",
    body: `<p>Top-down policies are essential, but the real battle against climate change is won on the ground by local communities. When community members are given ownership of their natural resources, conservation efforts succeed.</p>
           <p>Our advocacy programs educate communities on waste management, clean energy alternatives, and forest protection. By aligning economic incentives with ecological conservation, we make sustainability a natural choice.</p>
           <p>Read on to learn about our community workshops and how you can bring these climate mitigation techniques to your local town or school group.</p>`,
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
      
      document.title = `${blog.title} | EcoEmpower NGO`;
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
      document.title = `${localBlog.title} | EcoEmpower NGO`;
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
