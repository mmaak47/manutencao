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
  
  const resp = await axios.get('https://sistema.redeintermidia.com/index/index3', {
    headers: { Cookie: cookies }, timeout: 20000, validateStatus: () => true
  });
  
  const html = resp.data;
  console.log('HTML length:', html.length);
  
  // Find all img title attributes with stats
  const imgTitlePattern = /title="(\d+ Minutos[^"]*)"/g;
  let m, count = 0;
  while ((m = imgTitlePattern.exec(html)) && count < 5) {
    console.log('--- Stats title #' + (count + 1) + ':');
    console.log(JSON.stringify(m[1]));
    count++;
  }
  
  const onlineCount = (html.match(/title="\d+ Minutos/g) || []).length;
  const offlineCount = (html.match(/title="Offline desde/g) || []).length;
  console.log('\nTotal online img titles:', onlineCount);
  console.log('Total offline titles:', offlineCount);
  
  // Check for CPU Temp in any title
  console.log('CPU Temp occurrences:', (html.match(/CPU Temp/g) || []).length);
  console.log('Uptime occurrences:', (html.match(/Uptime/g) || []).length);
  console.log('App Ver occurrences:', (html.match(/App Ver/g) || []).length);

  // Now test the full parsing with corrected regex
  const monitors = [];
  const offlineIdx = html.indexOf('OFFLINE');
  const onlineHtml = offlineIdx > 0 ? html.substring(0, offlineIdx) : html;
  const offlineHtml = offlineIdx > 0 ? html.substring(offlineIdx) : '';

  // Online: find each monitor block
  const onlineMonitorPattern = /campanhas\/monitor\/(\d+)'/g;
  let om;
  while ((om = onlineMonitorPattern.exec(onlineHtml)) !== null) {
    const id = parseInt(om[1]);
    const blockStart = om.index;
    const blockEnd = onlineHtml.indexOf('campanhas/monitor', om.index + 1);
    const block = onlineHtml.substring(blockStart, blockEnd > 0 ? blockEnd : blockStart + 3000);
    
    // Get stats from img title
    const statsMatch = block.match(/title="(\d+ Minutos[^"]*)"/);
    const statsRaw = statsMatch ? statsMatch[1] : '';
    
    // Get name from div title
    const nameMatch = block.match(/title="(\d+\s*-\s*[^"]*)"/);
    const nameRaw = nameMatch ? nameMatch[1] : '';
    
    // Orientation
    const isVert = block.includes('tv_vert');
    
    if (monitors.length < 3) {
      console.log('\n=== Online Monitor', id, '===');
      console.log('Stats:', JSON.stringify(statsRaw));
      console.log('Name:', nameRaw);
      console.log('Vertical:', isVert);
    }
    
    monitors.push({ id, status: 'online' });
  }

  // Offline: find each monitor block  
  const offlineMonitorPattern = /campanhas\/monitor\/(\d+)'/g;
  while ((om = offlineMonitorPattern.exec(offlineHtml)) !== null) {
    const id = parseInt(om[1]);
    monitors.push({ id, status: 'offline' });
  }

  console.log('\nTotal parsed monitors:', monitors.length);
  console.log('Online:', monitors.filter(m => m.status === 'online').length);
  console.log('Offline:', monitors.filter(m => m.status === 'offline').length);
})().catch(e => console.error(e.message));
