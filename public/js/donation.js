document.addEventListener('DOMContentLoaded', () => {
  const donationForm = document.getElementById('donation-form');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const customAmountInput = document.getElementById('custom-donation-amount');
  const anonymousCheckbox = document.getElementById('donate-anonymously');
  const infoFieldsContainer = document.getElementById('donor-info-fields');
  const nameInput = document.getElementById('donor-name');
  const emailInput = document.getElementById('donor-email');
  const phoneInput = document.getElementById('donor-phone');

  // Load live raised amount on page load
  loadLiveRaisedSum();

  // Toggle donor info fields when anonymous checkbox changes
  if (anonymousCheckbox && infoFieldsContainer) {
    anonymousCheckbox.addEventListener('change', () => {
      if (anonymousCheckbox.checked) {
        infoFieldsContainer.style.maxHeight = '0';
        infoFieldsContainer.style.opacity = '0';
        infoFieldsContainer.style.overflow = 'hidden';
        if (nameInput) { nameInput.required = false; nameInput.value = ''; }
        if (emailInput) { emailInput.required = false; emailInput.value = ''; }
        if (phoneInput) { phoneInput.required = false; phoneInput.value = ''; }
      } else {
        infoFieldsContainer.style.maxHeight = '400px';
        infoFieldsContainer.style.opacity = '1';
        infoFieldsContainer.style.overflow = 'visible';
        if (nameInput) nameInput.required = true;
        if (emailInput) emailInput.required = true;
        if (phoneInput) phoneInput.required = true;
      }
    });
  }

  // Preset amount buttons
  if (presetButtons && customAmountInput) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        customAmountInput.value = btn.dataset.amount;
        customAmountInput.dispatchEvent(new Event('input'));
      });
    });

    customAmountInput.addEventListener('input', () => {
      // Clear preset active if user types a custom value not matching any preset
      const val = customAmountInput.value.trim();
      const matchesPreset = Array.from(presetButtons).some(b => b.dataset.amount === val);
      if (!matchesPreset) presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  // Donation form submit handler
  if (donationForm) {
    donationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isAnonymous = anonymousCheckbox && anonymousCheckbox.checked;

      // Validate donor info if not anonymous
      if (!isAnonymous) {
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';

        if (!name) {
          showNotification('Please enter your full name or choose to donate anonymously.', 'error');
          nameInput && nameInput.focus();
          return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showNotification('Please enter a valid email address.', 'error');
          emailInput && emailInput.focus();
          return;
        }
        if (!phone) {
          showNotification('Please enter your phone number.', 'error');
          phoneInput && phoneInput.focus();
          return;
        }
      }

      const amountValue = customAmountInput ? customAmountInput.value.trim() : '';
      if (!amountValue) {
        showNotification('Please select or enter a donation amount.', 'error');
        customAmountInput && customAmountInput.focus();
        return;
      }

      const amount = parseFloat(amountValue);
      if (isNaN(amount) || amount < 100) {
        showNotification('Minimum donation amount is KES 100.', 'error');
        return;
      }

      const donorName = isAnonymous ? 'Anonymous' : (nameInput ? nameInput.value.trim() : 'Anonymous');
      const donorEmail = isAnonymous ? `anon_${Date.now()}@dta-ngo.org` : (emailInput ? emailInput.value.trim() : '');
      const donorPhone = isAnonymous ? '' : (phoneInput ? phoneInput.value.trim() : '');

      const submitBtn = donationForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerText : 'Donate';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Initializing...';
      }

      try {
        // Fetch Paystack public key from backend
        const configRes = await fetch('/api/config/paystack');
        const configData = await configRes.json();
        const publicKey = configData.publicKey;

        // Generate unique transaction reference
        const reference = 'DTA-' + Date.now() + '-' + Math.floor(Math.random() * 100000);

        if (!publicKey || publicKey === 'pk_test_developer_mock_key') {
          // Developer/offline mode - show simulation dialog
          simulatePaystackCheckout({ donorName, donorEmail, donorPhone, amount, reference, submitBtn, originalText });
        } else {
          // Live/Test mode - use Paystack Inline popup
          initiatePaystackCheckout({ publicKey, donorName, donorEmail, donorPhone, amount, reference, submitBtn, originalText });
        }
      } catch (err) {
        console.error('Error starting donation flow:', err);
        showNotification('Could not connect to payment server. Please try again.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalText;
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYSTACK INLINE CHECKOUT (Real integration)
// ─────────────────────────────────────────────────────────────────────────────
function initiatePaystackCheckout({ publicKey, donorName, donorEmail, donorPhone, amount, reference, submitBtn, originalText }) {
  if (typeof PaystackPop === 'undefined') {
    showNotification('Payment gateway is loading. Please try again in a moment.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
    return;
  }

  if (submitBtn) submitBtn.innerText = 'Opening checkout...';

  const handler = PaystackPop.setup({
    key: publicKey,
    email: donorEmail,
    amount: Math.round(amount * 100), // Paystack expects kobo (smallest unit)
    currency: 'KES',
    ref: reference,
    firstname: donorName !== 'Anonymous' ? donorName.split(' ')[0] : '',
    lastname: donorName !== 'Anonymous' ? donorName.split(' ').slice(1).join(' ') : '',
    phone: donorPhone || undefined,
    label: donorName,
    metadata: {
      custom_fields: [
        {
          display_name: 'Donor Name',
          variable_name: 'donor_name',
          value: donorName
        },
        {
          display_name: 'Phone Number',
          variable_name: 'donor_phone',
          value: donorPhone || 'N/A'
        }
      ]
    },
    callback: function(response) {
      // Payment completed on Paystack side - verify on backend
      const ref = response.reference || reference;
      if (submitBtn) submitBtn.innerText = 'Verifying payment...';
      verifyOnBackend({ reference: ref, donorName, donorEmail, donorPhone, amount, submitBtn, originalText });
    },
    onClose: function() {
      // User closed the popup without completing
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
      showNotification('Payment window closed. Your donation was not completed.', 'info');
    }
  });

  handler.openIframe();
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER SIMULATION OVERLAY (When no real API key is set)
// ─────────────────────────────────────────────────────────────────────────────
function simulatePaystackCheckout({ donorName, donorEmail, donorPhone, amount, reference, submitBtn, originalText }) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    backgroundColor: 'rgba(10, 17, 40, 0.75)',
    backdropFilter: 'blur(6px)',
    zIndex: '9999',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'fadeIn 0.25s ease'
  });

  const formattedAmount = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);

  overlay.innerHTML = `
    <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 36px 28px; width: 100%; max-width: 420px; box-shadow: var(--shadow-lg); text-align: center; border: 1px solid var(--border-light); position: relative;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #0ca678 0%, #099268 100%); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">₦</div>
      <h3 style="font-size: 20px; margin-bottom: 4px; font-family: var(--font-heading);">DTA Checkout (Test Mode)</h3>
      <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">Add your Paystack API keys in <code>.env</code> to enable live payments.</p>

      <div style="background: var(--bg-primary); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 20px; text-align: left; font-size: 14px; border: 1px solid var(--border-light);">
        <div style="margin-bottom: 8px;"><strong>Donor:</strong> ${escapeHTML(donorName)}</div>
        <div style="margin-bottom: 8px;"><strong>Email:</strong> ${escapeHTML(donorEmail)}</div>
        ${donorPhone ? `<div style="margin-bottom: 8px;"><strong>Phone:</strong> ${escapeHTML(donorPhone)}</div>` : ''}
        <div style="margin-bottom: 8px;"><strong>Amount:</strong> ${formattedAmount}</div>
        <div style="font-size: 12px; color: var(--text-muted);"><strong>Ref:</strong> <code>${reference}</code></div>
      </div>

      <div style="display: flex; gap: 12px;">
        <button id="sim-success-btn" style="flex:1; padding: 12px 0; border-radius: var(--radius-full); border: none; background: linear-gradient(135deg, #0ca678, #099268); color: #fff; font-family: var(--font-heading); font-weight: 700; cursor: pointer; font-size: 15px; transition: opacity 0.2s ease;">✓ Simulate Success</button>
        <button id="sim-cancel-btn" style="flex:1; padding: 12px 0; border-radius: var(--radius-full); border: 1px solid var(--border-light); background: transparent; color: var(--text-dark); font-family: var(--font-heading); font-weight: 600; cursor: pointer; font-size: 15px; transition: opacity 0.2s ease;">✕ Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('sim-success-btn').addEventListener('click', () => {
    overlay.remove();
    if (submitBtn) submitBtn.innerText = 'Verifying...';
    verifyOnBackend({ reference, donorName, donorEmail, donorPhone, amount, submitBtn, originalText });
  });

  document.getElementById('sim-cancel-btn').addEventListener('click', () => {
    overlay.remove();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = originalText; }
    showNotification('Donation cancelled.', 'info');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND VERIFICATION — Posts to /api/donate/verify
// ─────────────────────────────────────────────────────────────────────────────
async function verifyOnBackend({ reference, donorName, donorEmail, donorPhone, amount, submitBtn, originalText }) {
  try {
    const res = await fetch('/api/donate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        donor_name: donorName,
        donor_email: donorEmail,
        donor_phone: donorPhone,
        amount
      })
    });

    const data = await res.json();

    if (data.success) {
      // Reset form
      const form = document.getElementById('donation-form');
      if (form) form.reset();
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));

      // Restore anonymous fields visibility
      const infoFields = document.getElementById('donor-info-fields');
      if (infoFields) {
        infoFields.style.maxHeight = '400px';
        infoFields.style.opacity = '1';
        infoFields.style.overflow = 'visible';
      }

      showDonationSuccessModal(donorName, amount, reference);
      loadLiveRaisedSum(); // refresh live total
    } else {
      showNotification(data.message || 'Donation verification failed. Please contact us if payment was deducted.', 'error');
    }
  } catch (err) {
    console.error('Verification error:', err);
    showNotification('Network error during verification. Please contact support if payment was deducted.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DONATION SUCCESS MODAL
// ─────────────────────────────────────────────────────────────────────────────
function showDonationSuccessModal(donorName, amount, reference) {
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    backgroundColor: 'rgba(10, 17, 40, 0.75)',
    backdropFilter: 'blur(6px)',
    zIndex: '9999',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  });

  const formattedAmount = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
  const displayName = (donorName && donorName !== 'Anonymous') ? donorName : 'Generous Friend';

  modal.innerHTML = `
    <div style="background: var(--bg-secondary); border-radius: var(--radius-lg); padding: 48px 36px; width: 100%; max-width: 480px; box-shadow: var(--shadow-lg); text-align: center; border: 1px solid var(--border-light); animation: fadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
      <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #0ca678 0%, #099268 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto; font-size: 36px; color: white; box-shadow: 0 8px 24px rgba(12, 166, 120, 0.4);">✓</div>
      <h3 style="font-size: 26px; margin-bottom: 8px; font-family: var(--font-heading);">Thank You, ${escapeHTML(displayName)}!</h3>
      <p style="color: var(--color-green-primary); font-weight: 700; font-size: 20px; margin-bottom: 16px;">${formattedAmount} Received</p>
      <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 28px; line-height: 1.6;">Your generous contribution empowers women farmers, keeps girls in school, and funds climate restoration in Kenya. Together we are building a cleaner, fairer world. 🌿</p>
      <div style="font-size: 12px; color: var(--text-muted); padding: 10px 16px; background: var(--bg-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-family: monospace; display: inline-block; margin-bottom: 28px;">
        Ref: ${escapeHTML(reference)}
      </div>
      <div>
        <button id="close-success-modal" class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 16px;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('close-success-modal').addEventListener('click', () => modal.remove());
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE RAISED SUM — Fetches public stats
// ─────────────────────────────────────────────────────────────────────────────
async function loadLiveRaisedSum() {
  const el = document.getElementById('live-raised-sum');
  if (!el) return;

  try {
    const res = await fetch('/api/public/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      el.innerText = new Intl.NumberFormat('en-KE', {
        style: 'currency', currency: 'KES', maximumFractionDigits: 0
      }).format(data.stats.totalRaised || 0);
    }
  } catch (err) {
    // Fail silently - element retains default value
    console.warn('Could not load live stats:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML ESCAPE UTILITY
// ─────────────────────────────────────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
