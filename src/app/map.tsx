import { useApp } from '@/store/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { apiService } from '@/services/api';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  EyeOff,
  Layers,
  Locate,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  Route,
  ShieldAlert,
  Star,
  Check,
  User,
  Users,
  X,
  Zap
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Coordinates registry for dynamic routes mapping
const CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  // Northern India
  'Delhi': { latitude: 28.6139, longitude: 77.2090 },
  'New Delhi': { latitude: 28.6139, longitude: 77.2090 },
  'Noida': { latitude: 28.5355, longitude: 77.3910 },
  'Gurugram': { latitude: 28.4595, longitude: 77.0266 },
  'Gurgaon': { latitude: 28.4595, longitude: 77.0266 },
  'Faridabad': { latitude: 28.4089, longitude: 77.3178 },
  'Ghaziabad': { latitude: 28.6692, longitude: 77.4538 },
  'Agra': { latitude: 27.1767, longitude: 78.0081 },
  'Mathura': { latitude: 27.4924, longitude: 77.6737 },
  'Vrindavan': { latitude: 27.5650, longitude: 77.7008 },
  'Varanasi': { latitude: 25.3176, longitude: 82.9739 },
  'Sarnath': { latitude: 25.3762, longitude: 83.0227 },
  'Lucknow': { latitude: 26.8467, longitude: 80.9462 },
  'Kanpur': { latitude: 26.4499, longitude: 80.3319 },
  'Ayodhya': { latitude: 26.7922, longitude: 82.1998 },
  'Allahabad': { latitude: 25.4358, longitude: 81.8463 },
  'Prayagraj': { latitude: 25.4358, longitude: 81.8463 },
  'Haridwar': { latitude: 29.9457, longitude: 78.1642 },
  'Rishikesh': { latitude: 30.0869, longitude: 78.2676 },
  'Dehradun': { latitude: 30.3165, longitude: 78.0322 },
  'Shimla': { latitude: 31.1048, longitude: 77.1734 },
  'Manali': { latitude: 32.2396, longitude: 77.1887 },
  'Srinagar': { latitude: 34.0837, longitude: 74.7973 },
  'Gulmarg': { latitude: 34.0484, longitude: 74.3805 },
  'Pahalgam': { latitude: 34.0161, longitude: 75.1950 },
  'Leh': { latitude: 34.1526, longitude: 77.5771 },
  'Ladakh': { latitude: 34.1526, longitude: 77.5771 },
  'Amritsar': { latitude: 31.6340, longitude: 74.8723 },
  'Chandigarh': { latitude: 30.7333, longitude: 76.7794 },

  // Western India
  'Jaipur': { latitude: 26.9124, longitude: 75.7873 },
  'Udaipur': { latitude: 24.5854, longitude: 73.7125 },
  'Jodhpur': { latitude: 26.2389, longitude: 73.0243 },
  'Jaisalmer': { latitude: 26.9157, longitude: 70.9083 },
  'Mumbai': { latitude: 19.0760, longitude: 72.8777 },
  'Pune': { latitude: 18.5204, longitude: 73.8567 },
  'Nagpur': { latitude: 21.1458, longitude: 79.0882 },
  'Ahmedabad': { latitude: 23.0225, longitude: 72.5714 },
  'Surat': { latitude: 21.1702, longitude: 72.8311 },
  'Vadodara': { latitude: 22.3072, longitude: 73.1812 },
  'Goa': { latitude: 15.2993, longitude: 74.1240 },
  'North Goa': { latitude: 15.5898, longitude: 73.8278 },
  'South Goa': { latitude: 15.0644, longitude: 74.0229 },
  'Dudhsagar': { latitude: 15.3185, longitude: 74.3142 },

  // Eastern India
  'Patna': { latitude: 25.5941, longitude: 85.1376 },
  'Gaya': { latitude: 24.7955, longitude: 85.0002 },
  'Ranchi': { latitude: 23.3441, longitude: 85.3090 },
  'Jamshedpur': { latitude: 22.8046, longitude: 86.2029 },
  'Kolkata': { latitude: 22.5726, longitude: 88.3639 },
  'Bhubaneswar': { latitude: 20.2961, longitude: 85.8245 },
  'Puri': { latitude: 19.8135, longitude: 85.8312 },
  'Darjeeling': { latitude: 27.0410, longitude: 88.2627 },
  'Gangtok': { latitude: 27.3314, longitude: 88.6138 },
  'Guwahati': { latitude: 26.1445, longitude: 91.7362 },
  'Shillong': { latitude: 25.5788, longitude: 91.8833 },

  // Southern India
  'Bengaluru': { latitude: 12.9716, longitude: 77.5946 },
  'Bangalore': { latitude: 12.9716, longitude: 77.5946 },
  'Mysore': { latitude: 12.2958, longitude: 76.6394 },
  'Mysuru': { latitude: 12.2958, longitude: 76.6394 },
  'Ooty': { latitude: 11.4102, longitude: 76.6950 },
  'Chennai': { latitude: 13.0827, longitude: 80.2707 },
  'Madurai': { latitude: 9.9252, longitude: 78.1198 },
  'Hyderabad': { latitude: 17.3850, longitude: 78.4867 },
  'Secunderabad': { latitude: 17.4399, longitude: 78.5000 },
  'Visakhapatnam': { latitude: 17.6868, longitude: 83.2185 },
  'Kochi': { latitude: 9.9312, longitude: 76.2673 },
  'Munnar': { latitude: 10.0889, longitude: 77.0595 },
  'Alleppey': { latitude: 9.4981, longitude: 76.3388 },
  'Trivandrum': { latitude: 8.5241, longitude: 76.9366 },
  'Thiruvananthapuram': { latitude: 8.5241, longitude: 76.9366 },

  // Central India
  'Bhopal': { latitude: 23.2599, longitude: 77.4126 },
  'Indore': { latitude: 22.7196, longitude: 75.8577 },
  'Raipur': { latitude: 21.2514, longitude: 81.6296 },
};

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
    url: 'https://{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  satellite: {
    url: 'https://{s}.google.com/vt/lyrs=s,h&hl=en&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  terrain: {
    url: 'https://{s}.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}',
    subdomains: "['mt0','mt1','mt2','mt3']",
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: "['a','b','c','d']",
  },
};

