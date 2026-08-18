document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
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

    overlay.addEventListener('click', closeMobileMenu);

    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  const searchForm = document.getElementById('global-search-form');
  const searchInput = document.getElementById('global-search-input');

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        window.location.href = `/blogs?search=${encodeURIComponent(query)}`;
      }
    });
  }

  document.querySelectorAll('.faq-accordion').forEach(accordion => {
    accordion.addEventListener('click', (e) => {
      const questionBtn = e.target.closest('.faq-question');
      if (!questionBtn) return;
      const item = questionBtn.closest('.faq-item');
      if (!item) return;

      const wasActive = item.classList.contains('active');
      
      accordion.querySelectorAll('.faq-item').forEach(otherItem => {
        otherItem.classList.remove('active');
      });

      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });
});

function showNotification(message, type = 'success', duration = 5000) {
  const existingBanner = document.querySelector('.alert-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement('div');
  banner.className = `alert-banner ${type}`;
  
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

  setTimeout(() => {
    if (banner.parentElement) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(20px)';
      banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      setTimeout(() => banner.remove(), 400);
    }
  }, duration);
}

async function handleNewsletterSubscribe(event, form) {
  event.preventDefault();
  const emailInput = form.querySelector('input[type="email"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    showNotification('Please enter your email address.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '...';
  }

  try {
    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.success) {
      showNotification(data.message || 'Thank you for subscribing!', 'success');
      form.reset();
    } else {
      showNotification(data.message || 'Subscription failed. Please try again.', 'error');
    }
  } catch (err) {
    showNotification('Connection error. Please try again later.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Join';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const slides = document.querySelectorAll('.quote-slide');
  const dots = document.querySelectorAll('#quote-carousel-dots .carousel-dot');
  if (slides.length === 0) return;

  let currentIndex = 0;
  let slideInterval = null;

  function showSlide(index) {
    slides.forEach((slide, idx) => {
      if (idx === index) {
        slide.style.opacity = '1';
        slide.style.transform = 'scale(1) translateY(0)';
        slide.style.pointerEvents = 'auto';
        slide.style.position = 'relative';
        slide.classList.add('active');
      } else {
        slide.style.opacity = '0';
        slide.style.transform = 'scale(0.95) translateY(20px)';
        slide.style.pointerEvents = 'none';
        slide.style.position = 'absolute';
        slide.classList.remove('active');
      }
    });

    dots.forEach((dot, idx) => {
      if (idx === index) {
        dot.style.backgroundColor = 'var(--color-red-primary)';
        dot.classList.add('active');
      } else {
        dot.style.backgroundColor = 'var(--border-light)';
        dot.classList.remove('active');
      }
    });

    currentIndex = index;
  }

  function nextSlide() {
    let nextIdx = (currentIndex + 1) % slides.length;
    showSlide(nextIdx);
  }

  function startAutoPlay() {
    stopAutoPlay();
    slideInterval = setInterval(nextSlide, 6000);
  }

  function stopAutoPlay() {
    if (slideInterval) clearInterval(slideInterval);
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.getAttribute('data-index'));
      showSlide(idx);
      startAutoPlay();
    });
  });

  startAutoPlay();
});
