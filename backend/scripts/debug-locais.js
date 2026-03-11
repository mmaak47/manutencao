const axios = require('axios');

(async () => {
  // Login
  const loginPage = await axios.get('https://sistema.redeintermidia.com/login', {
    timeout: 15000, validateStatus: () => true, maxRedirects: 0
  });
  const cookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  
  await axios.post('https://sistema.redeintermidia.com/login/verifica', 
    'login=Intermidia&senha=Intermidia2025%40',
    { headers: {'Content-Type':'application/x-www-form-urlencoded', Cookie: cookies}, maxRedirects: 0, timeout: 15000, validateStatus: () => true }
  );
  
  const resp = await axios.get('https://sistema.redeintermidia.com/locais/monitores', {
    headers: { Cookie: cookies }, timeout: 30000, validateStatus: () => true
  });
  
  const html = resp.data;
  console.log('HTML length:', html.length);
  console.log('Has login form:', html.includes('/login/verifica'));
  
  // Find the first table or location group
  const patterns = ['<table', '<tr', 'monitor', 'local', 'Arnaldo', 'BIG WHEEL', 'LONDRINA', 'Orientação', 'Status'];
  for (const p of patterns) {
    const i = html.indexOf(p);
    console.log(`"${p}":`, i > 0 ? `found at ${i}` : 'NOT FOUND');
  }
  
  // Find first location group header
  const groupIdx = html.indexOf('monitores');
  if (groupIdx > 0) {
    // Look for table structure
    const tableIdx = html.indexOf('<table', Math.max(0, groupIdx - 2000));
    if (tableIdx > 0) {
      console.log('\n=== TABLE AREA (first 3000 chars) ===');
      console.log(html.substring(tableIdx, tableIdx + 3000));
    }
  }
  
  // Also look for the location group row pattern
  const locHeaderIdx = html.indexOf('monitores</');
  if (locHeaderIdx > 0) {
    console.log('\n=== AROUND "monitores</" ===');
    console.log(html.substring(locHeaderIdx - 500, locHeaderIdx + 500));
  }
})().catch(e => console.error(e.message));
