document.addEventListener('DOMContentLoaded', () => {
  const loginContainer = document.getElementById('admin-login-container');
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  const loginForm = document.getElementById('admin-login-form');
  const logoutBtn = document.getElementById('admin-logout-btn');

  // Check if we are on the admin page
  const isAdminPage = dashboardContainer !== null;
  if (!isAdminPage) return;

  // Session Routing
  const token = localStorage.getItem('dta_admin_token');
  if (token) {
    verifySession(token);
  } else {
    showLogin();
  }

  // Handle Login Form Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value.trim();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      
      submitBtn.disabled = true;
      submitBtn.innerText = 'Verifying credentials...';

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem('dta_admin_token', data.token);
          showNotification('Login successful! Welcome to the portal.', 'success');
          showDashboard();
        } else {
          showNotification(data.message || 'Invalid username or password.', 'error');
        }
      } catch (error) {
        console.error('Login error:', error);
        showNotification('Connection error. Please check if server is active.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }

  // Handle Logout Button Click
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('dta_admin_token');
      showNotification('You have logged out successfully.', 'info');
      showLogin();
    });
  }

  // Tab Navigation Handling
  const tabs = document.querySelectorAll('.admin-tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      if (targetId === 'tab-messages') loadSupportMessages();
      if (targetId === 'tab-donations') loadDonations();
      if (targetId === 'tab-manage-blogs') loadPublishedBlogs();
      if (targetId === 'tab-subscribers') loadSubscribers();
    });
  });

  // ─── Initialize Quill Rich Text Editor ───────────────────────────────────
  let quillEditor = null;
  const quillContainer = document.getElementById('blog-quill-editor');
  if (quillContainer && typeof Quill !== 'undefined') {
    quillEditor = new Quill('#blog-quill-editor', {
      theme: 'snow',
      placeholder: 'Start writing your article here...',
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['blockquote', 'link'],
          [{ 'align': [] }],
          ['clean']
        ]
      }
    });
  }

  // Show Cloudinary / local storage status badge
  const cloudinaryStatus = document.getElementById('cloudinary-status');
  if (cloudinaryStatus) {
    fetch('/api/config/upload-mode')
      .then(r => r.json())
      .then(d => {
        if (d.cloudinary) {
          cloudinaryStatus.innerText = '☁️ Cloudinary Active';
          cloudinaryStatus.style.cssText = 'background:var(--color-green-light);color:var(--color-green-primary);font-size:12px;padding:5px 12px;border-radius:var(--radius-full);font-weight:600;';
        } else {
          cloudinaryStatus.innerText = '💾 Local Storage';
          cloudinaryStatus.style.cssText = 'background:#f1f5f9;color:#475569;font-size:12px;padding:5px 12px;border-radius:var(--radius-full);font-weight:600;';
        }
      })
      .catch(() => {});
  }

  // ─── Image Upload with Preview & Drag-Drop ───────────────────────────────
  const imgInput = document.getElementById('blog-image-input');
  const imgPreview = document.getElementById('blog-image-preview');
  const dropPlaceholder = document.getElementById('image-drop-placeholder');
  const dropZone = document.getElementById('image-drop-zone');

  function showImagePreview(file) {
    if (!file || !imgPreview) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      imgPreview.src = e.target.result;
      imgPreview.style.display = 'block';
      if (dropPlaceholder) dropPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  function clearImagePreview() {
    if (imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
    if (dropPlaceholder) dropPlaceholder.style.display = 'block';
  }

  if (imgInput) {
    imgInput.addEventListener('change', () => {
      if (imgInput.files[0]) showImagePreview(imgInput.files[0]);
      else clearImagePreview();
    });
  }

  // Drag-and-drop support
  if (dropZone && imgInput) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--color-blue-primary)';
      dropZone.style.background = 'var(--color-blue-light)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-light)';
      dropZone.style.background = 'var(--bg-primary)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-light)';
      dropZone.style.background = 'var(--bg-primary)';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        // Assign dropped file to the actual input
        const dt = new DataTransfer();
        dt.items.add(file);
        imgInput.files = dt.files;
        showImagePreview(file);
      } else {
        showNotification('Only image files are supported (JPG, PNG, WEBP).', 'error');
      }
    });
  }

  // ─── Animate Upload Progress Bar (simulated while server uploads) ─────────
  function animateProgress(targetPct, label) {
    const wrap = document.getElementById('upload-progress-wrap');
    const bar = document.getElementById('upload-progress-bar');
    const text = document.getElementById('upload-progress-text');
    if (!wrap || !bar) return;
    wrap.style.display = 'block';
    bar.style.width = targetPct + '%';
    if (text) text.innerText = label || 'Uploading image...';
  }

  function hideProgress() {
    const wrap = document.getElementById('upload-progress-wrap');
    if (wrap) wrap.style.display = 'none';
    const bar = document.getElementById('upload-progress-bar');
    if (bar) bar.style.width = '0%';
  }

  // ─── Clear Form Button ────────────────────────────────────────────────────
  const clearBlogBtn = document.getElementById('clear-blog-btn');
  if (clearBlogBtn) {
    clearBlogBtn.addEventListener('click', () => {
      const blogForm = document.getElementById('admin-blog-form');
      if (blogForm) blogForm.reset();
      if (quillEditor) quillEditor.setContents([]);
      clearImagePreview();
      hideProgress();
    });
  }

  // ─── Blog Form Submission ─────────────────────────────────────────────────
  const blogForm = document.getElementById('admin-blog-form');
  if (blogForm) {
    blogForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Sync Quill HTML to hidden body input
      const bodyInput = document.getElementById('blog-body-input');
      const titleInput = document.getElementById('blog-title-input');

      if (quillEditor) {
        const html = quillEditor.root.innerHTML.trim();
        const text = quillEditor.getText().trim();
        if (!text || text === '\n') {
          showNotification('Please write some article content before publishing.', 'error');
          return;
        }
        if (bodyInput) bodyInput.value = html;
      }

      if (!titleInput || !titleInput.value.trim()) {
        showNotification('Please enter an article title.', 'error');
        titleInput && titleInput.focus();
        return;
      }

      const submitBtn = document.getElementById('publish-blog-btn');
      const originalText = submitBtn ? submitBtn.innerText : '🚀 Publish Article';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Publishing...'; }

      // Show upload progress if image selected
      const hasImage = imgInput && imgInput.files && imgInput.files.length > 0;
      if (hasImage) {
        animateProgress(30, 'Uploading banner image...');
        setTimeout(() => animateProgress(70, 'Processing image...'), 600);
      }

      const formData = new FormData(blogForm);
      const token = localStorage.getItem('dta_admin_token');

      try {
        const res = await fetch('/api/blogs', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        if (hasImage) animateProgress(100, 'Upload complete!');

        if (res.status === 401) {
          showNotification('Session expired. Please log in again.', 'error');
          showLogin();
          return;
        }

        const data = await res.json();

        if (data.success) {
          showNotification('✅ Article published successfully! It is now live on the site.', 'success', 6000);
          blogForm.reset();
          if (quillEditor) quillEditor.setContents([]);
          clearImagePreview();
          setTimeout(hideProgress, 800);

          // Refresh both the published list and stat counters
          loadPublishedBlogs();
          loadDashboardStats();
        } else {
          showNotification(data.message || 'Failed to publish article.', 'error');
          hideProgress();
        }
      } catch (error) {
        console.error('Error publishing blog:', error);
        showNotification('Connection error. Could not publish article.', 'error');
        hideProgress();
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
      }
    });
  }

  const searchInput = document.getElementById('donor-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterAndSumDonations(searchInput.value.trim());
    });
  }
});

