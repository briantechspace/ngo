/**
 * Doorway to Acceptance (DTA) - Super Admin Dashboard Client
 * Complete administrative powers: Blog Editor & Management, Donation Log,
 * Status Overrides, Manual Offline Entries, CSV Exports, Broadcast Center,
 * and Live System Diagnostics.
 */

let quillEditor = null;
let editQuillEditor = null;
let currentDonations = [];
let currentMessages = [];
let currentSubscribers = [];

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('dta_admin_token');
  const loginContainer = document.getElementById('admin-login-container');
  const dashboardContainer = document.getElementById('admin-dashboard-container');
  const loginForm = document.getElementById('admin-login-form');
  const logoutBtn = document.getElementById('admin-logout-btn');

  // Check login state
  if (token) {
    showDashboard();
  } else {
    showLogin();
  }

  // Handle Admin Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Authenticating...'; }

      let loginSuccess = false;
      let token = null;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          loginSuccess = true;
          token = data.token;
          localStorage.setItem('dta_admin_token', token);
          showNotification('Login successful! Welcome to the Admin Portal.', 'success');
        } else {
          showNotification(data.message || 'Invalid credentials.', 'error');
        }
      } catch (err) {
        console.error('Login network error:', err);
        showNotification('Unable to reach server. Please check your connection.', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Access Portal'; }
      }

      if (loginSuccess) {
        showDashboard();
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('dta_admin_token');
      showNotification('Logged out successfully.', 'info');
      showLogin();
    });
  }

  // Initialize Tab Navigation
  initTabs();

  // Initialize Blog Editor Drop Zone & Form
  initBlogEditor();

  // Initialize Search & Filter Listeners
  initSearchAndFilters();

  // Initialize CSV Export Handlers
  initCsvExports();

  // Initialize Newsletter Broadcast Composer
  initBroadcastComposer();

  // Initialize Manual Donation Dialog
  initManualDonationModal();

  // Initialize Edit Blog Modal
  initEditBlogModal();

  // Initialize Diagnostics Refresh
  const refreshDiagBtn = document.getElementById('refresh-diagnostics-btn');
  if (refreshDiagBtn) {
    refreshDiagBtn.addEventListener('click', loadSystemDiagnostics);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH VIEW TOGGLING
// ─────────────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('admin-login-container').style.display = 'flex';
  document.getElementById('admin-dashboard-container').style.display = 'none';
}

function showDashboard() {
  document.getElementById('admin-login-container').style.display = 'none';
  document.getElementById('admin-dashboard-container').style.display = 'block';

  try {
    initQuillEditors();
  } catch (e) {
    console.warn('Quill editor init note:', e);
  }

  try { checkUploadMode(); } catch (e) {}
  try { loadDashboardStats(); } catch (e) {}
  try { loadSupportMessages(); } catch (e) {}
  try { loadDonations(); } catch (e) {}
  try { loadAdminBlogs(); } catch (e) {}
  try { loadSubscribers(); } catch (e) {}
  try { loadSystemDiagnostics(); } catch (e) {}
}

