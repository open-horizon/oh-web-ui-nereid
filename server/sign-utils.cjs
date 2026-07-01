const crypto = require('crypto');

// Generate RSA key pair for deployment signing
// SPKI format for public key (standard), PKCS#1 PEM for private key (Open Horizon compatible)
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return { publicKey, privateKey };
}

// Sign a deployment JSON string using RSA-PSS SHA-256
// salt length is set to digest size (SHA-256 = 32 bytes) as required by Open Horizon
function signDeployment(deploymentStr, privateKeyPem) {
  const sign = crypto.createSign('sha256');
  sign.update(deploymentStr, 'utf8');
  sign.end();
  return sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALT_LENGTH_DIGEST,
  }, 'base64');
}

// Extract deployment string from a service object, converting from object if needed
function getDeploymentString(service) {
  if (typeof service.deployment === 'string') return service.deployment;
  return JSON.stringify(service.deployment);
}

// Convenience function: generate keys and sign deployment in one call
// Returns the signed deployment string, base64 signature, and PEM public key
function genAndSign(deploymentObj) {
  const keys = generateKeyPair();
  const depStr = typeof deploymentObj === 'string' ? deploymentObj : JSON.stringify(deploymentObj);
  const sig = signDeployment(depStr, keys.privateKey);
  return { deployment: depStr, deploymentSignature: sig, publicKey: keys.publicKey };
}

module.exports = { generateKeyPair, signDeployment, getDeploymentString, genAndSign };