// Build Leaflet HTML with premium markers
function buildMapHTML(tileKey: string, routeCoords: typeof ROUTE_COORDS) {
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
      .leaflet-control-container { display: none !important; }

      .leaflet-popup-content-wrapper {
        background: rgba(13, 17, 23, 0.95) !important;
        color: #F0F6FC !important;
        border: 1px solid rgba(0, 102, 255, 0.35);
        border-radius: 8px !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 12px rgba(0, 102, 255, 0.1);
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
        min-width: 125px;
      }
      .popup-card { padding: 6px 8px; }
      .popup-badge {
        display: inline-block;
        padding: 1px 4px; border-radius: 3px;
        font-size: 7px; font-weight: 800;
        letter-spacing: 0.5px; margin-bottom: 2px;
        text-transform: uppercase;
      }
      .popup-badge-guide { background: rgba(16, 185, 129, 0.15); color: #34D399; }
      .popup-badge-group { background: rgba(245, 158, 11, 0.15); color: #FBBF24; }
      .popup-badge-tourist { background: rgba(139, 92, 246, 0.15); color: #A78BFA; }
      .popup-badge-attraction { background: rgba(239, 68, 68, 0.15); color: #F87171; }
      .popup-name { margin: 0 0 1px 0; font-size: 10px; color: #F0F6FC; font-weight: 700; }
      .popup-detail { margin: 0; font-size: 8px; color: #8B949E; line-height: 1.25; }
      .popup-cta {
        display: flex; align-items: center; justify-content: center;
        margin-top: 4px; padding: 4px 0;
        border-top: 1px solid rgba(255,255,255,0.06);
        font-size: 8px; font-weight: 700; color: #0066FF;
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
        var pathPoints = ${JSON.stringify(routeCoords.map(c => [c.latitude, c.longitude]))};
        var map = L.map('map', {
          zoomControl: false,
        attributionControl: false,
        zoomAnimation: true,
        markerZoomAnimation: false,
      });

      if (pathPoints.length > 0) {
        map.setView(pathPoints[0], 4);
      } else {
        map.setView([27.5650, 77.7008], 4);
      }

      L.tileLayer('${tile.url}', {
        maxZoom: 20,
        subdomains: ${tile.subdomains},
      }).addTo(map);

      if (pathPoints.length > 1) {
        map.fitBounds(pathPoints, { padding: [60, 60] });
      }

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

      // Helper to calculate line weights dynamically based on zoom level (makes lines thinner as you zoom in)
      function getWeights(zoom) {
        return {
          sw: Math.max(3.0, 18.0 - (zoom * 0.8)),   // Shadow line width
          rw: Math.max(1.2, 7.5 - (zoom * 0.35)),   // Main route line width (purple)
          hw: Math.max(2.0, 11.5 - (zoom * 0.5))    // Active highlight line width (yellow)
        };
      }

      // Route polyline & segments with click and hover interactions
      var polylineSegments = [];
      var shadowSegments = [];
      if (pathPoints.length > 1) {
        for (var i = 0; i < pathPoints.length - 1; i++) {
          (function(segmentIdx) {
            var segPoints = [pathPoints[segmentIdx], pathPoints[segmentIdx+1]];
            var w = getWeights(map.getZoom());
            
            var shadow = L.polyline(segPoints, {
              color: '#8B5CF6', weight: w.sw, opacity: 0.08,
              smoothFactor: 1.2, lineCap: 'round', lineJoin: 'round',
              interactive: false
            }).addTo(map);
            shadowSegments.push(shadow);

            var segmentPoly = L.polyline(segPoints, {
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

      // Central checkpoint zoom and highlight
      function selectCheckpoint(cityLat, cityLng, legIdx) {
        // Zoom extensively on selected checkpoint city coordinate (zoom level 16) with a smooth 0.85s animation
        map.flyTo([cityLat, cityLng], 16, { animate: true, duration: 0.85, easeLinearity: 0.25 });
        
        // Highlight corresponding leg - disabled for checkpoint clicks
        highlightLeg(null);

        // Notify parent React Native code
        var msg = JSON.stringify({ type: 'CHECKPOINT_CLICKED', index: legIdx });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(msg);
        } else {
          window.parent.postMessage(msg, '*');
        }
      }

      // Checkpoint markers HTML Badges
      var routeCities = ${JSON.stringify(routeCoords)};
      routeCities.forEach(function(city, idx) {
        var isStart = idx === 0;
        var isEnd = idx === routeCities.length - 1;
        var badgeBg = '#10B981'; // Emerald Green
        var textColor = '#FFFFFF';
        if (isStart) {
          badgeBg = '#0066FF'; // Blue
          textColor = '#FFFFFF';
        } else if (isEnd) {
          badgeBg = '#F59E0B'; // Amber Gold
          textColor = '#000000'; // Dark text for yellow background
        }

        var markerHtml = '<div class="checkpoint-badge" style="' +
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

        var checkpointIcon = L.divIcon({
          html: markerHtml,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });

        var marker = L.marker([city.latitude, city.longitude], { icon: checkpointIcon, zIndexOffset: 1000 }).addTo(map);

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

      // Current location (non-interactive so it doesn't block checkpoint clicks)
      var locIcon = L.divIcon({
        html: '<div class="current-loc-outer"><div class="current-loc-inner"></div></div>',
        className: '', iconSize: [28, 28], iconAnchor: [14, 14],
      });
      if (pathPoints.length > 0) {
        L.marker(pathPoints[0], { icon: locIcon, interactive: false }).addTo(map);
      } else {
        L.marker([28.6139, 77.2090], { icon: locIcon, interactive: false }).addTo(map);
      }

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
          .bindPopup(popupHTML, { closeButton: false, minWidth: 125 });

        markerInstances.push({ marker: marker, type: pin.type });
      });

      var activeLegPolyline = null;

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
                var payload = JSON.stringify({ type: 'GEOLOCATION_ERROR', message: "Invalid coordinates received." });
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(payload);
                } else {
                  window.parent.postMessage(payload, '*');
                }
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
              var payload = JSON.stringify({ type: 'GEOLOCATION_ERROR', message: errorMsg });
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(payload);
              } else {
                window.parent.postMessage(payload, '*');
              }
            },
            { enableHighAccuracy: true, timeout: 8000 }
          );
        } else {
          alert("Geolocation is not supported by this browser.");
        }
      }

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
              map.flyTo(pathPoints[0], 7, { animate: true, duration: 0.85 });
            } else {
              map.flyTo([27.5650, 77.7008], 7, { animate: true, duration: 0.85 });
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
      document.addEventListener('message', handleMsg);
      window.addEventListener('message', handleMsg);
      })();
    <\/script>
  </body>
  </html>
  `;
}

// Filter config constant removed

// Haversine distance calculator
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Generate leg details
const getLegDetails = (startIndex: number, coords: any[]) => {
  const start = coords[startIndex];
  const end = coords[startIndex + 1];
  if (!start || !end) return null;

  const distance = calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);
  const routeDistance = Math.round(distance * 1.25); // estimate road path distance
  const hours = Math.floor(routeDistance / 70);
  const minutes = Math.round((routeDistance % 70) * 60 / 70);
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const conditions = [
    'Excellent 4-lane Highway',
    'Double-lane State Highway',
    'Expressway (Smooth condition)',
    'Scenic Mountain Road (Caution on bends)',
  ];
  const condition = conditions[startIndex % conditions.length];

  const pitStopsList = [
    ['HP Fuel Station & EV Charger (km 45)', 'Highway Oasis Food Plaza (km 110)'],
    ['Scenic Viewpoint Cafe (km 30)', 'Local Dhaba & Tea Stall (km 75)'],
    ['Expressway Rest Stop (km 65)', 'Rest Area with Clean Restrooms (km 130)'],
  ];
  const pitStops = pitStopsList[startIndex % pitStopsList.length];

  return {
    title: `Leg ${startIndex + 1}: ${start.name} ➔ ${end.name}`,
    distance: `${routeDistance} km`,
    duration: durationText,
    condition,
    pitStops,
  };
};

const getNavigationSteps = (startIndex: number, coords: any[]) => {
  const start = coords[startIndex];
  const end = coords[startIndex + 1];
  if (!start || !end) return [];

  return [
    { instruction: `Depart from ${start.name} city center.`, distance: '1.0 km', icon: 'start' },
    { instruction: `Merge onto Highway NH road heading toward ${end.name}.`, distance: '3.5 km', icon: 'straight' },
    { instruction: `Keep straight, watch out for speed limit signs.`, distance: '45.0 km', icon: 'straight' },
    { instruction: `Toll plaza ahead, prepare FASTag payment.`, distance: '2.0 km', icon: 'info' },
    { instruction: `Take exit ramp toward ${end.name} central bypass.`, distance: '1.5 km', icon: 'right' },
    { instruction: `Turn left at roundabout and arrive in ${end.name}.`, distance: '0.8 km', icon: 'end' },
  ];
};

export default function MapScreen() {
  const { triggerSOS, trips, joinTrip, profile, isLoggedIn, requestedTrips, reloadJoinRequests } = useApp();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  // Reload requested trips on focus
  useEffect(() => {
    reloadJoinRequests();
    const unsubscribe = navigation.addListener('focus', reloadJoinRequests);
    return unsubscribe;
  }, [navigation]);

  const [mapFilter, setMapFilter] = useState<'ALL' | 'GUIDES' | 'GROUPS' | 'TOURISTS' | 'ATTRACTIONS' | 'NONE'>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [tileLayer, setTileLayer] = useState<'roadmap' | 'satellite' | 'terrain' | 'dark'>('roadmap');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
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

  const webViewRef = useRef<WebView>(null);
  const sosPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch (e) {
        console.log('Error requesting location permission:', e);
      }
    })();
  }, []);

  // Resolve dynamic route coords from the active trip or nearby place
  let activeTrip = trips.find((t) => t.id === tripId);

  const [bottomCardHeight, setBottomCardHeight] = useState(180);
  const panelTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(panelTranslateY, {
      toValue: showNavigationOverlay ? (bottomCardHeight + 50) : 0,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [showNavigationOverlay, bottomCardHeight]);

  // Dynamic bottom offset for SOS button based on panel height measurements
  const sosBottomOffset = 16 + bottomCardHeight + 12;

  const filterOptions = [
    { value: 'ALL', label: 'All Categories', icon: Compass },
    { value: 'GUIDES', label: 'Guides', icon: Users },
    { value: 'GROUPS', label: 'Groups', icon: Users },
    { value: 'TOURISTS', label: 'Solo Tourists', icon: User },
    { value: 'ATTRACTIONS', label: 'Attractions', icon: Star },
    { value: 'NONE', label: 'No Categories', icon: EyeOff },
  ];
  const activeOption = filterOptions.find((o) => o.value === mapFilter) || filterOptions[0];

  const handleLocateSelf = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to show your current position on the map. Please enable it in your device settings.');
        return;
      }
    } catch (e) {
      console.log('Location permission error:', e);
    }
    postMapMessage({ type: 'LOCATE_SELF' });
  };

  if (tripId && (tripId.startsWith('place-') || tripId.startsWith('nearby-'))) {
    const names: Record<string, string> = {
      'place-1': 'Sultanpur',
      'place-2': 'Surajkund',
      'place-3': 'Agra',
      'place-4': 'Neemrana',
      'place-5': 'Rishikesh',
    };
    const placeName = names[tripId] || 'Sultanpur';
    activeTrip = {
      id: tripId,
      name: `Delhi to ${placeName} Exploration`,
      creator: 'Local Guide',
      cities: ['Delhi', placeName],
      startDate: '2026-08-10',
      endDate: '2026-08-11',
      budget: 1500,
      availableSeats: 4,
      totalSeats: 10,
      meetingPoint: 'Delhi Assembly Gate',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC',
      membersCount: 4,
    } as any;
  }

  const activeRouteCoords = activeTrip
    ? activeTrip.coordinates || activeTrip.cities
      .map((city) => {
        const clean = city.trim();
        const found = CITY_COORDS[clean] || Object.entries(CITY_COORDS).find(([k]) => clean.toLowerCase().includes(k.toLowerCase()))?.[1];
        if (found) {
          return { latitude: found.latitude, longitude: found.longitude, name: clean };
        } else {
          // Deterministic fallback based on name hash
          let hash = 0;
          for (let i = 0; i < clean.length; i++) {
            hash = clean.charCodeAt(i) + ((hash << 5) - hash);
          }
          const lat = 18.0 + (Math.abs(hash % 100) / 100) * 8.0;
          const lon = 74.0 + (Math.abs((hash >> 8) % 100) / 100) * 10.0;
          return { latitude: lat, longitude: lon, name: clean };
        }
      })
    : ROUTE_COORDS;

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
    const startCoord = activeRouteCoords[0] || { latitude: 28.6139, longitude: 77.2090 };
    triggerSOS(startCoord.latitude, startCoord.longitude);
    setSosTriggered(true);
  };

  // Post filter updates to Leaflet
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'FILTER', filter: mapFilter }));
    }
  }, [mapFilter]);

  const postMapMessage = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // Helper: select a leg — updates React state AND tells the WebView to zoom
  const selectLegFromReact = useCallback((idx: number | null) => {
    setSelectedLegIndex(idx);
    postMapMessage({ type: 'SELECT_LEG', index: idx });
  }, [postMapMessage]);

  const handleRecenter = () => {
    selectLegFromReact(null);
    postMapMessage({ type: 'RECENTER' });
  };

  const legs = [];
  if (activeRouteCoords && activeRouteCoords.length > 1) {
    for (let i = 0; i < activeRouteCoords.length - 1; i++) {
      legs.push({
        start: activeRouteCoords[i],
        end: activeRouteCoords[i + 1],
      });
    }
  }

  const fromCity = activeTrip ? activeTrip.cities[0] : 'Ranchi';
  const toCity = activeTrip ? activeTrip.cities[activeTrip.cities.length - 1] : 'Vrindavan';
  const stopCount = activeRouteCoords.length;
  const activeSegmentText = activeTrip ? `Route with ${stopCount} cities` : 'Active segment • 2 of 4 stops';
  const distanceVal = activeTrip ? activeTrip.cities.length * 115 : 145;
  const nextStopName = activeTrip ? (activeTrip.cities[1] || activeTrip.cities[0]) : 'Mathura';
  const isMyTrip = isLoggedIn && !!(activeTrip && profile && profile.id && activeTrip.creatorId && activeTrip.creatorId === profile.id);

  const webViewSource = useMemo(() => {
    return { html: buildMapHTML(tileLayer, activeRouteCoords) };
  }, [tileLayer, activeRouteCoords]);

  return (
    <View style={styles.screenRoot}>
      <StatusBar hidden={true} />
      <View style={styles.mapContainer}>
        {/* LEAFLET WEBVIEW */}
        <WebView
          ref={webViewRef}
          key={tileLayer}
          originWhitelist={['*']}
          source={webViewSource}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          geolocationEnabled={true}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'CHECKPOINT_CLICKED') {
                setSelectedLegIndex(data.index);
              } else if (data.type === 'GEOLOCATION_ERROR') {
                Alert.alert('Location Error', data.message);
              }
            } catch (err) { }
          }}
        />

        {/* TOP FILTER BAR */}
        <SafeAreaView edges={['top']} style={styles.topSafeArea}>
          <View style={styles.filterBarHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <ArrowLeft size={22} color="#000" strokeWidth={3} />
            </TouchableOpacity>

            {/* OPTION 1: ROUTE ITINERARY SELECTOR DROPDOWN */}
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={toggleItineraryDropdown}
                activeOpacity={0.9}
              >
                <View style={styles.dropdownTriggerLeft}>
                  <Route size={11} color="#0066FF" style={{ marginRight: 4 }} />
                  <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                    ROUTE: {legs.length + 1} STOPS
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
                    >
                      <Compass size={11} color={selectedLegIndex === null ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                      <Text style={[
                        styles.dropdownOptionText,
                        selectedLegIndex === null && styles.dropdownOptionTextActive
                      ]}>
                        Entire Route
                      </Text>
                    </TouchableOpacity>

                    {/* List of legs */}
                    {legs.map((leg, idx) => {
                      const isActive = selectedLegIndex === idx;
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
                        >
                          <Route size={11} color={isActive ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                          <Text style={[
                            styles.dropdownOptionText,
                            isActive && styles.dropdownOptionTextActive
                          ]} numberOfLines={1}>
                            Leg {idx + 1}: {leg.start.name.split(',')[0]} ➔ {leg.end.name.split(',')[0]}
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
              >
                <View style={styles.dropdownTriggerLeft}>
                  <activeOption.icon size={11} color="#0066FF" style={{ marginRight: 4 }} />
                  <Text style={styles.dropdownTriggerText}>{activeOption.label}</Text>
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
                      >
                        <opt.icon size={10} color={isSelected ? '#0066FF' : '#8B949E'} style={{ marginRight: 6 }} />
                        <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </SafeAreaView>



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

          {/* Entire Route Recenter */}
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={handleRecenter}
            activeOpacity={0.8}
          >
            <Route size={17} color="#C9D1D9" />
          </TouchableOpacity>

          {/* GPS Self Location */}
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={handleLocateSelf}
            activeOpacity={0.8}
          >
            <Locate size={17} color="#0066FF" />
          </TouchableOpacity>

          {/* SOS Emergency - Stable in control strip */}
          <TouchableOpacity
            style={styles.sosControlBtn}
            onPress={handleSOS}
            activeOpacity={0.85}
          >
            <ShieldAlert size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 7, fontWeight: '900', marginTop: 1 }}>SOS</Text>
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



        {/* BOTTOM TRIP INFO CARD / SEGMENT NAVIGATION CARD */}
        <Animated.View
          style={[
            styles.bottomCardContainer,
            {
              transform: [{ translateY: panelTranslateY }],
            }
          ]}
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            if (height > 0) {
              setBottomCardHeight(height);
            }
          }}
        >
          {selectedLegIndex === null ? (
            <LinearGradient
              colors={['rgba(13, 17, 23, 0.97)', 'rgba(13, 17, 23, 0.92)']}
              style={styles.bottomCard}
            >
              <View style={styles.bottomCardHeader}>
                <View style={styles.routeIconWrap}>
                  <Route size={14} color="#0066FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bottomCardTitle} numberOfLines={1} ellipsizeMode="tail">{fromCity} ➔ {toCity}</Text>
                  <Text style={styles.bottomCardSub}>{activeSegmentText}</Text>
                </View>
                <View style={styles.etaBadge}>
                  <Text style={styles.etaBadgeText}>ETA 3h 20m</Text>
                </View>

                {/* Main Panel Collapse/Expand Toggle Button */}
                <TouchableOpacity
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsMainPanelCollapsed(!isMainPanelCollapsed);
                  }}
                  activeOpacity={0.8}
                  style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginLeft: 8 }}
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
                    <LinearGradient
                      colors={['#0066FF', '#8B5CF6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.routeProgressFill, { width: activeTrip ? '100%' : '50%' }]}
                    />
                  </View>

                  <View style={styles.bottomStatsRow}>
                    <View style={styles.bottomStatItem}>
                      <Clock size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>Distance</Text>
                      <Text style={styles.bottomStatVal}>{distanceVal} km</Text>
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
                      <Text style={styles.bottomStatVal}>{nextStopName}</Text>
                    </View>
                  </View>

                  {!isMyTrip && activeTrip && (
                    requestedTrips.has(activeTrip.id) ? (
                      <View style={[styles.joinTripBtn, styles.joinTripBtnRequested]}>
                        <Check size={13} color="#2ECC71" style={{ marginRight: 6 }} />
                        <Text style={styles.joinTripBtnRequestedText}>Requested</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.joinTripBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (activeTrip.availableSeats <= 0) {
                            Alert.alert('⚠️ No Seats Available', 'Sorry, this trip has no seats left.');
                            return;
                          }
                          joinTrip(activeTrip.id);
                          Alert.alert('🎉 Seat Requested!', `You have requested to join "${activeTrip.name}". Status synced to database.`);
                        }}
                      >
                        <Text style={styles.joinTripBtnText}>Request to Join Trip</Text>
                      </TouchableOpacity>
                    )
                  )}
                </>
              )}
            </LinearGradient>
          ) : (
            <LinearGradient
              colors={['rgba(13, 17, 23, 0.97)', 'rgba(13, 17, 23, 0.92)']}
              style={styles.bottomCard}
            >
              {(() => {
                const legDetails = getLegDetails(selectedLegIndex, activeRouteCoords);

                // Determine vehicle based on activeTrip
                let vehicleName = "Sedan Car";
                if (activeTrip) {
                  if (activeTrip.totalSeats <= 4) {
                    vehicleName = "Premium Sedan";
                  } else if (activeTrip.totalSeats > 4 && activeTrip.totalSeats <= 7) {
                    vehicleName = "Luxury SUV";
                  } else if (activeTrip.totalSeats > 7 && activeTrip.totalSeats <= 15) {
                    vehicleName = "Traveler Van";
                  } else {
                    vehicleName = "AC Tour Bus";
                  }
                }

                // Determine facilities based on activeTrip
                let facilities: string[] = [];
                if (activeTrip) {
                  if (activeTrip.guideIncluded) facilities.push("Certified Guide");
                  if (activeTrip.foodIncluded) facilities.push("Food/Drinks");
                  if (activeTrip.hotelIncluded !== false) facilities.push("Hotel Stays");
                  if (activeTrip.cabIncluded !== false) {
                    const isBike = activeTrip.name?.toLowerCase().includes('bike');
                    facilities.push(isBike ? "Fuel/Bike" : "AC Vehicle");
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
                        <Text style={styles.bottomCardTitle} numberOfLines={1}>
                          {activeTrip ? activeTrip.name : 'Ranchi to Vrindavan Road Trip'}
                        </Text>
                        <Text style={styles.bottomCardSub} numberOfLines={1}>
                          Organizer: {activeTrip ? activeTrip.creator : 'Local Guide'}
                        </Text>
                      </View>

                      {/* Compact Switcher Chevrons removed */}

                      <TouchableOpacity
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setIsBottomPanelCollapsed(!isBottomPanelCollapsed);
                        }}
                        activeOpacity={0.8}
                        style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginRight: 6 }}
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

                      <TouchableOpacity onPress={handleRecenter} style={styles.closeLegBtn} activeOpacity={0.8}>
                        <X size={15} color="#8B949E" />
                      </TouchableOpacity>
                    </View>

                    {/* Segment Info Row: Leg name & Road condition */}
                    <View style={styles.segmentInfoRow}>
                      <Text style={styles.segmentLegTitle}>{legDetails?.title}</Text>
                      <Text style={styles.segmentRoadText}>Road: {legDetails?.condition}</Text>
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
                            <Clock size={11} color="#10B981" />
                            <Text style={styles.statsGridVal}>{legDetails?.duration}</Text>
                          </View>
                          <View style={styles.statsGridDivider} />
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
                              {activeTrip ? `${activeTrip.availableSeats}/${activeTrip.totalSeats} Seats` : '4/10 Seats'}
                            </Text>
                          </View>
                        </View>

                        {/* Detailed Metadata fields from DB */}
                        <View style={styles.dbDetailsContainer}>
                          <Text style={styles.dbDetailsText}>
                            <Text style={styles.dbDetailsLabel}>Meeting Point: </Text>
                            {activeTrip ? activeTrip.meetingPoint : 'Delhi Metro Station Gate 1'}
                          </Text>

                          <Text style={styles.dbDetailsText}>
                            <Text style={styles.dbDetailsLabel}>Budget: </Text>
                            ₹{activeTrip ? activeTrip.budget : '1500'} per person
                          </Text>

                          <Text style={styles.dbDetailsText}>
                            <Text style={styles.dbDetailsLabel}>Pit Stops: </Text>
                            {legDetails?.pitStops.join(', ') || 'None'}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                            <Text style={styles.dbDetailsLabel}>Service Inclusion: </Text>
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
            </LinearGradient>
          )}
        </Animated.View>



        {/* TURN-BY-TURN NAVIGATION OVERLAY */}
        {showNavigationOverlay && selectedLegIndex !== null && (
          <View style={styles.navOverlayContainer}>
            <View style={styles.navOverlayCard}>
              <LinearGradient
                colors={['rgba(13, 17, 23, 0.98)', 'rgba(6, 8, 20, 0.95)']}
                style={styles.navOverlayGradient}
              >
                <View style={styles.navOverlayHeader}>
                  <Compass size={18} color="#10B981" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.navOverlayTitle}>Turn-by-Turn Guide</Text>
                    <Text style={styles.navOverlaySub} numberOfLines={1}>
                      {getLegDetails(selectedLegIndex, activeRouteCoords)?.title}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeOverlayBtn}
                    onPress={() => setShowNavigationOverlay(false)}
                    activeOpacity={0.8}
                  >
                    <X size={16} color="#C9D1D9" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.stepsScroll} contentContainerStyle={styles.stepsScrollContent}>
                  {getNavigationSteps(selectedLegIndex, activeRouteCoords).map((step, sIdx) => {
                    let IconComponent = Navigation;
                    let iconColor = '#8B949E';
                    if (step.icon === 'start') {
                      IconComponent = Compass;
                      iconColor = '#10B981';
                    } else if (step.icon === 'end') {
                      IconComponent = MapPin;
                      iconColor = '#EF4444';
                    } else if (step.icon === 'info') {
                      IconComponent = AlertCircle;
                      iconColor = '#F59E0B';
                    } else if (step.icon === 'left') {
                      IconComponent = ArrowLeft;
                      iconColor = '#0066FF';
                    } else if (step.icon === 'right') {
                      IconComponent = ArrowRight;
                      iconColor = '#0066FF';
                    }

                    return (
                      <View key={sIdx} style={styles.stepItemRow}>
                        <View style={[styles.stepIconWrap, { borderColor: iconColor }]}>
                          <IconComponent size={14} color={iconColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stepInstruction}>{step.instruction}</Text>
                          <Text style={styles.stepDistance}>{step.distance}</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={styles.startDrivingBtn}
                  onPress={() => {
                    Alert.alert("Navigation Started", "GPS simulation active. Head to the highlighted route.");
                    setShowNavigationOverlay(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startDrivingBtnText}>Start Navigation Guide</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        )}



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
  filterBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
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
    fontSize: 9,
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
    fontSize: 9.5,
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: '#0066FF',
    fontWeight: '700',
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
    bottom: 16,
    left: 16,
    right: 16,
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
  joinTripBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  joinTripBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  joinTripBtnRequested: {
    backgroundColor: '#21262D',
    borderColor: '#30363D',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 12,
  },
  joinTripBtnRequestedText: {
    color: '#8B949E',
    fontSize: 12,
    fontWeight: '700',
  },

  // SOS button
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
  segmentStripContainer: {
    position: 'absolute',
    bottom: 195,
    left: 16,
    right: 80,
    zIndex: 15,
  },
  segmentStripScroll: {
    gap: 8,
  },
  segmentTab: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 17, 23, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(48, 54, 61, 0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentTabActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  segmentTabText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8B949E',
  },
  segmentTabTextActive: {
    color: '#FFF',
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
    color: '#C9D1D9',
    fontSize: 10,
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
    fontSize: 9.5,
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
    color: '#C9D1D9',
    fontSize: 10,
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
    fontSize: 11,
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
  },
  navOverlayGradient: {
    padding: 20,
    maxHeight: 450,
  },
  navOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  navOverlayTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  navOverlaySub: {
    color: '#8B949E',
    fontSize: 11,
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
    color: '#C9D1D9',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  stepDistance: {
    color: '#8B949E',
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 1,
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
    color: '#FFF',
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
    fontSize: 10,
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
    fontSize: 11,
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
    fontSize: 10,
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
    fontSize: 10,
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
    fontSize: 11,
    fontWeight: '800',
  },
  segmentRoadText: {
    color: '#8B949E',
    fontSize: 10,
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
    fontSize: 9.5,
    fontWeight: '600',
  },
  dbDetailsLabel: {
    color: '#8B949E',
    fontWeight: '800',
    textTransform: 'uppercase',
    fontSize: 9,
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
    fontSize: 8.5,
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
  },
});
