import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MapPin, Navigation, Search, Building2, Phone } from 'lucide-react-native';
import MapAPI from '../services/mapApi';

export function MapViewSection({ facilities: propFacilities, onSelectFacility }) {
  const [locations, setLocations] = useState(Array.isArray(propFacilities) ? propFacilities : []);
  const [loading, setLoading] = useState(!Array.isArray(propFacilities) || propFacilities.length === 0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (Array.isArray(propFacilities) && propFacilities.length > 0) {
      setLocations(propFacilities);
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await MapAPI.getMapFacilities();
        if (mounted && Array.isArray(res?.facilities)) {
          setLocations(res.facilities);
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [propFacilities]);

  const filtered = locations.filter(item => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const text = `${item.name || ''} ${item.address || ''} ${item.location || ''}`.toLowerCase();
    return text.includes(q);
  });

  const openDirections = item => {
    const lat = item.latitude ?? item.lat;
    const lng = item.longitude ?? item.long ?? item.lng;
    const url = lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name || item.address || 'Clinic')}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={18} color="#0ea5e9" />
          <Text style={styles.headerTitle}>Nearby Healthcare Facilities</Text>
        </View>
        <Text style={styles.countText}>{filtered.length} found</Text>
      </View>

      <View style={styles.searchBar}>
        <Search size={16} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clinic or address..."
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#0ea5e9" />
          <Text style={styles.muted}>Loading facilities...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>No facilities match your search.</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {filtered.slice(0, 8).map((item, idx) => (
            <TouchableOpacity
              key={`${item.id || item.facilityId || idx}`}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => onSelectFacility && onSelectFacility(item)}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Building2 size={14} color="#0284c7" />
                  <Text style={styles.name} numberOfLines={1}>{item.name || 'Healthcare Facility'}</Text>
                </View>
                {!!(item.address || item.location) && (
                  <Text style={styles.address} numberOfLines={2}>{item.address || item.location}</Text>
                )}
                {!!item.phone && (
                  <View style={styles.row}>
                    <Phone size={12} color="#64748b" />
                    <Text style={styles.phone}>{item.phone}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.dirBtn} onPress={() => openDirections(item)}>
                <Navigation size={14} color="#fff" />
                <Text style={styles.dirText}>Map</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  countText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', outlineStyle: 'none' },
  list: { maxHeight: 260 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  address: { fontSize: 12, color: '#64748b', marginTop: 2 },
  phone: { fontSize: 11, color: '#64748b', marginTop: 2 },
  dirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  dirText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 6 },
  muted: { fontSize: 13, color: '#64748b' },
});

