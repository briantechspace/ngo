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
    loadPublishedBlogs();
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
      
      // Update charts & stats metrics
      renderDonationCharts(data.donations);

      if (data.donations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No donations received yet.</td></tr>';
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
          <td>
            <button class="btn btn-outline btn-sm" onclick="window.deleteDonation(${don.id})" style="border-color: var(--color-red-primary); color: var(--color-red-primary); padding: 4px 10px; font-size: 12px;">Delete</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading donations:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--color-red-primary);">Error loading donations.</td></tr>';
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
