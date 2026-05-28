const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

function getKey() {
  const hex = process.env.PATIENT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('PATIENT_ENCRYPTION_KEY must be a 64-char hex string in .env');
  return Buffer.from(hex, 'hex');
}

function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  const str = String(text);
  if (str.startsWith(ENC_PREFIX)) return str; // already encrypted
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(value) {
  if (!value || !String(value).startsWith(ENC_PREFIX)) return value;
  try {
    const payload = String(value).slice(ENC_PREFIX.length);
    const [ivHex, tagHex, encrypted] = payload.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return value; // return as-is if decryption fails (e.g. legacy plain data)
  }
}

// Encrypt each element of a string array
function encryptArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => encrypt(item));
}

// Decrypt each element of a string array
function decryptArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => decrypt(item));
}

// Apply decryption to a plain patient document object (mutates a copy)
function decryptPatientDoc(doc) {
  if (!doc) return doc;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (d.medicareNumber) d.medicareNumber = decrypt(d.medicareNumber);
  if (d.allergies) d.allergies = decryptArray(d.allergies);
  if (d.chronicConditions) d.chronicConditions = decryptArray(d.chronicConditions);
  return d;
}

module.exports = { encrypt, decrypt, encryptArray, decryptArray, decryptPatientDoc };
