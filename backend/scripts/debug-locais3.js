const axios = require('axios');

const ORIGIN_USER = process.env.ORIGIN_USER;
const ORIGIN_PASS = process.env.ORIGIN_PASS;
if (!ORIGIN_USER || !ORIGIN_PASS) {
  throw new Error('Set ORIGIN_USER and ORIGIN_PASS before running debug-locais3.js');
}

(async () => {
  const loginPage = await axios.get('https://sistema.redeintermidia.com/login', {
    timeout: 15000, validateStatus: () => true, maxRedirects: 0
  });
  const cookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  
  await axios.post('https://sistema.redeintermidia.com/login/verifica', 
    `login=${encodeURIComponent(ORIGIN_USER)}&senha=${encodeURIComponent(ORIGIN_PASS)}`,
    { headers: {'Content-Type':'application/x-www-form-urlencoded', Cookie: cookies}, maxRedirects: 0, timeout: 15000, validateStatus: () => true }
  );
  
  const resp = await axios.get('https://sistema.redeintermidia.com/locais/monitores', {
    headers: { Cookie: cookies }, timeout: 30000, validateStatus: () => true
  });
  
  const html = resp.data;
  
  // Parse location headers
  const locPattern = /<th class="col-md-3 local"><b>([^<]+)<\/b><\/th>/g;
  let m;
  const locations = [];
  while ((m = locPattern.exec(html)) !== null) {
    locations.push({ raw: m[1], index: m.index });
  }
  
  // Build monitor -> location mapping using <tr data-id="XXX"> rows
  const mapping = {}; // monitorId -> { location, city }
  
  for (let i = 0; i < locations.length; i++) {
    const start = locations[i].index;
    const end = i + 1 < locations.length ? locations[i + 1].index : html.length;
    const section = html.substring(start, end);
    
    // Clean location name: remove " - N monitor(es)" suffix
    const locRaw = locations[i].raw;
    const locName = locRaw.replace(/\s*-\s*\d+\s+monit\w+\s*$/, '').trim();
    
    // Find monitors from <tr data-id="XXX">
    const trPattern = /tr_listagem"?\s+data-id="(\d+)"/g;
    let tm;
    while ((tm = trPattern.exec(section)) !== null) {
      const monId = parseInt(tm[1]);
      
      // Find city for this row
      const rowStart = tm.index;
      const rowEnd = section.indexOf('</tr>', rowStart);
      const row = section.substring(rowStart, rowEnd > 0 ? rowEnd : rowStart + 2000);
      
      // City is in <td class="col-md-1">CITY</td> (last simple td)
      const cityMatch = row.match(/<td class="col-md-1">([^<]+)<\/td>/);
      const city = cityMatch ? cityMatch[1].trim() : '';
      
      mapping[monId] = { location: locName, city };
    }
  }
  
  const monitorIds = Object.keys(mapping);
  console.log(`Total monitors mapped: ${monitorIds.length}`);
  
  // Show first 10
  console.log('\nFirst 10 mappings:');
  monitorIds.slice(0, 10).forEach(id => {
    console.log(`  Monitor ${id} -> Location: "${mapping[id].location}" | City: "${mapping[id].city}"`);
  });
  
  // Output as JSON
  console.log('\n=== FULL MAPPING JSON ===');
  console.log(JSON.stringify(mapping));
})().catch(e => console.error(e.message));
