/**
 * Seed script: Populate screens with Media Kit data (operating hours, flow, addresses)
 * Source: MIDIA KIT TODAS PRAÇAS.pdf
 * 
 * Run: node backend/scripts/seed-midiakit.js
 */
const sequelize = require('../config/database');
const Screen = require('../models/Screen');

// Media Kit data mapped to screen name patterns
// matchPattern: case-insensitive substring match against screen.name
const mediaKitData = [
  // ===== LONDRINA =====
  {
    matchPattern: 'duque hall',
    address: 'Av. Duque de Caxias, 1726 - Vila Brasil, Londrina/PR - CEP 86010-085',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 30000, flowVehicles: null
  },
  {
    matchPattern: 'genéve',
    altPatterns: ['geneve'],
    address: 'R. Ernâni Lacerda de Athayde, 350, Londrina/PR - CEP 86055-630',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 30000, flowVehicles: null
  },
  {
    matchPattern: 'palhano premium',
    address: 'Av. Ayrton Senna da Silva, 1377, Londrina/PR - CEP 86050-270',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 42000, flowVehicles: null
  },
  {
    matchPattern: 'palhano business t1',
    altPatterns: ['palhano business t1'],
    address: 'Av. Ayrton Senna da Silva, 200, Londrina/PR - CEP 86050-460',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 39000, flowVehicles: null
  },
  {
    matchPattern: 'palhano business t2',
    address: 'Av. Ayrton Senna da Silva, 200, Londrina/PR - CEP 86050-460',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 38000, flowVehicles: null
  },
  {
    matchPattern: 'comercial senador',
    altPatterns: ['condominio comercial senador'],
    address: 'Rua Senador Souza Naves, 771, Londrina/PR - CEP 86010-160',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 38000, flowVehicles: null
  },
  {
    matchPattern: 'nyc palhano',
    address: 'Rua Caracas, 1255, Londrina/PR - CEP 86050-070',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 17100, flowVehicles: null
  },
  {
    matchPattern: 'morada shangri',
    altPatterns: ['shangrila'],
    address: 'R. Euclides da Cunha, 374-628, Londrina/PR - CEP 86070-500',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 14300, flowVehicles: null
  },
  {
    matchPattern: 'duetto residence',
    address: 'R. dos Coqueiros, 305A - Morumbi, Londrina/PR - CEP 86035-140',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 17100, flowVehicles: null
  },
  {
    matchPattern: 'garden palhano',
    address: 'Rua Ulrico Zuinglio, 500 - Palhano 1, Londrina/PR - CEP 86055-620',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 45000, flowVehicles: null
  },
  {
    matchPattern: 'strassberg',
    excludePattern: 'frontlight|backlight',
    address: 'Rod. Celso Garcia Cid, Warta, PR 323, Londrina/PR - CEP 86015-000',
    operatingHoursStart: '10:00', operatingHoursEnd: '19:00', operatingDays: 'all',
    flowPeople: 26000, flowVehicles: null
  },
  {
    matchPattern: 'hachi alameda',
    address: 'Londrina/PR',
    operatingHoursStart: '08:00', operatingHoursEnd: '19:00', operatingDays: 'all',
    flowPeople: 10400, flowVehicles: null
  },
  {
    matchPattern: 'hachimitsu 2 telas',
    address: 'Av. JK, 3216, Londrina/PR - CEP 86010-540',
    operatingHoursStart: '08:00', operatingHoursEnd: '19:00', operatingDays: 'all',
    flowPeople: 10400, flowVehicles: null
  },
  {
    matchPattern: 'hachi b.s.',
    address: 'Rua Assunção, 331, Londrina/PR - CEP 86050-180',
    operatingHoursStart: '08:00', operatingHoursEnd: '19:00', operatingDays: 'all',
    flowPeople: 10400, flowVehicles: null
  },
  {
    matchPattern: 'arnaldo',
    address: 'Av. Maringá, 430, Londrina/PR - CEP 86060-000',
    operatingHoursStart: '17:30', operatingHoursEnd: '00:30', operatingDays: 'mon-sat',
    flowPeople: 19700, flowVehicles: null
  },
  {
    matchPattern: 'fruttaria',
    address: 'Rua Das Palmeiras, 88, Londrina/PR - CEP 86055-762',
    operatingHoursStart: '08:00', operatingHoursEnd: '19:00', operatingDays: 'mon-sat',
    flowPeople: 9800, flowVehicles: null
  },
  {
    matchPattern: 'posto alpha | conveni',
    address: 'Rod. Mabio Gonçalves Palhano, 1377, Londrina/PR - CEP 86055-585',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 36000, flowVehicles: null
  },
  {
    matchPattern: 'posto alpha | faixa',
    altPatterns: ['posto alpha | led'],
    address: 'Rod. Mabio Gonçalves Palhano, 1377, Londrina/PR - CEP 86055-585',
    operatingHoursStart: '06:00', operatingHoursEnd: '23:00', operatingDays: 'all',
    flowPeople: null, flowVehicles: 910000
  },
  {
    matchPattern: 'posto gastech',
    address: 'Av. Brasília, 2257, Londrina/PR - CEP 86055-620',
    operatingHoursStart: '06:00', operatingHoursEnd: '23:00', operatingDays: 'all',
    flowPeople: 1092000, flowVehicles: null
  },
  {
    matchPattern: 'panetteria',
    excludePattern: 'backlight',
    address: 'Av. Ayrton Senna da Silva, 740, Londrina/PR',
    operatingHoursStart: '06:30', operatingHoursEnd: '20:00', operatingDays: 'mon-sat',
    flowPeople: 17000, flowVehicles: null
  },
  {
    matchPattern: 'totem nykkon',
    altPatterns: ['nykkon'],
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'posto mediterr',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'casar',
    altPatterns: ['casarão'],
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  // BACKLIGHT / FRONTLIGHT - Londrina
  {
    matchPattern: 'waldemar spranger',
    address: 'Av. Waldemar Spranger, Londrina/PR',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: null, flowVehicles: 244000
  },
  {
    matchPattern: 'backlight] panetteria',
    altPatterns: ['backlight.*panetteria'],
    address: 'Av. Ayrton Senna da Silva, 740, Londrina/PR',
    operatingHoursStart: '06:30', operatingHoursEnd: '20:00', operatingDays: 'mon-sat',
    flowPeople: 17000, flowVehicles: null
  },
  {
    matchPattern: 'sun lake',
    address: 'R. Alcides Turini, 200 - Sun Lake Residence, Londrina/PR - CEP 86055-701',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 73890, flowVehicles: null
  },
  {
    matchPattern: 'bar valentino',
    address: 'Av. Prefeito Faria Lima, 486, Londrina/PR - CEP 86061-450',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: null, flowVehicles: 598000
  },
  {
    matchPattern: 'joaquim de matos',
    altPatterns: ['joaquim.*matos.*barreto'],
    address: 'Av. Joaquim de Matos Barreto (esq. Av. Maringá), Londrina/PR',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 18000, flowVehicles: null
  },
  {
    matchPattern: 'celso garcia',
    altPatterns: ['rod.*celso'],
    address: 'Av. Celso Garcia Cid, Londrina/PR',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 26000, flowVehicles: null
  },
  {
    matchPattern: 'frontlight] strassberg',
    altPatterns: ['frontlight.*strassberg'],
    address: 'Rod. Celso Garcia Cid, Km 401, S/N - PR 323, Londrina/PR - CEP 86105-000',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 26000, flowVehicles: null
  },
  {
    matchPattern: 'orla palhano',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'backlight] posto alpha',
    altPatterns: ['backlight.*posto alpha'],
    address: 'Rod. Mabio Gonçalves Palhano, 1377, Londrina/PR - CEP 86055-585',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 36000, flowVehicles: 910000
  },
  {
    matchPattern: 'gil de abreu',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'ldn grill',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'led tripla face',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'sr zanoni londrina',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'muffato madre',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  {
    matchPattern: 'teste checkin',
    address: 'Londrina/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  // ===== MARINGÁ =====
  {
    matchPattern: 'boteco do neco',
    address: 'Av. Tiradentes, 133 - Zona 02, Maringá/PR - CEP 86070-545',
    operatingHoursStart: '11:00', operatingHoursEnd: '23:30', operatingDays: 'tue-sun',
    flowPeople: 10400, flowVehicles: null
  },
  {
    matchPattern: 'zanoni maring',
    altPatterns: ['sr. zanoni maring', 'zanoni maringá'],
    address: 'Rua José do Patrocínio, 673 - Zona 04, Maringá/PR - CEP 87014-160',
    operatingHoursStart: '11:00', operatingHoursEnd: '23:30', operatingDays: 'tue-sun',
    flowPeople: 39100, flowVehicles: null
  },
  {
    matchPattern: 'hachimitsu maring',
    altPatterns: ['hachimitsu maringá'],
    address: 'Av. São Paulo, 1700 - Zona 02, Maringá/PR - CEP 87010-355',
    operatingHoursStart: '08:00', operatingHoursEnd: '20:00', operatingDays: 'all',
    flowPeople: 10400, flowVehicles: null
  },
  {
    matchPattern: 'maison lumini',
    address: 'Av. Laguna, 733 - Zona 03, Maringá/PR - CEP 86050-260',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 10500, flowVehicles: null
  },
  {
    matchPattern: 'maison montalcino',
    address: 'Av. Guedner, 683 - Zona 08, Maringá/PR - CEP 87050-390',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'maison porto fino',
    address: 'Av. Guedner, 891 - Zona 08, Maringá/PR - CEP 87050-390',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8400, flowVehicles: null
  },
  {
    matchPattern: 'new tower',
    altPatterns: ['panorâmico', 'torre 01 ', 'torre 02 '],
    address: 'Av. Duque de Caxias, 882 - Zona 07, Maringá/PR - CEP 87020-025',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 30000, flowVehicles: null
  },
  {
    matchPattern: 'marcelino champagnat',
    address: 'Av. Itororó, 1109 - Zona 02, Maringá/PR - CEP 87010-460',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'nyc maring',
    altPatterns: ['ed nyc maring', 'nyc maringá'],
    address: 'Av. Londrina, 1768 - Zona 08, Maringá/PR - CEP 87050-730',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'solar do bosque',
    address: 'Rua Monsenhor Kimura, 445 - Vila Cleopatra, Maringá/PR - CEP 87010-450',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'imperium residence',
    address: 'Av. Dr. Alexandre Rasgulaeff, 3342 - Parque Res. Cidade Nova, Maringá/PR - CEP 87023-060',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'spazio misato',
    address: 'Av. Pioneiro Antônio Ruíz Saldanha, 1826/1840 - Jardim das Estações, Maringá/PR - CEP 87065-303',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'torre alvorear',
    address: 'Rua Vítor do Amaral, 776 - Jardim Alvorada, Maringá/PR - CEP 87035-230',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 8500, flowVehicles: null
  },
  {
    matchPattern: 'aeroporto',
    address: 'Av. Dr. Vladimir Babkov, s/n, Maringá/PR',
    operatingHoursStart: '00:00', operatingHoursEnd: '23:59', operatingDays: 'all',
    flowPeople: 22000, flowVehicles: null
  },
  {
    matchPattern: 'ed josé gonçalves',
    altPatterns: ['josé gonçalves', 'jose gonçalves', 'ed jose'],
    address: 'Maringá/PR',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: null
  },
  // ===== BALNEÁRIO CAMBORIÚ / ITAJAÍ =====
  {
    matchPattern: 'big wheel',
    address: 'Estrada da Rainha, 1009 - Pioneiros, Balneário Camboriú/SC - CEP 88331-030',
    operatingHoursStart: '09:00', operatingHoursEnd: '21:00', operatingDays: 'mon-sun-except-wed',
    flowPeople: 42500, flowVehicles: null
  },
  {
    matchPattern: 'cafeteria da praça',
    altPatterns: ['cafeteria da praca'],
    address: 'R. 2700, 1401 - Centro, Balneário Camboriú/SC - CEP 88330-390',
    operatingHoursStart: '06:30', operatingHoursEnd: '21:00', operatingDays: 'all',
    flowPeople: 18000, flowVehicles: null
  },
  {
    matchPattern: 'seas tower',
    address: 'Av. Atlântica, 3950, Balneário Camboriú/SC - CEP 88330-260',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 9000, flowVehicles: null
  },
  {
    matchPattern: 'central park',
    address: 'R. 901, 431 - Centro, Balneário Camboriú/SC - CEP 88330-902',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 26500, flowVehicles: null
  },
  {
    matchPattern: 'ville de leon',
    address: 'Av. Itaipava, 1255 - Itaipava, Itajaí/SC - CEP 88316-300',
    operatingHoursStart: '06:00', operatingHoursEnd: '22:00', operatingDays: 'all',
    flowPeople: 38000, flowVehicles: null
  },
  {
    matchPattern: 'london hub',
    address: 'Rua Franklin Máximo Pereira, 96 - Centro, Itajaí/SC - CEP 88302-020',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: 6300, flowVehicles: null
  },
  {
    matchPattern: 'martin luther',
    address: 'Av. Martin Luther, Balneário Camboriú/SC',
    operatingHoursStart: null, operatingHoursEnd: null, operatingDays: null,
    flowPeople: null, flowVehicles: 362000
  }
];

// Priority based on total flow
function flowToPriority(flowPeople, flowVehicles) {
  const total = (flowPeople || 0) + (flowVehicles || 0);
  if (total === 0) return null; // don't override if no flow data
  if (total >= 500000) return 'critical';
  if (total >= 100000) return 'high';
  if (total >= 30000) return 'medium';
  return 'low';
}

function matchScreen(screenName, entry) {
  const name = screenName.toLowerCase();
  if (entry.excludePattern && new RegExp(entry.excludePattern, 'i').test(screenName)) {
    return false;
  }
  if (name.includes(entry.matchPattern.toLowerCase())) return true;
  if (entry.altPatterns) {
    for (const alt of entry.altPatterns) {
      if (alt.includes('.*') || alt.includes('|')) {
        if (new RegExp(alt, 'i').test(screenName)) return true;
      } else {
        if (name.includes(alt.toLowerCase())) return true;
      }
    }
  }
  return false;
}

async function seed() {
  try {
    await sequelize.authenticate();

    // Ensure new columns exist
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('screens');
    
    const newCols = {
      operatingHoursStart: { type: 'VARCHAR(5)', allowNull: true },
      operatingHoursEnd: { type: 'VARCHAR(5)', allowNull: true },
      operatingDays: { type: 'VARCHAR(50)', allowNull: true },
      flowPeople: { type: 'INTEGER', allowNull: true },
      flowVehicles: { type: 'INTEGER', allowNull: true }
    };

    for (const [col, def] of Object.entries(newCols)) {
      if (!tableDesc[col]) {
        await qi.addColumn('screens', col, def);
        console.log(`  Added column: ${col}`);
      }
    }

    const screens = await Screen.findAll();
    let updated = 0;
    let unmatched = [];

    for (const screen of screens) {
      let matched = false;
      for (const entry of mediaKitData) {
        if (matchScreen(screen.name, entry)) {
          const updates = {};
          
          // Update address (only if we have a real address, not just city)
          if (entry.address && entry.address.includes(',')) {
            updates.address = entry.address;
          }
          
          updates.operatingHoursStart = entry.operatingHoursStart;
          updates.operatingHoursEnd = entry.operatingHoursEnd;
          updates.operatingDays = entry.operatingDays;
          
          if (entry.flowPeople) updates.flowPeople = entry.flowPeople;
          if (entry.flowVehicles) updates.flowVehicles = entry.flowVehicles;
          
          const priority = flowToPriority(entry.flowPeople, entry.flowVehicles);
          if (priority) updates.priority = priority;

          await screen.update(updates);
          updated++;
          matched = true;
          console.log(`✓ ${screen.name} → ${entry.matchPattern} (priority: ${priority || 'unchanged'})`);
          break;
        }
      }
      if (!matched) {
        unmatched.push(screen.name);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Updated: ${updated} screens`);
    console.log(`Unmatched: ${unmatched.length} screens`);
    if (unmatched.length) {
      console.log('\nUnmatched screens:');
      unmatched.forEach(n => console.log(`  - ${n}`));
    }

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

seed();