// Helper: Show Login Card
function showLogin() {
  const loginContainer = document.getElementById('admin-login-container');
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  
  if (loginContainer) loginContainer.style.display = 'flex';
  if (dashboardContainer) dashboardContainer.style.display = 'none';
}

// Helper: Show Dashboard Panel
function showDashboard() {
  const loginContainer = document.getElementById('admin-login-container');
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  
  if (loginContainer) loginContainer.style.display = 'none';
  if (dashboardContainer) {
    dashboardContainer.style.display = 'block';
    
    // Load fresh data
    loadDashboardStats();
    loadSupportMessages();
    loadDonations();
    loadPublishedBlogs();
    loadSubscribers();
  }
}

// Helper: Verify token with backend stats API
async function verifySession(token) {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (res.ok) {
      showDashboard();
    } else {
      localStorage.removeItem('dta_admin_token');
      showLogin();
    }
  } catch (error) {
    console.error('Session validation connection issue:', error);
    // Keep local layout intact but warn
    showLogin();
  }
}

// Helper: Get Authorization Header object
function getAuthHeaders() {
  const token = localStorage.getItem('dta_admin_token');
  return {
    'Authorization': `Bearer ${token}`
  };
}

// Global references for Chart.js
let trendChartInstance = null;
let statusChartInstance = null;

