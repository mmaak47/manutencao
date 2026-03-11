const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const BASE = 'https://sistema.redeintermidia.com';

async function test() {
  // Login
  const loginPage = await axios.get(`${BASE}/login`, {
    httpsAgent: agent, timeout: 15000, validateStatus: () => true, maxRedirects: 0
  });
  const cookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  await axios.post(`${BASE}/login/verifica`, 
    `login=${encodeURIComponent('Intermidia')}&senha=${encodeURIComponent('Intermidia2025@')}`,
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies },
      maxRedirects: 0, timeout: 15000, httpsAgent: agent, validateStatus: () => true
    }
  );

  // Call the AJAX endpoint for dashboard data
  const now = new Date();
  const mes = now.getMonth() + 1; // 1-12
  const ano = now.getFullYear();
  
  const resp = await axios.get(`${BASE}/premium/ajax-dashboard-data?mes=${mes}&ano=${ano}`, {
    headers: { Cookie: cookies },
    httpsAgent: agent, timeout: 30000, validateStatus: () => true
  });
  
  console.log('Response type:', typeof resp.data);
  console.log('Is JSON:', typeof resp.data === 'object');
  
  if (typeof resp.data === 'object') {
    // Print keys
    console.log('Top-level keys:', Object.keys(resp.data));
    
    // Print contratos_vencer
    if (resp.data.contratos_vencer) {
      const cv = resp.data.contratos_vencer;
      console.log('\n--- CONTRATOS A VENCER ---');
      console.log('Este mês:', cv.este_mes);
      console.log('Próximo mês:', cv.proximo_mes);
      console.log('Lista count:', cv.lista ? cv.lista.length : 0);
      if (cv.lista && cv.lista.length) {
        console.log('\nFirst 5 contracts:');
        for (let i = 0; i < Math.min(5, cv.lista.length); i++) {
          console.log(JSON.stringify(cv.lista[i]));
        }
      }
    }
  } else {
    console.log('Response (first 2000):', String(resp.data).substring(0, 2000));
  }
}
test().catch(e => console.error(e.message));
