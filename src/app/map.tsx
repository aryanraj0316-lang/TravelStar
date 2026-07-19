import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  ShieldAlert,
  Phone,
  Compass,
  AlertCircle,
} from 'lucide-react-native';
import { useApp } from '@/store/AppContext';
import { ThemedText } from '@/components/themed-text';
import GlassCard from '@/components/ui/GlassCard';

// Ranchi to Vrindavan Route Cities Coordinates
const ROUTE_COORDS = [
  { latitude: 23.3441, longitude: 85.3090, name: 'Ranchi' },
  { latitude: 28.6139, longitude: 77.2090, name: 'Delhi' },
  { latitude: 27.4924, longitude: 77.6737, name: 'Mathura' },
  { latitude: 27.5650, longitude: 77.7008, name: 'Vrindavan' },
];

const MAP_PINS = [
  {
    id: 'pin-1',
    type: 'GUIDE',
    name: 'Rajesh Kumar (Guide)',
    latitude: 27.5650,
    longitude: 77.7008,
    detail: 'Expert in Heritage walks, Rating 4.9',
  },
  {
    id: 'pin-2',
    type: 'GROUP',
    name: 'Ranchi-Vrindavan Group',
    latitude: 27.4924,
    longitude: 77.6737,
    detail: 'Next Segment: Delhi → Vrindavan',
  },
  {
    id: 'pin-3',
    type: 'TOURIST',
    name: 'Neha Mehta (Solo)',
    latitude: 28.6139,
    longitude: 77.2090,
    detail: 'Looking for a tour group to join',
  },
  {
    id: 'pin-4',
    type: 'ATTRACTION',
    name: 'Prem Mandir Temple',
    latitude: 27.5670,
    longitude: 77.7015,
    detail: 'Popular Landmark, Open till 10 PM',
  },
];

