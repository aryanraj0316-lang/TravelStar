export interface MonsoonAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'ADVISORY';
  title: string;
  category: 'LANDSLIDE' | 'FLOOD & RAIN' | 'SNOWFALL' | 'LIGHTNING' | 'CLOUDBURST' | 'TRAFFIC RUSH';
  location: string;
  time: string;
  desc: string;
  affectedRoute: string;
  precautions: string[];
  image: string;
}

export const MONSOON_ALERTS: MonsoonAlert[] = [
  {
    id: 'h1',
    severity: 'CRITICAL',
    title: 'Monsoon Warning (Ladakh Routes)',
    category: 'FLOOD & RAIN',
    location: 'Ladakh Corridor (Kargil-Leh)',
    time: '5 mins ago',
    desc: 'Heavy monsoon rain warning along Ladakh routes. Slow down and avoid night transit due to flash flood risks.',
    affectedRoute: 'Srinagar ➔ Kargil ➔ Leh Highway',
    precautions: [
      'Avoid driving after sunset; visibility drops drastically.',
      'Check with local checkposts before crossing Zoji La.',
      'Keep extra emergency fuel and dry rations.',
      'Stay away from dry stream beds (nullahs) which can flood instantly.'
    ],
    image: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=600&q=80' // Torrential rain and flooded street
  },
  {
    id: 'h2',
    severity: 'CRITICAL',
    title: 'Landslide Warning near Shimla',
    category: 'LANDSLIDE',
    location: 'Shimla-Manali Highway (NH-5)',
    time: '14 mins ago',
    desc: 'Active landslide warnings and rockfalls reported near Koti Tunnel. Traffic temporarily suspended.',
    affectedRoute: 'Chandigarh ➔ Shimla ➔ Manali Highway',
    precautions: [
      'Use the recommended bypass route via Solan if traveling to Shimla.',
      'Do not park vehicles near steep rock walls or loose soil slopes.',
      'Monitor updates from Himachal Pradesh Traffic Police.',
      'Keep windows slightly open to hear falling stone sounds.'
    ],
    image: 'https://imgs.search.brave.com/DM-N8jr-m9mdKTxRifft8Pa0MdawZTa9dDrcYTZPTSM/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tYWdh/cnRpY2xlcy5tYWd6/dGVyLmNvbS9hcnRp/Y2xlcy80OTcyLzMz/Nzg3Ni81ZDM2YjZi/NmYxMDMzL1JhaW5m/YWxsLUxhbmRzbGlk/ZS1OYXR1cmFsLURp/c2FzdGVyLmpwZw' // User landslide reference image
  },
  {
    id: 'h3',
    severity: 'CRITICAL',
    title: 'Flash Flood Advisory in Rishikesh',
    category: 'FLOOD & RAIN',
    location: 'Ganges River Valley, Rishikesh',
    time: '28 mins ago',
    desc: 'River water levels rising rapidly near Lakshman Jhula. All white water rafting and river bank camping suspended for 48 hours.',
    affectedRoute: 'Rishikesh ➔ Devprayag corridor (NH-7)',
    precautions: [
      'Relocate from low-lying camping sites immediately.',
      'Rafting is strictly illegal until the red alert is lifted.',
      'Follow signs and instructions from local SDRF personnel.',
      'Secure dry bags for important documents and medicines.'
    ],
    image: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?w=600&q=80' // Rushing muddy flood waters
  },
  {
    id: 'h4',
    severity: 'WARNING',
    title: 'Cloudburst Warning (North Sikkim)',
    category: 'CLOUDBURST',
    location: 'Lachung & Lachen Valleys',
    time: '1 hour ago',
    desc: 'Met office predicts high risk of localized cloudbursts. Sudden flash floods and mudslides expected. Travel restricted.',
    affectedRoute: 'Gangtok ➔ Mangan ➔ Lachung Corridor',
    precautions: [
      'Postpone any travel plans to North Sikkim for the next 24 hours.',
      'Stay inside concrete structures; avoid lightweight shelters.',
      'Keep local disaster control room helpline numbers active.',
      'Coordinate with your tour guide for safe zone assembly.'
    ],
    image: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600&q=80' // Cloudburst torrential rain storm clouds
  },
  {
    id: 'h5',
    severity: 'WARNING',
    title: 'Heavy Rainfall & Waterlogging',
    category: 'FLOOD & RAIN',
    location: 'Mumbai-Pune Expressway',
    time: '2 hours ago',
    desc: 'Heavy continuous rain causing water pooling at low points of the expressway. 30-40 min delays expected.',
    affectedRoute: 'Mumbai ➔ Pune Expressway (NH-48)',
    precautions: [
      'Maintain double the normal stopping distance from the vehicle ahead.',
      'Avoid hydroplaning by keeping speeds under 60 km/h.',
      'Check wiper health before entering the ghat sections.',
      'Use fog lights and hazard lights if visibility drops below 50m.'
    ],
    image: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=600&q=80' // Heavy rain storm on wet road
  },
  {
    id: 'h6',
    severity: 'ADVISORY',
    title: 'Traffic Gridlock near Kalka',
    category: 'TRAFFIC RUSH',
    location: 'Kalka-Shimla Toy Train Bypass',
    time: '3 hours ago',
    desc: 'Weekend rush and slippery road conditions have caused a 6km traffic queue. Slow crawling speed advised.',
    affectedRoute: 'Kalka ➔ Solan highway stretch',
    precautions: [
      'Expect an additional 1.5 hours travel time.',
      'Keep vehicle AC in internal circulation mode to avoid exhaust fumes.',
      'Carry adequate drinking water and snacks.',
      'Do not attempt overtaking on single lane curves.'
    ],
    image: 'https://imgs.search.brave.com/UkOkctK_kmgYf3qV4eUoIEUSbUHoIwW5wNu2n4R0Rog/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS50ZWxhbmdhbmF0/b2RheS5jb20vd3At/Y29udGVudC91cGxv/YWRzLzIwMjYvMDYv/U2hpbWxhLWhpbGwt/c3RhdGlvbi5qcGc' // User traffic rush reference image
  }
];
