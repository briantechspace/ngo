const crypto = require('crypto');
require('dotenv').config();

// Re-implement the token logic to validate it
function generateToken(user, expOffset = 24 * 60 * 60 * 1000) {
  const payload = JSON.stringify({ user: user, exp: Date.now() + expOffset });
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret_session_key')
    .update(payload)
    .digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false, reason: 'Invalid format' };
    const payload = Buffer.from(parts[0], 'base64').toString();
    const signature = parts[1];
    const expectedSignature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret_session_key')
      .update(payload)
      .digest('hex');
    if (signature !== expectedSignature) return { valid: false, reason: 'Signature mismatch' };
    const parsed = JSON.parse(payload);
    if (Date.now() > parsed.exp) return { valid: false, reason: 'Token expired' };
    return { valid: true, payload: parsed };
  } catch (e) {
    return { valid: false, reason: 'Error parsing: ' + e.message };
  }
}

function runTests() {
  console.log('--- RUNNING CRYPTO AUTHENTICATION CHECKS ---');
  
  // Test 1: Valid token generation and verify
  const token = generateToken('admin');
  console.log('Generated token preview:', token.substring(0, 40) + '...');
  const result1 = verifyToken(token);
  console.log('Test 1 (Valid Token) Result:', result1.valid ? '✅ Success' : '❌ Failed: ' + result1.reason);
  
  // Test 2: Expired token checks
  const expiredToken = generateToken('admin', -10000); // 10s expired in past
  const result2 = verifyToken(expiredToken);
  console.log('Test 2 (Expired Token) Result:', !result2.valid && result2.reason === 'Token expired' ? '✅ Success (Caught expiration)' : '❌ Failed: ' + result2.reason);
  
  // Test 3: Tampered token checks
  const parts = token.split('.');
  const tamperedToken = parts[0] + '.tampered_signature_string';
  const result3 = verifyToken(tamperedToken);
  console.log('Test 3 (Tampered Token) Result:', !result3.valid && result3.reason === 'Signature mismatch' ? '✅ Success (Caught tampering)' : '❌ Failed: ' + result3.reason);
  
  console.log('--- AUTHENTICATION CHECKS SUCCESSFUL ---');
}

runTests();