// 1. Fetch Dashboard Stats
async function loadDashboardStats() {
  const countBlogs = document.getElementById('stat-blogs-count');
  const countMessages = document.getElementById('stat-messages-count');
  const countDonations = document.getElementById('stat-donations-count');
  const sumDonations = document.getElementById('stat-donations-sum');

  try {
    const res = await fetch('/api/admin/stats', {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      showLogin();
      return;
    }

    const data = await res.json();

    if (data.success) {
      const stats = data.stats;
      if (countBlogs) countBlogs.innerText = stats.blogsCount;
      if (countMessages) countMessages.innerText = stats.messagesCount;
      if (countDonations) countDonations.innerText = stats.donationsCount;

      const countSubscribers = document.getElementById('stat-subscribers-count');
      if (countSubscribers) countSubscribers.innerText = stats.subscribersCount || 0;

      if (sumDonations) {
        const formattedAmount = new Intl.NumberFormat('en-KE', {
          style: 'currency',
          currency: 'KES',
          minimumFractionDigits: 2
        }).format(stats.totalRaised);
        sumDonations.innerText = formattedAmount;
      }
    }
  } catch (error) {
    console.error('Error loading admin stats:', error);
  }
}

// 2. Fetch Support Messages Logs
async function loadSupportMessages() {
  const tbody = document.getElementById('admin-messages-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/messages', {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      showLogin();
      return;
    }

    const data = await res.json();

    if (data.success) {
      tbody.innerHTML = '';
      if (data.messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No support inquiries found.</td></tr>';
        return;
      }

      data.messages.forEach(msg => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="font-weight: 600;">${escapeHTML(msg.name)}</td>
          <td><a href="mailto:${escapeHTML(msg.email)}" style="color: var(--color-blue-primary);">${escapeHTML(msg.email)}</a></td>
          <td>${escapeHTML(msg.phone)}</td>
          <td style="max-width: 300px; word-break: break-word;">${escapeHTML(msg.message)}</td>
          <td style="font-size: 13px; color: var(--text-muted);">${formatDate(msg.created_at)}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="window.deleteSupportMessage(${msg.id})" style="border-color: var(--color-red-primary); color: var(--color-red-primary); padding: 4px 10px; font-size: 12px;">Delete</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-red-primary);">Error loading messages.</td></tr>';
  }
}

// Global memory store for donation logs
window.allDonations = [];

// 3. Fetch Donation History Logs
async function loadDonations() {
  const tbody = document.getElementById('admin-donations-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/donations', {
      headers: getAuthHeaders()
    });

    if (res.status === 401) {
      showLogin();
      return;
    }

    const data = await res.json();

    if (data.success) {
      window.allDonations = data.donations;
      
      // Update charts & stats metrics
      renderDonationCharts(data.donations);

      // Render the table rows
      const searchInput = document.getElementById('donor-search-input');
      const searchVal = searchInput ? searchInput.value.trim() : '';
      if (searchVal) {
        filterAndSumDonations(searchVal);
      } else {
        renderDonationRows(data.donations);
      }
    }
  } catch (error) {
    console.error('Error loading donations:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-primary);">Error loading donations.</td></tr>';
  }
}

// Render donation list helper
function renderDonationRows(donations) {
  const tbody = document.getElementById('admin-donations-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No matching donations found.</td></tr>';
    return;
  }

  donations.forEach(don => {
    const row = document.createElement('tr');
    
    const formattedAmount = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2
    }).format(don.amount);

    const statusClass = don.status === 'success' ? 'success' : (don.status === 'pending' ? 'pending' : 'failed');

    row.innerHTML = `
      <td style="font-weight: 600;">${escapeHTML(don.donor_name)}</td>
      <td>
        <a href="mailto:${escapeHTML(don.donor_email)}" style="color: var(--color-blue-primary);">${escapeHTML(don.donor_email)}</a>
        ${don.donor_phone ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHTML(don.donor_phone)}</div>` : ''}
      </td>
      <td style="font-weight: 700; color: var(--color-green-primary);">${formattedAmount}</td>
      <td style="font-family: monospace; font-size: 13px;">${escapeHTML(don.reference)}</td>
      <td><span class="status-badge ${statusClass}">${escapeHTML(don.status)}</span></td>
      <td style="font-size: 13px; color: var(--text-muted);">${formatDate(don.created_at)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="window.deleteDonation(${don.id})" style="border-color: var(--color-red-primary); color: var(--color-red-primary); padding: 4px 10px; font-size: 12px;">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Filter and sum donor contributions lookup
function filterAndSumDonations(query) {
  const tbody = document.getElementById('admin-donations-tbody');
  const badge = document.getElementById('donor-total-badge');
  const totalVal = document.getElementById('donor-total-value');
  if (!tbody || !window.allDonations) return;

  const normalizedQuery = query.toLowerCase();

  // If query is empty, show all rows and hide badge
  if (!normalizedQuery) {
    renderDonationRows(window.allDonations);
    if (badge) badge.style.display = 'none';
    return;
  }

  // Filter donations
  const filtered = window.allDonations.filter(don => {
    const nameMatch = (don.donor_name || '').toLowerCase().includes(normalizedQuery);
    const emailMatch = (don.donor_email || '').toLowerCase().includes(normalizedQuery);
    const phoneMatch = (don.donor_phone || '').toLowerCase().includes(normalizedQuery);
    const refMatch = (don.reference || '').toLowerCase().includes(normalizedQuery);
    return nameMatch || emailMatch || phoneMatch || refMatch;
  });

  // Render the filtered rows
  renderDonationRows(filtered);

  // Calculate sum of successful donations for matching email/phone to show totals
  const successfulFiltered = filtered.filter(d => d.status === 'success');
  const sum = successfulFiltered.reduce((total, d) => total + parseFloat(d.amount), 0);

  if (badge && totalVal) {
    badge.style.display = 'block';
    totalVal.innerText = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(sum);
  }
}

// 4. Fetch Published Blogs
async function loadPublishedBlogs() {
  const container = document.getElementById('admin-blogs-list-container');
  if (!container) return;

  try {
    const res = await fetch('/api/blogs');
    const data = await res.json();

    if (data.success) {
      container.innerHTML = '';
      if (data.blogs.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No blog posts published yet.</p>';
        return;
      }

      data.blogs.forEach(blog => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '12px';
        item.style.padding = '12px';
        item.style.backgroundColor = 'var(--bg-primary)';
        item.style.borderRadius = 'var(--radius-sm)';
        item.style.border = '1px solid var(--border-light)';
        
        item.innerHTML = `
          <img src="${blog.image_url || '/images/blog-placeholder.jpg'}" alt="${escapeHTML(blog.title)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: var(--radius-sm);">
          <div style="flex-grow: 1; min-width: 0;">
            <h4 style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${escapeHTML(blog.title)}</h4>
            <span style="font-size: 11px; color: var(--text-muted);">${formatDate(blog.created_at)}</span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="window.deleteBlog(${blog.id})" style="border-color: var(--color-red-primary); color: var(--color-red-primary); padding: 4px 8px; font-size: 11px; flex-shrink: 0;">Delete</button>
        `;
        container.appendChild(item);
      });
    }
  } catch (error) {
    console.error('Error loading published blogs:', error);
    container.innerHTML = '<p style="color: var(--color-red-primary); text-align: center;">Error loading blogs.</p>';
  }
}

// 5. Render Donation Trend and Status Charts
function renderDonationCharts(donations) {
  const trendCtx = document.getElementById('donationTrendChart');
  const statusCtx = document.getElementById('donationStatusChart');
  const metricAvg = document.getElementById('metric-avg-donation');
  const metricRate = document.getElementById('metric-success-rate');
  if (!trendCtx || !statusCtx) return;

  // 1. Success Rate & Avg Success
  const successfulDons = donations.filter(d => d.status === 'success');
  const successCount = successfulDons.length;
  const totalCount = donations.length;
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  
  const sumSuccess = successfulDons.reduce((sum, d) => sum + parseFloat(d.amount), 0);
  const avgSuccess = successCount > 0 ? Math.round(sumSuccess / successCount) : 0;

  if (metricAvg) {
    metricAvg.innerText = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(avgSuccess);
  }
  if (metricRate) {
    metricRate.innerText = `${successRate}%`;
  }

  // Calculate Weekly Total (EAT - East Africa Time, UTC+3)
  const nowEATString = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
  const nowEAT = new Date(nowEATString);
  const currentDay = nowEAT.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const startOfWeekEAT = new Date(nowEAT);
  startOfWeekEAT.setDate(nowEAT.getDate() + diffToMonday);
  startOfWeekEAT.setHours(0, 0, 0, 0);

  const weeklySuccessDons = successfulDons.filter(d => {
    const donDateEAT = new Date(new Date(d.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    return donDateEAT >= startOfWeekEAT;
  });
  const weeklyTotal = weeklySuccessDons.reduce((sum, d) => sum + parseFloat(d.amount), 0);

  const metricWeekly = document.getElementById('metric-weekly-total');
  if (metricWeekly) {
    metricWeekly.innerText = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(weeklyTotal);
  }

  // Destroy previous instances if they exist
  if (trendChartInstance) trendChartInstance.destroy();
  if (statusChartInstance) statusChartInstance.destroy();

  // 2. Status Breakdown
  const statusCounts = { success: 0, pending: 0, failed: 0 };
  donations.forEach(d => {
    if (statusCounts[d.status] !== undefined) {
      statusCounts[d.status]++;
    }
  });

  statusChartInstance = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: ['Successful', 'Pending', 'Failed'],
      datasets: [{
        data: [statusCounts.success, statusCounts.pending, statusCounts.failed],
        backgroundColor: ['#1b7b56', '#fef3c7', '#e05a47'],
        borderColor: ['#ffffff', '#ffffff', '#ffffff'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11 },
            boxWidth: 10
          }
        }
      }
    }
  });

  // 3. Trend (Successful Donations Over Time)
  const dailyTotals = {};
  
  // Group by Date
  successfulDons.forEach(d => {
    const dateObj = new Date(d.created_at);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + parseFloat(d.amount);
  });

  // Sort daily totals if needed or reverse (donations are desc by default, so reverse them)
  const sortedDates = Object.keys(dailyTotals).reverse();
  const sortedAmounts = sortedDates.map(date => dailyTotals[date]);

  trendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: sortedDates.length > 0 ? sortedDates : ['No Data'],
      datasets: [{
        label: 'Donation Volume (KES)',
        data: sortedAmounts.length > 0 ? sortedAmounts : [0],
        fill: true,
        backgroundColor: 'rgba(42, 92, 145, 0.1)',
        borderColor: '#2a5c91',
        tension: 0.3,
        borderWidth: 3,
        pointBackgroundColor: '#2a5c91',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'Inter', size: 10 },
            callback: value => 'KES ' + value
          }
        },
        x: {
          ticks: {
            font: { family: 'Inter', size: 10 }
          }
        }
      }
    }
  });
}

