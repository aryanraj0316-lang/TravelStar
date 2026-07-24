import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Alert,
  Text,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  ShieldAlert,
  Phone,
  Compass,
  AlertCircle,
  Navigation,
  Layers,
  MapPin,
  Users,
  User,
  Locate,
  Minus,
  Plus,
  Route,
  Clock,
  Zap,
} from 'lucide-react-native';
import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';

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

const TILE_LAYERS: Record<string, { url: string; subdomains: string }> = {
  roadmap: {
    url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  satellite: {
    url: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  terrain: {
    url: 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: "['a','b','c','d']",
  },
};

// Build Leaflet HTML with premium markers
function buildMapHTML(tileKey: string) {
  const tile = TILE_LAYERS[tileKey] || TILE_LAYERS.roadmap;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <style>
      body, html, #map {
        margin: 0; padding: 0; width: 100%; height: 100%;
        background: #0D1117;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .leaflet-control-attribution { display: none !important; }
      .leaflet-control-zoom { display: none !important; }

      .leaflet-popup-content-wrapper {
        background: rgba(13, 17, 23, 0.95) !important;
        color: #F0F6FC !important;
        border: 1px solid rgba(0, 102, 255, 0.35);
        border-radius: 14px !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(0, 102, 255, 0.15);
        padding: 0 !important;
        overflow: hidden;
      }
      .leaflet-popup-tip {
        background: rgba(13, 17, 23, 0.95) !important;
        border: none !important;
        box-shadow: none !important;
      }
      .leaflet-popup-content {
        margin: 0 !important;
        min-width: 200px;
      }
      .popup-card { padding: 14px 16px; }
      .popup-badge {
        display: inline-block;
        padding: 2px 8px; border-radius: 4px;
        font-size: 9px; font-weight: 800;
        letter-spacing: 0.8px; margin-bottom: 6px;
        text-transform: uppercase;
      }
      .popup-badge-guide { background: rgba(16, 185, 129, 0.15); color: #34D399; }
      .popup-badge-group { background: rgba(245, 158, 11, 0.15); color: #FBBF24; }
      .popup-badge-tourist { background: rgba(139, 92, 246, 0.15); color: #A78BFA; }
      .popup-badge-attraction { background: rgba(239, 68, 68, 0.15); color: #F87171; }
      .popup-name { margin: 0 0 4px 0; font-size: 13px; color: #F0F6FC; font-weight: 700; }
      .popup-detail { margin: 0; font-size: 11px; color: #8B949E; line-height: 1.4; }
      .popup-cta {
        display: flex; align-items: center; justify-content: center;
        margin-top: 10px; padding: 8px 0;
        border-top: 1px solid rgba(255,255,255,0.06);
        font-size: 11px; font-weight: 700; color: #0066FF;
      }

      .current-loc-outer {
        width: 28px; height: 28px; border-radius: 14px;
        background: rgba(0, 102, 255, 0.15);
        display: flex; align-items: center; justify-content: center;
        animation: pulse-ring 2s ease-out infinite;
      }
      .current-loc-inner {
        width: 12px; height: 12px; border-radius: 6px;
        background: #0066FF; border: 2px solid #FFF;
        box-shadow: 0 0 10px rgba(0, 102, 255, 0.6);
      }
      @keyframes pulse-ring {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(2.2); opacity: 0; }
      }

      .marker-pin {
        width: 32px; height: 32px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        position: relative;
      }
      .marker-pin::after {
        content: ''; position: absolute;
        bottom: -5px; left: 50%; transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
      }
      .marker-guide { background: #10B981; border: 2px solid #34D399; }
      .marker-guide::after { border-top: 6px solid #10B981; }
      .marker-group { background: #F59E0B; border: 2px solid #FBBF24; }
      .marker-group::after { border-top: 6px solid #F59E0B; }
      .marker-tourist { background: #8B5CF6; border: 2px solid #A78BFA; }
      .marker-tourist::after { border-top: 6px solid #8B5CF6; }
      .marker-attraction { background: #EF4444; border: 2px solid #F87171; }
      .marker-attraction::after { border-top: 6px solid #EF4444; }

      .marker-icon-svg { width: 16px; height: 16px; fill: #FFF; }

      .leaflet-tooltip {
        background: rgba(13, 17, 23, 0.9) !important;
        border: 1px solid rgba(48, 54, 61, 0.5) !important;
        color: #C9D1D9 !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        border-radius: 6px !important;
        padding: 4px 8px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
      }
      .leaflet-tooltip-top:before {
        border-top-color: rgba(13, 17, 23, 0.9) !important;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
      }).setView([27.5650, 77.7008], 7);

      L.tileLayer('${tile.url}', {
        maxZoom: 20,
        subdomains: ${tile.subdomains},
      }).addTo(map);

      var ICONS = {
        GUIDE: '<svg viewBox="0 0 24 24" class="marker-icon-svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        GROUP: '<svg viewBox="0 0 24 24" class="marker-icon-svg"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
        TOURIST: '<svg viewBox="0 0 24 24" class="marker-icon-svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
        ATTRACTION: '<svg viewBox="0 0 24 24" class="marker-icon-svg"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
      };

      var BADGE_CLASS = {
        GUIDE: 'popup-badge-guide',
        GROUP: 'popup-badge-group',
        TOURIST: 'popup-badge-tourist',
        ATTRACTION: 'popup-badge-attraction',
      };

      var MARKER_CLASS = {
        GUIDE: 'marker-guide',
        GROUP: 'marker-group',
        TOURIST: 'marker-tourist',
        ATTRACTION: 'marker-attraction',
      };

      // Route polyline with glow
      var pathPoints = [
        [23.3441, 85.3090],
        [25.6093, 80.7],
        [28.6139, 77.2090],
        [27.4924, 77.6737],
        [27.5650, 77.7008],
      ];

      L.polyline(pathPoints, {
        color: '#0066FF', weight: 10, opacity: 0.15,
        smoothFactor: 1.5, lineCap: 'round', lineJoin: 'round',
      }).addTo(map);

      L.polyline(pathPoints, {
        color: '#0066FF', weight: 4, opacity: 0.9,
        smoothFactor: 1.5, lineCap: 'round', lineJoin: 'round',
      }).addTo(map);

      var routeCities = ${JSON.stringify(ROUTE_COORDS)};
      routeCities.forEach(function(city, idx) {
        var isCompleted = idx <= 1;
        L.circleMarker([city.latitude, city.longitude], {
          radius: isCompleted ? 6 : 4,
          fillColor: isCompleted ? '#0066FF' : '#30363D',
          color: isCompleted ? '#58A6FF' : '#484F58',
          weight: 2, opacity: 1, fillOpacity: 1,
        }).addTo(map).bindTooltip(city.name, {
          permanent: false, direction: 'top', offset: [0, -10],
        });
      });

      // Current location
      var locIcon = L.divIcon({
        html: '<div class="current-loc-outer"><div class="current-loc-inner"></div></div>',
        className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      });
      L.marker([28.6139, 77.2090], { icon: locIcon }).addTo(map);

      // Map pins
      var pins = ${JSON.stringify(MAP_PINS)};
      var markerInstances = [];

      pins.forEach(function(pin) {
        var icon = L.divIcon({
          html: '<div class="marker-pin ' + MARKER_CLASS[pin.type] + '">' + ICONS[pin.type] + '</div>',
          className: '', iconSize: [32, 37], iconAnchor: [16, 37], popupAnchor: [0, -40],
        });

        var popupHTML = '<div class="popup-card">' +
          '<div class="popup-badge ' + BADGE_CLASS[pin.type] + '">' + pin.type + '</div>' +
          '<p class="popup-name">' + pin.name + '</p>' +
          '<p class="popup-detail">' + pin.detail + '</p>' +
          '<div class="popup-cta">Navigate \\u2192</div></div>';

        var marker = L.marker([pin.latitude, pin.longitude], { icon: icon })
          .addTo(map)
          .bindPopup(popupHTML, { closeButton: false, minWidth: 200 });

        markerInstances.push({ marker: marker, type: pin.type });
      });

      function applyFilter(filter) {
        markerInstances.forEach(function(item) {
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

      function handleMsg(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'FILTER') applyFilter(data.filter);
          if (data.type === 'ZOOM_IN') map.zoomIn();
          if (data.type === 'ZOOM_OUT') map.zoomOut();
          if (data.type === 'RECENTER') map.flyTo([27.5650, 77.7008], 7, { duration: 1.2 });
        } catch(e) {}
      }
      document.addEventListener('message', handleMsg);
      window.addEventListener('message', handleMsg);
    <\/script>
  </body>
  </html>
  `;
}

// Filter chip config
const FILTER_CHIPS = [
  { key: 'ALL', label: 'All', Icon: Compass, color: '#0066FF' },
  { key: 'GUIDES', label: 'Guides', Icon: User, color: '#10B981' },
  { key: 'GROUPS', label: 'Groups', Icon: Users, color: '#F59E0B' },
  { key: 'TOURISTS', label: 'Tourists', Icon: MapPin, color: '#8B5CF6' },
] as const;

export default function MapScreen() {
  const { triggerSOS } = useApp();
  const [mapFilter, setMapFilter] = useState<'ALL' | 'GUIDES' | 'GROUPS' | 'TOURISTS'>('ALL');
  const [sosTriggered, setSosTriggered] = useState(false);
  const [tileLayer, setTileLayer] = useState<'roadmap' | 'satellite' | 'terrain' | 'dark'>('roadmap');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const sosPulse = useRef(new Animated.Value(1)).current;

  // SOS pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(sosPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleSOS = () => {
    triggerSOS(28.6139, 77.2090);
    setSosTriggered(true);
  };

  // Post filter updates to Leaflet
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'FILTER', filter: mapFilter }));
    }
  }, [mapFilter]);

  const postMapMessage = (msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  };

  return (
    <View style={styles.screenRoot}>
      <View style={styles.mapContainer}>
        {/* LEAFLET WEBVIEW */}
        <WebView
          ref={webViewRef}
          key={tileLayer}
          originWhitelist={['*']}
          source={{ html: buildMapHTML(tileLayer) }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />

        {/* TOP FILTER BAR */}
        <SafeAreaView edges={['top']} style={styles.topSafeArea}>
          <View style={styles.filterBarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterBarScroll}
            >
              {FILTER_CHIPS.map(({ key, label, Icon, color }) => {
                const isActive = mapFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setMapFilter(key as any)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.filterDot, { backgroundColor: isActive ? color : 'transparent' }]} />
                    <Icon size={13} color={isActive ? '#FFF' : '#8B949E'} />
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>

        {/* LIVE STATUS PILL */}
        <View style={styles.statusPillContainer}>
          <LinearGradient
            colors={['rgba(0, 102, 255, 0.12)', 'rgba(139, 92, 246, 0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusPill}
          >
            <View style={styles.statusLiveDot} />
            <Compass size={12} color="#0066FF" />
            <Text style={styles.statusPillText}>
              Live Tracking • Ranchi-Delhi Highway
            </Text>
          </LinearGradient>
        </View>

        {/* MAP CONTROLS (RIGHT SIDE) */}
        <View style={styles.mapControlsCol}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setShowLayerPicker(!showLayerPicker)}
            activeOpacity={0.8}
          >
            <Layers size={17} color="#C9D1D9" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => postMapMessage({ type: 'ZOOM_IN' })}
            activeOpacity={0.8}
          >
            <Plus size={17} color="#C9D1D9" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => postMapMessage({ type: 'ZOOM_OUT' })}
            activeOpacity={0.8}
          >
            <Minus size={17} color="#C9D1D9" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => postMapMessage({ type: 'RECENTER' })}
            activeOpacity={0.8}
          >
            <Locate size={17} color="#0066FF" />
          </TouchableOpacity>
        </View>

        {/* LAYER PICKER POPOVER */}
        {showLayerPicker && (
          <View style={styles.layerPickerPanel}>
            {(['roadmap', 'satellite', 'terrain', 'dark'] as const).map((key) => {
              const labels = { roadmap: 'Google Maps', satellite: 'Satellite', terrain: 'Terrain', dark: 'Dark Mode' };
              const isActive = tileLayer === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.layerPickerItem, isActive && styles.layerPickerItemActive]}
                  onPress={() => { setTileLayer(key); setShowLayerPicker(false); }}
                >
                  <Text style={[styles.layerPickerText, isActive && { color: '#0066FF' }]}>
                    {labels[key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* BOTTOM TRIP INFO CARD */}
        <View style={styles.bottomCardContainer}>
          <LinearGradient
            colors={['rgba(13, 17, 23, 0.97)', 'rgba(13, 17, 23, 0.92)']}
            style={styles.bottomCard}
          >
            <View style={styles.bottomCardHeader}>
              <View style={styles.routeIconWrap}>
                <Route size={14} color="#0066FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomCardTitle}>Delhi → Mathura</Text>
                <Text style={styles.bottomCardSub}>Active segment • 2 of 4 stops</Text>
              </View>
              <View style={styles.etaBadge}>
                <Text style={styles.etaBadgeText}>ETA 3h 20m</Text>
              </View>
            </View>

            <View style={styles.routeProgressBg}>
              <LinearGradient
                colors={['#0066FF', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.routeProgressFill, { width: '50%' }]}
              />
            </View>

            <View style={styles.bottomStatsRow}>
              <View style={styles.bottomStatItem}>
                <Clock size={11} color="#8B949E" />
                <Text style={styles.bottomStatLabel}>Distance</Text>
                <Text style={styles.bottomStatVal}>145 km</Text>
              </View>
              <View style={styles.bottomStatDivider} />
              <View style={styles.bottomStatItem}>
                <Zap size={11} color="#8B949E" />
                <Text style={styles.bottomStatLabel}>Speed</Text>
                <Text style={styles.bottomStatVal}>65 km/h</Text>
              </View>
              <View style={styles.bottomStatDivider} />
              <View style={styles.bottomStatItem}>
                <Navigation size={11} color="#8B949E" />
                <Text style={styles.bottomStatLabel}>Next Stop</Text>
                <Text style={styles.bottomStatVal}>Mathura</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* SOS BUTTON */}
        <Animated.View style={[styles.sosButtonWrap, { transform: [{ scale: sosPulse }] }]}>
          <TouchableOpacity style={styles.sosButton} onPress={handleSOS} activeOpacity={0.85}>
            <ShieldAlert size={22} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>

        {/* SOS MODAL */}
        {sosTriggered && (
          <View style={styles.sosOverlay}>
            <View style={styles.sosModalCard}>
              <LinearGradient
                colors={['rgba(239, 68, 68, 0.15)', 'rgba(13, 17, 23, 0.98)']}
                style={styles.sosModalGradient}
              >
                <AlertCircle size={44} color="#EF4444" />
                <Text style={styles.sosModalTitle}>EMERGENCY ALERT TRIGGERED</Text>
                <Text style={styles.sosModalSub}>
                  Your coordinates (28.6139° N, 77.2090° E) have been broadcasted to emergency contacts, police authorities, and 3 nearby guides.
                </Text>

                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Alert.alert('Dialing Police...', 'Calling 112 emergency response.')}
                >
                  <Phone size={16} color="#FFF" />
                  <Text style={styles.callBtnText}>Call 112 Police</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelSosBtn} onPress={() => setSosTriggered(false)}>
                  <Text style={styles.cancelSosBtnText}>Cancel Alert</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },

  // Top filter bar
  topSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  filterBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterBarScroll: {
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 17, 23, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
  },
  filterChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#8B949E',
  },
  filterChipTextActive: {
    color: '#FFF',
  },

  // Status pill
  statusPillContainer: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    zIndex: 15,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.2)',
  },
  statusLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#C9D1D9',
  },

  // Map controls column
  mapControlsCol: {
    position: 'absolute',
    right: 16,
    top: '35%',
    zIndex: 15,
    gap: 6,
  },
  mapControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(13, 17, 23, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Layer picker
  layerPickerPanel: {
    position: 'absolute',
    right: 64,
    top: '35%',
    zIndex: 25,
    backgroundColor: 'rgba(13, 17, 23, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    padding: 4,
    minWidth: 120,
  },
  layerPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  layerPickerItemActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
  },
  layerPickerText: {
    color: '#C9D1D9',
    fontSize: 12,
    fontWeight: '600',
  },

  // Bottom trip card
  bottomCardContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 80,
    zIndex: 15,
  },
  bottomCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.5)',
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  routeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCardTitle: {
    color: '#F0F6FC',
    fontSize: 13,
    fontWeight: '800',
  },
  bottomCardSub: {
    color: '#8B949E',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  etaBadge: {
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 0.8,
    borderColor: 'rgba(0, 102, 255, 0.25)',
  },
  etaBadgeText: {
    color: '#58A6FF',
    fontSize: 9,
    fontWeight: '800',
  },
  routeProgressBg: {
    height: 4,
    backgroundColor: '#21262D',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  routeProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  bottomStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  bottomStatLabel: {
    color: '#484F58',
    fontSize: 9,
    fontWeight: '600',
  },
  bottomStatVal: {
    color: '#C9D1D9',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#21262D',
  },

  // SOS button
  sosButtonWrap: {
    position: 'absolute',
    bottom: 30,
    right: 16,
    zIndex: 20,
  },
  sosButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // SOS overlay
  sosOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 200,
  },
  sosModalCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  sosModalGradient: {
    padding: 28,
    alignItems: 'center',
  },
  sosModalTitle: {
    color: '#EF4444',
    fontWeight: '900',
    fontSize: 17,
    marginTop: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  sosModalSub: {
    color: '#8B949E',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  callBtn: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginTop: 20,
  },
  callBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelSosBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30363D',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  cancelSosBtnText: {
    color: '#8B949E',
    fontSize: 14,
    fontWeight: '700',
  },
});
