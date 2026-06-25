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
    });
  });

  // Blog Image Upload Preview
  const imgInput = document.getElementById('blog-image-input');
  const imgPreview = document.getElementById('blog-image-preview');
  const previewContainer = document.querySelector('.image-preview-container');

  if (imgInput && imgPreview) {
    imgInput.addEventListener('change', () => {
      const file = imgInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          imgPreview.src = e.target.result;
          imgPreview.style.display = 'block';
          const placeholder = previewContainer.querySelector('.preview-placeholder');
          if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
      } else {
        imgPreview.src = '';
        imgPreview.style.display = 'none';
        const placeholder = previewContainer.querySelector('.preview-placeholder');
        if (placeholder) placeholder.style.display = 'block';
      }
    });
  }

  // Handle New Blog Form Submission
  const blogForm = document.getElementById('admin-blog-form');
  if (blogForm) {
    blogForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = blogForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Uploading and Publishing...';

      const formData = new FormData(blogForm);
      const token = localStorage.getItem('dta_admin_token');

      try {
        const res = await fetch('/api/blogs', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (res.status === 401) {
          showNotification('Session expired. Please log in again.', 'error');
          showLogin();
          return;
        }

        const data = await res.json();

        if (data.success) {
          showNotification('Blog post published successfully!', 'success');
          blogForm.reset();
          
          if (imgPreview) {
            imgPreview.src = '';
            imgPreview.style.display = 'none';
            const placeholder = previewContainer.querySelector('.preview-placeholder');
            if (placeholder) placeholder.style.display = 'block';
          }

          loadDashboardStats();
        } else {
          showNotification(data.message || 'Failed to create blog.', 'error');
        }
      } catch (error) {
        console.error('Error creating blog:', error);
        showNotification('Server connection error. Failed to create blog.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No support inquiries found.</td></tr>';
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
        `;
        tbody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--color-red-primary);">Error loading messages.</td></tr>';
  }
}

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
      tbody.innerHTML = '';
      if (data.donations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No donations received yet.</td></tr>';
        return;
      }

      data.donations.forEach(don => {
        const row = document.createElement('tr');
        
        const formattedAmount = new Intl.NumberFormat('en-KE', {
          style: 'currency',
          currency: 'KES',
          minimumFractionDigits: 2
        }).format(don.amount);

        const statusClass = don.status === 'success' ? 'success' : (don.status === 'pending' ? 'pending' : 'failed');

        row.innerHTML = `
          <td style="font-weight: 600;">${escapeHTML(don.donor_name)}</td>
          <td><a href="mailto:${escapeHTML(don.donor_email)}" style="color: var(--color-blue-primary);">${escapeHTML(don.donor_email)}</a></td>
          <td style="font-weight: 700; color: var(--color-green-primary);">${formattedAmount}</td>
          <td style="font-family: monospace; font-size: 13px;">${escapeHTML(don.reference)}</td>
          <td><span class="status-badge ${statusClass}">${escapeHTML(don.status)}</span></td>
          <td style="font-size: 13px; color: var(--text-muted);">${formatDate(don.created_at)}</td>
        `;
        tbody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading donations:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-red-primary);">Error loading donations.</td></tr>';
  }
}

// Helper: Format Date
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString(undefined, options);
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