// --- Deletion Functions (Attached to window for global inline onclick targeting) ---

window.deleteBlog = async function(id) {
  if (!confirm('Are you sure you want to delete this blog post? This action cannot be undone.')) return;
  const token = localStorage.getItem('dta_admin_token');

  try {
    const res = await fetch(`/api/admin/blogs/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showNotification('Blog post deleted successfully.', 'success');
      loadDashboardStats();
      loadPublishedBlogs();
    } else {
      showNotification(data.message || 'Failed to delete blog post.', 'error');
    }
  } catch (error) {
    console.error('Error deleting blog:', error);
    showNotification('Server connection error. Failed to delete blog.', 'error');
  }
};

window.deleteSupportMessage = async function(id) {
  if (!confirm('Are you sure you want to delete this support message record?')) return;
  const token = localStorage.getItem('dta_admin_token');

  try {
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showNotification('Support inquiry deleted successfully.', 'success');
      loadDashboardStats();
      loadSupportMessages();
    } else {
      showNotification(data.message || 'Failed to delete message.', 'error');
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    showNotification('Server connection error. Failed to delete message.', 'error');
  }
};

window.deleteDonation = async function(id) {
  if (!confirm('Are you sure you want to delete this donation record log?')) return;
  const token = localStorage.getItem('dta_admin_token');

  try {
    const res = await fetch(`/api/admin/donations/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showNotification('Donation log deleted successfully.', 'success');
      loadDashboardStats();
      loadDonations();
    } else {
      showNotification(data.message || 'Failed to delete donation.', 'error');
    }
  } catch (error) {
    console.error('Error deleting donation:', error);
    showNotification('Server connection error. Failed to delete donation.', 'error');
  }
};

