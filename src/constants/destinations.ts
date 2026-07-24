export interface DestinationDetail {
  id: number;
  name: string;
  tags: string;
  rating: number;
  image: string;
  description: string;
  gallery: string[];
  videoThumb: string;
  specialties: { icon: 'adventure' | 'cuisine' | 'heritage' | 'nature' | 'culture' | 'stay'; title: string; desc: string }[];
  reviews: { id: string; user: string; avatar: string; rating: number; text: string; date: string }[];
}

export const DESTINATIONS_DATABASE: DestinationDetail[] = [
  {
    id: 1,
    name: 'Ladakh',
    tags: 'Adventure • Mountains',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
    description: 'Ladakh, the land of high passes, is a barren yet beautiful region in the state of Jammu and Kashmir. Bound by two of the world\'s mightiest mountain ranges, the Great Himalaya and the Karakoram, it lies athwart two others, the Ladakh range and the Zanskar range. Known for its crystal clear lakes, ancient monasteries, and cold deserts, it is a haven for adventure travelers and motorcyclists.',
    gallery: [
      'https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?w=600&q=80', // Thiksey Monastery
      'https://images.unsplash.com/photo-1590050752117-238cb0612b1b?w=600&q=80', // Pangong Lake
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'  // Nubra Valley
    ],
    videoThumb: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80',
    specialties: [
      { icon: 'adventure', title: 'Pangong Tso Lake', desc: 'World\'s highest saltwater lake situated at 4,250 meters altitude.' },
      { icon: 'culture', title: 'Monastery Circuits', desc: 'Visit ancient monasteries like Thiksey, Hemis, and Diskit.' },
      { icon: 'nature', title: 'Nubra Double Hump Camels', desc: 'Explore the high-altitude cold deserts of Nubra Valley on camels.' }
    ],
    reviews: [
      { id: '1', user: 'Aarav Sharma', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80', rating: 5, text: 'The rugged mountains, the blue lakes, and the peaceful vibes are unparalleled. A bike ride to Khardung La was a dream come true!', date: '3 days ago' },
      { id: '2', user: 'Neha Gupta', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80', rating: 4, text: 'Stunning vistas around every corner. Make sure to carry warm layers and rest for the first two days to prevent mountain sickness.', date: '2 weeks ago' }
    ]
  },
  {
    id: 2,
    name: 'Andaman',
    tags: 'Beaches • Relaxation',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    description: 'The Andaman and Nicobar Islands are an archipelago of over 500 islands in the Bay of Bengal, known for their turquoise lagoons, pristine white sand beaches, coral reefs, and historical jail sites. Radhanagar Beach on Havelock Island is globally renowned, offering spectacular sunsets. It is an ideal escape for diving enthusiasts, honeymooners, and families looking for coastal tranquility.',
    gallery: [
      'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=600&q=80', // Tropical Beach
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80', // Coral Reef
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'  // Sunset Havelock
    ],
    videoThumb: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=600&q=80',
    specialties: [
      { icon: 'nature', title: 'Radhanagar Beach', desc: 'Awarded as one of Asia\'s best beaches for its smooth sands and blue tides.' },
      { icon: 'adventure', title: 'Scuba & Snorkeling', desc: 'Dive at Havelock Island to witness active marine life and coral reefs.' },
      { icon: 'heritage', title: 'Cellular Jail (Kala Pani)', desc: 'Explore India\'s national memorial with a light and sound historical show.' }
    ],
    reviews: [
      { id: '1', user: 'Vikram Malhotra', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80', rating: 5, text: 'Absolutely crystal clear waters! Havelock is a paradise for scuba diving. The corals and marine life are breathtaking.', date: '5 days ago' },
      { id: '2', user: 'Priya Sen', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80', rating: 4.5, text: 'Peaceful and beautiful. Cellular Jail is incredibly moving. Havelock ferry booking needs to be done well in advance.', date: '1 month ago' }
    ]
  },
  {
    id: 3,
    name: 'Goa',
    tags: 'Nightlife • Beaches',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80',
    description: 'Goa, the smallest state in India, is famous for its endless sandy beaches, vibrant nightlife, 17th-century Portuguese architecture, and local spice plantations. Divided into North Goa (famous for trance parties, water sports, and crowded flea markets) and South Goa (renowned for peaceful luxury stays and silent beaches), Goa offers a unique blend of Indian and Portuguese cultures.',
    gallery: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80', // Beach Palm
      'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=600&q=80', // Sunset Goa
      'https://images.unsplash.com/photo-1590001155093-a3c66ab0c3ff?w=600&q=80'  // Basilica of Bom Jesus
    ],
    videoThumb: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=600&q=80',
    specialties: [
      { icon: 'cuisine', title: 'Goan Fish Curry', desc: 'Indulge in traditional beach-side seafood, vindaloo, and local cashew feni.' },
      { icon: 'heritage', title: 'Old Goa Churches', desc: 'Visit UNESCO sites like the Basilica of Bom Jesus holding relics of St. Francis.' },
      { icon: 'adventure', title: 'Water Sports', desc: 'Parasailing, jet skiing, and banana boat rides at Calangute and Baga beach.' }
    ],
    reviews: [
      { id: '1', user: 'Rohan Mehta', avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&q=80', rating: 4, text: 'Amazing vibe! Loved the shacks at Baga Beach and exploring the old colorful quarters of Fontainhas in Panaji.', date: '1 week ago' },
      { id: '2', user: 'Kriti Kapoor', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&q=80', rating: 5, text: 'South Goa is where the real beauty lies. Palolem and Agonda beaches are so peaceful and clean. Highly recommended for couples.', date: '3 weeks ago' }
    ]
  },
  {
    id: 4,
    name: 'Kerala',
    tags: 'Nature • Backwaters',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
    description: 'Often referred to as "God\'s Own Country", Kerala is a tropical paradise situated on the southwestern Malabar coast of India. It is famous for its serene backwaters network of canals, lakes, and rivers, spice plantations, lush tea estates in Munnar, Ayurvedic therapies, and wildlife sanctuaries like Periyar. Its slow pace makes it an ideal destination for ultimate rejuvenation.',
    gallery: [
      'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&q=80', // Houseboat
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80', // Kovalam Beach
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'  // Tea gardens
    ],
    videoThumb: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&q=80',
    specialties: [
      { icon: 'nature', title: 'Alleppey Houseboats', desc: 'Spend a night cruising the serene, palm-fringed backwater lagoons.' },
      { icon: 'stay', title: 'Ayurveda Retreats', desc: 'Indulge in traditional holistic body massages and herbal spa therapies.' },
      { icon: 'cuisine', title: 'Sadya on Banana Leaf', desc: 'Try the traditional multi-course vegetarian feast of Kerala.' }
    ],
    reviews: [
      { id: '1', user: 'Ananya Nair', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80', rating: 5, text: 'Alleppey houseboat stay was a once-in-a-lifetime experience. Waking up to backwater villages was so peaceful.', date: '4 days ago' },
      { id: '2', user: 'Amit Trivedi', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&q=80', rating: 4.8, text: 'Munnar tea fields are incredibly green and refreshing. Make sure to buy fresh spices directly from cardamom farms.', date: '2 weeks ago' }
    ]
  },
  {
    id: 5,
    name: 'Manali',
    tags: 'Snow • Hill Station',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=800&q=80',
    description: 'Manali is a high-altitude Himalayan resort town in Himachal Pradesh, positioned near the northern end of the Kullu Valley. It is a rustic enclave surrounded by towering snow-clad peaks, dense pine forests, and orchards. It is India\'s adventure playground, offering paragliding, skiing, and trekking in Solang Valley, and access to Lahaul and Spiti through the engineering marvel, the Atal Tunnel.',
    gallery: [
      'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80', // Snowy peak
      'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=600&q=80', // Mountain stream
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'  // Solang Valley
    ],
    videoThumb: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=600&q=80',
    specialties: [
      { icon: 'adventure', title: 'Solang Adventure', desc: 'Go paragliding, zorbing, and quad-biking in the Solang meadows.' },
      { icon: 'nature', title: 'Atal Tunnel Corridor', desc: 'Drive through the longest high-altitude tunnel into the Lahaul Valley.' },
      { icon: 'stay', title: 'Old Manali Cafes', desc: 'Relax in wooden cafes offering woodfired pizza, live music, and mountain views.' }
    ],
    reviews: [
      { id: '1', user: 'Devendra J.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80', rating: 4.5, text: 'Solang valley paragliding was thrilling. Old Manali has a very cozy vibe compared to the busy mall road.', date: '6 days ago' },
      { id: '2', user: 'Shreya Roy', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80', rating: 5, text: 'Visited Solang in winter and saw fresh snowfall! The drive to Sissu via Atal Tunnel was absolutely mind-blowing.', date: '3 weeks ago' }
    ]
  },
  {
    id: 6,
    name: 'Varanasi',
    tags: 'Ghats • Ganga River',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=500&q=80',
    description: 'Varanasi, also known as Kashi or Benares, is one of the world\'s oldest continually inhabited cities and the spiritual heart of India. Situated on the banks of the sacred Ganges River in Uttar Pradesh, Varanasi is famous for its labyrinth of narrow alleys, ancient temples, and over 80 ghats (stone steps leading to the river). The daily Ganga Aarti ceremony at Dashashwamedh Ghat is a mesmerizing spectacle of sound, fire, and devotion.',
    gallery: [
      'https://images.unsplash.com/photo-1561361041-c96a2a5adfc3?w=600&q=80', // Sunrise boat ride
      'https://images.unsplash.com/photo-1598091383021-15ddea10925d?w=600&q=80', // Kashi Vishwanath
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=80'  // Ganga Aarti
    ],
    videoThumb: 'https://images.unsplash.com/photo-1571536802807-30451e3955d8?w=600&q=80',
    specialties: [
      { icon: 'culture', title: 'Subah-e-Banaras Aarti', desc: 'Witness the grand morning or evening Ganga Aarti ritual at the ghats.' },
      { icon: 'nature', title: 'Sunrise Boat Ride', desc: 'Take a boat ride along the Ganges to view the ghats as the city wakes up.' },
      { icon: 'cuisine', title: 'Kachori Sabzi & Lassi', desc: 'Indulge in Varanasi\'s famous street food and thick sweet lassi served in mud cups.' }
    ],
    reviews: [
      { id: '1', user: 'Rahul Verma', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&q=80', rating: 5, text: 'Varanasi is pure magic. The Ganga Aarti at Dashashwamedh Ghat gave me goosebumps. A boat ride at sunrise is highly recommended.', date: '2 days ago' },
      { id: '2', user: 'Sunita D.', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&q=80', rating: 4.8, text: 'Crowded and chaotic but spiritually moving. Visited the Kashi Vishwanath corridor which is beautifully built now.', date: '1 week ago' }
    ]
  },
  {
    id: 7,
    name: 'Udaipur',
    tags: 'Palaces • Romance',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=400&q=80',
    description: 'Often called the "City of Lakes" or the "Venice of the East", Udaipur is the historic capital of the kingdom of Mewar in Rajasthan. It is built around a series of artificial lakes and is famous for its lavish royal palaces. The grand City Palace complex, which overlooks Lake Pichola, is a monumental architectural marvel. With its romantic lake cruises, heritage mansions, and luxury resorts, it is a favorite for travelers globally.',
    gallery: [
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=600&q=80', // Hawa Mahal/Palace
      'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80', // Lake Pichola
      'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80'  // Jag Mandir
    ],
    videoThumb: 'https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?w=600&q=80',
    specialties: [
      { icon: 'heritage', title: 'City Palace Complex', desc: 'Explore the grand corridors, museums, and royal courtyard collections.' },
      { icon: 'nature', title: 'Pichola Boat Cruise', desc: 'Sail past Jag Mandir and the Lake Palace during a scenic sunset.' },
      { icon: 'cuisine', title: 'Mewari Laal Maas', desc: 'Savor traditional spicy lamb curry in heritage lakeside restaurants.' }
    ],
    reviews: [
      { id: '1', user: 'Harish R.', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&q=80', rating: 5, text: 'Udaipur is incredibly romantic. Sunset boat cruise on Lake Pichola with views of the illuminated Taj Lake Palace was stunning.', date: '4 days ago' },
      { id: '2', user: 'Sneha Rao', avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=120&q=80', rating: 4.9, text: 'Loved the museum inside the City Palace. Also caught the Dharohar folk dance show at Bagore Ki Haveli, don\'t miss it!', date: '3 weeks ago' }
    ]
  },
  {
    id: 8,
    name: 'Darjeeling',
    tags: 'Tea Gardens • Views',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80',
    description: 'Darjeeling, a hill station in West Bengal, is situated in the lesser Himalayas. It is globally famous for its premium black tea plantations, which are backdropped by the majestic snow peaks of Mount Kanchenjunga, the world\'s third-highest peak. The Darjeeling Himalayan Railway (the "Toy Train"), constructed in the late 19th century, is a UNESCO World Heritage Site.',
    gallery: [
      'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=600&q=80', // Tea gardens
      'https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=600&q=80', // Himalayan peak
      'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80'  // Toy train track
    ],
    videoThumb: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=600&q=80',
    specialties: [
      { icon: 'nature', title: 'Tiger Hill Sunrise', desc: 'Wake up early to catch the golden sun rising over Mt. Kanchenjunga.' },
      { icon: 'culture', title: 'Toy Train Ride', desc: 'Enjoy a slow scenic train ride on the historic loop of Ghoom monastery.' },
      { icon: 'stay', title: 'Tea Estate Bungalows', desc: 'Stay in historic British-era tea estate bungalows and pick tea leaves.' }
    ],
    reviews: [
      { id: '1', user: 'Sourav Ghosh', avatar: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?w=120&q=80', rating: 4.7, text: 'Tiger Hill sunrise was freezing but absolutely worth the early wake-up call! Sipping fresh Darjeeling tea overlooking tea gardens was heaven.', date: '1 week ago' },
      { id: '2', user: 'Meera Das', avatar: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=120&q=80', rating: 4.5, text: 'The toy train steam ride was very nostalgic and fun. It gets a bit crowded during peak season, so pre-booking is critical.', date: '2 weeks ago' }
    ]
  }
];
