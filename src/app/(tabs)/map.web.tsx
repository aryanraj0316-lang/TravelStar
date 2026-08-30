import { ThemedText } from '@/components/themed-text';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/feedback';
import { getCurrentDeviceLocation } from '@/lib/device-location';
import GlassCard from '@/components/ui/GlassCard';
import { useApp } from '@/store/AppContext';
import { eventBus } from '@/services/event-bus';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  EyeOff,
  Locate,
  Minus,
  Navigation,
  Phone,
  Plus,
  Route,
  ShieldAlert,
  Star,
  User,
  Users,
  X,
  Zap
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Coordinates registry for dynamic routes mapping
// docs/REMEDIATION.md §8.8: a local city coordinate table used to live
// here, feeding a client-side route builder that hashed unknown city names
// into invented coordinates. Routes and pin positions are now resolved
// server-side (GET /map/trips/:id/route, GET /map/pins).
type RoutePoint = { latitude: number; longitude: number; name: string };

// Ranchi to Vrindavan Route Cities Coordinates
// docs/REMEDIATION.md §8.8: a hardcoded Ranchi→Delhi→Mathura→Vrindavan
// route and four hardcoded pins ("Rajesh Kumar (Guide)", a
// "Ranchi-Vrindavan Group", solo tourist "Neha Mehta", Prem Mandir) used
// to live here — identical on every user's map, with nothing behind them.
// Both now come from the API.

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const getLegDetails = (startIndex: number, coords: any[]) => {
  const start = coords[startIndex];
  const end = coords[startIndex + 1];
  if (!start || !end) return null;

  // docs/REMEDIATION.md §8.8: this used to invent a road-condition string,
  // a duration from a made-up ×1.25 road factor at an assumed 70 km/h, and
  // two named pit stops per leg — none of it from any routing service.
  // Straight-line distance between two real coordinates is the one thing
  // genuinely derivable here, and the UI labels it as such.
  const distance = calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);

  return {
    legNumber: startIndex + 1,
    startName: start.name,
    endName: end.name,
    distance: `${Math.round(distance)} km`,
    start,
    end,
  };
};

// docs/REMEDIATION.md §8.8: a getNavigationSteps() used to live here,
// returning six invented turns per leg ("Toll plaza ahead, prepare FASTag
// payment") for any pair of cities, with no routing service behind it.
// Removed — the overlay hands the leg to a real maps app instead.

