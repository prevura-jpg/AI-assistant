const { GoogleAuth } = require('google-auth-library');
const path = require('path');

const auth = new GoogleAuth({
  keyFile: path.join(__dirname, '../../key/gemini-service-account.json'),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAuthClient() {
  return await auth.getClient();
}

module.exports = { getAuthClient };