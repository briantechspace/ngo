document.addEventListener('DOMContentLoaded', () => {
  // Determine which page we are on
  const isBlogsPage = document.getElementById('blogs-grid-container') !== null;
  const isBlogDetailPage = document.getElementById('blog-detail-content-area') !== null;
  const isHomePage = document.getElementById('recent-blogs-container') !== null;

  if (isHomePage) {
    loadHomeRecentBlogs();
  }

  if (isBlogsPage) {
    // Parse URL search param if redirecting from somewhere else
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    
    const searchInput = document.getElementById('blogs-search-input');
    if (searchParam && searchInput) {
      searchInput.value = searchParam;
    }
    
    loadBlogs(searchParam || '');
    
    // Bind search form in blogs list page
    const searchForm = document.getElementById('blogs-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        loadBlogs(query);
        
        // Update URL search query without reloading
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

// Helper: Format Dates nicely
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

// Helper: Truncate Text to fit preview cards
function truncateText(htmlText, limit = 120) {
  // Basic HTML tag stripper
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
      // Slice first 3 blogs
      const recent = data.blogs.slice(0, 3);
      recent.forEach(blog => {
        const card = createBlogCard(blog);
        container.appendChild(card);
      });
    } else {
      container.innerHTML = '<p class="text-muted">No blogs published yet.</p>';
    }
  } catch (error) {
    console.error('Error loading recent blogs:', error);
    container.innerHTML = '<p class="text-muted">Could not load recent blogs.</p>';
  }
}

// 2. BLOGS LISTING: Fetch and render all blogs
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
      
      // Update result count info text
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
    console.error('Error loading blogs:', error);
    gridContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--color-red-primary);">Failed to load blogs. Please try again later.</p>';
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
      
      // Update DOM
      document.title = `${blog.title} | NGO for Women & Climate`;
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
    console.error('Error loading blog detail:', error);
    if (contentEl) {
      contentEl.innerHTML = '<p style="color: var(--color-red-primary);">Failed to load article. Please check your network connection.</p>';
    }
  }
}

// Card Builder Helper
function createBlogCard(blog) {
  const card = document.createElement('div');
  card.className = 'blog-card animate-fade';
  
  // Set fallback image if empty
  const imageUrl = blog.image_url || '/images/blog-placeholder.jpg';
  
  card.innerHTML = `
    <img src="${imageUrl}" alt="${escapeHTML(blog.title)}" class="blog-card-img" onerror="this.src='/images/blog-placeholder.jpg'">
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

// Simple HTML escaping helper
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
