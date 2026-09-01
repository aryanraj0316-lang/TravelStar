import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/feedback';
import { getCurrentDeviceLocation } from '@/lib/device-location';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import { eventBus } from '@/services/event-bus';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  EyeOff,
  Layers,
  Locate,
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
import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  LayoutAnimation,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Coordinates registry for dynamic routes mapping
// docs/REMEDIATION.md §8.8: a ~70-entry local city coordinate table used
// to live here, feeding a client-side route builder that hashed unknown
// city names into invented coordinates. Routes and pin positions are now
// resolved server-side (GET /map/trips/:id/route, GET /map/pins) against
// the backend's own reference table, so there is nothing left for a
// second copy in the client to do.

// docs/REMEDIATION.md §8.8: a hardcoded Ranchi→Delhi→Mathura→Vrindavan
// route and four hardcoded pins ("Rajesh Kumar (Guide)", a
// "Ranchi-Vrindavan Group", solo tourist "Neha Mehta", Prem Mandir) used
// to live here — the same four places on every user's map, forever, with
// nothing behind them. Both now come from the API (GET /map/pins,
// GET /map/trips/:id/route) and are injected into Leaflet at runtime.
type RoutePoint = { latitude: number; longitude: number; name: string };
type MapFilter = 'ALL' | 'GUIDES' | 'GROUPS' | 'TOURISTS' | 'ATTRACTIONS' | 'NONE';

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
type LeafletStrings = { navigate: string; youAreHere: string; liveGpsLocation: string };

