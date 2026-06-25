document.addEventListener('DOMContentLoaded', () => {
  const donationForm = document.getElementById('donation-form');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const customAmountInput = document.getElementById('custom-donation-amount');

  // 1. Preset buttons click listeners
  if (presetButtons && customAmountInput) {
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active state
        presetButtons.forEach(b => b.classList.remove('active'));
        
        // Add active state to clicked
        btn.classList.add('active');
        
        // Set value in custom input
        customAmountInput.value = btn.dataset.amount;
      });
    });

    // Clear preset buttons if user types custom amount
    customAmountInput.addEventListener('input', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  // 2. Donation Form Submission listener
  if (donationForm) {
    donationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const donorName = document.getElementById('donor-name').value.trim();
      const donorEmail = document.getElementById('donor-email').value.trim();
      const amountValue = customAmountInput.value.trim();

      if (!donorEmail || !amountValue) {
        showNotification('Please provide your email and donation amount.', 'error');
        return;
      }

      const amount = parseFloat(amountValue);
      if (isNaN(amount) || amount <= 0) {
        showNotification('Please enter a valid donation amount greater than 0.', 'error');
        return;
      }

      // Disable button
      const submitBtn = donationForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Initializing payment...';

      try {
        // Fetch Paystack Public Key from server
        const configRes = await fetch('/api/config/paystack');
        const configData = await configRes.json();
        
        const publicKey = configData.publicKey;
        const reference = 'NGO-' + Date.now() + '-' + Math.round(Math.random() * 1000);

        if (publicKey === 'pk_test_developer_mock_key') {
          // If developer mode, display simulation dialog overlay
          simulatePaystackPayment({
            donorName,
            donorEmail,
            amount,
            reference,
            submitBtn,
            originalText
          });
        } else {
          // Trigger Paystack inline checkout
          payWithPaystack({
            key: publicKey,
            email: donorEmail,
            amount: amount * 100, // Paystack works in kobo
            currency: 'KES',
            ref: reference,
            metadata: {
              custom_fields: [
                {
                  display_name: "Donor Name",
                  variable_name: "donor_name",
                  value: donorName || "Anonymous"
                }
              ]
            },
            callback: function(response) {
              // On payment success, call backend verification
              verifyPaymentOnBackend(response.reference, donorName, donorEmail, amount, submitBtn, originalText);
            },
            onClose: function() {
              showNotification('Donation transaction cancelled.', 'info');
              submitBtn.disabled = false;
              submitBtn.innerText = originalText;
            }
          });
        }
      } catch (error) {
        console.error('Error starting donation transaction:', error);
        showNotification('Error connecting to payment processor. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }
});

// Paystack pop standard call
function payWithPaystack(options) {
  if (typeof PaystackPop === 'undefined') {
    // Lazy load standard Paystack script if missing
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => {
      const handler = PaystackPop.setup(options);
      handler.openIframe();
    };
    script.onerror = () => {
      showNotification('Failed to load Paystack payment library.', 'error');
    };
    document.head.appendChild(script);
  } else {
    const handler = PaystackPop.setup(options);
    handler.openIframe();
  }
}

// Simulated mock checkout modal for developers
function simulatePaystackPayment({ donorName, donorEmail, amount, reference, submitBtn, originalText }) {
  // Create overlay markup
  const overlay = document.createElement('div');
  overlay.id = 'dev-paystack-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(10, 17, 40, 0.7)';
  overlay.style.backdropFilter = 'blur(5px)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  // Format amount
  const formattedAmount = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES'
  }).format(amount);

  overlay.innerHTML = `
    <div style="background-color: var(--bg-secondary); border-radius: var(--radius-md); padding: 32px; width: 100%; max-width: 440px; box-shadow: var(--shadow-lg); text-align: center; border: 1px solid var(--border-light); animation: fadeIn 0.3s ease;">
      <div style="width: 60px; height: 60px; border-radius: 50%; background-color: var(--color-blue-light); color: var(--color-blue-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 18px; font-weight: bold;">DTA</div>
      <h3 style="font-size: 20px; margin-bottom: 8px;">DTA Sandbox Checkout</h3>
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 24px;">This overlay appears in simulation developer mode (Paystack credentials omitted).</p>
      
      <div style="background-color: var(--bg-primary); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 24px; text-align: left; font-size: 14px; border: 1px solid var(--border-light);">
        <div style="margin-bottom: 8px;"><strong>Donor:</strong> ${escapeHTML(donorName || 'Anonymous')}</div>
        <div style="margin-bottom: 8px;"><strong>Email:</strong> ${escapeHTML(donorEmail)}</div>
        <div style="margin-bottom: 8px;"><strong>Amount:</strong> ${formattedAmount}</div>
        <div><strong>Reference:</strong> <code style="font-size: 12px; color: var(--text-muted);">${reference}</code></div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button id="dev-paystack-success-btn" style="flex: 1; padding: 12px; border-radius: var(--radius-full); border: none; font-family: var(--font-heading); font-weight: bold; background-color: var(--color-green-primary); color: var(--text-light); cursor: pointer; transition: var(--transition-smooth);">Simulate Success</button>
        <button id="dev-paystack-cancel-btn" style="flex: 1; padding: 12px; border-radius: var(--radius-full); border: 1px solid var(--border-light); font-family: var(--font-heading); font-weight: bold; background-color: transparent; color: var(--text-dark); cursor: pointer; transition: var(--transition-smooth);">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Bind simulation controls
  document.getElementById('dev-paystack-success-btn').addEventListener('click', () => {
    overlay.remove();
    verifyPaymentOnBackend(reference, donorName, donorEmail, amount, submitBtn, originalText);
  });

  document.getElementById('dev-paystack-cancel-btn').addEventListener('click', () => {
    overlay.remove();
    showNotification('Donation transaction cancelled.', 'info');
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  });
}

// 3. API backend validation post
async function verifyPaymentOnBackend(reference, donorName, donorEmail, amount, submitBtn, originalText) {
  submitBtn.innerText = 'Verifying donation...';
  
  try {
    const res = await fetch('/api/donate/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reference,
        donor_name: donorName,
        donor_email: donorEmail,
        amount
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Clear form inputs
      const form = document.getElementById('donation-form');
      if (form) form.reset();
      
      const presetButtons = document.querySelectorAll('.preset-btn');
      presetButtons.forEach(b => b.classList.remove('active'));

      // Show success modal or simple custom notification
      showSuccessPopup(donorName, amount, reference);
      
      // Update donation stats on page if they are visible
      updateStatDisplay();
    } else {
      showNotification(data.message || 'Donation verification failed.', 'error');
    }
  } catch (error) {
    console.error('Error verifying donation:', error);
    showNotification('Connection error while verifying donation record.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
  }
}

// Donation success thank-you popup
function showSuccessPopup(donorName, amount, reference) {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.backgroundColor = 'rgba(10, 17, 40, 0.7)';
  modal.style.backdropFilter = 'blur(5px)';
  modal.style.zIndex = '9999';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  const formattedAmount = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES'
  }).format(amount);

  modal.innerHTML = `
    <div style="background-color: var(--bg-secondary); border-radius: var(--radius-lg); padding: 40px 32px; width: 100%; max-width: 480px; box-shadow: var(--shadow-lg); text-align: center; border: 1px solid var(--border-light); animation: fadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
      <div style="width: 72px; height: 72px; border-radius: 50%; background-color: var(--color-green-light); color: var(--color-green-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto; font-size: 32px;">🌟</div>
      <h3 style="font-size: 24px; margin-bottom: 8px;">Thank You, ${escapeHTML(donorName || 'Generous Friend')}!</h3>
      <p style="color: var(--color-blue-primary); font-weight: 600; font-size: 18px; margin-bottom: 16px;">Donation of ${formattedAmount} Received</p>
      <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 24px;">Your contribution empowers women farmers and funds climate restoration initiatives. Together, we are creating a cleaner, fairer, and brighter world.</p>
      
      <div style="font-size: 12px; color: var(--text-muted); padding: 8px 12px; background-color: var(--bg-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-family: monospace; display: inline-block; margin-bottom: 28px;">
        Ref: ${reference}
      </div>
      
      <div>
        <button id="close-thankyou-btn" class="btn btn-primary" style="width: 100%;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('close-thankyou-btn').addEventListener('click', () => {
    modal.remove();
  });
}

// Async dynamic stats updater
async function updateStatDisplay() {
  const sumEl = document.getElementById('live-raised-sum');
  if (!sumEl) return;

  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const formattedAmount = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        maximumFractionDigits: 0
      }).format(data.stats.totalRaised);
      sumEl.innerText = formattedAmount;
    }
  } catch (err) {
    console.error('Error updating live raised sum:', err);
  }
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