function WebMapScreen() {
  const { t } = useTranslation();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  useEffect(() => {
    logger.log('Screen mounted: WebMapScreen');
    const unsub = eventBus.on('focusTripOnMap', (id: string) => {
      setSelectedTripId(id);
    });
    return unsub;
  }, []);
  const router = useRouter();
  const { triggerSOS, trips } = useApp();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [mapFilter, setMapFilter] = useState<'ALL' | 'GUIDES' | 'GROUPS' | 'TOURISTS' | 'ATTRACTIONS' | 'NONE'>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  // docs/REMEDIATION.md §8.8: the confirmation card used to state a
  // hardcoded "28.6139° N, 77.2090° E" — New Delhi — as the coordinates
  // that had been sent, whatever the user's real position was, and claimed
  // "police authorities and 3 nearby guides" had been notified. No police
  // force is integrated with this app. These are the coordinates actually
  // sent.
  const [sosCoords, setSosCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null);
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);
  const [showNavigationOverlay, setShowNavigationOverlay] = useState(false);
  const [isBottomPanelCollapsed, setIsBottomPanelCollapsed] = useState(false);
  const [isMainPanelCollapsed, setIsMainPanelCollapsed] = useState(false);
  const toggleItineraryDropdown = () => {
    setIsDropdownOpen(false);
    setIsItineraryOpen((prev) => !prev);
  };

  const toggleCategoryDropdown = () => {
    setIsItineraryOpen(false);
    setIsDropdownOpen((prev) => !prev);
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postMapMessage = useCallback((msg: object) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
    }
  }, []);

  // Helper: select a leg — updates React state AND tells the iframe to zoom
  const selectLegFromReact = useCallback((idx: number | null) => {
    setSelectedLegIndex(idx);
    postMapMessage({ type: 'SELECT_LEG', index: idx });
  }, [postMapMessage]);

  useEffect(() => {
    const handleMapMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'CHECKPOINT_CLICKED') {
          setSelectedLegIndex(data.index);
        }
      } catch { }
    };
    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, []);

  // Post filter updates to Leaflet web iframe
  useEffect(() => {
    postMapMessage({ type: 'FILTER', filter: mapFilter });
  }, [mapFilter, postMapMessage]);


  // Dials India's real national emergency number. The button that calls this
  // used to pop an Alert reading "Dialing Police... Calling 112 emergency
  // response" and place no call at all — shown on the SOS confirmation
  // screen, to someone who has just declared an emergency. That is the same
  // class of fake as the "24/7 Safety SOS Hotline" §8.9 replaced, in a worse
  // place. No confirmation step: an emergency control should not add a tap.
  const handleCallEmergencyServices = () => {
    Linking.openURL('tel:112').catch((e: unknown) => {
      logger.warn('[Map] Failed to open the phone dialer:', e);
      toast(t('map.couldNotOpenDialer'), 'error');
    });
  };

  const handleRecenter = () => {
    selectLegFromReact(null);
    postMapMessage({ type: 'RECENTER' });
  };

  // Real device GPS via the browser's Geolocation API (REMEDIATION.md
  // §8.9) — previously hardcoded to New Delhi's coordinates regardless of
  // where the user actually was.
  const handleSOS = async () => {
    const location = await getCurrentDeviceLocation();
    if (!location.ok) {
      const message = location.reason === 'PERMISSION_DENIED'
        ? t('map.sosPermissionRequired')
        : t('map.couldNotGetLocation');
      toast(message, 'error');
      return;
    }
    triggerSOS(location.latitude, location.longitude);
    setSosCoords({ latitude: location.latitude, longitude: location.longitude });
    setSosTriggered(true);
  };

  // Resolve dynamic route coords from the active trip or nearby place
  let activeTrip = trips.find((t) => t.id === (selectedTripId || tripId));

  const [, setBottomCardHeight] = useState(180);

  const filterOptions = [
    { value: 'ALL', labelKey: 'map.filterAllCategories', icon: Compass },
    { value: 'GUIDES', labelKey: 'map.filterGuides', icon: Users },
    { value: 'GROUPS', labelKey: 'map.filterGroups', icon: Users },
    { value: 'TOURISTS', labelKey: 'map.filterSoloTourists', icon: User },
    { value: 'ATTRACTIONS', labelKey: 'map.filterAttractions', icon: Star },
    { value: 'NONE', labelKey: 'map.filterNoCategories', icon: EyeOff },
  ];
  const activeOption = filterOptions.find((o) => o.value === mapFilter) || filterOptions[0];

  const handleLocateSelf = () => {
    // Browser will automatically prompt for geolocation permission
    postMapMessage({ type: 'LOCATE_SELF' });
  };

  // docs/REMEDIATION.md §8.8: a `place-`/`nearby-` id used to make this
  // screen invent a whole trip — fake creator, budget, seats, dates and a
  // "Delhi Assembly Gate" meeting point — and render it as real. §8.13
  // rewrote nearby-trips.tsx to only ever hand over real trip ids, so
  // nothing produces those ids any more.

  // The server resolves the route from the trip's real cities and omits
  // the ones it cannot place, rather than the old client-side builder that
  // hashed an unknown city name into coordinates and drew them as fact.
  const { data: tripRoute } = useQuery({
    queryKey: ['map', 'route', activeTrip?.id],
    queryFn: () => apiService.getTripRoute(activeTrip!.id),
    enabled: !!activeTrip?.id,
    staleTime: 5 * 60 * 1000,
  });

  const activeRouteCoords: RoutePoint[] = useMemo(() => tripRoute?.points ?? [], [tripRoute]);

  // Real map pins and hazard overlays (docs/REMEDIATION.md §8.8).
  const { data: mapPins } = useQuery({
    queryKey: ['map', 'pins'],
    queryFn: () => apiService.getMapPins(),
    staleTime: 60 * 1000,
  });

  const { data: mapHazards } = useQuery({
    queryKey: ['map', 'hazards'],
    queryFn: () => apiService.getMapHazards(),
    staleTime: 5 * 60 * 1000,
  });

  const legs = [];
  if (activeRouteCoords && activeRouteCoords.length > 1) {
    for (let i = 0; i < activeRouteCoords.length - 1; i++) {
      legs.push({
        start: activeRouteCoords[i],
        end: activeRouteCoords[i + 1],
      });
    }
  }

  const getLeafletHtml = () => {
    const pinsJson = JSON.stringify(mapPins ?? []);
    const hazardsJson = JSON.stringify(mapHazards ?? []);
    const routeJson = JSON.stringify(activeRouteCoords);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #060814; }
          .leaflet-popup-content {
            margin: 4px 6px !important;
            min-width: 120px;
          }
          .leaflet-popup-content-wrapper {
            background: #111322 !important;
            color: #FFF !important;
            border: 1px solid #1A1D30;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .leaflet-popup-tip {
            background: #111322 !important;
          }
          .leaflet-popup-content h4 { margin: 0 0 1px 0; font-size: 9.5px; color: #FFF; font-weight: bold; }
          .leaflet-popup-content p { margin: 0; font-size: 8.0px; color: #7E8494; line-height: 1.25; }
          /* Ensure the checkpoint badge div fills its icon container for full click coverage */
          .leaflet-marker-icon { pointer-events: auto !important; }
          .checkpoint-badge { pointer-events: auto; }
          /* Smoother tile transitions during animations */
          .leaflet-tile { transition: opacity 0.15s linear; }
          .leaflet-fade-anim .leaflet-tile { transition: opacity 0.15s linear; }
          /* Hide path lines during zoom scaling transitions to keep their width constant */
          .leaflet-zoom-anim .leaflet-overlay-pane {
            opacity: 0 !important;
            transition: opacity 0.1s ease-in-out;
          }
          @keyframes blink {
            0% { opacity: 0.35; }
            50% { opacity: 1.0; }
            100% { opacity: 0.35; }
          }
          .blinking-path {
            animation: blink 1.2s infinite ease-in-out;
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
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          (function() {
            const map = L.map('map', { zoomControl: false, fadeAnimation: true, zoomAnimation: true, markerZoomAnimation: false });
          
          L.tileLayer('https://{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Maps'
          }).addTo(map);

          // Render Route Polyline & Segments
          const routeCoords = ${routeJson};
          const pathPoints = routeCoords.map(c => [c.latitude, c.longitude]);

          // Helper to calculate line weights dynamically based on zoom level (makes lines thinner as you zoom in)
          function getWeights(zoom) {
            return {
              sw: Math.max(3.0, 18.0 - (zoom * 0.8)),   // Shadow line width
              rw: Math.max(1.2, 7.5 - (zoom * 0.35)),   // Main route line width (purple)
              hw: Math.max(2.0, 11.5 - (zoom * 0.5))    // Active highlight line width (yellow)
            };
          }

          const polylineSegments = [];
          const shadowSegments = [];
          if (pathPoints.length > 1) {
            for (let i = 0; i < pathPoints.length - 1; i++) {
              (function(segmentIdx) {
                const segPoints = [pathPoints[segmentIdx], pathPoints[segmentIdx+1]];
                const w = getWeights(map.getZoom());
                
                const shadow = L.polyline(segPoints, {
                  color: '#8B5CF6', weight: w.sw, opacity: 0.08,
                  smoothFactor: 1.2, lineCap: 'round', lineJoin: 'round',
                  interactive: false
                }).addTo(map);
                shadowSegments.push(shadow);

                const segmentPoly = L.polyline(segPoints, {
                  color: '#8B5CF6', weight: w.rw, opacity: 0.75,
                  smoothFactor: 1.2, lineCap: 'round', lineJoin: 'round',
                  interactive: true
                }).addTo(map);

                segmentPoly.on('mouseover', function() {
                  var currentW = getWeights(map.getZoom());
                  this.setStyle({ color: '#8B5CF6', weight: currentW.rw * 1.2, opacity: 0.95 });
                });
                segmentPoly.on('mouseout', function() {
                  var currentW = getWeights(map.getZoom());
                  this.setStyle({ color: '#8B5CF6', weight: currentW.rw, opacity: 0.75 });
                });
                segmentPoly.on('click', function() {
                  var msg = JSON.stringify({ type: 'CHECKPOINT_CLICKED', index: segmentIdx });
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(msg);
                  } else {
                    window.parent.postMessage(msg, '*');
                  }
                });
                polylineSegments.push(segmentPoly);
              })(i);
            }
            // Initial view: zoom out to show the ENTIRE journey
            map.fitBounds(pathPoints, { padding: [60, 60], animate: false });
          } else if (pathPoints.length === 1) {
            map.setView(pathPoints[0], 6);
          } else {
            map.setView([22.0, 78.0], 5);
          }

          // Adjust line weights dynamically depending on the current zoom level
          map.on('zoomend', function() {
            var w = getWeights(map.getZoom());
            shadowSegments.forEach(function(p) { p.setStyle({ weight: w.sw }); });
            polylineSegments.forEach(function(p) { p.setStyle({ weight: w.rw }); });
            if (activeLegPolyline) {
              activeLegPolyline.setStyle({ weight: w.hw });
            }
          });

          // Stop blinking active leg on map interaction
          map.on('mousedown touchstart wheel dragstart click', makeSolid);

          // Draw active leg highlight (yellow highlight color and dynamic width)
          var activeLegPolyline = null;
          function highlightLeg(legIdx) {
            if (activeLegPolyline) {
              map.removeLayer(activeLegPolyline);
              activeLegPolyline = null;
            }
            if (legIdx !== null && legIdx >= 0 && legIdx < pathPoints.length - 1) {
              var legPoints = [pathPoints[legIdx], pathPoints[legIdx+1]];
              var w = getWeights(map.getZoom());
              activeLegPolyline = L.polyline(legPoints, {
                color: '#FFCC00',
                weight: w.hw,
                opacity: 0.95,
                smoothFactor: 1.0,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'blinking-path'
              }).addTo(map);
            }
          }

          function makeSolid() {
            if (activeLegPolyline && activeLegPolyline.options.className === 'blinking-path') {
              var legPoints = activeLegPolyline.getLatLngs();
              var w = getWeights(map.getZoom());
              map.removeLayer(activeLegPolyline);
              activeLegPolyline = L.polyline(legPoints, {
                color: '#FFCC00',
                weight: w.hw,
                opacity: 0.95,
                smoothFactor: 1.0,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(map);
            }
          }

          // Central function to select a leg from a checkpoint click — does direct checkpoint zoom + highlights + notifies parent
          function selectCheckpoint(cityLat, cityLng, legIdx) {
            // Zoom extensively on the selected checkpoint city coordinate (zoom level 16) with a smooth 0.85s animation
            map.flyTo([cityLat, cityLng], 16, { animate: true, duration: 0.85, easeLinearity: 0.25 });
            
            // Highlight the corresponding route leg - disabled for checkpoint clicks
            highlightLeg(null);

            // Notify parent React component
            var msg = JSON.stringify({ type: 'CHECKPOINT_CLICKED', index: legIdx });
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(msg);
            } else {
              window.parent.postMessage(msg, '*');
            }
          }

          // Render Route Checkpoints HTML Badges
          routeCoords.forEach(function(city, idx) {
            const isStart = idx === 0;
            const isEnd = idx === routeCoords.length - 1;
            let badgeBg = '#10B981'; // Emerald Green
            let textColor = '#FFFFFF';
            if (isStart) {
              badgeBg = '#0066FF'; // Blue
              textColor = '#FFFFFF';
            } else if (isEnd) {
              badgeBg = '#F59E0B'; // Amber Gold
              textColor = '#000000'; // Dark text for yellow background
            }

            const checkpointHtml = '<div class="checkpoint-badge" style="' +
              'background: rgba(13, 17, 23, 0.95); ' +
              'color: #F0F6FC; ' +
              'font-family: -apple-system, BlinkMacSystemFont, \\'Segoe UI\\', Roboto, sans-serif; ' +
              'font-size: 10px; ' +
              'font-weight: 600; ' +
              'padding: 3px 8px; ' +
              'border-radius: 6px; ' +
              'border: 1px solid rgba(255, 255, 255, 0.15); ' +
              'box-shadow: 0 4px 12px rgba(0,0,0,0.5); ' +
              'white-space: nowrap; ' +
              'display: inline-flex; ' +
              'align-items: center; ' +
              'gap: 6px; ' +
              'cursor: pointer; ' +
              'transform: translate(-50%, -50%); ' +
              '">' +
              '<span style="' +
                'background: ' + badgeBg + '; ' +
                'color: ' + textColor + '; ' +
                'font-size: 9px; ' +
                'font-weight: 800; ' +
                'width: 14px; ' +
                'height: 14px; ' +
                'border-radius: 3px; ' +
                'display: inline-flex; ' +
                'align-items: center; ' +
                'justify-content: center; ' +
              '">' + (idx + 1) + '</span>' +
              '<span>' + city.name + '</span>' +
              '</div>';

            const checkpointIcon = L.divIcon({
              html: checkpointHtml,
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            });

            const marker = L.marker([city.latitude, city.longitude], { icon: checkpointIcon, zIndexOffset: 1000 }).addTo(map);

            marker.on('click', function() {
              // For start city → leg 0, for end city → last leg, otherwise → leg idx
              var selectedLegIdx = isEnd ? idx - 1 : idx;
              // Clamp to valid range
              if (selectedLegIdx >= pathPoints.length - 1) selectedLegIdx = pathPoints.length - 2;
              if (selectedLegIdx < 0) selectedLegIdx = 0;
              // Trigger checkpoint zoom and highlight
              selectCheckpoint(city.latitude, city.longitude, selectedLegIdx);
            });
          });

          // Render Pins
          const pins = ${pinsJson};
          var markerInstances = [];
          pins.forEach(pin => {
            const markerColor = pin.type === 'GUIDE' ? '#10B981' : 
                               pin.type === 'GROUP' ? '#F59E0B' : 
                               pin.type === 'TOURIST' ? '#8B5CF6' : '#EF4444';
            
            const customIcon = L.divIcon({
              html: '<div style="width:24px;height:24px;border-radius:12px;background:' + markerColor + ';border:2px solid #FFF;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.3)"><span style="color:#FFF;font-size:10px">📍</span></div>',
              className: 'custom-pin-icon',
              iconSize: [24, 24],
              iconAnchor: [12, 24]
            });

            var badgeClass = pin.type === 'GUIDE' ? 'popup-badge-guide' :
                             pin.type === 'GROUP' ? 'popup-badge-group' :
                             pin.type === 'TOURIST' ? 'popup-badge-tourist' : 'popup-badge-attraction';

            var popupHTML = '<div class="popup-card">' +
              '<div class="popup-badge ' + badgeClass + '">' + pin.type + '</div>' +
              '<h4>' + pin.name + '</h4>' +
              '<p>' + pin.detail + '</p>' +
              '<div class="popup-cta" onclick="startNavigationToPin(\'' + pin.id + '\', \'' + pin.name + '\', ' + pin.latitude + ', ' + pin.longitude + ')">Navigate \u2192</div></div>';

            var marker = L.marker([pin.latitude, pin.longitude], { icon: customIcon })
              .addTo(map)
              .bindPopup(popupHTML, { closeButton: false, minWidth: 120 });

            markerInstances.push({ marker: marker, type: pin.type });
          });

          // Hazard alerts from the real /alerts data (§8.8/§8.10), drawn as
          // severity-coloured circles. An alert whose free-text location the
          // server could not resolve arrives with null coordinates and is
          // skipped rather than dropped somewhere arbitrary.
          const hazards = ${hazardsJson};
          var HAZARD_COLOR = { CRITICAL: '#EF4444', WARNING: '#F59E0B', ADVISORY: '#38BDF8' };
          hazards.forEach(function(h) {
            if (h.latitude === null || h.longitude === null) return;
            var color = HAZARD_COLOR[h.severity] || HAZARD_COLOR.ADVISORY;
            L.circle([h.latitude, h.longitude], {
              radius: 25000, color: color, weight: 1.5, fillColor: color, fillOpacity: 0.16,
            }).addTo(map).bindPopup(
              '<div class="popup-card"><div class="popup-badge">' + h.severity + '</div>' +
              '<h4>' + h.title + '</h4><p>' + h.location + '</p></div>',
              { closeButton: false, minWidth: 120 }
            );
          });

          function applyFilter(filter) {
            var bounds = [];
            markerInstances.forEach(function(item) {
              if (filter === 'ALL' ||
                  (filter === 'GUIDES' && item.type === 'GUIDE') ||
                  (filter === 'GROUPS' && item.type === 'GROUP') ||
                  (filter === 'TOURISTS' && item.type === 'TOURIST') ||
                  (filter === 'ATTRACTIONS' && item.type === 'ATTRACTION')) {
                item.marker.addTo(map);
                bounds.push(item.marker.getLatLng());
              } else {
                map.removeLayer(item.marker);
              }
            });
            if (bounds.length > 0) {
              var targetBounds = L.latLngBounds(bounds);
              var targetCenter = targetBounds.getCenter();
              var targetZoom = Math.min(map.getBoundsZoom(targetBounds) || 14, 15);
              
              // Smooth slow cinematic flyover flight animation
              map.flyTo(targetCenter, targetZoom, {
                animate: true,
                duration: 2.2,
                easeLinearity: 0.2
              });
            }
          }

          var selfMarker = null;

          function locateUser() {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                function(position) {
                  var lat = position.coords.latitude;
                  var lng = position.coords.longitude;
                  
                  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                    alert("Invalid coordinates received.");
                    return;
                  }
                  
                  var selfLatLng = [lat, lng];

                  if (!selfMarker) {
                    var currentLocHtml = '<div class="current-loc-outer"><div class="current-loc-inner"></div></div>';
                    var selfIcon = L.divIcon({
                      html: currentLocHtml,
                      className: '',
                      iconSize: [28, 28],
                      iconAnchor: [14, 14]
                    });
                    selfMarker = L.marker(selfLatLng, { icon: selfIcon })
                      .addTo(map)
                      .bindPopup('<b>You are here</b><br>Live GPS Location');
                  } else {
                    selfMarker.setLatLng(selfLatLng);
                  }

                  // Slow cinematic zoom-in focus transition on self location
                  map.flyTo(selfLatLng, 15, {
                    animate: true,
                    duration: 2.2,
                    easeLinearity: 0.2
                  });
                },
                function(error) {
                  var errorMsg = "Unable to retrieve your location.";
                  if (error.code === error.PERMISSION_DENIED) {
                    errorMsg = "Location permission denied. Please allow location access in settings.";
                  }
                  alert(errorMsg);
                },
                { enableHighAccuracy: true, timeout: 8000 }
              );
            } else {
              alert("Geolocation is not supported by this browser.");
            }
          }

          // Handle messages from parent React component
          function handleMsg(event) {
            try {
              var data = JSON.parse(event.data);
              if (data.type === 'FILTER') applyFilter(data.filter);
              if (data.type === 'LOCATE_SELF') locateUser();
              if (data.type === 'ZOOM_IN') map.zoomIn();
              if (data.type === 'ZOOM_OUT') map.zoomOut();
              if (data.type === 'RECENTER') {
                if (activeLegPolyline) {
                  map.removeLayer(activeLegPolyline);
                  activeLegPolyline = null;
                }
                if (pathPoints.length > 1) {
                  map.fitBounds(pathPoints, { padding: [60, 60], animate: true, duration: 0.9 });
                } else if (pathPoints.length > 0) {
                  map.flyTo(pathPoints[0], 6, { animate: true, duration: 0.85 });
                }
              }
              if (data.type === 'SELECT_LEG') {
                var idx = data.index;
                highlightLeg(idx);
                if (pathPoints.length > 1) {
                  map.fitBounds(pathPoints, { padding: [60, 60], animate: true, duration: 0.9 });
                } else if (pathPoints.length > 0) {
                  map.setView(pathPoints[0], 6);
                }
              }
            } catch(e) {}
          }
          window.addEventListener('message', handleMsg);
          })();
        </script>
      </body>
      </html>
    `;
  };

  const lastHtmlRef = useRef<string | null>(null);

  // Write the HTML into the iframe ONLY when the generated HTML content changes.
  // This ensures that state updates like selectedLegIndex do NOT reload the map,
  // preventing flickering and preserving smooth zoom-in animations on the first click.
  useEffect(() => {
    const html = getLeafletHtml();
    if (iframeRef.current && html !== lastHtmlRef.current) {
      lastHtmlRef.current = html;
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: '#060814' }]}>
      <View style={styles.mapContainer}>
        {/* Render the iframe WITHOUT srcDoc — content is written via useEffect */}
        <iframe
          ref={iframeRef}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title={t('map.iframeTitle')}
        />

        {/* ─── FILTERS SELECTOR ROW OVERLAY ───────────────────── */}
        <View style={styles.topFilterOverlay}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.navigate('/')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.goBack')}
          >
            <ArrowLeft size={22} color="#FFF" strokeWidth={3} />
          </TouchableOpacity>

          {/* OPTION 1: ROUTE ITINERARY SELECTOR DROPDOWN */}
          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={toggleItineraryDropdown}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('map.routeSelector')}
              accessibilityState={{ expanded: isItineraryOpen }}
            >
              <View style={styles.dropdownTriggerLeft}>
                <Route size={11} color="#0066FF" style={{ marginRight: 4 }} />
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {t('map.routeStops', { count: legs.length + 1 })}
                </Text>
              </View>
              <ChevronDown size={11} color="#8B949E" style={{ transform: [{ rotate: isItineraryOpen ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>

            {isItineraryOpen && (
              <View style={styles.routeDropdownOptionsCard}>
                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={true}>
                  {/* Option 0: Entire Tour Route */}
                  <TouchableOpacity
                    style={[
                      styles.dropdownOptionRow,
                      selectedLegIndex === null && styles.dropdownOptionRowActive
                    ]}
                    onPress={() => {
                      handleRecenter();
                      setIsItineraryOpen(false);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('map.entireRoute')}
                    accessibilityState={{ selected: selectedLegIndex === null }}
                  >
                    <Compass size={11} color={selectedLegIndex === null ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                    <Text style={[
                      styles.dropdownOptionText,
                      selectedLegIndex === null && styles.dropdownOptionTextActive
                    ]}>
                      {t('map.entireRoute')}
                    </Text>
                  </TouchableOpacity>

                  {/* List of legs */}
                  {legs.map((leg, idx) => {
                    const isActive = selectedLegIndex === idx;
                    const legLabel = t('map.legLabel', {
                      number: idx + 1,
                      start: leg.start.name.split(',')[0],
                      end: leg.end.name.split(',')[0],
                    });
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.dropdownOptionRow,
                          isActive && styles.dropdownOptionRowActive
                        ]}
                        onPress={() => {
                          selectLegFromReact(idx);
                          setIsItineraryOpen(false);
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={legLabel}
                        accessibilityState={{ selected: isActive }}
                      >
                        <Route size={11} color={isActive ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                        <Text style={[
                          styles.dropdownOptionText,
                          isActive && styles.dropdownOptionTextActive
                        ]} numberOfLines={1}>
                          {legLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* OPTION 2: FLOATING MAP SELECTOR DROPDOWN */}
          <View style={styles.dropdownContainer}>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={toggleCategoryDropdown}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('map.categorySelector')}
              accessibilityState={{ expanded: isDropdownOpen }}
            >
              <View style={styles.dropdownTriggerLeft}>
                <activeOption.icon size={11} color="#0066FF" style={{ marginRight: 4 }} />
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {t('map.mapViewLabel', { label: t(activeOption.labelKey).toUpperCase().split(' ')[0] })}
                </Text>
              </View>
              <ChevronDown size={11} color="#8B949E" style={{ transform: [{ rotate: isDropdownOpen ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>

            {isDropdownOpen && (
              <View style={styles.categoryDropdownOptionsCard}>
                {filterOptions.map((opt) => {
                  const isSelected = opt.value === mapFilter;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowActive]}
                      onPress={() => {
                        setMapFilter(opt.value as any);
                        setIsDropdownOpen(false);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t(opt.labelKey)}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <opt.icon size={10} color={isSelected ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                      <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextActive]}>
                        {t(opt.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>





        {/* MAP CONTROLS (RIGHT SIDE) */}
        <View style={styles.mapControlsCol}>
          <TouchableOpacity
            style={[styles.mapControlBtn, { backgroundColor: 'rgba(13, 17, 23, 0.88)' }]}
            onPress={() => postMapMessage({ type: 'ZOOM_IN' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
          >
            <Plus size={17} color={'#C9D1D9'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapControlBtn, { backgroundColor: 'rgba(13, 17, 23, 0.88)' }]}
            onPress={() => postMapMessage({ type: 'ZOOM_OUT' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
          >
            <Minus size={17} color={'#C9D1D9'} />
          </TouchableOpacity>

          {/* Entire Route Recenter */}
          <TouchableOpacity
            style={[styles.mapControlBtn, { backgroundColor: 'rgba(13, 17, 23, 0.88)' }]}
            onPress={handleRecenter}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.recenterRoute')}
          >
            <Route size={17} color={'#C9D1D9'} />
          </TouchableOpacity>

          {/* GPS Self Location */}
          <TouchableOpacity
            style={[styles.mapControlBtn, { backgroundColor: 'rgba(13, 17, 23, 0.88)' }]}
            onPress={handleLocateSelf}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.locateMe')}
          >
            <Locate size={17} color="#0066FF" />
          </TouchableOpacity>

          {/* SOS Emergency - Stable in control strip */}
          <TouchableOpacity
            style={styles.sosControlBtn}
            onPress={handleSOS}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('map.sos')}
          >
            <ShieldAlert size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 1 }}>{t('map.sos')}</Text>
          </TouchableOpacity>
        </View>



        {/* BOTTOM TRIP INFO CARD / SEGMENT NAVIGATION CARD */}
        <View
          style={styles.bottomCardContainer}
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            if (height > 0) {
              setBottomCardHeight(height);
            }
          }}
        >
          {selectedLegIndex === null ? (
            <GlassCard style={styles.bottomCard}>
              <View style={styles.bottomCardHeader}>
                <View style={styles.routeIconWrap}>
                  <Route size={14} color="#0066FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.bottomCardTitle} numberOfLines={1}>
                    {activeTrip ? activeTrip.cities[0] : 'Ranchi'} ➔ {activeTrip ? activeTrip.cities[activeTrip.cities.length - 1] : 'Vrindavan'}
                  </ThemedText>
                  <ThemedText style={styles.bottomCardSub}>
                    {activeTrip ? t('map.routeWithCities', { count: activeRouteCoords.length }) : t('map.activeSegmentFallback')}
                  </ThemedText>
                </View>
                <View style={styles.etaBadge}>
                  <Text style={styles.etaBadgeText}>{t('map.etaLabel', { time: '3h 20m' })}</Text>
                </View>

                {/* Main Panel Collapse/Expand Toggle Button */}
                <TouchableOpacity
                  onPress={() => setIsMainPanelCollapsed(!isMainPanelCollapsed)}
                  activeOpacity={0.8}
                  style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginLeft: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={isMainPanelCollapsed ? t('map.expandPanel') : t('map.collapsePanel')}
                >
                  <LinearGradient
                    colors={['#0066FF', '#00D2FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isMainPanelCollapsed ? (
                      <ChevronUp size={14} color="#FFF" />
                    ) : (
                      <ChevronDown size={14} color="#FFF" />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {!isMainPanelCollapsed && (
                <>
                  <View style={styles.routeProgressBg}>
                    <View style={[styles.routeProgressFill, { width: activeTrip ? '100%' : '50%' }]} />
                  </View>

                  <View style={styles.bottomStatsRow}>
                    <View style={styles.bottomStatItem}>
                      <Clock size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>{t('map.distance')}</Text>
                      <ThemedText style={styles.bottomStatVal}>
                        {activeTrip ? activeTrip.cities.length * 115 : 145} km
                      </ThemedText>
                    </View>
                    <View style={styles.bottomStatDivider} />
                    <View style={styles.bottomStatItem}>
                      <Zap size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>{t('map.speed')}</Text>
                      <ThemedText style={styles.bottomStatVal}>65 km/h</ThemedText>
                    </View>
                    <View style={styles.bottomStatDivider} />
                    <View style={styles.bottomStatItem}>
                      <Navigation size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>{t('map.nextStop')}</Text>
                      <ThemedText style={styles.bottomStatVal}>
                        {activeTrip ? (activeTrip.cities[1] || activeTrip.cities[0]) : 'Mathura'}
                      </ThemedText>
                    </View>
                  </View>
                </>
              )}
            </GlassCard>
          ) : (
            <GlassCard style={styles.bottomCard}>
              {(() => {
                const legDetails = getLegDetails(selectedLegIndex, activeRouteCoords);

                // Determine vehicle based on activeTrip
                let vehicleName = t('map.vehicleSedan');
                if (activeTrip) {
                  if (activeTrip.totalSeats <= 4) {
                    vehicleName = t('map.vehiclePremiumSedan');
                  } else if (activeTrip.totalSeats > 4 && activeTrip.totalSeats <= 7) {
                    vehicleName = t('map.vehicleLuxurySuv');
                  } else if (activeTrip.totalSeats > 7 && activeTrip.totalSeats <= 15) {
                    vehicleName = t('map.vehicleTravelerVan');
                  } else {
                    vehicleName = t('map.vehicleAcTourBus');
                  }
                }

                // Determine facilities based on activeTrip
                let facilities: string[] = [];
                if (activeTrip) {
                  if (activeTrip.guideIncluded) facilities.push(t('map.facilityGuide'));
                  if (activeTrip.foodIncluded) facilities.push(t('map.facilityFood'));
                  if (activeTrip.hotelIncluded !== false) facilities.push(t('map.facilityHotel'));
                  if (activeTrip.cabIncluded !== false) {
                    const isBike = activeTrip.name?.toLowerCase().includes('bike');
                    facilities.push(isBike ? t('map.facilityFuelBike') : t('map.facilityAcVehicle'));
                  }
                }

                return (
                  <>
                    {/* Header Row: Trip Context & Creator */}
                    <View style={styles.bottomCardHeader}>
                      <View style={[styles.routeIconWrap, { backgroundColor: 'rgba(0, 102, 255, 0.1)' }]}>
                        <Route size={15} color="#0066FF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.bottomCardTitle} numberOfLines={1}>
                          {activeTrip ? activeTrip.name : 'Ranchi to Vrindavan Road Trip'}
                        </ThemedText>
                        <ThemedText style={styles.bottomCardSub} numberOfLines={1}>
                          {t('map.organizerLabel', { name: activeTrip ? activeTrip.creator : 'Local Guide' })}
                        </ThemedText>
                      </View>

                      {/* Compact Switcher Chevrons removed */}

                      <TouchableOpacity
                        onPress={() => setIsBottomPanelCollapsed(!isBottomPanelCollapsed)}
                        activeOpacity={0.8}
                        style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginRight: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={isBottomPanelCollapsed ? t('map.expandPanel') : t('map.collapsePanel')}
                      >
                        <LinearGradient
                          colors={['#0066FF', '#00D2FF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {isBottomPanelCollapsed ? (
                            <ChevronUp size={14} color="#FFF" />
                          ) : (
                            <ChevronDown size={14} color="#FFF" />
                          )}
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleRecenter}
                        style={styles.closeLegBtn}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={t('map.closeLegDetails')}
                      >
                        <X size={15} color="#8B949E" />
                      </TouchableOpacity>
                    </View>

                    {/* Segment Info Row: Leg name & Road condition */}
                    <View style={styles.segmentInfoRow}>
                      <Text style={styles.segmentLegTitle}>
                        {legDetails
                          ? t('map.legLabel', {
                              number: legDetails.legNumber,
                              start: legDetails.startName,
                              end: legDetails.endName,
                            })
                          : ''}
                      </Text>
                      <Text style={styles.segmentRoadText}>{t('map.straightLineDistance')}</Text>
                    </View>

                    {!isBottomPanelCollapsed && (
                      <ScrollView
                        style={{ maxHeight: 150, marginTop: 4 }}
                        contentContainerStyle={{ gap: 8 }}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                      >
                        {/* Stats Grid: Duration, Distance, Transit Mode, Seats */}
                        <View style={styles.statsGridRow}>
                          <View style={styles.statsGridCol}>
                            <Compass size={11} color="#0066FF" />
                            <Text style={styles.statsGridVal}>{legDetails?.distance}</Text>
                          </View>
                          <View style={styles.statsGridDivider} />
                          <View style={styles.statsGridCol}>
                            <Car size={11} color="#58A6FF" />
                            <Text style={styles.statsGridVal} numberOfLines={1}>{vehicleName}</Text>
                          </View>
                          <View style={styles.statsGridDivider} />
                          <View style={styles.statsGridCol}>
                            <Users size={11} color="#A78BFA" />
                            <Text style={styles.statsGridVal}>
                              {activeTrip
                                ? t('map.seatsCount', { available: activeTrip.availableSeats, total: activeTrip.totalSeats })
                                : '—'}
                            </Text>
                          </View>
                        </View>

                        {/* Real trip metadata. docs/REMEDIATION.md §8.8: these
                        used to fall back to a hardcoded "Delhi Metro Station
                        Gate 1" and ₹1500 with no trip selected, and listed
                        two invented pit stops per leg. */}
                        <View style={styles.dbDetailsContainer}>
                          {activeTrip && (
                            <>
                              <Text style={styles.dbDetailsText}>
                                <Text style={styles.dbDetailsLabel}>{t('map.meetingPointLabel')}</Text>
                                {activeTrip.meetingPoint}
                              </Text>

                              <Text style={styles.dbDetailsText}>
                                <Text style={styles.dbDetailsLabel}>{t('map.budgetLabel')}</Text>
                                {t('map.budgetPerPerson', { amount: activeTrip.budget })}
                              </Text>
                            </>
                          )}

                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                            <Text style={styles.dbDetailsLabel}>{t('map.serviceInclusionLabel')}</Text>
                            <View style={styles.facilitiesChipsWrap}>
                              {facilities.map((fac, fIdx) => (
                                <View key={fIdx} style={styles.facilityChip}>
                                  <Text style={styles.facilityChipText}>{fac}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        </View>
                      </ScrollView>
                    )}
                  </>
                );
              })()}
            </GlassCard>
          )}
        </View>



        {/* Route handoff (docs/REMEDIATION.md §8.8). This was a
        "Turn-by-Turn Guide" listing six invented instructions per leg with
        a "Start Navigation Guide" button that popped "GPS simulation
        active" — there was never any navigation. Real turn-by-turn needs a
        routing provider this project has no credentials for, so the leg
        goes to a real maps app instead. */}
        {showNavigationOverlay && selectedLegIndex !== null && (
          <View style={styles.navOverlayContainer}>
            <GlassCard style={styles.navOverlayCard}>
              <View style={styles.navOverlayHeader}>
                <Compass size={18} color="#10B981" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <ThemedText style={styles.navOverlayTitle}>{t('map.directions')}</ThemedText>
                  <ThemedText style={styles.navOverlaySub} numberOfLines={1}>
                    {(() => {
                      const leg = getLegDetails(selectedLegIndex, activeRouteCoords);
                      return leg ? t('map.legLabel', { number: leg.legNumber, start: leg.startName, end: leg.endName }) : '';
                    })()}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.closeOverlayBtn}
                  onPress={() => setShowNavigationOverlay(false)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.closeDirections')}
                >
                  <X size={16} color="#C9D1D9" />
                </TouchableOpacity>
              </View>

              <ThemedText style={styles.navHandoffNote}>{t('map.navHandoffNote')}</ThemedText>

              <TouchableOpacity
                style={styles.startDrivingBtn}
                onPress={() => {
                  const leg = getLegDetails(selectedLegIndex, activeRouteCoords);
                  if (!leg) return;
                  const origin = `${leg.start.latitude},${leg.start.longitude}`;
                  const destination = `${leg.end.latitude},${leg.end.longitude}`;
                  Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
                  ).catch((e: unknown) => {
                    logger.warn('[Map] Could not open directions:', e);
                    toast(t('map.couldNotOpenMapsApp'), 'error');
                  });
                  setShowNavigationOverlay(false);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('map.openInMaps')}
              >
                <Text style={styles.startDrivingBtnText}>{t('map.openInMaps')}</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        )}



        {/* ─── SOS EMERGENCY CONFIRMATION MODAL OVERLAY ───────── */}
        {sosTriggered && (
          <View style={styles.sosOverlay}>
            <GlassCard style={styles.sosAlertContent}>
              <AlertCircle size={48} color="#EF4444" />
              <ThemedText style={styles.sosAlertTitle}>
                {t('map.emergencyAlertTriggered')}
              </ThemedText>
              <ThemedText style={styles.sosAlertSub}>
                {sosCoords
                  ? t('map.sosMessageWithCoords', {
                      lat: sosCoords.latitude.toFixed(4),
                      lng: sosCoords.longitude.toFixed(4),
                    })
                  : t('map.sosMessageNoCoords')}
              </ThemedText>

              <View style={styles.emergencyActions}>
                <TouchableOpacity
                  style={styles.callAuthorityBtn}
                  onPress={handleCallEmergencyServices}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.call112Police')}
                >
                  <Phone size={16} color="#FFF" />
                  <Text style={styles.callAuthorityText}>{t('map.call112Police')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelSOSBtn}
                  onPress={() => setSosTriggered(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.cancelAlert')}
                >
                  <Text style={styles.cancelSOSText}>{t('map.cancelAlert')}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    flex: 1,
    position: 'relative',
    zIndex: 999,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 17, 23, 0.95)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownTriggerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  routeDropdownOptionsCard: {
    position: 'absolute',
    top: 38,
    left: -46,
    minWidth: 260,
    backgroundColor: 'rgba(13, 17, 23, 0.98)',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  categoryDropdownOptionsCard: {
    position: 'absolute',
    top: 38,
    right: 0,
    minWidth: 155,
    backgroundColor: 'rgba(13, 17, 23, 0.98)',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  dropdownOptionRowActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
  },
  dropdownOptionText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: '#0066FF',
    fontWeight: '700',
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
  sosControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 6,
  },
  sosText: {
    color: '#FFF',
    fontSize: 12,
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
  mapControlsCol: {
    position: 'absolute',
    right: 16,
    top: '30%',
    zIndex: 15,
    gap: 6,
  },
  mapControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentStripContainer: {
    position: 'absolute',
    bottom: 200,
    left: 16,
    right: 16,
    zIndex: 15,
  },
  segmentStripScroll: {
    gap: 8,
  },
  segmentTab: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentTabActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B949E',
  },
  segmentTabTextActive: {
    color: '#FFF',
  },
  bottomCardContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 15,
  },
  bottomCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.3)',
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
    fontSize: 13,
    fontWeight: '800',
  },
  bottomCardSub: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '800',
  },
  routeProgressBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  routeProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#0066FF',
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
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomStatVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  closeLegBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  legDetailsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  legDetailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(48, 54, 61, 0.4)',
    borderWidth: 0.8,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  legDetailBadgeText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '700',
  },
  pitStopsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(48, 54, 61, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  pitStopsTitle: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  pitStopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pitStopText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '600',
  },
  legActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  switcherBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    backgroundColor: 'rgba(13, 17, 23, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherBtnDisabled: {
    opacity: 0.4,
    backgroundColor: 'rgba(13, 17, 23, 0.4)',
  },
  startNavBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 32,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startNavBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  navFab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  navOverlayContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  navOverlayCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.5)',
    padding: 20,
  },
  navOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  navOverlayTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  navOverlaySub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  closeOverlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsScroll: {
    marginBottom: 16,
    maxHeight: 250,
  },
  stepsScrollContent: {
    gap: 12,
  },
  stepItemRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  stepIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  stepInstruction: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  stepDistance: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  navHandoffNote: {
    color: '#8B949E',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    marginBottom: 14,
  },
  startDrivingBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startDrivingBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  itineraryPanelContainer: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    zIndex: 30,
  },
  itineraryCard: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.3)',
  },
  itineraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itineraryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itineraryHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  itineraryHeaderRight: {
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  itineraryToggleText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
  },
  itineraryList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(48, 54, 61, 0.2)',
    paddingTop: 8,
    gap: 6,
  },
  itineraryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  itineraryItemActive: {
    backgroundColor: '#10B981',
  },
  itineraryItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B949E',
  },
  itineraryItemTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  miniSwitcherBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.5)',
    backgroundColor: 'rgba(13, 17, 23, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniSwitcherBtnDisabled: {
    opacity: 0.35,
  },
  statsGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(48, 54, 61, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  statsGridCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'center',
  },
  statsGridVal: {
    color: '#C9D1D9',
    fontSize: 12,
    fontWeight: '700',
  },
  statsGridDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  compactDetailsBlock: {
    gap: 4,
  },
  compactDetailsText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '600',
  },
  compactDetailsLabel: {
    color: '#58A6FF',
    fontWeight: '700',
  },
  segmentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  segmentLegTitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentRoadText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '600',
  },
  dbDetailsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.2)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  dbDetailsText: {
    color: '#C9D1D9',
    fontSize: 12,
    fontWeight: '600',
  },
  dbDetailsLabel: {
    color: '#8B949E',
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  dbMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  facilitiesChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  facilityChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 0.5,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  facilityChipText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  collapseGradientBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    // Web CSS gradient fallback
    ...({
      backgroundImage: 'linear-gradient(135deg, #0066FF, #00D2FF)',
    } as any),
  },
});

export default memo(WebMapScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Map" />;
}
