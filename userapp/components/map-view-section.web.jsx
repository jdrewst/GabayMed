import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Linking, TextInput, ScrollView, ActivityIndicator, Keyboard,
} from 'react-native';
import {
  Search, Maximize2, X, Navigation, MapPin, Phone, Crosshair, Building2, Clock, ChevronDown, ChevronUp, CornerDownRight, Compass,
} from 'lucide-react-native';
import MapAPI, { getDistanceKm, formatDistance } from '../services/mapApi';
import ProfileAPI from '../services/profileApi';
import { useTheme } from '../context/ThemeContext';
import { matchesFacilityQuery, MAP_QUICK_SERVICE_FILTERS } from '../lib/medical-services';
import { Popup } from './auth/auth-ui';

const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// Global shared map state store so maps across all tabs stay 100% synchronized
const sharedMapStore = {
  region: { ...DEFAULT_REGION },
  selectedPin: null,
  activeRoute: null,
  searchQuery: '',
  locations: [],
  userCoords: null,
  locationGranted: null,
  initialized: false,
  listeners: new Set(),

  getState() {
    return {
      region: this.region,
      selectedPin: this.selectedPin,
      activeRoute: this.activeRoute,
      searchQuery: this.searchQuery,
      locations: this.locations,
      userCoords: this.userCoords,
      locationGranted: this.locationGranted,
      initialized: this.initialized,
    };
  },

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    const s = this.getState();
    this.listeners.forEach(fn => {
      try { fn(s); } catch {}
    });
  },

  setRegion(r) {
    if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return;
    this.region = {
      latitude: r.latitude,
      longitude: r.longitude,
      latitudeDelta: Math.min(6.0, Math.max(0.01, r.latitudeDelta || 0.12)),
      longitudeDelta: Math.min(6.0, Math.max(0.01, r.longitudeDelta || 0.12)),
    };
  },

  update(patch) {
    let changed = false;
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'region') {
        this.setRegion(val);
        changed = true;
      } else if (this[key] !== val) {
        this[key] = val;
        changed = true;
      }
    }
    if (changed) this.notify();
  },
};

