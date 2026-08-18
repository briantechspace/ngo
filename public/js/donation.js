document.addEventListener('DOMContentLoaded', () => {
  const donationForm = document.getElementById('donation-form');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const customAmountInput = document.getElementById('custom-donation-amount');
  const anonymousCheckbox = document.getElementById('donate-anonymously');
  const nameInput = document.getElementById('donor-name');
  const emailInput = document.getElementById('donor-email');
  const phoneInput = document.getElementById('donor-phone');
  const nameGroup = nameInput ? nameInput.closest('.form-group') : null;
  const emailGroup = emailInput ? emailInput.closest('.form-group') : null;

  loadLiveRaisedSum();

  if (anonymousCheckbox) {
    anonymousCheckbox.addEventListener('change', () => {
      const isAnon = anonymousCheckbox.checked;
      if (nameGroup) {
        nameGroup.style.display = isAnon ? 'none' : 'block';
        if (nameInput) nameInput.required = !isAnon;
      }
      if (emailGroup) {
        emailGroup.style.display = isAnon ? 'none' : 'block';
        if (emailInput) emailInput.required = !isAnon;
      }
    });
  }

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
      const val = customAmountInput.value.trim();
      const matchesPreset = Array.from(presetButtons).some(b => b.dataset.amount === val);
      if (!matchesPreset) presetButtons.forEach(b => b.classList.remove('active'));
    });
  }

  if (donationForm) {
    donationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isAnonymous = anonymousCheckbox && anonymousCheckbox.checked;
      const phone = phoneInput ? phoneInput.value.trim() : '';

      if (!phone) {
        showNotification('Please enter your M-PESA phone number to receive the prompt.', 'error');
        phoneInput && phoneInput.focus();
        return;
      }

      let name = 'Anonymous';
      let email = `anon_${Date.now()}@dta-ngo.org`;

      if (!isAnonymous) {
        name = nameInput ? nameInput.value.trim() : '';
        email = emailInput ? emailInput.value.trim() : '';

        if (!name) {
          showNotification('Please enter your full name or select "Donate Anonymously".', 'error');
          nameInput && nameInput.focus();
          return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showNotification('Please enter a valid email address.', 'error');
          emailInput && emailInput.focus();
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
      if (isNaN(amount) || amount < 10) {
        showNotification('Minimum donation amount is KES 10.', 'error');
        return;
      }

      const submitBtn = donationForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : 'Donate';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ Sending M-PESA Prompt...</span>';
      }

      try {
        const res = await fetch('/api/donation/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            donor_name: name,
            donor_email: email,
            donor_phone: phone,
            amount: amount,
            isAnonymous: isAnonymous
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          const checkoutId = data.data.checkout_request_id;
          const formattedPhone = data.data.phone_number || phone;
          const isMock = !!data._mock;

          showNotification(data.message || 'M-PESA prompt sent to your phone!', 'success');

          openMpesaStkModal({
            checkoutId,
            phone: formattedPhone,
            amount,
            isMock,
            onComplete: () => {
              donationForm.reset();
              presetButtons.forEach(b => b.classList.remove('active'));
              loadLiveRaisedSum();
            }
          });
        } else {
          showNotification(data.message || 'Could not initiate M-PESA payment. Please verify your phone number.', 'error');
        }
      } catch (err) {
        showNotification('Connection error. Please check your network and try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }
});

function openMpesaStkModal({ checkoutId, phone, amount, isMock, onComplete }) {
  const existingModal = document.getElementById('mpesa-stk-modal-overlay');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'mpesa-stk-modal-overlay';
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(10, 17, 40, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.3s ease;
  `;

  modalOverlay.innerHTML = `
    <div style="background: #ffffff; width: 100%; max-width: 440px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; border: 1px solid #e2e8f0; text-align: center; position: relative;" id="mpesa-modal-card">
      <div style="background: linear-gradient(135deg, #008751 0%, #00a86b 100%); padding: 24px 20px; color: #ffffff; position: relative;">
        <button id="close-stk-modal-btn" style="position: absolute; right: 16px; top: 16px; background: rgba(0,0,0,0.2); border: none; color: #ffffff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;" aria-label="Close">&times;</button>
        <div style="font-size: 32px; margin-bottom: 4px;">📱</div>
        <h3 style="color: #ffffff; font-size: 20px; margin: 0; font-family: var(--font-heading, sans-serif);">M-PESA STK Push</h3>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Powered by UpesiPay</p>
      </div>

      <div style="padding: 28px 24px;" id="stk-modal-body">
        <div id="stk-waiting-state">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px auto; border: 4px solid #e2e8f0; border-top: 4px solid #008751; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <h4 style="font-size: 18px; color: #1e293b; margin-bottom: 8px;">Check Your Phone</h4>
          <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
            An M-PESA STK prompt has been sent to <strong>${phone}</strong> for <strong>KES ${Number(amount).toLocaleString()}</strong>.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-size: 13px; color: #334155; margin-bottom: 20px;">
            💡 Enter your <strong>M-PESA PIN</strong> on your mobile handset to authorize this contribution.
          </div>

          <div style="font-size: 12px; color: #94a3b8;" id="stk-countdown-text">
            Waiting for confirmation... (<span id="stk-seconds-left">60</span>s)
          </div>

          ${isMock ? `
            <div style="margin-top: 18px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
              <span style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 999px; font-weight: bold;">DEV SIMULATION</span>
              <p style="font-size: 12px; color: #64748b; margin: 6px 0 10px 0;">Click below to simulate PIN authorization:</p>
              <button id="sim-confirm-btn" style="background: #008751; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; width: 100%;">
                ✓ Simulate PIN Entered (Confirm KES ${amount})
              </button>
            </div>
          ` : ''}
        </div>

        <div id="stk-success-state" style="display: none;">
          <div style="width: 64px; height: 64px; background: #dcfce7; color: #15803d; border-radius: 50%; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">✓</div>
          <h4 style="font-size: 22px; color: #15803d; margin-bottom: 8px;">Donation Confirmed!</h4>
          <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin-bottom: 18px;">
            Thank you for your generous contribution of <strong>KES ${Number(amount).toLocaleString()}</strong> to Doorway to Acceptance (DTA).
          </p>
          <p style="font-size: 13px; color: #475569; margin-bottom: 20px;">
            Your support directly fuels grassroots girls empowerment and climate resilience in Kenya.
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/receipt?ref=${encodeURIComponent(checkoutId)}" target="_blank" style="background: #008751; color: white; text-decoration: none; padding: 12px 20px; border-radius: 9999px; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              📄 Download Official Receipt
            </a>
            <button id="stk-done-btn" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 10px 24px; border-radius: 9999px; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%;">
              Done
            </button>
          </div>
        </div>

        <div id="stk-failed-state" style="display: none;">
          <div style="width: 64px; height: 64px; background: #fee2e2; color: #b91c1c; border-radius: 50%; font-size: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">✕</div>
          <h4 style="font-size: 20px; color: #b91c1c; margin-bottom: 8px;">Payment Not Completed</h4>
          <p id="stk-fail-reason" style="color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            The transaction was cancelled or timed out. Please verify your M-PESA balance and try again.
          </p>
          <button id="stk-retry-btn" style="background: #e2e8f0; color: #1e293b; border: none; padding: 12px 24px; border-radius: 9999px; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%;">
            Try Again
          </button>
        </div>

      </div>
    </div>
  `;

  if (!document.getElementById('stk-spinner-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'stk-spinner-style';
    styleEl.textContent = `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(styleEl);
  }

  document.body.appendChild(modalOverlay);

  const closeBtn = document.getElementById('close-stk-modal-btn');
  const doneBtn = document.getElementById('stk-done-btn');
  const retryBtn = document.getElementById('stk-retry-btn');
  const simBtn = document.getElementById('sim-confirm-btn');

  let pollInterval = null;
  let countdownTimer = null;
  let secondsRemaining = 60;

  const cleanupModal = () => {
    if (pollInterval) clearInterval(pollInterval);
    if (countdownTimer) clearInterval(countdownTimer);
    modalOverlay.remove();
  };

  closeBtn && closeBtn.addEventListener('click', cleanupModal);
  doneBtn && doneBtn.addEventListener('click', cleanupModal);
  retryBtn && retryBtn.addEventListener('click', cleanupModal);

  if (simBtn) {
    simBtn.addEventListener('click', async () => {
      simBtn.disabled = true;
      simBtn.innerText = 'Simulating...';
      try {
        await fetch('/api/donation/simulate-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkout_request_id: checkoutId })
        });
      } catch (e) {}
    });
  }

  pollInterval = setInterval(async () => {
    try {
      const statusRes = await fetch(`/api/donation/status/${encodeURIComponent(checkoutId)}`);
      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.status === 'success') {
          clearInterval(pollInterval);
          clearInterval(countdownTimer);
          document.getElementById('stk-waiting-state').style.display = 'none';
          document.getElementById('stk-success-state').style.display = 'block';
          onComplete && onComplete();
        } else if (['failed', 'cancelled', 'timeout'].includes(data.status)) {
          clearInterval(pollInterval);
          clearInterval(countdownTimer);
          document.getElementById('stk-waiting-state').style.display = 'none';
          document.getElementById('stk-failed-state').style.display = 'block';
        }
      }
    } catch (e) {}
  }, 2500);

  countdownTimer = setInterval(() => {
    secondsRemaining -= 1;
    const secEl = document.getElementById('stk-seconds-left');
    if (secEl) secEl.innerText = secondsRemaining;

    if (secondsRemaining <= 0) {
      clearInterval(pollInterval);
      clearInterval(countdownTimer);
      const waitingState = document.getElementById('stk-waiting-state');
      const failedState = document.getElementById('stk-failed-state');
      if (waitingState && failedState && waitingState.style.display !== 'none') {
        waitingState.style.display = 'none';
        failedState.style.display = 'block';
        const failReason = document.getElementById('stk-fail-reason');
        if (failReason) failReason.innerText = 'The request timed out before confirmation. If your M-PESA balance was deducted, our system will automatically credit the donation once the callback arrives.';
      }
    }
  }, 1000);
}

async function loadLiveRaisedSum() {
  const sumElement = document.getElementById('live-raised-sum');
  if (!sumElement) return;

  try {
    const res = await fetch('/api/public/stats');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.stats) {
        const total = parseFloat(data.stats.totalRaised) || 0;
        sumElement.innerText = `KES ${total.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  } catch (err) {}
}