function buildMapHTML(tileKey: string, routeCoords: RoutePoint[], strings: LeafletStrings) {
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
        var I18N = ${JSON.stringify(strings)};
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

      // docs/REMEDIATION.md §8.8: a "Current location" pulse marker used to
      // be dropped here at the *route's first city* — or, with no route, at
      // a hardcoded New Delhi — and styled exactly like the real GPS
      // marker. It never had anything to do with where the user was. The
      // real one is the selfMarker below, placed from actual geolocation
      // when the locate button is pressed.

      // Map pins — pushed in from React once GET /map/pins resolves
      // (docs/REMEDIATION.md §8.8), rather than baked into this HTML.
      var markerInstances = [];
      var currentFilter = 'ALL';

      function renderPins(pins) {
        markerInstances.forEach(function(item) { map.removeLayer(item.marker); });
        markerInstances = [];
        pins.forEach(addPin);
        applyFilter(currentFilter, true);
      }

      function addPin(pin) {
        var icon = L.divIcon({
          html: '<div class="marker-pin ' + MARKER_CLASS[pin.type] + '">' + ICONS[pin.type] + '</div>',
          className: '', iconSize: [32, 37], iconAnchor: [16, 37], popupAnchor: [0, -40],
        });

        var popupHTML = '<div class="popup-card">' +
          '<div class="popup-badge ' + BADGE_CLASS[pin.type] + '">' + pin.type + '</div>' +
          '<p class="popup-name">' + pin.name + '</p>' +
          '<p class="popup-detail">' + pin.detail + '</p>' +
          '<div class="popup-cta">' + I18N.navigate + '</div></div>';

        var marker = L.marker([pin.latitude, pin.longitude], { icon: icon })
          .addTo(map)
          .bindPopup(popupHTML, { closeButton: false, minWidth: 125 });

        markerInstances.push({ marker: marker, type: pin.type });
      }

      // Hazard alerts from the real /alerts data (§8.8/§8.10), drawn as
      // severity-coloured circles. Alerts whose free-text location the
      // server could not resolve arrive with null coordinates and are
      // skipped rather than dropped somewhere arbitrary.
      var hazardLayers = [];
      var HAZARD_COLOR = { CRITICAL: '#EF4444', WARNING: '#F59E0B', ADVISORY: '#38BDF8' };

      function renderHazards(hazards) {
        hazardLayers.forEach(function(layer) { map.removeLayer(layer); });
        hazardLayers = [];
        hazards.forEach(function(h) {
          if (h.latitude === null || h.longitude === null) return;
          var color = HAZARD_COLOR[h.severity] || HAZARD_COLOR.ADVISORY;
          var circle = L.circle([h.latitude, h.longitude], {
            radius: 25000, color: color, weight: 1.5, fillColor: color, fillOpacity: 0.16,
          }).addTo(map).bindPopup(
            '<div class="popup-card"><div class="popup-badge">' + h.severity + '</div>' +
            '<p class="popup-name">' + h.title + '</p>' +
            '<p class="popup-detail">' + h.location + '</p></div>',
            { closeButton: false, minWidth: 125 }
          );
          hazardLayers.push(circle);
        });
      }

      var activeLegPolyline = null;

      function applyFilter(filter, skipFly) {
        currentFilter = filter;
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
        if (bounds.length > 0 && !skipFly) {
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
                  .bindPopup('<b>' + I18N.youAreHere + '</b><br>' + I18N.liveGpsLocation);
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
          if (data.type === 'SET_PINS') renderPins(data.pins || []);
          if (data.type === 'SET_HAZARDS') renderHazards(data.hazards || []);
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
const getLegDetails = (startIndex: number, coords: RoutePoint[]) => {
  const start = coords[startIndex];
  const end = coords[startIndex + 1];
  if (!start || !end) return null;

  // docs/REMEDIATION.md §8.8: this used to invent a road-condition string
  // ("Excellent 4-lane Highway"), a duration from a made-up ×1.25 road
  // factor at an assumed 70 km/h, and two named pit stops per leg ("HP
  // Fuel Station & EV Charger (km 45)") — none of it from any routing
  // service, all of it rendered as fact. Straight-line distance between
  // two real city coordinates is the one thing genuinely derivable here,
  // and the UI labels it as straight-line rather than implying road km.
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
// returning six invented turns per leg — "Merge onto Highway NH road",
// "Toll plaza ahead, prepare FASTag payment", each with a fabricated
// distance — for any pair of cities, with no routing service behind it.
// Removed. The overlay now hands the leg to the device's own maps app,
// which does have real turn-by-turn data.

function MapScreen() {
  const { t } = useTranslation();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  useEffect(() => {
    logger.log('Screen mounted: MapScreen');
    const unsub = eventBus.on('focusTripOnMap', (id: string) => {
      setSelectedTripId(id);
    });
    return unsub;
  }, []);
  const { triggerSOS, trips, joinTrip, profile, isLoggedIn, requestedTrips, reloadJoinRequests } = useApp();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  // React Navigation's tab navigator keeps a visited tab mounted-but-hidden
  // rather than unmounting it, so without this the embedded Leaflet WebView
  // (GPS marker, live tile rendering) would keep running in the background
  // forever after the user's first visit to this tab — exactly the
  // permanent-resource-hold REMEDIATION.md §7.3 flags. Unmounting the
  // WebView itself (not the whole screen) when unfocused releases it while
  // keeping the rest of the screen's state (filters, selected route) intact.
  const isFocused = useIsFocused();

  // Reload requested trips on focus
  useEffect(() => {
    reloadJoinRequests();
    const unsubscribe = navigation.addListener('focus', reloadJoinRequests);
    return unsubscribe;
  }, [navigation, reloadJoinRequests]);

  const [mapFilter, setMapFilter] = useState<MapFilter>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  // docs/REMEDIATION.md §8.8: the confirmation card used to state a
  // hardcoded "28.6139° N, 77.2090° E" — New Delhi — as the coordinates
  // that had been sent, whatever the user's real position was, and claimed
  // "police authorities and 3 nearby guides" had been notified. No police
  // force is integrated with this app. These are the coordinates actually
  // sent.
  const [sosCoords, setSosCoords] = useState<{ latitude: number; longitude: number } | null>(null);
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
  const sosPulse = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    void (async () => {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch (e) {
        logger.log('Error requesting location permission:', e);
      }
    })();
  }, []);

  // Resolve dynamic route coords from the active trip or nearby place
  let activeTrip = trips.find((t) => t.id === (selectedTripId || tripId));

  const [bottomCardHeight, setBottomCardHeight] = useState(180);
  const panelTranslateY = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    Animated.spring(panelTranslateY, {
      toValue: showNavigationOverlay ? (bottomCardHeight + 50) : 0,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [showNavigationOverlay, bottomCardHeight, panelTranslateY]);

  const filterOptions: { value: MapFilter; labelKey: string; icon: typeof Compass }[] = [
    { value: 'ALL', labelKey: 'map.filterAllCategories', icon: Compass },
    { value: 'GUIDES', labelKey: 'map.filterGuides', icon: Users },
    { value: 'GROUPS', labelKey: 'map.filterGroups', icon: Users },
    { value: 'TOURISTS', labelKey: 'map.filterSoloTourists', icon: User },
    { value: 'ATTRACTIONS', labelKey: 'map.filterAttractions', icon: Star },
    { value: 'NONE', labelKey: 'map.filterNoCategories', icon: EyeOff },
  ];
  const activeOption = filterOptions.find((o) => o.value === mapFilter) || filterOptions[0];


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

  const handleLocateSelf = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast(t('map.locationPermissionDenied'), 'error');
        return;
      }
    } catch (e) {
      logger.log('Location permission error:', e);
    }
    postMapMessage({ type: 'LOCATE_SELF' });
  };

  // docs/REMEDIATION.md §8.8: a `place-`/`nearby-` id used to make this
  // screen invent a whole trip — a fake creator ("Local Guide"), fake
  // budget, seats, dates and a "Delhi Assembly Gate" meeting point — and
  // render it as real. §8.13 rewrote nearby-trips.tsx to only ever hand
  // over real trip ids, so nothing produces those ids any more; the
  // fabrication is gone rather than left waiting for a caller.

  // docs/REMEDIATION.md §8.8: this used to fall back to the hardcoded
  // Ranchi→Vrindavan route with no trip selected, and — worse — when a
  // city was missing from the local table it *hashed the city name* into a
  // latitude/longitude somewhere in central India and drew that as the
  // trip's real route. Fabricated geodata rendered as fact. The server now
  // resolves the route from the trip's real cities and simply omits the
  // ones it cannot place, reporting how many it dropped.
  const { data: tripRoute } = useQuery({
    queryKey: ['map', 'route', activeTrip?.id],
    queryFn: () => apiService.getTripRoute(activeTrip!.id),
    enabled: !!activeTrip?.id,
    staleTime: 5 * 60 * 1000,
  });

  const activeRouteCoords: RoutePoint[] = useMemo(
    () => tripRoute?.points ?? [],
    [tripRoute]
  );

  // SOS pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(sosPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [sosPulse]);

  // Real device GPS (REMEDIATION.md §8.9) — previously this sent the
  // route's start coordinate (or a hardcoded New Delhi fallback), not
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

  // Real map pins and hazard overlays (docs/REMEDIATION.md §8.8),
  // replacing the four hardcoded pins this screen used to show everyone.
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

  useEffect(() => {
    if (!mapPins) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'SET_PINS', pins: mapPins }));
  }, [mapPins]);

  useEffect(() => {
    if (!mapHazards) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'SET_HAZARDS', hazards: mapHazards }));
  }, [mapHazards]);

  // Post filter updates to Leaflet
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'FILTER', filter: mapFilter }));
    }
  }, [mapFilter]);

  const postMapMessage = (msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  };

  // Helper: select a leg — updates React state AND tells the WebView to zoom
  const selectLegFromReact = (idx: number | null) => {
    setSelectedLegIndex(idx);
    postMapMessage({ type: 'SELECT_LEG', index: idx });
  };

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
  const activeSegmentText = activeTrip ? t('map.routeWithCities', { count: stopCount }) : t('map.activeSegmentFallback');
  const distanceVal = activeTrip ? activeTrip.cities.length * 115 : 145;
  const nextStopName = activeTrip ? (activeTrip.cities[1] || activeTrip.cities[0]) : 'Mathura';
  const isMyTrip = isLoggedIn && !!(activeTrip && profile && profile.id && activeTrip.creatorId && activeTrip.creatorId === profile.id);

  const webViewSource = useMemo(() => {
    const leafletStrings: LeafletStrings = {
      navigate: t('map.leafletNavigate'),
      youAreHere: t('map.leafletYouAreHere'),
      liveGpsLocation: t('map.leafletLiveGpsLocation'),
    };
    return { html: buildMapHTML(tileLayer, activeRouteCoords, leafletStrings) };
  }, [tileLayer, activeRouteCoords, t]);

  return (
    <View style={styles.screenRoot}>
      <StatusBar hidden={true} />
      <View style={styles.mapContainer}>
        {/* LEAFLET WEBVIEW — unmounted while this tab isn't focused, see isFocused above */}
        {isFocused && (
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
                  toast(typeof data.message === 'string' ? data.message : t('map.couldNotReadLocation'), 'error');
                }
              } catch (e) {
                logger.warn('[Map] Failed to parse WebView message:', e);
              }
            }}
          />
        )}

        {/* TOP FILTER BAR */}
        <SafeAreaView edges={['top']} style={styles.topSafeArea}>
          <View style={styles.filterBarHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.navigate('/')}
              activeOpacity={0.8}
              hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
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
                  <Text style={styles.dropdownTriggerText}>{t(activeOption.labelKey)}</Text>
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
                          setMapFilter(opt.value);
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
        </SafeAreaView>



        {/* MAP CONTROLS (RIGHT SIDE) */}
        <View style={styles.mapControlsCol}>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => setShowLayerPicker(!showLayerPicker)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.toggleLayerPicker')}
          >
            <Layers size={17} color="#C9D1D9" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => postMapMessage({ type: 'ZOOM_IN' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
          >
            <Plus size={17} color="#C9D1D9" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => postMapMessage({ type: 'ZOOM_OUT' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
          >
            <Minus size={17} color="#C9D1D9" />
          </TouchableOpacity>

          {/* Entire Route Recenter */}
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={handleRecenter}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('map.recenterRoute')}
          >
            <Route size={17} color="#C9D1D9" />
          </TouchableOpacity>

          {/* GPS Self Location */}
          <TouchableOpacity
            style={styles.mapControlBtn}
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

        {/* LAYER PICKER POPOVER */}
        {showLayerPicker && (
          <View style={styles.layerPickerPanel}>
            {(
              [
                { key: 'roadmap', labelKey: 'map.layerRoadmap' },
                { key: 'satellite', labelKey: 'map.layerSatellite' },
                { key: 'terrain', labelKey: 'map.layerTerrain' },
                { key: 'dark', labelKey: 'map.layerDark' },
              ] as const
            ).map(({ key, labelKey }) => {
              const isActive = tileLayer === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.layerPickerItem, isActive && styles.layerPickerItemActive]}
                  onPress={() => { setTileLayer(key); setShowLayerPicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={t(labelKey)}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.layerPickerText, isActive && { color: '#0066FF' }]}>
                    {t(labelKey)}
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
                  <Text style={styles.etaBadgeText}>{t('map.etaLabel', { time: '3h 20m' })}</Text>
                </View>

                {/* Main Panel Collapse/Expand Toggle Button */}
                <TouchableOpacity
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setIsMainPanelCollapsed(!isMainPanelCollapsed);
                  }}
                  activeOpacity={0.8}
                  style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginLeft: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                      <Text style={styles.bottomStatLabel}>{t('map.distance')}</Text>
                      <Text style={styles.bottomStatVal}>{distanceVal} km</Text>
                    </View>
                    <View style={styles.bottomStatDivider} />
                    <View style={styles.bottomStatItem}>
                      <Zap size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>{t('map.speed')}</Text>
                      <Text style={styles.bottomStatVal}>65 km/h</Text>
                    </View>
                    <View style={styles.bottomStatDivider} />
                    <View style={styles.bottomStatItem}>
                      <Navigation size={11} color="#8B949E" />
                      <Text style={styles.bottomStatLabel}>{t('map.nextStop')}</Text>
                      <Text style={styles.bottomStatVal}>{nextStopName}</Text>
                    </View>
                  </View>

                  {!isMyTrip && activeTrip && (
                    requestedTrips.has(activeTrip.id) ? (
                      <View style={[styles.joinTripBtn, styles.joinTripBtnRequested]}>
                        <Check size={13} color="#2ECC71" style={{ marginRight: 6 }} />
                        <Text style={styles.joinTripBtnRequestedText}>{t('map.requested')}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.joinTripBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (activeTrip.availableSeats <= 0) {
                            toast(t('map.noSeatsAvailable'), 'error');
                            return;
                          }
                          joinTrip(activeTrip.id);
                          toast(t('map.seatRequested', { name: activeTrip.name }), 'info');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('map.requestToJoinTrip')}
                      >
                        <Text style={styles.joinTripBtnText}>{t('map.requestToJoinTrip')}</Text>
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
                        <Text style={styles.bottomCardTitle} numberOfLines={1}>
                          {activeTrip ? activeTrip.name : 'Ranchi to Vrindavan Road Trip'}
                        </Text>
                        <Text style={styles.bottomCardSub} numberOfLines={1}>
                          {t('map.organizerLabel', { name: activeTrip ? activeTrip.creator : 'Local Guide' })}
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
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
            </LinearGradient>
          )}
        </Animated.View>



        {/* Route handoff (docs/REMEDIATION.md §8.8). This was a
        "Turn-by-Turn Guide" listing six invented instructions per leg
        ("Toll plaza ahead, prepare FASTag payment") with a "Start
        Navigation Guide" button that popped "GPS simulation active" —
        there was never any navigation. Real turn-by-turn needs a routing
        provider this project has no credentials for, so the leg is handed
        to the device's own maps app, which does. */}
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
                    <Text style={styles.navOverlayTitle}>{t('map.directions')}</Text>
                    <Text style={styles.navOverlaySub} numberOfLines={1}>
                      {(() => {
                        const leg = getLegDetails(selectedLegIndex, activeRouteCoords);
                        return leg ? t('map.legLabel', { number: leg.legNumber, start: leg.startName, end: leg.endName }) : '';
                      })()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeOverlayBtn}
                    onPress={() => setShowNavigationOverlay(false)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('map.closeDirections')}
                  >
                    <X size={16} color="#C9D1D9" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.navHandoffNote}>{t('map.navHandoffNote')}</Text>

                <TouchableOpacity
                  style={styles.startDrivingBtn}
                  onPress={() => {
                    const leg = getLegDetails(selectedLegIndex, activeRouteCoords);
                    if (!leg) return;
                    const origin = `${leg.start.latitude},${leg.start.longitude}`;
                    const destination = `${leg.end.latitude},${leg.end.longitude}`;
                    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
                    Linking.openURL(url).catch((e: unknown) => {
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
                <Text style={styles.sosModalTitle}>{t('map.emergencyAlertTriggered')}</Text>
                <Text style={styles.sosModalSub}>
                  {sosCoords
                    ? t('map.sosMessageWithCoords', {
                        lat: sosCoords.latitude.toFixed(4),
                        lng: sosCoords.longitude.toFixed(4),
                      })
                    : t('map.sosMessageNoCoords')}
                </Text>

                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={handleCallEmergencyServices}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.call112Police')}
                >
                  <Phone size={16} color="#FFF" />
                  <Text style={styles.callBtnText}>{t('map.call112Police')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelSosBtn}
                  onPress={() => setSosTriggered(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.cancelAlert')}
                >
                  <Text style={styles.cancelSosBtnText}>{t('map.cancelAlert')}</Text>
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
    minHeight: MIN_TOUCH_TARGET,
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
    color: C.white,
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
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 6,
  },
  dropdownOptionRowActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
  },
  dropdownOptionText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: C.blue,
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
    backgroundColor: C.green,
  },
  statusPillText: {
    fontSize: 12,
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
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 13,
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
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
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
    color: C.textMuted,
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
    fontSize: 12,
    fontWeight: '600',
  },
  bottomStatVal: {
    color: '#C9D1D9',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#21262D',
  },
  joinTripBtn: {
    backgroundColor: C.blue,
    paddingVertical: 10,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  joinTripBtnText: {
    color: C.white,
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
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },

  // SOS button
  sosControlBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: C.red,
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
    color: C.red,
    fontWeight: '900',
    fontSize: 17,
    marginTop: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  sosModalSub: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  callBtn: {
    flexDirection: 'row',
    backgroundColor: C.red,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginTop: 20,
  },
  callBtnText: {
    color: C.white,
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
    color: C.textMuted,
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
    backgroundColor: C.green,
    borderColor: C.green,
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textMuted,
  },
  segmentTabTextActive: {
    color: C.white,
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
    color: C.textMuted,
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
    color: '#C9D1D9',
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
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startNavBtnText: {
    color: C.white,
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
    backgroundColor: C.green,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: C.green,
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
    color: C.white,
    fontSize: 15,
    fontWeight: '800',
  },
  navOverlaySub: {
    color: C.textMuted,
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
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  stepDistance: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  navHandoffNote: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    marginBottom: 14,
  },
  startDrivingBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startDrivingBtnText: {
    color: C.white,
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
    color: C.white,
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
    color: C.blue,
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
    backgroundColor: C.green,
  },
  itineraryItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  itineraryItemTextActive: {
    color: C.white,
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
    color: C.textMuted,
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
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentRoadText: {
    color: C.textMuted,
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
    color: C.textMuted,
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
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
  },
  collapseGradientBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default memo(MapScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Map" />;
}
