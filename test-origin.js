const https = require('https');
const axios = require('/home/intermidia/app/backend/node_modules/axios');

const agent = new https.Agent({ rejectUnauthorized: false });

console.log('Testing origin connectivity...');
console.log('1. Testing HTTPS with rejectUnauthorized: false');

axios.get('https://sistema.redeintermidia.com/login', {
  timeout: 15000,
  httpsAgent: agent
})
.then(r => {
  console.log('SUCCESS! Status:', r.status, 'Length:', r.data.length);
  console.log('Contains login form:', r.data.includes('login/verifica'));
  
  // Now test the full login flow
  console.log('\n2. Testing login...');
  const initCookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  console.log('Got cookies:', initCookies ? 'YES' : 'NO');
  
  return axios.post('https://sistema.redeintermidia.com/login/verifica',
    'login=Intermidia&senha=Intermidia2025%40',
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: initCookies },
      maxRedirects: 0,
      timeout: 15000,
      httpsAgent: agent,
      validateStatus: () => true
    }
  ).then(r2 => {
    console.log('Login response status:', r2.status);
    console.log('Login redirect:', r2.headers.location || 'none');
    
    // Try fetching monitor page
    console.log('\n3. Testing monitor page...');
    return axios.get('https://sistema.redeintermidia.com/index/index3', {
      headers: { Cookie: initCookies },
      timeout: 20000,
      httpsAgent: agent,
      maxRedirects: 5,
      validateStatus: () => true
    });
  }).then(r3 => {
    console.log('Monitor page status:', r3.status, 'Length:', r3.data.length);
    console.log('Has monitor data:', r3.data.includes('campanhas/monitor/'));
    const count = (r3.data.match(/campanhas\/monitor\//g) || []).length;
    console.log('Monitor count:', count);
  });
})
.catch(e => {
  console.log('FAIL:', e.code || '', e.message);
});
