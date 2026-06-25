document.addEventListener('DOMContentLoaded', () => {
  // 1. Sticky Header scroll effect
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // 2. Mobile Drawer Hamburger Menu
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    // Create backdrop overlay element dynamically
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    const closeMobileMenu = () => {
      navLinks.classList.remove('open');
      overlay.classList.remove('active');
      const lines = hamburger.querySelectorAll('span');
      lines[0].style.transform = 'none';
      lines[1].style.opacity = '1';
      lines[2].style.transform = 'none';
    };

    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      overlay.classList.toggle('active', isOpen);
      
      // Animate hamburger lines
      const lines = hamburger.querySelectorAll('span');
      if (isOpen) {
        lines[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        lines[1].style.opacity = '0';
        lines[2].style.transform = 'rotate(-45deg) translate(7px, -7px)';
      } else {
        lines[0].style.transform = 'none';
        lines[1].style.opacity = '1';
        lines[2].style.transform = 'none';
      }
    });

    // Close menu when clicking outside (on overlay)
    overlay.addEventListener('click', closeMobileMenu);

    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  // 3. Global Search Bar Redirection
  const searchForm = document.getElementById('global-search-form');
  const searchInput = document.getElementById('global-search-input');

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        window.location.href = `/blogs.html?search=${encodeURIComponent(query)}`;
      }
    });
  }
});

// 4. Global Toast Notification Banner Utility
function showNotification(message, type = 'success', duration = 5000) {
  // Remove existing banner if any
  const existingBanner = document.querySelector('.alert-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  // Create notification container
  const banner = document.createElement('div');
  banner.className = `alert-banner ${type}`;
  
  // Icon / Content
  let icon = '🔔';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';

  banner.innerHTML = `
    <span>${icon}</span>
    <div style="flex-grow: 1;">${message}</div>
    <button onclick="this.parentElement.remove()">&times;</button>
  `;

  document.body.appendChild(banner);

  // Auto remove
  setTimeout(() => {
    if (banner.parentElement) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(20px)';
      banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      setTimeout(() => banner.remove(), 400);
    }
  }, duration);
}