// Helper: Format Date
function formatDate(dateString) {
  const options = { 
    timeZone: 'Africa/Nairobi',
    year: 'numeric', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    timeZoneName: 'short'
  };
  return new Date(dateString).toLocaleDateString('en-US', options);
}

// Simple HTML escaping helper
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 5. Load Newsletter Subscribers
async function loadSubscribers() {
  const tbody = document.getElementById('admin-subscribers-tbody');
  const countBadge = document.getElementById('subscribers-count-badge');
  const statCount = document.getElementById('stat-subscribers-count');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Loading...</td></tr>';

  try {
    const res = await fetch('/api/admin/subscribers', { headers: getAuthHeaders() });

    if (res.status === 401) { showLogin(); return; }

    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-red-primary);">Failed to load subscribers.</td></tr>';
      return;
    }

    const subs = data.subscribers || [];

    // Update count badge and stat card
    if (countBadge) countBadge.innerText = `${subs.length} subscriber${subs.length !== 1 ? 's' : ''}`;
    if (statCount) statCount.innerText = subs.length;

    if (subs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">No subscribers yet. Share the newsletter form with your audience!</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    subs.forEach((sub, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;color:var(--text-muted);">${index + 1}</td>
        <td>
          <a href="mailto:${escapeHTML(sub.email)}" style="color:var(--color-blue-primary);font-weight:500;">
            ${escapeHTML(sub.email)}
          </a>
        </td>
        <td style="color:var(--text-muted);font-size:13px;">${formatDate(sub.subscribed_at)}</td>
        <td>
          <button
            onclick="deleteSubscriber(${sub.id}, this)"
            class="btn btn-accent btn-sm"
            style="padding:6px 12px;font-size:12px;"
            title="Remove subscriber"
          >Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading subscribers:', err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-red-primary);">Connection error. Please try again.</td></tr>';
  }
}

// Delete a subscriber
async function deleteSubscriber(id, btn) {
  if (!confirm('Remove this subscriber from the newsletter list?')) return;

  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = '...';

  try {
    const res = await fetch(`/api/admin/subscribers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (data.success) {
      showNotification('Subscriber removed successfully.', 'success');
      loadSubscribers();
      loadDashboardStats();
    } else {
      showNotification(data.message || 'Failed to remove subscriber.', 'error');
      btn.disabled = false;
      btn.innerText = originalText;
    }
  } catch (err) {
    console.error('Error deleting subscriber:', err);
    showNotification('Server error. Failed to remove subscriber.', 'error');
    btn.disabled = false;
    btn.innerText = originalText;
  }
}
