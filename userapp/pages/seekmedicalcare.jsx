import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Image, ActivityIndicator, Alert } from 'react-native';
import { Search, Star, X, MessageCircle, Calendar, FileText, DollarSign, MapPin, Stethoscope } from 'lucide-react-native';
import { AppHeader } from '../components/app-header';
import { MapViewSection } from '../components/map-view-section';
import { AppointmentBooking } from '../components/appointment';
import BrowseAPI from '../services/browseApi';

export function SeekMedicalCare({
  isActive = true,
  onOpenMessages,
  onOpenNotifications,
  onOpenProfile,
  onAppointmentBooked,
}) {
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [bookingFacility, setBookingFacility] = useState(null); // ADD THIS: Separate state for booking
  const [showAppointmentBooking, setShowAppointmentBooking] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [facilityNameQuery, setFacilityNameQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [showAllHospitals, setShowAllHospitals] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false); // Controls Modal now
 
  // Data State
  const [loading, setLoading] = useState(true);
  const [allFacilities, setAllFacilities] = useState([]);
  const [displayedFacilities, setDisplayedFacilities] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (filters = {}) => {
    setLoading(true);
    try {
      const data = await BrowseAPI.getSeekCareData(filters);
      if (!filters.category && !filters.name && !filters.location) {
        setAllFacilities(data.facilities);
      }
      setDisplayedFacilities(data.facilities);
      setAvailableServices(data.services);
    } catch (error) {
      Alert.alert('Unable to search facilities', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSelect = (service) => {
    setShowAllServices(false); // Close modal if selecting from there
    const category = selectedService === service ? '' : service;
    setSelectedService(category || null);
    loadData({
      category,
      name: facilityNameQuery,
      location: locationQuery
    });
  };

  const handleFacilityClick = (facility) => {
    if (facility.isGabay) {
      setSelectedFacility(facility.id);
    }
    // No else needed as button is disabled
  };

  const filteredServices = availableServices.filter(service =>
    service.toLocaleLowerCase().includes(serviceSearchQuery.trim().toLocaleLowerCase())
  );

  const clearServiceSearch = () => {
    setServiceSearchQuery('');
    setSelectedService(null);
    loadData({ name: facilityNameQuery, location: locationQuery });
  };

  const handleServiceSearchChange = (query) => {
    setServiceSearchQuery(query);
  };

  const handleFacilitySearch = () => {
    loadData({
      category: selectedService || '',
      name: facilityNameQuery,
      location: locationQuery
    });
  };

  const clearFacilitySearch = () => {
    setFacilityNameQuery('');
    setLocationQuery('');
    loadData({ category: selectedService || '' });
  };

  const gabayPerks = [
    { icon: FileText, label: "View Your Ledger" },
    { icon: Calendar, label: "Book Appointments" },
    { icon: DollarSign, label: "Real-time Bill Estimates" },
    { icon: MessageCircle, label: "Direct Facility Chat" },
  ];

  return (
    <View style={styles.container}>
      <AppHeader onOpenMessages={onOpenMessages} onOpenNotifications={onOpenNotifications} onOpenProfile={onOpenProfile} />

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seek Medical Care</Text>
          <MapViewSection isActive={isActive} facilities={displayedFacilities} />
        </View>

        <View style={styles.section}>
          <View style={styles.serviceBrowseHeader}>
            <Text style={styles.sectionTitle}>Browse Services</Text>
            <TouchableOpacity onPress={() => setShowAllServices(true)}>
              <Text style={styles.seeAllButton}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.serviceSearchContainer}>
            <Search size={18} color="#6b7280" />
            <TextInput
              style={styles.serviceSearchInput}
              value={serviceSearchQuery}
              onChangeText={handleServiceSearchChange}
              placeholder="Search services (e.g., Cardiology)"
              returnKeyType="search"
            />
            {serviceSearchQuery.length > 0 && (
              <TouchableOpacity onPress={clearServiceSearch} accessibilityLabel="Clear service search">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serviceList}>
            {filteredServices.map((service) => (
              <TouchableOpacity
                key={service}
                style={[styles.serviceCard, selectedService === service && styles.serviceCardSelected]}
                onPress={() => handleServiceSelect(service)}
              >
                <View style={styles.serviceIconContainer}>
                  <Stethoscope size={24} color={selectedService === service ? "#fff" : "#0ea5e9"} />
                </View>
                <Text style={[styles.serviceLabel, selectedService === service && styles.serviceLabelSelected]}>
                  {service}
                </Text>
              </TouchableOpacity>
            ))}
            {filteredServices.length === 0 && (
              <Text style={styles.noServicesText}>No services match your search.</Text>
            )}
          </ScrollView>

          <Modal
            visible={showAllServices}
            animationType="slide"
            onRequestClose={() => setShowAllServices(false)}
          >
            <View style={styles.fullScreenModalContainer}>
              <View style={styles.fullScreenModalHeader}>
                <Text style={styles.fullScreenModalTitle}>All Services</Text>
                <TouchableOpacity
                  onPress={() => setShowAllServices(false)}
                  style={styles.closeButton}
                >
                  <X size={24} color="#1f2937" />
                </TouchableOpacity>
              </View>

              <View style={[styles.serviceSearchContainer, styles.modalServiceSearch]}>
                <Search size={18} color="#6b7280" />
                <TextInput
                  style={styles.serviceSearchInput}
                  value={serviceSearchQuery}
                  onChangeText={handleServiceSearchChange}
                  placeholder="Search services"
                  returnKeyType="search"
                />
                {serviceSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={clearServiceSearch} accessibilityLabel="Clear service search">
                    <X size={18} color="#6b7280" />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                <View style={styles.serviceGrid}>
                  {filteredServices.map((service) => (
                    <TouchableOpacity
                      key={service}
                      style={[styles.serviceCardGrid, selectedService === service && styles.serviceCardSelected]}
                      onPress={() => handleServiceSelect(service)}
                    >
                      <View style={styles.serviceIconContainer}>
                        <Stethoscope size={24} color={selectedService === service ? "#fff" : "#0ea5e9"} />
                      </View>
                      <Text style={[styles.serviceLabel, selectedService === service && styles.serviceLabelSelected]}>
                        {service}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {filteredServices.length === 0 && (
                    <Text style={styles.noServicesText}>No services match your search.</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          </Modal>

          {selectedService && (
            <Text style={styles.serviceDescription}>
              Showing facilities that offer {selectedService}.
            </Text>
          )}
        </View>

        <View style={[styles.section, styles.lastSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedService ? `Facilities for ${selectedService}` : 'Search Facilities'}
            </Text>
            <TouchableOpacity onPress={() => setShowAllHospitals(!showAllHospitals)}>
              <Text style={styles.seeAllButton}>{showAllHospitals ? 'Show Less' : 'See All'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.facilitySearchPanel}>
            <View style={styles.serviceSearchContainer}>
              <Search size={18} color="#6b7280" />
              <TextInput
                style={styles.serviceSearchInput}
                value={facilityNameQuery}
                onChangeText={setFacilityNameQuery}
                placeholder="Search facility name"
                returnKeyType="search"
                onSubmitEditing={handleFacilitySearch}
              />
            </View>
            <View style={styles.serviceSearchContainer}>
              <MapPin size={18} color="#6b7280" />
              <TextInput
                style={styles.serviceSearchInput}
                value={locationQuery}
                onChangeText={setLocationQuery}
                placeholder="Search city or location"
                returnKeyType="search"
                onSubmitEditing={handleFacilitySearch}
              />
            </View>
            <View style={styles.facilitySearchActions}>
              <TouchableOpacity style={styles.searchButton} onPress={handleFacilitySearch}>
                <Search size={16} color="#fff" />
                <Text style={styles.searchButtonText}>Search Facilities</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearFacilitySearch} style={styles.clearSearchButton}>
                <Text style={styles.clearSearchText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#0ea5e9" style={{ marginTop: 20 }} />
          ) : displayedFacilities.length === 0 ? (
            <Text style={styles.noServicesText}>
              {selectedService ? `No facilities offer ${selectedService}.` : 'No facilities found.'}
            </Text>
          ) : !showAllHospitals ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hospitalList}>
              {displayedFacilities.map((hospital, idx) => (
                <TouchableOpacity
                  key={`hosp-scroll-${hospital.id}-${idx}`}
                  style={[styles.hospitalCard, !hospital.isGabay && { opacity: 0.5 }]}
                  onPress={() => handleFacilityClick(hospital)}
                  disabled={!hospital.isGabay}
                >
                <View style={styles.hospitalImageContainer}>
                  {hospital.imageUrl ? (
                    <Image 
                      source={{ uri: hospital.imageUrl }} 
                      style={styles.hospitalImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.hospitalImagePlaceholder}>
                      <Text style={styles.hospitalImageText}>🏥</Text>
                    </View>
                  )}
                  <View style={styles.ratingBadge}>
                    <Star size={12} color="#fbbf24" fill="#fbbf24" />
                    <Text style={styles.ratingText}>{hospital.rating}</Text>
                  </View>
                </View>
                <View style={styles.hospitalInfo}>
                  <Text style={styles.hospitalName} numberOfLines={1}>{hospital.name}</Text>
                  <Text style={styles.hospitalAddress} numberOfLines={1}>{hospital.address}</Text>
                  <View style={styles.hospitalFooter}>
                    <View style={styles.hospitalDistance}>
                      <MapPin size={12} color="#9ca3af" />
                      <Text style={styles.hospitalDistanceText}>{hospital.distance}</Text>
                    </View>
                    {hospital.isGabay && (
                      <Image 
                        source={require('../assets/logoblue.png')} 
                        style={styles.gabayBadgeSmall}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          ) : (
            <View style={styles.hospitalGrid}>
              {displayedFacilities.map((hospital, idx) => (
                <TouchableOpacity
                  key={`hosp-grid-${hospital.id}-${idx}`}
                  style={[styles.hospitalCardGrid, !hospital.isGabay && { opacity: 0.5 }]}
                  onPress={() => handleFacilityClick(hospital)}
                  disabled={!hospital.isGabay}
                >
                  <View style={styles.hospitalImageContainer}>
                    {hospital.imageUrl ? (
                      <Image 
                        source={{ uri: hospital.imageUrl }} 
                        style={styles.hospitalImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.hospitalImagePlaceholder}>
                        <Text style={styles.hospitalImageText}>🏥</Text>
                      </View>
                    )}
                    <View style={styles.ratingBadge}>
                      <Star size={12} color="#fbbf24" fill="#fbbf24" />
                      <Text style={styles.ratingText}>{hospital.rating}</Text>
                    </View>
                  </View>
                  <View style={styles.hospitalInfo}>
                    <Text style={styles.hospitalName} numberOfLines={1}>{hospital.name}</Text>
                    <Text style={styles.hospitalAddress} numberOfLines={1}>{hospital.address}</Text>
                    <View style={styles.hospitalFooter}>
                      <View style={styles.hospitalDistance}>
                        <MapPin size={12} color="#9ca3af" />
                        <Text style={styles.hospitalDistanceText}>{hospital.distance}</Text>
                      </View>
                      {hospital.isGabay && (
                        <Image 
                          source={require('../assets/logoblue.png')} 
                          style={styles.gabayBadgeSmall}
                          resizeMode="contain"
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* GABAY Partner Modal */}
      <Modal
        visible={selectedFacility !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedFacility(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalGabayBadge}>
                  <Image
                    source={require('../assets/logoblue.png')}
                    style={styles.modalGabayBadgeImage}
                    resizeMode="contain"
                  />
                </View>
                <View>
                  <Text style={styles.modalTitle}>GABAY 2.0 Partner</Text>
                  <Text style={styles.modalSubtitle}>
                    {allFacilities.find((h) => h.id === selectedFacility)?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedFacility(null)}
                style={styles.modalCloseButton}
              >
                <X size={20} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Exclusive perks available at this GABAY partner:
            </Text>

            <View style={styles.perksGrid}>
              {gabayPerks.map((perk, index) => {
                const Icon = perk.icon;
                return (
                  <View key={index} style={styles.perkCard}>
                    <Icon size={20} color="#0ea5e9" />
                    <Text style={styles.perkLabel}>{perk.label}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.bookButton}
                onPress={() => {
                  const chosen = allFacilities.find((h) => h.id === selectedFacility);
                  setBookingFacility(chosen?.facilityId || selectedFacility); // Pass the actual UUID facilityId for booking
                  setSelectedFacility(null); // Close details modal
                  setShowAppointmentBooking(true); // Open booking modal
                }}
              >
                <Calendar size={16} color="#fff" />
                <Text style={styles.bookButtonText}>Book Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.detailsButton}>
                <Text style={styles.detailsButtonText}>View Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Appointment Booking Component */}
      <AppointmentBooking
        visible={showAppointmentBooking}
        onBooked={onAppointmentBooked}
        onClose={() => {
          setShowAppointmentBooking(false);
          setSelectedService(null);
          setBookingFacility(null); // Clear on close
          if (onAppointmentBooked) onAppointmentBooked();
        }}
        initialService={selectedService}
        facilityId={bookingFacility} // USE THIS instead of selectedFacility
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  lastSection: {
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllButton: {
    color: '#0ea5e9',
    fontSize: 14,
    fontWeight: '500',
  },
  hospitalList: {
    marginTop: 12,
  },
  hospitalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  hospitalCard: {
    width: 250,
    height: 230,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  hospitalCardGrid: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 12,
  },
  hospitalImageContainer: {
    position: 'relative',
    height: 156,
  },
  hospitalImage: {
    width: '100%',
    height: '100%',
  },
  hospitalImagePlaceholder: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hospitalImageText: {
    fontSize: 40,
  },
  gabayBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  gabayBadgeImage: {
    width: 20,
    height: 20,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
  },
  hospitalInfo: {
    padding: 8,
  },
  hospitalName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  hospitalAddress: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  hospitalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  hospitalDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hospitalDistanceText: {
    fontSize: 12,
    color: '#6b7280',
  },
  gabayBadgeSmall: {
    width: 16,
    height: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalGabayBadge: {
    width: 40,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalGabayBadgeImage: {
    width: 32,
    height: 32,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
    marginBottom: 16,
  },
  perksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  perkCard: {
    width: '48%',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
  },
  perkLabel: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bookButton: {
    flex: 1,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailsButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: 'bold',
  },
  serviceBrowseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceSearchContainer: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  facilitySearchPanel: {
    gap: 8,
    marginBottom: 12,
  },
  facilitySearchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0ea5e9',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  clearSearchButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  clearSearchText: {
    color: '#4b5563',
    fontWeight: '500',
  },
  serviceSearchInput: {
    flex: 1,
    minHeight: 44,
    color: '#1f2937',
  },
  modalServiceSearch: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  noServicesText: {
    paddingVertical: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  serviceList: {
    marginTop: 12,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  serviceCard: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    marginRight: 12,
    width: 100, // Fixed width for horizontal scroll items
  },
  serviceCardGrid: {
    width: '30%', // 3 columns
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  serviceCardSelected: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0c4a6e',
  },
  serviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 14,
    color: '#0ea5e9',
    fontWeight: '500',
  },
  serviceLabelSelected: {
    color: '#fff',
  },
  serviceDescriptionContainer: {
    marginTop: 16,
  },
  serviceDescription: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  // New Styles for Full Screen Modal
  fullScreenModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullScreenModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    marginTop: 40, // For status bar
  },
  fullScreenModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalScrollContent: {
    padding: 16,
  },
});