function computeBoundingRegion(points) {
  if (!points || !Array.isArray(points) || points.length === 0) return { ...DEFAULT_REGION };

  const validPoints = points
    .filter(p => {
      if (!p) return false;
      const lat = Number(p.latitude ?? p.lat);
      const lng = Number(p.longitude ?? p.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 4.5 && lat <= 21.5 && lng >= 116.0 && lng <= 127.0;
    })
    .map(p => ({
      latitude: Number(p.latitude ?? p.lat),
      longitude: Number(p.longitude ?? p.lng),
    }));

  if (validPoints.length === 0) return { ...DEFAULT_REGION };
  if (validPoints.length === 1) {
    return {
      latitude: validPoints[0].latitude,
      longitude: validPoints[0].longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  const ncrPoints = validPoints.filter(
    p => p.latitude >= 14.3 && p.latitude <= 14.9 && p.longitude >= 120.8 && p.longitude <= 121.2
  );
  const targetPoints = ncrPoints.length >= 2 ? ncrPoints : validPoints;

  let minLat = targetPoints[0].latitude;
  let maxLat = targetPoints[0].latitude;
  let minLng = targetPoints[0].longitude;
  let maxLng = targetPoints[0].longitude;

  targetPoints.forEach(p => {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  });

  const latDelta = Math.min(0.18, Math.max(0.04, (maxLat - minLat) * 1.4));
  const lngDelta = Math.min(0.18, Math.max(0.04, (maxLng - minLng) * 1.4));

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

function buildInteractiveMapHtml({ locations, selectedId, userCoords, locationGranted, activeRoute, region, focusUser }) {
  const payload = JSON.stringify({
    locations: (locations || [])
      .filter(loc => loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude)) && Math.abs(Number(loc.latitude)) > 1)
      .map(loc => ({
        id: String(loc.id),
        name: loc.name || loc.title || 'Medical Facility',
        address: loc.address || loc.location || '',
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
        isPublic: loc.isGabay === false,
      })),
    selectedId: selectedId != null ? String(selectedId) : null,
    userCoords: locationGranted && userCoords ? { lat: Number(userCoords.latitude), lng: Number(userCoords.longitude) } : null,
    routeCoords: Array.isArray(activeRoute?.coordinates)
      ? activeRoute.coordinates.map(c => [Number(c.latitude), Number(c.longitude)])
      : null,
    region: region || DEFAULT_REGION,
    focusUser: !!focusUser,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .leaflet-control-zoom { display: none !important; }
  .pin-svg { filter: drop-shadow(0 3px 5px rgba(0,0,0,0.28)); transition: transform 0.18s ease; }
  .pin-svg.selected { transform: scale(1.22); }
  .leaflet-popup-content-wrapper {
    border-radius: 14px !important;
    border: 1px solid #bae6fd !important;
    box-shadow: 0 3px 10px rgba(2,132,199,0.18) !important;
    padding: 0 !important;
  }
  .leaflet-popup-content { margin: 10px 12px !important; width: 195px !important; }
  .callout-row { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
  .callout-badge {
    width: 22px; height: 22px; border-radius: 7px; background: #e0f2fe;
    display: flex; align-items: center; justify-content: center; color: #0ea5e9; font-weight: 800; font-size: 12px; flex-shrink: 0;
  }
  .callout-title { font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.25; }
  .callout-sub { font-size: 11.5px; color: #64748b; line-height: 1.35; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const data = ${payload};
  const map = L.map('map', { zoomControl: false }).setView([data.region.latitude || 14.5995, data.region.longitude || 120.9842], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  function pinIcon(color, isSelected) {
    const svg = '<svg class="pin-svg' + (isSelected ? ' selected' : '') + '" width="30" height="40" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22s12-13 12-22c0-6.63-5.37-12-12-12z" fill="' + color + '" stroke="#ffffff" stroke-width="1.8"/>' +
      '<circle cx="12" cy="12" r="4.5" fill="#ffffff"/>' +
      '</svg>';
    return L.divIcon({ className: '', html: svg, iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const bounds = [];

  if (data.userCoords && Number.isFinite(data.userCoords.lat)) {
    const uMarker = L.marker([data.userCoords.lat, data.userCoords.lng], { icon: pinIcon('#ef4444', false) }).addTo(map);
    uMarker.bindPopup(
      '<div class="callout-row"><div class="callout-badge" style="background:#bae6fd;color:#0284c7">●</div>' +
      '<div class="callout-title">You are here</div></div><div class="callout-sub">Your current location</div>'
    );
    if (data.focusUser) setTimeout(() => uMarker.openPopup(), 200);
    bounds.push([data.userCoords.lat, data.userCoords.lng]);
  }

  data.locations.forEach(loc => {
    const isSel = data.selectedId && String(loc.id) === String(data.selectedId);
    const pinColor = loc.isPublic ? (isSel ? '#047857' : '#10b981') : (isSel ? '#1d4ed8' : '#0ea5e9');
    const badgeBg = loc.isPublic ? '#d1fae5' : '#e0f2fe';
    const badgeText = loc.isPublic ? 'Public Hospital' : 'Gabay Partner';
    const badgeColor = loc.isPublic ? '#047857' : '#0284c7';
    const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(pinColor, isSel) }).addTo(map);
    marker.bindPopup(
      '<div class="callout-row"><div class="callout-badge" style="background:' + badgeBg + ';color:' + badgeColor + '">🏥</div>' +
      '<div class="callout-title">' + escapeHtml(loc.name) + '</div></div>' +
      '<div style="display:inline-block;margin-bottom:4px;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700;background:' + badgeBg + ';color:' + badgeColor + '">' + badgeText + '</div>' +
      '<div class="callout-sub">' + escapeHtml(loc.address) + '</div>'
    );
    marker.on('click', () => {
      window.parent.postMessage({ type: 'GABAY_SELECT_PIN', id: loc.id }, '*');
    });
    if (isSel) {
      setTimeout(() => marker.openPopup(), 180);
    }
    bounds.push([loc.lat, loc.lng]);
  });

  map.on('click', () => {
    window.parent.postMessage({ type: 'GABAY_MAP_BG_CLICK' }, '*');
  });

  if (data.routeCoords && data.routeCoords.length > 1) {
    const poly = L.polyline(data.routeCoords, { color: '#0284c7', weight: 4.5, opacity: 0.9 }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding: [45, 45] });
  } else if (data.focusUser && data.userCoords) {
    map.setView([data.userCoords.lat, data.userCoords.lng], 15);
  } else if (data.selectedId) {
    const sel = data.locations.find(l => String(l.id) === String(data.selectedId));
    if (sel) map.setView([sel.lat, sel.lng], 15);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [38, 38], maxZoom: 14 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  }
</script>
</body>
</html>`;
}

export function MapViewSection({ facilities: propFacilities, onSelectFacility, isActive = true }) {
  const { display, isDark } = useTheme();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [focusUser, setFocusUser] = useState(false);
  const [locations, setLocations] = useState(() => {
    if (Array.isArray(propFacilities) && propFacilities.length > 0) return propFacilities;
    return sharedMapStore.locations;
  });
  const [userCoords, setUserCoords] = useState(() => sharedMapStore.userCoords);
  const [locationGranted, setLocationGranted] = useState(() => sharedMapStore.locationGranted);
  const [region, setRegion] = useState(() => sharedMapStore.region);

  const activeLocations = (Array.isArray(propFacilities) && propFacilities.length > 0)
    ? propFacilities
    : (locations && locations.length > 0)
      ? locations
      : (sharedMapStore.locations && sharedMapStore.locations.length > 0)
        ? sharedMapStore.locations
        : [];

  const [selectedPin, setSelectedPin] = useState(() => sharedMapStore.selectedPin);
  const [activeRoute, setActiveRoute] = useState(() => sharedMapStore.activeRoute);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => sharedMapStore.searchQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationPromptAction, setLocationPromptAction] = useState(null);
  const [locatingBusy, setLocatingBusy] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'gabay' | 'public'
  const [serviceFilter, setServiceFilter] = useState('');
  const [livePublicResults, setLivePublicResults] = useState([]);
  const [searchingPublic, setSearchingPublic] = useState(false);

  const combinedLocations = (() => {
    const base = [];
    const seenIds = new Set();
    const pushUnique = item => {
      if (!item || seenIds.has(String(item.id))) return;
      seenIds.add(String(item.id));
      base.push(item);
    };
    if (Array.isArray(propFacilities) && propFacilities.length > 0) {
      propFacilities.forEach(pushUnique);
    }
    (locations || []).forEach(pushUnique);
    (sharedMapStore.locations || []).forEach(pushUnique);
    (livePublicResults || []).forEach(pushUnique);
    return base;
  })();

  const visibleLocations = combinedLocations.filter(loc => {
    if (sourceFilter === 'gabay' && loc.isGabay === false) return false;
    if (sourceFilter === 'public' && loc.isGabay !== false) return false;
    if (serviceFilter && !matchesFacilityQuery(loc, serviceFilter)) return false;
    if (searchQuery.trim() && !matchesFacilityQuery(loc, searchQuery)) return false;
    return true;
  });

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setLivePublicResults([]);
      setSearchingPublic(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingPublic(true);
      try {
        const results = await MapAPI.searchPublicHospitals(q, userCoords);
        if (!cancelled) setLivePublicResults(results || []);
      } catch {
        if (!cancelled) setLivePublicResults([]);
      } finally {
        if (!cancelled) setSearchingPublic(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, userCoords]);

  useEffect(() => {
    if (Array.isArray(propFacilities) && propFacilities.length > 0) {
      setLocations(propFacilities);
      if (sharedMapStore.locations.length === 0) {
        sharedMapStore.update({ locations: propFacilities });
      }
    }
  }, [propFacilities]);

  useEffect(() => {
    const unsub = sharedMapStore.subscribe(state => {
      setRegion(state.region);
      setSelectedPin(state.selectedPin);
      setActiveRoute(state.activeRoute);
      setSearchQuery(state.searchQuery);
      if (Array.isArray(state.locations) && state.locations.length > 0) {
        setLocations(state.locations);
      }
      setUserCoords(state.userCoords);
      setLocationGranted(state.locationGranted);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isActive) {
      const targetLocations = (Array.isArray(propFacilities) && propFacilities.length > 0)
        ? propFacilities
        : sharedMapStore.locations;

      if (targetLocations && targetLocations.length > 0) {
        setLocations(targetLocations);
      } else {
        initializeMap();
      }
      setRegion(sharedMapStore.region);
      setSelectedPin(sharedMapStore.selectedPin);
      setActiveRoute(sharedMapStore.activeRoute);
      setSearchQuery(sharedMapStore.searchQuery);
    }
  }, [isActive]);

  useEffect(() => {
    if (!sharedMapStore.initialized || sharedMapStore.locations.length === 0) {
      initializeMap();
    }
    const unsub = ProfileAPI.subscribePermissions(perms => {
      if (!perms.locationAllowed) {
        setLocationGranted(false);
        setUserCoords(null);
        setActiveRoute(null);
        setShowSteps(false);
        sharedMapStore.update({
          locationGranted: false,
          userCoords: null,
          activeRoute: null,
        });
      } else {
        initializeMap();
      }
    });
    return unsub;
  }, []);

  const initializeMap = async () => {
    const locResult = await MapAPI.requestUserLocation();
    const currentCoords = locResult.granted ? locResult.coords : null;
    const facilities = await MapAPI.getFacilitiesLocations(currentCoords);

    const isPhUser =
      currentCoords &&
      currentCoords.latitude >= 4.5 &&
      currentCoords.latitude <= 21.5 &&
      currentCoords.longitude >= 116.0 &&
      currentCoords.longitude <= 127.0;

    const points = isPhUser ? [currentCoords, ...facilities] : facilities;
    const initialRegion = computeBoundingRegion(points);

    sharedMapStore.update({
      locationGranted: locResult.granted,
      userCoords: currentCoords,
      locations: facilities,
      region: initialRegion,
      initialized: true,
    });
    setRegion(initialRegion);
    setLocations(facilities);
    setUserCoords(currentCoords);
    setLocationGranted(locResult.granted);
  };

  const activateAndFetchUserLocation = async () => {
    const locResult = await MapAPI.requestUserLocation({ forceEnable: true });
    if (!locResult.granted || !locResult.coords) {
      Linking.openSettings?.();
      return null;
    }
    setLocationGranted(true);
    setUserCoords(locResult.coords);
    let updatedLocations = locations;
    if (locResult.coords) {
      updatedLocations = (locations || [])
        .map(loc => {
          const km = getDistanceKm(
            locResult.coords.latitude,
            locResult.coords.longitude,
            loc.latitude,
            loc.longitude
          );
          return { ...loc, distanceKm: km, distanceLabel: formatDistance(km) };
        })
        .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
      setLocations(updatedLocations);
    }
    sharedMapStore.update({
      locationGranted: true,
      userCoords: locResult.coords,
      locations: updatedLocations,
    });
    return locResult.coords;
  };

  const panToUserCoords = coords => {
    if (!coords) return;
    const targetRegion = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
    setFocusUser(true);
    setRegion(targetRegion);
    sharedMapStore.update({
      locationGranted: true,
      userCoords: coords,
      region: targetRegion,
    });
  };

  const computeAndFrameRoute = async (origin, dest) => {
    if (!origin || !dest) return;
    setFocusUser(false);
    setSelectedPin(dest);
    setLoadingRoute(true);
    try {
      const routeData = await MapAPI.getInAppRoute(origin, dest);
      setActiveRoute(routeData);
      setShowSteps(true);
      const framed = computeBoundingRegion([
        origin,
        { latitude: Number(dest.latitude), longitude: Number(dest.longitude) },
      ]);
      setRegion(framed);
      sharedMapStore.update({
        locationGranted: true,
        userCoords: origin,
        selectedPin: dest,
        activeRoute: routeData,
        region: framed,
      });
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleConfirmLocationPopup = async () => {
    const pending = locationPromptAction;
    setLocatingBusy(true);
    try {
      const coords = await activateAndFetchUserLocation();
      setLocationPromptAction(null);
      if (!coords) return;
      if (pending?.type === 'directions' && pending.dest) {
        await computeAndFrameRoute(coords, pending.dest);
      } else {
        panToUserCoords(coords);
      }
    } finally {
      setLocatingBusy(false);
    }
  };

  const selectFacilityPin = loc => {
    Keyboard.dismiss?.();
    setFocusUser(false);
    setSelectedPin(loc);
    setActiveRoute(null);
    setShowSteps(false);
    setShowSuggestions(false);
    const targetRegion = {
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    };
    setRegion(targetRegion);
    sharedMapStore.update({
      selectedPin: loc,
      activeRoute: null,
      region: targetRegion,
    });
    if (onSelectFacility) onSelectFacility(loc);
  };

  const clearSelection = () => {
    setFocusUser(false);
    setSelectedPin(null);
    setActiveRoute(null);
    setShowSteps(false);
    sharedMapStore.update({
      selectedPin: null,
      activeRoute: null,
    });
  };

  // Listen for pin clicks from the embedded Leaflet canvas
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = event => {
      if (event?.data?.type === 'GABAY_SELECT_PIN') {
        const found = combinedLocations.find(loc => String(loc.id) === String(event.data.id));
        if (found) selectFacilityPin(found);
      } else if (event?.data?.type === 'GABAY_MAP_BG_CLICK') {
        setShowSuggestions(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [combinedLocations]);

  const startInAppDirections = async targetFacility => {
    const dest = targetFacility || selectedPin;
    if (!dest) return;
    const perms = await ProfileAPI.getPermissions();
    if (!locationGranted || !perms.locationAllowed || !userCoords) {
      setLocationPromptAction({ type: 'directions', dest });
      return;
    }
    await computeAndFrameRoute(userCoords, dest);
  };

  const recenterOnUser = async () => {
    const perms = await ProfileAPI.getPermissions();
    if (!locationGranted || !perms.locationAllowed || !userCoords) {
      setLocationPromptAction({ type: 'recenter' });
      return;
    }
    panToUserCoords(userCoords);
  };

  const resetNorthOrientation = () => {
    setFocusUser(false);
    const initial = computeBoundingRegion(activeLocations);
    setRegion(initial);
  };

  const suggestions = searchQuery.trim() || serviceFilter || sourceFilter !== 'all'
    ? visibleLocations.slice(0, 15)
    : combinedLocations.slice(0, 10);

  const mapHtml = buildInteractiveMapHtml({
    locations: visibleLocations,
    selectedId: selectedPin?.id,
    userCoords,
    locationGranted,
    activeRoute,
    region,
    focusUser,
  });

  const renderFilterChips = (isFullscreen = false) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.filterChipsBar, isFullscreen && styles.filterChipsBarFullscreen]}
      contentContainerStyle={styles.filterChipsContent}
      keyboardShouldPersistTaps="handled"
    >
      {[
        { id: 'all', label: 'All Hospitals' },
        { id: 'gabay', label: 'Gabay Clinics' },
        { id: 'public', label: 'Public Hospitals' },
      ].map(tab => {
        const active = sourceFilter === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? display.cardBg : 'rgba(255,255,255,0.94)', borderColor: display.border },
              active && (tab.id === 'public' ? styles.filterChipPublicActive : styles.filterChipActive),
            ]}
            onPress={() => setSourceFilter(tab.id)}
          >
            <Text style={[styles.filterChipText, { color: isDark && !active ? display.textSecondary : undefined }, active && styles.filterChipTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      {MAP_QUICK_SERVICE_FILTERS.map(svc => {
        const active = serviceFilter === svc.query;
        return (
          <TouchableOpacity
            key={svc.id}
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? display.cardBg : 'rgba(255,255,255,0.94)', borderColor: display.border },
              active && styles.filterChipActive,
            ]}
            onPress={() => setServiceFilter(active ? '' : svc.query)}
          >
            <Text style={[styles.filterChipText, { color: isDark && !active ? display.textSecondary : undefined }, active && styles.filterChipTextActive]}>
              {svc.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderSuggestionsDropdown = (isFullscreen = false) => {
    if (!showSuggestions) return null;
    return (
      <View style={[styles.suggestionsDropdown, isFullscreen && styles.suggestionsDropdownFullscreen, { backgroundColor: display.cardBg, borderColor: display.border }]}>
        {searchingPublic && (
          <View style={styles.searchingRow}>
            <ActivityIndicator size="small" color="#0ea5e9" />
            <Text style={[styles.searchingText, { color: display.textSecondary }]}>Searching public hospitals &amp; clinics...</Text>
          </View>
        )}
        {suggestions.length === 0 ? (
          <View style={styles.emptySuggestion}>
            <Text style={[styles.emptySuggestionText, { color: display.textSecondary }]}>No matching hospitals, clinics, or services found.</Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: isFullscreen ? 320 : 210 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {suggestions.map(item => {
              const isPublic = item.isGabay === false;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.suggestionRow, { borderBottomColor: display.border }]}
                  onPress={() => {
                    setSearchQuery(item.name);
                    selectFacilityPin(item);
                  }}
                >
                  <View style={[styles.suggestionIcon, isPublic && { backgroundColor: '#d1fae5' }]}>
                    <MapPin size={15} color={isPublic ? '#059669' : '#0ea5e9'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.suggestionTitle, { color: display.textPrimary }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {isPublic ? (
                        <View style={styles.publicTag}>
                          <Text style={styles.publicTagText}>Public</Text>
                        </View>
                      ) : (
                        <View style={styles.branchTag}>
                          <Text style={styles.branchTagText}>
                            {item.type === 'branch' ? 'Gabay Branch' : 'Gabay'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.suggestionSub, { color: display.textSecondary }]} numberOfLines={1}>
                      {item.distanceLabel ? `${item.distanceLabel} • ${item.address}` : item.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderPopupCard = (isCompact = false) => {
    if (!selectedPin) return null;
    return (
      <View style={[styles.selectedCard, isCompact && styles.selectedCardCompact, { backgroundColor: display.cardBg, borderColor: display.border, borderWidth: isDark ? 1 : 0 }]}>
        <View style={styles.selectedHeader}>
          <View style={[styles.selectedIconWrap, { backgroundColor: isDark ? display.subCardBg : '#f0f9ff' }]}>
            <Building2 size={20} color="#0ea5e9" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.selectedTitle, { flexShrink: 1, color: display.textPrimary }]} numberOfLines={1}>
                {selectedPin.name}
              </Text>
              {selectedPin.isGabay === false ? (
                <View style={styles.publicTag}>
                  <Text style={styles.publicTagText}>Public</Text>
                </View>
              ) : (
                <View style={styles.branchTag}>
                  <Text style={styles.branchTagText}>Gabay</Text>
                </View>
              )}
            </View>
            <Text style={[styles.selectedAddress, { color: display.textSecondary }]} numberOfLines={isCompact ? 1 : 2}>
              {selectedPin.address}
            </Text>
            {!isCompact && Array.isArray(selectedPin.services) && selectedPin.services.length > 0 && (
              <View style={styles.pinServicesWrap}>
                {selectedPin.services.slice(0, 4).map(svc => (
                  <View key={svc} style={[styles.pinServicePill, isDark && { backgroundColor: display.subCardBg }]}>
                    <Text style={[styles.pinServicePillText, isDark && { color: display.textSecondary }]}>{svc}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.metaRow}>
              {activeRoute ? (
                <>
                  <View style={styles.routeBadge}>
                    <Clock size={12} color="#0284c7" />
                    <Text style={styles.routeBadgeText}>{activeRoute.durationLabel}</Text>
                  </View>
                  <View style={styles.routeBadge}>
                    <Navigation size={12} color="#0284c7" />
                    <Text style={styles.routeBadgeText}>{activeRoute.distanceLabel}</Text>
                  </View>
                </>
              ) : selectedPin.distanceLabel ? (
                <View style={styles.distancePill}>
                  <MapPin size={12} color="#0284c7" />
                  <Text style={styles.distancePillText}>{selectedPin.distanceLabel}</Text>
                </View>
              ) : null}

              {!isCompact && !!selectedPin.phone && (
                <View style={styles.phoneRow}>
                  <Phone size={11} color="#64748b" />
                  <Text style={styles.phoneText}>{selectedPin.phone}</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={clearSelection} hitSlop={8} style={styles.dismissCardBtn}>
            <X size={16} color="#64748b" />
          </TouchableOpacity>
        </View>

        {activeRoute && showSteps && (
          <ScrollView
            style={[
              styles.stepsList,
              isCompact && { maxHeight: 85 },
              { borderTopColor: display.border },
            ]}
            nestedScrollEnabled
          >
            {activeRoute.steps.map(step => (
              <View key={step.id} style={styles.stepRow}>
                <CornerDownRight size={14} color="#0ea5e9" />
                <Text style={[styles.stepInstruction, { color: display.textPrimary }]}>{step.instruction}</Text>
                <Text style={[styles.stepDistance, { color: display.textSecondary }]}>{step.distanceLabel}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.cardActions}>
          {!activeRoute ? (
            <TouchableOpacity
              style={styles.directionsBtn}
              onPress={() => startInAppDirections(selectedPin)}
              disabled={loadingRoute}
              activeOpacity={0.85}
            >
              {loadingRoute ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Navigation size={15} color="#fff" />
              )}
              <Text style={styles.directionsBtnText}>
                {loadingRoute ? 'Finding Route...' : 'Directions from My Location'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.activeRouteRow}>
              <TouchableOpacity style={styles.stepsToggleBtn} onPress={() => setShowSteps(!showSteps)}>
                {showSteps ? <ChevronDown size={16} color="#0284c7" /> : <ChevronUp size={16} color="#0284c7" />}
                <Text style={styles.stepsToggleText}>
                  {showSteps ? 'Hide Steps' : `View Steps (${activeRoute.steps.length})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearRouteBtn}
                onPress={() => {
                  setActiveRoute(null);
                  setShowSteps(false);
                  sharedMapStore.update({ activeRoute: null });
                }}
              >
                <Text style={styles.clearRouteText}>End Route</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <View style={styles.mapContainer}>
        {!isActive ? (
          <View style={[styles.map, styles.mapLoadingFallback]}>
            <ActivityIndicator size="small" color="#0ea5e9" />
          </View>
        ) : (
          React.createElement('iframe', {
            title: 'GabayMed Clinic Map',
            srcDoc: mapHtml,
            style: { width: '100%', height: '100%', border: 'none' },
          })
        )}

        {/* Top search bar with live suggestions + expand button */}
        <View style={styles.inlineTopBar}>
          <View style={[styles.searchInputWrap, { backgroundColor: isDark ? display.cardBg : 'rgba(255, 255, 255, 0.95)', borderColor: display.border }]}>
            <Search size={16} color="#0ea5e9" />
            <TextInput
              value={searchQuery}
              onChangeText={text => {
                setSearchQuery(text);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onSubmitEditing={() => {
                if (suggestions.length > 0) {
                  setSearchQuery(suggestions[0].name);
                  selectFacilityPin(suggestions[0]);
                }
              }}
              returnKeyType="search"
              placeholder="Search hospital"
              placeholderTextColor={display.placeholder}
              style={[styles.searchInput, { color: display.textPrimary }]}
            />
            {!!searchQuery && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setShowSuggestions(false);
                }}
                hitSlop={8}
              >
                <X size={15} color={display.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.expandButton, { backgroundColor: isDark ? display.cardBg : '#fff' }]}
            onPress={() => {
              setShowSuggestions(false);
              setMapExpanded(true);
            }}
            accessibilityLabel="Expand map"
          >
            <Maximize2 size={18} color="#0ea5e9" />
          </TouchableOpacity>
        </View>

        {!showSuggestions && !searchQuery.trim() && renderFilterChips(false)}
        {renderSuggestionsDropdown(false)}

        {locationGranted === false && !showSuggestions && (
          <TouchableOpacity style={styles.enableLocationChip} onPress={recenterOnUser} activeOpacity={0.85}>
            <Crosshair size={13} color="#0284c7" />
            <Text style={styles.enableLocationText}>Enable my location</Text>
          </TouchableOpacity>
        )}

        {!showSuggestions && (
          <View style={styles.mapOverlay}>
            <View style={styles.fabAboveCardRow}>
              <TouchableOpacity
                style={[styles.locateButtonSmall, { backgroundColor: isDark ? display.cardBg : '#fff' }]}
                onPress={resetNorthOrientation}
                accessibilityLabel="Reset map compass to north"
              >
                <Compass size={17} color="#0ea5e9" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.locateButtonSmall, { backgroundColor: isDark ? display.cardBg : '#fff' }]}
                onPress={recenterOnUser}
                accessibilityLabel="My location"
              >
                <Crosshair size={17} color="#0ea5e9" />
              </TouchableOpacity>
            </View>
            {selectedPin && renderPopupCard(true)}
          </View>
        )}
      </View>

      {/* Fullscreen Interactive Map Modal */}
      <Modal visible={mapExpanded} animationType="slide" onRequestClose={() => setMapExpanded(false)}>
        <View style={styles.fullscreenMapContainer}>
          {React.createElement('iframe', {
            title: 'GabayMed Fullscreen Clinic Map',
            srcDoc: mapHtml,
            style: { width: '100%', height: '100%', border: 'none', flex: 1 },
          })}

          <View style={styles.fullscreenTopBar}>
            <View style={[styles.fullscreenSearchBox, { backgroundColor: isDark ? display.cardBg : '#fff', borderColor: display.border }]}>
              <Search size={18} color="#0ea5e9" />
              <TextInput
                value={searchQuery}
                onChangeText={text => {
                  setSearchQuery(text);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onSubmitEditing={() => {
                  if (suggestions.length > 0) {
                    setSearchQuery(suggestions[0].name);
                    selectFacilityPin(suggestions[0]);
                  }
                }}
                returnKeyType="search"
                placeholder="Search hospital"
                placeholderTextColor={display.placeholder}
                style={[styles.fullscreenSearchInput, { color: display.textPrimary }]}
              />
              {!!searchQuery && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setShowSuggestions(false);
                  }}
                >
                  <X size={16} color={display.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowSuggestions(false);
                setMapExpanded(false);
              }}
              accessibilityLabel="Close fullscreen map"
            >
              <X size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {!showSuggestions && !searchQuery.trim() && renderFilterChips(true)}

          {showSuggestions && (
            <View style={styles.fullscreenSuggestionsWrap}>
              {renderSuggestionsDropdown(true)}
            </View>
          )}

          {!showSuggestions && (
            <View style={styles.fullscreenMapOverlay}>
              <View style={styles.fabAboveCardRow}>
                <TouchableOpacity
                  style={[styles.myLocationFab, { backgroundColor: isDark ? display.cardBg : '#fff' }]}
                  onPress={resetNorthOrientation}
                  accessibilityLabel="Reset map compass to north"
                >
                  <Compass size={20} color="#0ea5e9" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.myLocationFab, { backgroundColor: isDark ? display.cardBg : '#fff' }]}
                  onPress={recenterOnUser}
                  accessibilityLabel="My location"
                >
                  <Crosshair size={20} color="#0ea5e9" />
                </TouchableOpacity>
              </View>
              {selectedPin && renderPopupCard(false)}
            </View>
          )}
        </View>
      </Modal>

      <Popup
        visible={!!locationPromptAction}
        icon={MapPin}
        title="Allow Location Access?"
        message="Location access is currently turned off. Would you like to enable location access so GabayMed can find your current location?"
        actionLabel={locatingBusy ? 'Locating...' : 'Allow'}
        actionLoading={locatingBusy}
        onAction={handleConfirmLocationPopup}
        secondaryLabel="Deny"
        onSecondary={() => setLocationPromptAction(null)}
        onRequestClose={() => setLocationPromptAction(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    height: 330,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapLoadingFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTopBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    paddingVertical: 0,
    outlineStyle: 'none',
  },
  expandButton: {
    backgroundColor: '#fff',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 54,
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
    overflow: 'hidden',
  },
  fullscreenSuggestionsWrap: {
    position: 'absolute',
    top: 48,
    left: 6,
    right: 6,
    zIndex: 20,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTitle: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1e293b',
  },
  branchTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  branchTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  suggestionSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  emptySuggestion: {
    padding: 14,
    alignItems: 'center',
  },
  emptySuggestionText: {
    fontSize: 13,
    color: '#64748b',
  },
  enableLocationChip: {
    position: 'absolute',
    top: 56,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bae6fd',
    elevation: 2,
  },
  enableLocationText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284c7',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
  },
  fabAboveCardRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  locateButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  fullscreenMapContainer: {
    flex: 1,
  },
  fullscreenTopBar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  fullscreenSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 5,
  },
  fullscreenSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    paddingVertical: 0,
    outlineStyle: 'none',
  },
  closeButton: {
    backgroundColor: '#0ea5e9',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  myLocationFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  fullscreenMapOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  selectedCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  selectedCardCompact: {
    padding: 12,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selectedIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  selectedAddress: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  distancePillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0284c7',
  },
  routeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  routeBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  dismissCardBtn: {
    padding: 4,
  },
  stepsList: {
    maxHeight: 130,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  stepInstruction: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
  },
  stepDistance: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
  },
  cardActions: {
    marginTop: 10,
  },
  directionsBtn: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  directionsBtnText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  activeRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepsToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 9,
    borderRadius: 10,
  },
  stepsToggleText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  clearRouteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearRouteText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#dc2626',
  },
  filterChipsBar: {
    position: 'absolute',
    top: 56,
    left: 10,
    right: 10,
    zIndex: 12,
    maxHeight: 34,
  },
  filterChipsBarFullscreen: {
    top: 106,
    left: 16,
    right: 16,
    zIndex: 25,
  },
  suggestionsDropdownFullscreen: {
    position: 'relative',
    top: 0,
    left: 0,
    right: 0,
    marginTop: 0,
    zIndex: 35,
    elevation: 14,
  },
  filterChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
  },
  filterChipPublicActive: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  publicTag: {
    backgroundColor: '#d1fae5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  publicTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchingText: {
    fontSize: 12,
    color: '#64748b',
  },
  pinServicesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
  },
  pinServicePill: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pinServicePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0369a1',
  },
});
