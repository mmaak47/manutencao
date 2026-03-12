import pdfplumber
import json
import re
import sys

pdf_path = r"c:\Users\Usuário\Documents\Manutenção\backend\midiakit\MIDIA KIT TODAS PRAÇAS.pdf"

locations = []

with pdfplumber.open(pdf_path) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        if not text:
            continue
        
        # Skip separator/intro pages (no address info)
        if len(text.strip()) < 100:
            continue
            
        loc = {"page": i + 1, "raw": text}
        
        # Extract name - look for known patterns
        # The location name is typically in uppercase after type headers
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        # Try to find the establishment name
        name = None
        address = None
        hours = None
        flow_people = None
        flow_vehicles = None
        latitude = None
        longitude = None
        loc_type = None
        
        for j, line in enumerate(lines):
            # Type detection
            if any(t in line.upper() for t in ['PAINEL LED', 'VIDEO WALL', 'TELAS COMERCIAL', 'TELAS VERTICAIS', 'ELEVADORES', 'BACKLIGHT', 'FRONTLIGHT']):
                for t in ['PAINEL LED', 'VIDEO WALL', 'TELAS VERTICAIS', 'TELAS COMERCIAL', 'ELEVADORES RESIDENCIAL', 'ELEVADORES COMERCIAL', 'BACKLIGHT', 'FRONTLIGHT']:
                    if t in line.upper():
                        loc_type = t
                        break
            
            # Flow
            m = re.search(r'Fluxo\s+(pessoas|ve.culos)/m.s:\s*([\d\.]+)', line)
            if m:
                flow_type = m.group(1)
                flow_val = m.group(2).replace('.', '')
                if 'pessoa' in flow_type:
                    flow_people = int(flow_val)
                else:
                    flow_vehicles = int(flow_val)
            
            # Coordinates
            m = re.search(r'Latitude:\s*(-?[\d\.]+)', line)
            if m:
                latitude = m.group(1)
            m = re.search(r'Longitude:\s*(-?[\d\.]+)', line)
            if m:
                longitude = m.group(1)
            
            # Hours - look for patterns like "6h às 22h" or "24h" or "Aberto 24h"
            if re.search(r'\d+h\s*.s\s*\d+h|24h|Aberto 24', line):
                if not hours:
                    hours = line.strip()
        
        # Find name: typically after COMERCIAL/RESIDENCIAL line
        for j, line in enumerate(lines):
            if line.upper() in ['COMERCIAL', 'RESIDENCIAL']:
                if j + 1 < len(lines):
                    candidate = lines[j + 1]
                    # Name should be uppercase and not be an address
                    if candidate.isupper() and not candidate.startswith(('Av.', 'Rua ', 'Rod.', 'R. ', 'Estrada')):
                        name = candidate
                        # Address is typically next line
                        if j + 2 < len(lines):
                            addr_candidate = lines[j + 2]
                            if any(p in addr_candidate for p in ['Av.', 'Rua ', 'Rod.', 'R. ', 'Estrada', 'CEP']):
                                address = addr_candidate
                break
        
        # Also try: name right after type line
        if not name:
            for j, line in enumerate(lines):
                if any(t in line for t in ['PAINEL LED COMERCIAL', 'VIDEO WALL COMERCIAL', 'TELAS COMERCIAL', 'TELAS VERTICAIS COMERCIAL', 'ELEVADORES RESIDENCIAL', 'ELEVADORES COMERCIAL', 'BACKLIGHT', 'FRONTLIGHT']):
                    if j + 1 < len(lines):
                        candidate = lines[j + 1]
                        if not candidate.startswith(('Av.', 'Rua ', 'Rod.', 'R. ', 'Estrada', 'Coordenadas', 'Latitude')):
                            name = candidate
                            if j + 2 < len(lines):
                                addr_candidate = lines[j + 2]
                                if any(p in addr_candidate for p in ['Av.', 'Rua ', 'Rod.', 'R. ', 'Estrada', 'CEP']):
                                    address = addr_candidate
                    break
        
        if name:
            loc['name'] = name
            loc['address'] = address
            loc['hours'] = hours
            loc['flow_people'] = flow_people
            loc['flow_vehicles'] = flow_vehicles
            loc['latitude'] = latitude
            loc['longitude'] = longitude
            loc['type'] = loc_type
            locations.append(loc)

print(f"\n\n{'='*60}")
print(f"EXTRACTED {len(locations)} LOCATIONS")
print(f"{'='*60}")
for loc in locations:
    print(f"\nName: {loc.get('name')}")
    print(f"  Address: {loc.get('address')}")
    print(f"  Hours: {loc.get('hours')}")
    print(f"  Flow people: {loc.get('flow_people')}")
    print(f"  Flow vehicles: {loc.get('flow_vehicles')}")
    print(f"  Lat/Lng: {loc.get('latitude')}, {loc.get('longitude')}")
    print(f"  Type: {loc.get('type')}")
    print(f"  Page: {loc.get('page')}")

# Output JSON for later use
with open(r"c:\Users\Usuário\Documents\Manutenção\backend\scripts\midiakit-data.json", "w", encoding="utf-8") as f:
    cleaned = [{k: v for k, v in loc.items() if k != 'raw'} for loc in locations]
    json.dump(cleaned, f, indent=2, ensure_ascii=False)
