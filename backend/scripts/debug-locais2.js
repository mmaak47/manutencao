const axios = require('axios');

(async () => {
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
  
  // Parse all location groups: each is a <table> with header containing location name
  // Location pattern: <th class="col-md-3 local"><b>LOCATION_NAME - N monitores</b></th>
  const locPattern = /<th class="col-md-3 local"><b>([^<]+)<\/b><\/th>/g;
  let m;
  const locations = [];
  while ((m = locPattern.exec(html)) !== null) {
    locations.push({ name: m[1], index: m.index });
  }
  console.log(`Found ${locations.length} locations:`);
  locations.forEach(l => console.log(`  - ${l.name}`));
  
  // For each location, find the monitors (data-id="XXX") between this location and the next
  console.log('\n=== LOCATION -> MONITOR MAPPING ===');
  for (let i = 0; i < locations.length; i++) {
    const start = locations[i].index;
    const end = i + 1 < locations.length ? locations[i + 1].index : html.length;
    const section = html.substring(start, end);
    
    // Find monitors
    const monPattern = /data-id="(\d+)"/g;
    let mm;
    const monitorIds = [];
    while ((mm = monPattern.exec(section)) !== null) {
      const id = parseInt(mm[1]);
      if (!monitorIds.includes(id)) monitorIds.push(id);
    }
    
    // Find city
    const cityPattern = /<td class="col-md-1">([^<]+)<\/td>/g;
    let cm;
    const cities = new Set();
    while ((cm = cityPattern.exec(section)) !== null) {
      const city = cm[1].trim();
      if (city && city !== 'Cidade/Uf') cities.add(city);
    }
    
    const locName = locations[i].name;
    console.log(`${locName} => IDs:[${monitorIds.join(',')}] Cities:[${[...cities].join(',')}]`);
  }
})().catch(e => console.error(e.message));