// High-fidelity standard HTML containing Leaflet with direct Google Maps Roadmap Tiles
const STATIC_LEAFLET_HTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #060814; }
      #map {
        filter: invert(90%) hue-rotate(180deg) brightness(105%) contrast(140%) saturate(80%);
      }
      .leaflet-popup-content-wrapper {
        background: #111322 !important;
        color: #FFF !important;
        border: 1px solid #1A1D30;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .leaflet-popup-tip {
        background: #111322 !important;
      }
      .leaflet-popup-content h4 { margin: 0 0 4px 0; font-size: 13px; color: #FFF; font-weight: bold; }
      .leaflet-popup-content p { margin: 0; font-size: 11px; color: #7E8494; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      // Centered around Mathura/Vrindavan
      const map = L.map('map', { zoomControl: false }).setView([27.5650, 77.7008], 8);
      
      // Google Maps Standard Roadmap Tiles (showing full roads, cities, shops, establishments)
      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      }).addTo(map);

      // Render Route Polyline (Ranchi to Vrindavan)
      const pathPoints = [
        [23.3441, 85.3090], // Ranchi
        [28.6139, 77.2090], // Delhi
        [27.4924, 77.6737], // Mathura
        [27.5650, 77.7008]  // Vrindavan
      ];
      L.polyline(pathPoints, { color: '#0066FF', weight: 4, opacity: 0.85, dashArray: '5, 8' }).addTo(map);

      // Load Pins
      const pins = ${JSON.stringify(MAP_PINS)};
      const markerInstances = [];

      pins.forEach(pin => {
        const markerColor = pin.type === 'GUIDE' ? '#10B981' : 
                           pin.type === 'GROUP' ? '#F59E0B' : 
                           pin.type === 'TOURIST' ? '#8B5CF6' : '#EF4444';
        
        const customIcon = L.divIcon({
          html: \`<div style="width:24px;height:24px;border-radius:12px;background:\${markerColor};border:2px solid #FFF;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.3)"><span style="color:#FFF;font-size:10px">📍</span></div>\`,
          className: 'custom-pin-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 24]
        });

        const marker = L.marker([pin.latitude, pin.longitude], { icon: customIcon })
          .addTo(map)
          .bindPopup(\`<h4>\${pin.name}</h4><p>\${pin.detail}</p>\`);
        
        markerInstances.push({ marker, type: pin.type });
      });

      // Filter function called dynamically via postMessage from React Native
      function applyFilter(filter) {
        markerInstances.forEach(item => {
          if (filter === 'ALL' || 
              (filter === 'GUIDES' && item.type === 'GUIDE') ||
              (filter === 'GROUPS' && item.type === 'GROUP') ||
              (filter === 'TOURISTS' && item.type === 'TOURIST')) {
            item.marker.addTo(map);
          } else {
            map.removeLayer(item.marker);
          }
        });
      }

      // Listen for filter toggle messages from parent
      document.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'FILTER') {
            applyFilter(data.filter);
          }
        } catch(e) {}
      });
      window.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'FILTER') {
            applyFilter(data.filter);
          }
        } catch(e) {}
      });
    </script>
  </body>
  </html>
`;

export default function MapScreen() {
  const isDark = useColorScheme() === 'dark';
  const { triggerSOS } = useApp();
  const [mapFilter, setMapFilter] = useState<'ALL' | 'GUIDES' | 'GROUPS' | 'TOURISTS'>('ALL');
  const [sosTriggered, setSosTriggered] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleSOS = () => {
    triggerSOS(28.6139, 77.2090);
    setSosTriggered(true);
  };

  // Reactively post filter updates to the Leaflet script instantly (without re-rendering/reloading the WebView)
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'FILTER', filter: mapFilter }));
    }
  }, [mapFilter]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: isDark ? '#060814' : '#FAFAFC' }]}>
      <View style={styles.mapContainer}>
        {/* CROSS-PLATFORM INTERACTIVE MAP WEBVIEW */}
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: STATIC_LEAFLET_HTML }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />

        {/* ─── FILTERS SELECTOR ROW OVERLAY ───────────────────── */}
        <View style={styles.topFilterOverlay}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {['ALL', 'GUIDES', 'GROUPS', 'TOURISTS'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterTab,
                  mapFilter === f && styles.filterTabActive,
                  mapFilter !== f && { backgroundColor: isDark ? 'rgba(17, 19, 34, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDark ? '#1A1D30' : '#E1E4ED', borderWidth: 1 },
                ]}
                onPress={() => setMapFilter(f as any)}
              >
                <Text style={[styles.filterTabText, mapFilter === f && styles.filterTabTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ─── LIVE LOCATION STATUS BAR OVERLAY ───────────────── */}
        <GlassCard style={styles.statusBar}>
          <View style={styles.statusRow}>
            <Compass size={16} color="#0066FF" />
            <ThemedText style={{ fontSize: 11, marginLeft: 6, fontWeight: '700', color: isDark ? '#FFF' : '#000' }}>
              Live Sharing Active • Ranchi-Delhi Highway
            </ThemedText>
          </View>
        </GlassCard>

        {/* ─── SOS EMERGENCY ACTION BUTTON ────────────────────── */}
        <TouchableOpacity style={styles.sosButton} onPress={handleSOS}>
          <ShieldAlert size={26} color="#FFF" />
          <Text style={styles.sosText}>SOS</Text>
        </TouchableOpacity>

        {/* ─── SOS EMERGENCY CONFIRMATION MODAL OVERLAY ───────── */}
        {sosTriggered && (
          <View style={styles.sosOverlay}>
            <GlassCard style={styles.sosAlertContent}>
              <AlertCircle size={48} color="#EF4444" />
              <ThemedText style={styles.sosAlertTitle}>
                EMERGENCY ALERT TRIGGERED
              </ThemedText>
              <ThemedText style={styles.sosAlertSub}>
                Your coordinates (28.6139° N, 77.2090° E) have been broadcasted to emergency contacts, police authorities, and 3 nearby guides.
              </ThemedText>

              <View style={styles.emergencyActions}>
                <TouchableOpacity
                  style={styles.callAuthorityBtn}
                  onPress={() => Alert.alert('Dialing Police...', 'Calling 112 emergency response.')}
                >
                  <Phone size={16} color="#FFF" />
                  <Text style={styles.callAuthorityText}>Call 112 Police</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelSOSBtn} onPress={() => setSosTriggered(false)}>
                  <Text style={styles.cancelSOSText}>Cancel Alert</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  topFilterOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  filterScroll: {
    gap: 8,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  filterTabActive: {
    backgroundColor: '#0066FF',
  },
  filterTabText: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#7E8494',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  statusBar: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sosButton: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
  },
  sosText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '900',
    marginTop: 1,
  },
  sosOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100,
  },
  sosAlertContent: {
    width: '100%',
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
  },
  sosAlertTitle: {
    color: '#EF4444',
    fontWeight: '900',
    fontSize: 17,
    marginTop: 16,
    textAlign: 'center',
  },
  sosAlertSub: {
    color: '#7E8494',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  emergencyActions: {
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  callAuthorityBtn: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  callAuthorityText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelSOSBtn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#7E8494',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelSOSText: {
    color: '#7E8494',
    fontSize: 14,
    fontWeight: '700',
  },
});