function getAuthHeaders() {
  const token = localStorage.getItem('dta_admin_token');
  return {
    'Authorization': `Bearer ${token}`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TABS NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function initTabs() {
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) {
        target.classList.add('active');
        if (btn.dataset.tab === 'tab-system') {
          loadSystemDiagnostics();
        }
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// QUILL RICH TEXT EDITORS
// ─────────────────────────────────────────────────────────────────────────────
function initQuillEditors() {
  if (!quillEditor && document.getElementById('blog-quill-editor')) {
    quillEditor = new Quill('#blog-quill-editor', {
      theme: 'snow',
      placeholder: 'Write your story, press release, or field report...',
      modules: {
        toolbar: [
          [{ 'header': [2, 3, 4, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link', 'clean']
        ]
      }
    });
  }

  if (!editQuillEditor && document.getElementById('edit-quill-editor')) {
    editQuillEditor = new Quill('#edit-quill-editor', {
      theme: 'snow',
      placeholder: 'Edit article content...',
      modules: {
        toolbar: [
          [{ 'header': [2, 3, 4, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link', 'clean']
        ]
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK UPLOAD MODE
// ─────────────────────────────────────────────────────────────────────────────
async function checkUploadMode() {
  const badge = document.getElementById('cloudinary-status');
  if (!badge) return;
  try {
    const res = await fetch('/api/config/upload-mode');
    const data = await res.json();
    if (data.cloudinary) {
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0284c7';
      badge.innerText = '☁ Cloudinary CDN Active';
    } else {
      badge.style.background = '#fef3c7';
      badge.style.color = '#b45309';
      badge.innerText = '📁 Local Storage Active';
    }
  } catch (e) {
    badge.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────
async function loadDashboardStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (res.status === 401) { handleSessionExpired(); return; }
    const data = await res.json();

    if (data.success && data.stats) {
      const s = data.stats;
      const donationsSumEl = document.getElementById('stat-donations-sum');
      const messagesCountEl = document.getElementById('stat-messages-count');
      const blogsCountEl = document.getElementById('stat-blogs-count');
      const donationsCountEl = document.getElementById('stat-donations-count');
      const subscribersCountEl = document.getElementById('stat-subscribers-count');

      if (donationsSumEl) donationsSumEl.innerText = `KES ${parseFloat(s.totalRaised || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
      if (messagesCountEl) messagesCountEl.innerText = s.messagesCount || 0;
      if (blogsCountEl) blogsCountEl.innerText = s.blogsCount || 0;
      if (donationsCountEl) donationsCountEl.innerText = s.donationsCount || 0;
      if (subscribersCountEl) {
        subscribersCountEl.innerText = s.subscribersCount || 0;
        const subBadge = document.getElementById('broadcast-recipient-count');
        if (subBadge) subBadge.innerText = `${s.subscribersCount || 0} Recipients`;
      }
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT INQUIRIES & SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function loadSupportMessages() {
  const tbody = document.getElementById('admin-messages-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/messages', { headers: getAuthHeaders() });
    if (res.status === 401) { handleSessionExpired(); return; }
    const data = await res.json();

    if (data.success) {
      currentMessages = data.messages || [];
      renderSupportMessages(currentMessages);
    }
  } catch (err) {
    console.error('Error loading messages:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Failed to load inquiries.</td></tr>';
  }
}

function renderSupportMessages(messages) {
  const tbody = document.getElementById('admin-messages-tbody');
  if (!tbody) return;

  if (messages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No support messages found.</td></tr>';
    return;
  }

  tbody.innerHTML = messages.map(m => `
    <tr>
      <td style="font-weight: 600;">${escapeHTML(m.name)}</td>
      <td><a href="mailto:${escapeHTML(m.email)}" style="color: var(--color-blue-primary);">${escapeHTML(m.email)}</a></td>
      <td><a href="tel:${escapeHTML(m.phone)}" style="color: inherit; text-decoration: none;">${escapeHTML(m.phone)}</a></td>
      <td style="max-width: 320px; white-space: pre-wrap; font-size: 13px;">${escapeHTML(m.message)}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${new Date(m.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      <td>
        <button class="btn btn-outline btn-sm" style="color: var(--color-red-primary); border-color: var(--color-red-primary); padding: 4px 10px;" onclick="deleteSupportMessage(${m.id})">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

async function deleteSupportMessage(id) {
  if (!confirm('Are you sure you want to permanently delete this support inquiry?')) return;

  try {
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Inquiry deleted.', 'info');
      loadSupportMessages();
      loadDashboardStats();
    } else {
      showNotification(data.message || 'Could not delete.', 'error');
    }
  } catch (err) {
    showNotification('Error deleting inquiry.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DONATIONS LOG, STATUS OVERRIDES & ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
async function loadDonations() {
  const tbody = document.getElementById('admin-donations-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/donations', { headers: getAuthHeaders() });
    if (res.status === 401) { handleSessionExpired(); return; }
    const data = await res.json();

    if (data.success) {
      currentDonations = data.donations || [];
      filterAndRenderDonations();
      renderDonationCharts(currentDonations);
    }
  } catch (err) {
    console.error('Error loading donations:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Failed to load donations.</td></tr>';
  }
}

function filterAndRenderDonations() {
  const searchInput = document.getElementById('donor-search-input');
  const statusFilter = document.getElementById('donation-status-filter');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const status = statusFilter ? statusFilter.value : 'all';

  let filtered = currentDonations.filter(d => {
    const matchesStatus = status === 'all' || d.status === status;
    const matchesQuery = !query || 
      (d.donor_name && d.donor_name.toLowerCase().includes(query)) ||
      (d.donor_email && d.donor_email.toLowerCase().includes(query)) ||
      (d.donor_phone && d.donor_phone.toLowerCase().includes(query)) ||
      (d.reference && d.reference.toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  });

  renderDonations(filtered);
}

function renderDonations(donations) {
  const tbody = document.getElementById('admin-donations-tbody');
  if (!tbody) return;

  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No donation records matching your filter.</td></tr>';
    return;
  }

  tbody.innerHTML = donations.map(d => {
    const statusClass = d.status === 'success' ? 'status-success' : (d.status === 'pending' ? 'status-pending' : 'status-failed');
    return `
      <tr>
        <td style="font-weight: 600;">${escapeHTML(d.donor_name || 'Anonymous')}</td>
        <td><span style="font-size: 13px; color: var(--text-muted);">${escapeHTML(d.donor_email || '')}</span></td>
        <td style="font-weight: 700; color: ${d.status === 'success' ? 'var(--color-green-primary)' : 'inherit'};">
          KES ${parseFloat(d.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
        </td>
        <td><code style="font-size: 11.5px; background: var(--bg-secondary); padding: 3px 6px; border-radius: 4px;">${escapeHTML(d.reference)}</code></td>
        <td>
          <select onchange="overrideDonationStatus(${d.id}, this.value)" style="font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--border-light); cursor: pointer;" class="${statusClass}">
            <option value="success" ${d.status === 'success' ? 'selected' : ''}>✓ Success</option>
            <option value="pending" ${d.status === 'pending' ? 'selected' : ''}>⏳ Pending</option>
            <option value="failed" ${d.status === 'failed' ? 'selected' : ''}>✕ Failed</option>
            <option value="refunded" ${d.status === 'refunded' ? 'selected' : ''}>↩ Refunded</option>
          </select>
        </td>
        <td style="font-size: 12px; color: var(--text-muted);">${new Date(d.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td style="white-space: nowrap;">
          <a href="/receipt?ref=${encodeURIComponent(d.reference)}" target="_blank" class="btn btn-outline btn-sm" style="color: var(--color-blue-primary); border-color: var(--color-blue-primary); padding: 4px 8px; font-size: 12px; margin-right: 4px;">
            📄 Receipt
          </a>
          <button class="btn btn-outline btn-sm" style="color: var(--color-red-primary); border-color: var(--color-red-primary); padding: 4px 8px; font-size: 12px;" onclick="deleteDonationRecord(${d.id})">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function overrideDonationStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/donations/${id}/status`, {
      method: 'PATCH',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(`Donation status updated to ${newStatus}.`, 'success');
      loadDonations();
      loadDashboardStats();
    } else {
      showNotification(data.message || 'Status update failed.', 'error');
    }
  } catch (err) {
    showNotification('Error updating donation status.', 'error');
  }
}

async function deleteDonationRecord(id) {
  if (!confirm('Are you sure you want to permanently delete this donation ledger record?')) return;

  try {
    const res = await fetch(`/api/admin/donations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Donation record deleted.', 'info');
      loadDonations();
      loadDashboardStats();
    }
  } catch (err) {
    showNotification('Error deleting record.', 'error');
  }
}

// Chart.js Visuals
let trendChart = null;
let statusChart = null;

function renderDonationCharts(donations) {
  const trendCanvas = document.getElementById('donationTrendChart');
  const statusCanvas = document.getElementById('donationStatusChart');
  if (!trendCanvas || !statusCanvas || typeof Chart === 'undefined') return;

  // 1. Status count breakdown
  const successCount = donations.filter(d => d.status === 'success').length;
  const pendingCount = donations.filter(d => d.status === 'pending').length;
  const failedCount = donations.filter(d => ['failed', 'cancelled', 'timeout', 'refunded'].includes(d.status)).length;
  const totalCount = donations.length;

  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
  const totalSuccessAmount = donations.filter(d => d.status === 'success').reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);
  const avgDonation = successCount > 0 ? Math.round(totalSuccessAmount / successCount) : 0;

  const rateEl = document.getElementById('metric-success-rate');
  const avgEl = document.getElementById('metric-avg-donation');
  const weekEl = document.getElementById('metric-weekly-total');

  if (rateEl) rateEl.innerText = `${successRate}%`;
  if (avgEl) avgEl.innerText = `KES ${avgDonation.toLocaleString()}`;
  if (weekEl) weekEl.innerText = `KES ${totalSuccessAmount.toLocaleString()}`;

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(statusCanvas, {
    type: 'doughnut',
    data: {
      labels: ['Success', 'Pending', 'Failed / Other'],
      datasets: [{
        data: [successCount, pendingCount, failedCount],
        backgroundColor: ['#008751', '#f59e0b', '#ef4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // 2. Trend volume over time (Grouped by date)
  const dateMap = {};
  donations.filter(d => d.status === 'success').forEach(d => {
    const day = new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    dateMap[day] = (dateMap[day] || 0) + parseFloat(d.amount || 0);
  });

  const labels = Object.keys(dateMap).slice(-7);
  const amounts = labels.map(l => dateMap[l]);

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(trendCanvas, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['No recent data'],
      datasets: [{
        label: 'Funds Raised (KES)',
        data: amounts.length > 0 ? amounts : [0],
        borderColor: '#008751',
        backgroundColor: 'rgba(0, 135, 81, 0.1)',
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL OFFLINE DONATION DIALOG
// ─────────────────────────────────────────────────────────────────────────────
function initManualDonationModal() {
  const openBtn = document.getElementById('open-manual-donation-btn');
  const modal = document.getElementById('manual-donation-modal');
  const closeBtn = document.getElementById('close-manual-modal-btn');
  const cancelBtn = document.getElementById('cancel-manual-modal-btn');
  const form = document.getElementById('manual-donation-form');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
  }

  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const donor_name = document.getElementById('manual-donor-name').value.trim();
      const donor_email = document.getElementById('manual-donor-email').value.trim();
      const donor_phone = document.getElementById('manual-donor-phone').value.trim();
      const amount = document.getElementById('manual-amount').value.trim();
      const payment_method = document.getElementById('manual-method').value;

      try {
        const res = await fetch('/api/admin/donations/manual', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ donor_name, donor_email, donor_phone, amount, payment_method })
        });
        const data = await res.json();
        if (data.success) {
          showNotification('Offline donation recorded successfully!', 'success');
          form.reset();
          closeModal();
          loadDonations();
          loadDashboardStats();
        } else {
          showNotification(data.message || 'Failed to record donation.', 'error');
        }
      } catch (err) {
        showNotification('Error recording manual donation.', 'error');
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOG PUBLISHER & EDITING SUITE
// ─────────────────────────────────────────────────────────────────────────────
function initBlogEditor() {
  const form = document.getElementById('admin-blog-form');
  const imageInput = document.getElementById('blog-image-input');
  const imagePreview = document.getElementById('blog-image-preview');
  const dropPlaceholder = document.getElementById('image-drop-placeholder');
  const clearBtn = document.getElementById('clear-blog-btn');

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (imagePreview) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
          }
          if (dropPlaceholder) dropPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      form.reset();
      if (quillEditor) quillEditor.root.innerHTML = '';
      if (imagePreview) { imagePreview.src = ''; imagePreview.style.display = 'none'; }
      if (dropPlaceholder) dropPlaceholder.style.display = 'block';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('blog-title-input').value.trim();
      const body = quillEditor ? quillEditor.root.innerHTML : '';

      if (!title || !body || body === '<p><br></p>') {
        showNotification('Please provide both article title and content.', 'error');
        return;
      }

      const submitBtn = document.getElementById('publish-blog-btn');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Publishing...'; }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('body', body);

      const file = imageInput ? imageInput.files[0] : null;
      if (file) {
        formData.append('image', file);
      }

      try {
        const res = await fetch('/api/blogs', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showNotification('Article published successfully!', 'success');
          form.reset();
          if (quillEditor) quillEditor.root.innerHTML = '';
          if (imagePreview) { imagePreview.src = ''; imagePreview.style.display = 'none'; }
          if (dropPlaceholder) dropPlaceholder.style.display = 'block';
          loadAdminBlogs();
          loadDashboardStats();
        } else {
          showNotification(data.message || 'Failed to publish article.', 'error');
        }
      } catch (err) {
        showNotification('Network error publishing article.', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 Publish Article'; }
      }
    });
  }
}

async function loadAdminBlogs() {
  const container = document.getElementById('admin-blogs-list-container');
  if (!container) return;

  try {
    const res = await fetch('/api/blogs');
    const data = await res.json();

    if (data.success && data.blogs.length > 0) {
      container.innerHTML = data.blogs.map(b => `
        <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-light);">
          <div style="display: flex; gap: 10px; align-items: center; overflow: hidden;">
            <img src="${b.image_url || '/images/blog-placeholder.jpg'}" alt="Cover" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" onerror="this.src='/images/blog-placeholder.jpg'">
            <div style="overflow: hidden;">
              <h5 style="margin: 0 0 2px 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(b.title)}</h5>
              <p style="margin: 0; font-size: 11.5px; color: var(--text-muted);">${new Date(b.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 12px;" onclick="openEditBlogModal(${b.id})">✏️ Edit</button>
            <button class="btn btn-outline btn-sm" style="color: var(--color-red-primary); border-color: var(--color-red-primary); padding: 4px 8px; font-size: 12px;" onclick="deleteAdminBlog(${b.id})">🗑 Delete</button>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No blog articles published yet.</p>';
    }
  } catch (err) {
    container.innerHTML = '<p style="text-align: center; color: red;">Failed to load published blogs.</p>';
  }
}

async function deleteAdminBlog(id) {
  if (!confirm('Are you sure you want to permanently delete this blog post?')) return;

  try {
    const res = await fetch(`/api/admin/blogs/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Blog article deleted.', 'info');
      loadAdminBlogs();
      loadDashboardStats();
    }
  } catch (err) {
    showNotification('Error deleting blog post.', 'error');
  }
}

// Edit Blog Modal Logic
function initEditBlogModal() {
  const modal = document.getElementById('edit-blog-modal');
  const closeBtn = document.getElementById('close-edit-modal-btn');
  const cancelBtn = document.getElementById('cancel-edit-blog-btn');
  const form = document.getElementById('edit-blog-form');

  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-blog-id').value;
      const title = document.getElementById('edit-blog-title').value.trim();
      const body = editQuillEditor ? editQuillEditor.root.innerHTML : '';
      const imageFile = document.getElementById('edit-blog-image').files[0];

      if (!title || !body) {
        showNotification('Title and content are required.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('body', body);
      if (imageFile) formData.append('image', imageFile);

      try {
        const res = await fetch(`/api/admin/blogs/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          showNotification('Article updated successfully!', 'success');
          closeModal();
          loadAdminBlogs();
        } else {
          showNotification(data.message || 'Update failed.', 'error');
        }
      } catch (err) {
        showNotification('Error saving blog update.', 'error');
      }
    });
  }
}

async function openEditBlogModal(blogId) {
  const modal = document.getElementById('edit-blog-modal');
  if (!modal) return;

  try {
    const res = await fetch(`/api/admin/blogs/${blogId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (data.success && data.blog) {
      const blog = data.blog;
      document.getElementById('edit-blog-id').value = blog.id;
      document.getElementById('edit-blog-title').value = blog.title;
      if (editQuillEditor) {
        editQuillEditor.root.innerHTML = blog.body || '';
      }
      const previewEl = document.getElementById('edit-current-image-preview');
      if (previewEl && blog.image_url) {
        previewEl.innerHTML = `<img src="${blog.image_url}" alt="Current" style="max-height: 80px; border-radius: 6px; object-fit: cover;">`;
      }
      modal.style.display = 'flex';
    }
  } catch (err) {
    showNotification('Could not load blog data for editing.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBERS & NEWSLETTER BROADCAST COMPOSER
// ─────────────────────────────────────────────────────────────────────────────
async function loadSubscribers() {
  const tbody = document.getElementById('admin-subscribers-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/subscribers', { headers: getAuthHeaders() });
    if (res.status === 401) { handleSessionExpired(); return; }
    const data = await res.json();

    if (data.success) {
      currentSubscribers = data.subscribers || [];
      renderSubscribers(currentSubscribers);
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load subscribers.</td></tr>';
  }
}

function renderSubscribers(subscribers) {
  const tbody = document.getElementById('admin-subscribers-tbody');
  if (!tbody) return;

  if (subscribers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No subscribers found.</td></tr>';
    return;
  }

  tbody.innerHTML = subscribers.map((s, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="font-weight: 600;"><a href="mailto:${escapeHTML(s.email)}" style="color: var(--color-blue-primary);">${escapeHTML(s.email)}</a></td>
      <td style="font-size: 12px; color: var(--text-muted);">${new Date(s.subscribed_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-outline btn-sm" style="color: var(--color-red-primary); border-color: var(--color-red-primary); padding: 3px 8px;" onclick="deleteSubscriber(${s.id})">
          Remove
        </button>
      </td>
    </tr>
  `).join('');
}

async function deleteSubscriber(id) {
  if (!confirm('Are you sure you want to remove this subscriber from the mailing list?')) return;
  try {
    const res = await fetch(`/api/admin/subscribers/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    const data = await res.json();
    if (data.success) {
      showNotification('Subscriber removed.', 'info');
      loadSubscribers();
      loadDashboardStats();
    }
  } catch (err) {
    showNotification('Error removing subscriber.', 'error');
  }
}

function initBroadcastComposer() {
  const form = document.getElementById('admin-broadcast-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('broadcast-subject').value.trim();
    const message = document.getElementById('broadcast-message').value.trim();

    if (!subject || !message) {
      showNotification('Please enter both subject and message.', 'error');
      return;
    }

    const submitBtn = document.getElementById('broadcast-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Queuing Broadcast...'; }

    try {
      const res = await fetch('/api/admin/newsletter/broadcast', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subject, message })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Newsletter broadcast dispatched!', 'success');
        form.reset();
      } else {
        showNotification(data.message || 'Broadcast failed.', 'error');
      }
    } catch (err) {
      showNotification('Error sending newsletter broadcast.', 'error');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '✉ Send Broadcast to All Subscribers'; }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM DIAGNOSTICS & ENGINE HEALTH
// ─────────────────────────────────────────────────────────────────────────────
async function loadSystemDiagnostics() {
  try {
    const res = await fetch('/api/admin/system/diagnostics', { headers: getAuthHeaders() });
    if (res.status === 401) { handleSessionExpired(); return; }
    const data = await res.json();

    if (data.success && data.diagnostics) {
      const d = data.diagnostics;
      const dbEl = document.getElementById('diag-db-status');
      const memEl = document.getElementById('diag-mem-usage');
      const uptimeEl = document.getElementById('diag-uptime');
      const storageEl = document.getElementById('diag-storage');
      const nodeEl = document.getElementById('diag-node-version');

      if (dbEl) dbEl.innerText = `${d.database.type} (${d.database.status})`;
      if (memEl) memEl.innerText = `${d.memoryRssMb} MB (Heap: ${d.memoryHeapUsedMb} MB)`;
      if (uptimeEl) {
        const hours = Math.floor(d.uptimeSeconds / 3600);
        const mins = Math.floor((d.uptimeSeconds % 3600) / 60);
        uptimeEl.innerText = `${hours}h ${mins}m (${d.uptimeSeconds}s)`;
      }
      if (storageEl) storageEl.innerText = d.storage;
      if (nodeEl) nodeEl.innerText = `${d.nodeVersion} (${d.platform})`;
    }
  } catch (err) {
    console.warn('Diagnostics load error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE-CLICK CSV EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
function initCsvExports() {
  const exportDonationsBtn = document.getElementById('export-donations-csv-btn');
  const exportMessagesBtn = document.getElementById('export-messages-csv-btn');
  const exportSubscribersBtn = document.getElementById('export-subscribers-csv-btn');

  const triggerCsvDownload = async (type, filename) => {
    try {
      const res = await fetch(`/api/admin/export/${type}`, { headers: getAuthHeaders() });
      if (res.status === 401) { handleSessionExpired(); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `${type}_export.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showNotification(`CSV exported: ${filename}`, 'success');
    } catch (err) {
      showNotification('Error downloading CSV export.', 'error');
    }
  };

  if (exportDonationsBtn) {
    exportDonationsBtn.addEventListener('click', () => triggerCsvDownload('donations', 'dta_donations_ledger.csv'));
  }
  if (exportMessagesBtn) {
    exportMessagesBtn.addEventListener('click', () => triggerCsvDownload('messages', 'dta_support_inquiries.csv'));
  }
  if (exportSubscribersBtn) {
    exportSubscribersBtn.addEventListener('click', () => triggerCsvDownload('subscribers', 'dta_newsletter_subscribers.csv'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH & FILTER LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function initSearchAndFilters() {
  const donorSearch = document.getElementById('donor-search-input');
  const statusFilter = document.getElementById('donation-status-filter');
  const msgSearch = document.getElementById('message-search-input');

  if (donorSearch) donorSearch.addEventListener('input', filterAndRenderDonations);
  if (statusFilter) statusFilter.addEventListener('change', filterAndRenderDonations);

  if (msgSearch) {
    msgSearch.addEventListener('input', () => {
      const q = msgSearch.value.trim().toLowerCase();
      const filtered = currentMessages.filter(m => 
        !q ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (m.message && m.message.toLowerCase().includes(q))
      );
      renderSupportMessages(filtered);
    });
  }
}

// Session expired handler
function handleSessionExpired() {
  localStorage.removeItem('dta_admin_token');
  showNotification('Your session has expired. Please log in again.', 'error');
  showLogin();
}

// Simple HTML escaping helper
function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
