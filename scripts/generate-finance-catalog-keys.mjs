import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
console.log('FINANCE_CATALOG_PRIVATE_KEY:');
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));
console.log('FINANCE_CATALOG_PUBLIC_KEY:');
console.log(publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Guarde a chave privada apenas nas variaveis protegidas da Vercel. O Gateway recebe somente a chave publica.');
