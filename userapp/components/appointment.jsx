import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  X, 
  Calendar, 
  Clock, 
  ChevronLeft,
  ChevronRight,
  Hospital,
  Brain,
  User,
  HeartPulse,
  Bone,
  Droplet,
  Stethoscope,
  CheckCircle,
  MapPin,
  CalendarCheck,
  Baby,
  Eye,
  Pill,
  Wind,
  Activity
} from 'lucide-react-native';
import AppointmentAPI, { STANDARD_MEDICAL_SERVICES } from '../services/appointmentApi';
import MapAPI from '../services/mapApi';
import { expandServiceKeywords, normalizeSearchText, matchesFacilityQuery } from '../lib/medical-services';

export const serviceUIConfig = {
  "General Check-up": { icon: Hospital, colors: ['#66BAFF', '#83BFF0'] },
  "General Physician": { icon: Stethoscope, colors: ['#66BAFF', '#83BFF0'] },
  "Emergency & Trauma Care": { icon: Activity, colors: ['#EF4444', '#F87171'] },
  "Cardiology": { icon: HeartPulse, colors: ['#66BAFF', '#83BFF0'] },
  "Cardiothoracic Surgery": { icon: HeartPulse, colors: ['#0284C7', '#38BDF8'] },
  "OB-GYN (Obstetrics & Gynecology)": { icon: Baby, colors: ['#EC4899', '#F472B6'] },
  "Maternity & Birthing": { icon: Baby, colors: ['#EC4899', '#F472B6'] },
  "Pediatrics": { icon: Baby, colors: ['#66BAFF', '#83BFF0'] },
  "Neonatology (NICU)": { icon: Baby, colors: ['#38BDF8', '#7DD3FC'] },
  "Blood Bank & Transfusion": { icon: Droplet, colors: ['#DC2626', '#EF4444'] },
  "Laboratory & Blood Tests": { icon: Activity, colors: ['#0EA5E9', '#38BDF8'] },
  "Hematology": { icon: Droplet, colors: ['#EF4444', '#F87171'] },
  "Neurology": { icon: Brain, colors: ['#66BAFF', '#83BFF0'] },
  "Psychiatry & Mental Health": { icon: User, colors: ['#66BAFF', '#83BFF0'] },
  "Orthopedics": { icon: Bone, colors: ['#66BAFF', '#83BFF0'] },
  "Dermatology": { icon: Droplet, colors: ['#66BAFF', '#83BFF0'] },
  "Ophthalmology (Eye Care)": { icon: Eye, colors: ['#66BAFF', '#83BFF0'] },
  "ENT (Ear, Nose & Throat)": { icon: User, colors: ['#66BAFF', '#83BFF0'] },
  "Pulmonology": { icon: Wind, colors: ['#66BAFF', '#83BFF0'] },
  "Dentistry & Oral Surgery": { icon: Pill, colors: ['#66BAFF', '#83BFF0'] },
  "Nephrology & Dialysis": { icon: Activity, colors: ['#0284C7', '#38BDF8'] },
  "Oncology (Cancer Care)": { icon: Activity, colors: ['#6366F1', '#818CF8'] },
  "Radiology & Imaging (X-Ray / CT / MRI)": { icon: Hospital, colors: ['#0EA5E9', '#38BDF8'] },
  "default": { icon: Stethoscope, colors: ['#66BAFF', '#83BFF0'] }
};

const serviceAliases = {
  cardiologist: 'Cardiology',
  cardiology: 'Cardiology',
  cardiothoracic: 'Cardiothoracic Surgery',
  cardiothorasic: 'Cardiothoracic Surgery',
  heart: 'Cardiology',
  obgyn: 'OB-GYN (Obstetrics & Gynecology)',
  'ob-gyn': 'OB-GYN (Obstetrics & Gynecology)',
  maternity: 'Maternity & Birthing',
  pregnant: 'OB-GYN (Obstetrics & Gynecology)',
  pediatrician: 'Pediatrics',
  pediatrics: 'Pediatrics',
  baby: 'Pediatrics',
  blood: 'Blood Bank & Transfusion',
  lab: 'Laboratory & Blood Tests',
  hematologist: 'Hematology',
  orthopedic: 'Orthopedics',
  orthopedics: 'Orthopedics',
  psychiatric: 'Psychiatry & Mental Health',
  psychiatry: 'Psychiatry & Mental Health',
  ophthalmologist: 'Ophthalmology (Eye Care)',
  ophthalmology: 'Ophthalmology (Eye Care)',
  eye: 'Ophthalmology (Eye Care)',
  dentist: 'Dentistry & Oral Surgery',
  dentistry: 'Dentistry & Oral Surgery',
  pulmonologist: 'Pulmonology',
  lung: 'Pulmonology',
  neurologist: 'Neurology',
  dermatologist: 'Dermatology',
  skin: 'Dermatology',
  'ent specialist': 'ENT (Ear, Nose & Throat)',
};

export function getServiceDisplayName(name) {
  const displayName = String(name || '').trim();
  return serviceAliases[displayName.toLocaleLowerCase()] || displayName;
}

export function getServiceSearchTerms(name) {
  const displayName = getServiceDisplayName(name);
  const normalizedDisplayName = displayName.toLocaleLowerCase();
  const aliases = Object.entries(serviceAliases)
    .filter(([, canonicalName]) => canonicalName.toLocaleLowerCase() === normalizedDisplayName)
    .map(([alias]) => alias);
  return [displayName, ...aliases];
}

export function getServiceUI(name) {
  const displayName = getServiceDisplayName(name);
  const normalizedName = displayName.toLocaleLowerCase();
  if (!normalizedName) return serviceUIConfig.default;

  if (serviceUIConfig[displayName]) return serviceUIConfig[displayName];

  const key = Object.keys(serviceUIConfig).find(
    serviceName => serviceName !== 'default' &&
      (normalizedName.includes(serviceName.toLocaleLowerCase()) ||
        serviceName.toLocaleLowerCase().includes(normalizedName))
  );
  return key ? serviceUIConfig[key] : serviceUIConfig.default;
}

// ─── Helper: format "YYYY-MM-DD" → "Thursday, Nov 27, 2026"
function formatDateFriendly(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ─── Helper: get day-of-week names
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export function AppointmentBooking({ onClose, onBooked, visible = true, initialService = null, facilityId: propFacilityId }) {
  // If no facilityId prop is provided, the user must pick a facility first
  const needsFacilityPick = !propFacilityId;
  const [activeFacilityId, setActiveFacilityId] = useState(propFacilityId || null);
  const facilityId = activeFacilityId || propFacilityId || null;

  const getInitialStep = () => {
    if (!propFacilityId && !activeFacilityId) return 'facility';
    return initialService ? 'provider' : 'service';
  };

  const [step, setStep] = useState(getInitialStep());
  const [selectedService, setSelectedService] = useState(initialService);
  const [selectedServiceName, setSelectedServiceName] = useState(initialService || "");
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  
  // Calendar month navigation state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  
  // Data State
  const [loading, setLoading] = useState(false);
  const [facilityServices, setFacilityServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [facilityName, setFacilityName] = useState('');
  const [availableFacilities, setAvailableFacilities] = useState([]);
  
  // Confirmation state
  const [bookingResult, setBookingResult] = useState(null); // null | { success, data }

  // Static Time Slots Definition
  const baseTimeSlots = [
    "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", 
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM"
  ];

  // ─── Calendar Grid Generation ───
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build a 6-week grid (42 cells)
    const cells = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) {
      cells.push({ key: `blank-${i}`, day: null });
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = dateObj < today;
      // Allow booking up to 30 days out
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 30);
      const isTooFar = dateObj > maxDate;
      const isToday = dateObj.getTime() === today.getTime();

      cells.push({
        key: dateStr,
        day: d,
        dateStr,
        disabled: isPast || isTooFar,
        isToday,
        isSelected: selectedDate === dateStr,
      });
    }

    return cells;
  }, [calendarMonth, selectedDate]);

  const canGoPrevMonth = useMemo(() => {
    const now = new Date();
    return calendarMonth.year > now.getFullYear() || 
           (calendarMonth.year === now.getFullYear() && calendarMonth.month > now.getMonth());
  }, [calendarMonth]);

  const canGoNextMonth = useMemo(() => {
    const now = new Date();
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 30);
    return calendarMonth.year < maxDate.getFullYear() || 
           (calendarMonth.year === maxDate.getFullYear() && calendarMonth.month < maxDate.getMonth());
  }, [calendarMonth]);

  // Sync propFacilityId and initialService when modal opens
  useEffect(() => {
    if (visible) {
      if (propFacilityId) {
        setActiveFacilityId(propFacilityId);
        if (initialService) {
          setSelectedService(initialService);
          setSelectedServiceName(initialService);
          setStep('provider');
        } else {
          setStep(prev => (prev === 'facility' ? 'service' : prev));
        }
      } else if (!activeFacilityId) {
        setStep('facility');
      }
    } else {
      setActiveFacilityId(propFacilityId || null);
      setStep(propFacilityId ? (initialService ? 'provider' : 'service') : 'facility');
      setSelectedService(initialService);
      setSelectedServiceName(initialService || '');
      setSelectedProvider(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setBookingResult(null);
      setBookedSlots([]);
      setAvailableFacilities([]);
      const now = new Date();
      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
    }
  }, [visible, propFacilityId, initialService]);

  // 1. Load data on mount depending on whether facility is pre-selected
  useEffect(() => {
    if (visible && facilityId) {
      loadServices();
      loadFacilityName();
    } else if (visible && !facilityId) {
      loadFacilities();
    }
  }, [visible, facilityId, initialService]);

  // 2. Load Providers when step becomes 'provider'
  useEffect(() => {
    if (step === 'provider' && facilityId) {
      loadProviders();
    }
  }, [step, facilityId]);

  // 3. Load Schedule when date is selected
  useEffect(() => {
    if (step === 'time' && selectedProvider && selectedDate) {
      loadSchedule();
    }
  }, [step, selectedProvider, selectedDate]);

  const loadFacilityName = async () => {
    const name = await AppointmentAPI.getFacilityName(facilityId);
    setFacilityName(name);
  };

  const loadFacilities = async () => {
    setLoading(true);
    try {
      const locRes = await MapAPI.requestUserLocation();
      const userCoords = locRes.granted ? locRes.coords : null;
      MapAPI.clearFacilitiesCache();
      const [mapFacilities, dbFacilities] = await Promise.all([
        MapAPI.getFacilitiesLocations(userCoords, { includePublic: false }).catch(() => []),
        AppointmentAPI.getAllFacilities().catch(() => []),
      ]);

      // Display ONLY Gabay-supported healthcare facilities and branches for booking
      const seenKeys = new Set();
      const allFacilitiesList = [];

      const gabayMapItems = (mapFacilities || []).filter(
        f => f && f.isGabay !== false && f.isPublic !== true
      );
      // If branches exist for a facility, prefer the branch entries (which carry per-branch services_offered)
      const facilityIdsWithBranches = new Set(
        gabayMapItems.filter(f => f.branchId).map(f => String(f.facilityId || ''))
      );
      const filteredSource = [
        ...gabayMapItems.filter(f => f.branchId || !facilityIdsWithBranches.has(String(f.facilityId || ''))),
        ...(dbFacilities || []).filter(f => !facilityIdsWithBranches.has(String(f.facilityId || f.id || ''))),
      ].filter(f => f && f.isGabay !== false && f.isPublic !== true);

      for (let i = 0; i < filteredSource.length; i++) {
        const f = filteredSource[i];
        const services = Array.isArray(f.services) ? f.services : [];

        // When a user selected a service from Home -> Browse by Services, only show clinics offering that service
        if (initialService && !matchesFacilityQuery({ services }, initialService)) {
          continue;
        }

        const rawFacId = String(f.facilityId || f.id || '').replace(/^(facility-|branch-)/, '').trim();
        const dedupeKey = f.branchId
          ? `branch-${f.branchId}`
          : `facility-${rawFacId}-${(f.name || '').toLowerCase()}`;

        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        allFacilitiesList.push({
          key: `${dedupeKey}-${i}`,
          id: f.branchId ? `branch-${f.branchId}` : rawFacId || f.id,
          facilityId: rawFacId || f.id,
          branchId: f.branchId || null,
          name: f.name || 'Healthcare Facility',
          address: f.address || f.location || 'Metro Manila, Philippines',
          distance: f.distanceLabel || f.distance || '',
          services,
        });
      }

      setAvailableFacilities(allFacilitiesList);
    } catch (error) {
      console.error("Load facilities error:", error);
      setAvailableFacilities([]);
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    setLoading(true);
    try {
      const services = await AppointmentAPI.getFacilityServices(facilityId);
      const validServices = Array.isArray(services) && services.length > 0
        ? services
        : [...STANDARD_MEDICAL_SERVICES];
      setFacilityServices(validServices);
    } catch (error) {
      setFacilityServices([...STANDARD_MEDICAL_SERVICES]);
    } finally {
      setLoading(false);
    }
  };

  const loadProviders = async () => {
    setLoading(true);
    const data = await AppointmentAPI.getFacilityProviders(facilityId);
    const seen = new Set();
    const uniqueProviders = [];
    (data || []).forEach((p, idx) => {
      const pid = p.id || p.provider_id || `provider-${idx}`;
      if (!seen.has(pid)) {
        seen.add(pid);
        uniqueProviders.push(p);
      }
    });

    // Filter doctors so only providers whose specialty matches the hospital's offered services
    // (and the selected service when chosen) are shown.
    const allowedServices = selectedService
      ? [selectedService]
      : Array.isArray(facilityServices) && facilityServices.length > 0
        ? facilityServices
        : [];

    let filteredProviders = uniqueProviders;
    if (allowedServices.length > 0) {
      const allowedKeywords = new Set(
        allowedServices.flatMap(svc => [normalizeSearchText(svc), ...expandServiceKeywords(svc)])
      );
      const specialtyMatches = uniqueProviders.filter(p => {
        const specText = normalizeSearchText(
          [p.specialization, p.specialty, p.department, p.role].filter(Boolean).join(' ')
        );
        if (!specText) return false;
        const specExpanded = expandServiceKeywords(specText);
        return (
          allowedKeywords.has(specText) ||
          Array.from(allowedKeywords).some(kw => kw && (specText.includes(kw) || kw.includes(specText))) ||
          specExpanded.some(kw => allowedKeywords.has(kw))
        );
      });
      if (specialtyMatches.length > 0) {
        filteredProviders = specialtyMatches;
      }
    }

    setProviders(filteredProviders);
    setLoading(false);
  };

  const loadSchedule = async () => {
    const providerId = selectedProvider?.id || selectedProvider?.provider_id;
    if (!providerId) return;

    setLoading(true);
    const booked = await AppointmentAPI.getProviderSchedule(providerId, selectedDate);
    setBookedSlots(booked);
    setLoading(false);
  };

  const isTimeSlotAvailable = (timeStr) => {
    if (!selectedDate) return false;

    try {
      let [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);

      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;

      // Check if the time is in the past for today
      const now = new Date();
      const [y, m, d] = selectedDate.split('-').map(Number);
      const slotDate = new Date(y, m - 1, d, hours, minutes);
      if (slotDate <= now) return false;

      return !bookedSlots.some(bookedIso => {
        const bookedDate = new Date(bookedIso);
        return bookedDate.getHours() === hours && bookedDate.getMinutes() === minutes;
      });
    } catch (e) {
      return true;
    }
  };

  const handleSelectService = (serviceName) => {
    setSelectedService(serviceName);
    setSelectedServiceName(serviceName);
    setStep("provider");
  };

  const handleSelectFacility = (facility) => {
    setActiveFacilityId(facility.id);
    setFacilityName(facility.name);
    if (initialService) {
      setSelectedService(initialService);
      setSelectedServiceName(initialService);
      setStep("provider");
    } else {
      setStep("service");
    }
  };

  const handleSelectProvider = (provider) => {
    setSelectedProvider(provider);
    setStep("calendar");
  };

  const handleSelectDate = (dateStr) => {
    setSelectedDate(dateStr);
    setSelectedTime(null);
    setStep("time");
  };

  const handleSelectTime = (time) => {
    setSelectedTime(time);
    setStep("confirm");
  };

  const handleConfirmBooking = async () => {
    const providerId = selectedProvider?.id || selectedProvider?.provider_id;

    if (!selectedTime || !providerId || !facilityId) return;

    setLoading(true);
    const result = await AppointmentAPI.createAppointment({
      facilityId,
      providerId,
      date: selectedDate,
      time: selectedTime,
      serviceName: selectedServiceName,
      notes: "Booked via GabayMed App"
    });
    setLoading(false);

    if (result.success) {
      setBookingResult(result);
      setStep("success");
      if (onBooked) {
        try { onBooked(result.data); } catch {}
      }
    } else if (result.error === 'SLOT_TAKEN') {
      Alert.alert(
        "Slot Unavailable",
        result.message,
        [{ text: "Choose Another Time", onPress: () => {
          setSelectedTime(null);
          setStep("time");
          loadSchedule(); // Refresh slots
        }}]
      );
    } else {
      Alert.alert("Error", result.error || "Failed to book appointment. Please try again.");
    }
  };

  const handleBack = () => {
    if (step === "confirm") setStep("time");
    else if (step === "service") {
      if (needsFacilityPick) setStep("facility");
    }
    else if (step === "provider") setStep("service");
    else if (step === "calendar") setStep("provider");
    else if (step === "time") { setStep("calendar"); setSelectedTime(null); }
  };

  const handleDone = () => {
    setBookingResult(null);
    onClose();
  };

  const goToPrevMonth = () => {
    setCalendarMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const goToNextMonth = () => {
    setCalendarMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // Step indicator
  const steps = needsFacilityPick
    ? ['facility', 'service', 'provider', 'calendar', 'time', 'confirm']
    : ['service', 'provider', 'calendar', 'time', 'confirm'];
  const currentStepIndex = steps.indexOf(step);

  const getStepTitle = () => {
    switch (step) {
      case 'facility': return 'Select Facility';
      case 'service': return 'Select Service';
      case 'provider': return 'Select Provider';
      case 'calendar': return 'Select Date';
      case 'time': return 'Select Time';
      case 'confirm': return 'Review & Confirm';
      case 'success': return 'Booking Confirmed';
      default: return 'Schedule Appointment';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {step !== "success" && step !== steps[0] && (
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                  <ChevronLeft size={20} color="#1f2937" />
                </TouchableOpacity>
              )}
              <Text style={styles.headerTitle}>{getStepTitle()}</Text>
            </View>
            <TouchableOpacity onPress={step === 'success' ? handleDone : onClose} style={styles.closeButton}>
              <X size={20} color="#1f2937" />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          {step !== 'success' && (
            <View style={styles.progressContainer}>
              {steps.map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    i <= currentStepIndex && styles.progressDotActive,
                    i < currentStepIndex && styles.progressDotDone,
                  ]}
                />
              ))}
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {loading && step !== 'time' && step !== 'confirm' && step !== 'success' && (
              <ActivityIndicator size="large" color="#0ea5e9" style={{ marginVertical: 20 }} />
            )}

            {/* ───────── Step 0: Select Facility (when no facilityId prop) ───────── */}
            {step === "facility" && !loading && (
              <View>
                <Text style={styles.stepDescription}>
                  {initialService
                    ? `Choose a Gabay clinic offering ${initialService}`
                    : 'Choose a healthcare facility to book your appointment'}
                </Text>
                {availableFacilities.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {initialService
                      ? `No Gabay clinics currently offer ${initialService}.`
                      : 'No partner facilities found.'}
                  </Text>
                ) : (
                  <View style={styles.optionsList}>
                    {availableFacilities.map((facility, index) => (
                      <TouchableOpacity
                        key={facility.key || `facility-${facility.id}-${index}`}
                        onPress={() => handleSelectFacility(facility)}
                        style={styles.providerCard}
                      >
                        <View style={[styles.providerAvatar, { backgroundColor: '#eff6ff' }]}>
                          <Hospital size={20} color="#0ea5e9" />
                        </View>
                        <View style={styles.providerInfo}>
                          <Text style={styles.providerName}>{facility.name}</Text>
                          <Text style={styles.providerSpecialty}>
                            {facility.address || 'Medical Center'}
                          </Text>
                          {facility.distance ? (
                            <Text style={[styles.providerSpecialty, { fontSize: 11, color: '#9ca3af' }]}>
                              {facility.distance}
                            </Text>
                          ) : null}
                        </View>
                        <ChevronRight size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ───────── Step 1: Select Service ───────── */}
            {step === "service" && !loading && (
              <View>
                <Text style={styles.stepDescription}>Which service do you need?</Text>
                <View style={styles.optionsList}>
                  {facilityServices.map((serviceName, index) => {
                    const ui = getServiceUI(serviceName);
                    const IconComponent = ui.icon;
                    return (
                      <TouchableOpacity
                        key={`service-${serviceName}-${index}`}
                        onPress={() => handleSelectService(serviceName)}
                        style={styles.optionCard}
                      >
                        <LinearGradient colors={ui.colors} style={styles.optionIcon}>
                          <IconComponent size={24} color="#fff" strokeWidth={2} />
                        </LinearGradient>
                        <Text style={styles.optionText}>{serviceName}</Text>
                        <ChevronRight size={18} color="#9ca3af" style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ───────── Step 2: Select Provider ───────── */}
            {step === "provider" && !loading && (
              <View>
                <Text style={styles.stepDescription}>Choose your healthcare provider</Text>
                {providers.length === 0 ? (
                  <Text style={styles.emptyText}>No providers available for this facility.</Text>
                ) : (
                  <View style={styles.optionsList}>
                    {providers.map((provider, index) => (
                      <TouchableOpacity
                        key={`provider-${provider.id || provider.provider_id || index}-${index}`}
                        onPress={() => handleSelectProvider(provider)}
                        style={styles.providerCard}
                      >
                        <View style={styles.providerAvatar}>
                          <Text style={{ fontSize: 18 }}>👨‍⚕️</Text>
                        </View>
                        <View style={styles.providerInfo}>
                          <Text style={styles.providerName}>{provider.name}</Text>
                          <Text style={styles.providerSpecialty}>
                            {provider.specialization || provider.specialty || 'General Physician'}
                          </Text>
                        </View>
                        <ChevronRight size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ───────── Step 3: Calendar Picker ───────── */}
            {step === "calendar" && selectedProvider && (
              <View>
                <Text style={styles.stepDescription}>
                  Pick an available date for your appointment
                </Text>

                {/* Month/Year Header with Navigation */}
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    onPress={goToPrevMonth}
                    disabled={!canGoPrevMonth}
                    style={[styles.calendarNavBtn, !canGoPrevMonth && { opacity: 0.3 }]}
                  >
                    <ChevronLeft size={20} color="#1f2937" />
                  </TouchableOpacity>

                  <Text style={styles.calendarMonthLabel}>
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </Text>

                  <TouchableOpacity
                    onPress={goToNextMonth}
                    disabled={!canGoNextMonth}
                    style={[styles.calendarNavBtn, !canGoNextMonth && { opacity: 0.3 }]}
                  >
                    <ChevronRight size={20} color="#1f2937" />
                  </TouchableOpacity>
                </View>

                {/* Day-of-week headers */}
                <View style={styles.calendarRow}>
                  {DAY_NAMES.map(dn => (
                    <View key={dn} style={styles.calendarCell}>
                      <Text style={styles.dayNameText}>{dn}</Text>
                    </View>
                  ))}
                </View>

                {/* Day grid */}
                <View style={styles.calendarGrid}>
                  {calendarDays.map(cell => (
                    <View key={cell.key} style={styles.calendarCell}>
                      {cell.day !== null ? (
                        <TouchableOpacity
                          onPress={() => !cell.disabled && handleSelectDate(cell.dateStr)}
                          disabled={cell.disabled}
                          style={[
                            styles.calendarDayBtn,
                            cell.isToday && styles.calendarDayToday,
                            cell.isSelected && styles.calendarDaySelected,
                            cell.disabled && styles.calendarDayDisabled,
                          ]}
                        >
                          <Text style={[
                            styles.calendarDayText,
                            cell.isToday && styles.calendarDayTodayText,
                            cell.isSelected && styles.calendarDaySelectedText,
                            cell.disabled && styles.calendarDayDisabledText,
                          ]}>
                            {cell.day}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.calendarDayBtn} />
                      )}
                    </View>
                  ))}
                </View>

                {/* Legend */}
                <View style={styles.calendarLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#0ea5e9' }]} />
                    <Text style={styles.legendText}>Selected</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { borderWidth: 1.5, borderColor: '#0ea5e9', backgroundColor: '#fff' }]} />
                    <Text style={styles.legendText}>Today</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#e5e7eb' }]} />
                    <Text style={styles.legendText}>Unavailable</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ───────── Step 4: Select Time Slot ───────── */}
            {step === "time" && (
              <View>
                <Text style={styles.stepDescription}>
                  {selectedDate
                    ? `Available slots for ${formatDateFriendly(selectedDate)}`
                    : "Select your preferred time"}
                </Text>

                {loading ? (
                  <ActivityIndicator size="small" color="#0ea5e9" />
                ) : (
                  <View style={styles.timeGrid}>
                    {baseTimeSlots.map((time, index) => {
                      const available = isTimeSlotAvailable(time);
                      const isSelected = selectedTime === time;
                      return (
                        <TouchableOpacity
                          key={index}
                          onPress={() => available && handleSelectTime(time)}
                          disabled={!available}
                          style={[
                            styles.timeSlot,
                            !available && styles.timeSlotDisabled,
                            isSelected && styles.timeSlotSelected
                          ]}
                        >
                          <Clock
                            size={16}
                            color={isSelected ? '#fff' : (available ? '#0ea5e9' : '#d1d5db')}
                            style={styles.timeIcon}
                          />
                          <Text style={[
                            styles.timeText,
                            !available && styles.timeTextDisabled,
                            isSelected && styles.timeTextSelected,
                          ]}>
                            {time}
                          </Text>
                          {!available && <Text style={styles.bookedText}>Booked</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ───────── Step 5: Review & Confirm ───────── */}
            {step === "confirm" && (
              <View>
                <Text style={styles.stepDescription}>
                  Please review your appointment details
                </Text>

                <View style={styles.confirmCard}>
                  {/* Service */}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmIconBox}>
                      <Stethoscope size={18} color="#0ea5e9" />
                    </View>
                    <View style={styles.confirmDetail}>
                      <Text style={styles.confirmLabel}>Service</Text>
                      <Text style={styles.confirmValue}>{selectedServiceName}</Text>
                    </View>
                  </View>

                  <View style={styles.confirmDivider} />

                  {/* Provider */}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmIconBox}>
                      <User size={18} color="#0ea5e9" />
                    </View>
                    <View style={styles.confirmDetail}>
                      <Text style={styles.confirmLabel}>Provider</Text>
                      <Text style={styles.confirmValue}>{selectedProvider?.name}</Text>
                      <Text style={styles.confirmSubvalue}>
                        {selectedProvider?.specialization || selectedProvider?.specialty || 'General Physician'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.confirmDivider} />

                  {/* Facility */}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmIconBox}>
                      <MapPin size={18} color="#0ea5e9" />
                    </View>
                    <View style={styles.confirmDetail}>
                      <Text style={styles.confirmLabel}>Facility</Text>
                      <Text style={styles.confirmValue}>{facilityName || 'Medical Facility'}</Text>
                    </View>
                  </View>

                  <View style={styles.confirmDivider} />

                  {/* Date */}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmIconBox}>
                      <Calendar size={18} color="#0ea5e9" />
                    </View>
                    <View style={styles.confirmDetail}>
                      <Text style={styles.confirmLabel}>Date</Text>
                      <Text style={styles.confirmValue}>
                        {selectedDate ? formatDateFriendly(selectedDate) : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.confirmDivider} />

                  {/* Time */}
                  <View style={styles.confirmRow}>
                    <View style={styles.confirmIconBox}>
                      <Clock size={18} color="#0ea5e9" />
                    </View>
                    <View style={styles.confirmDetail}>
                      <Text style={styles.confirmLabel}>Time</Text>
                      <Text style={styles.confirmValue}>{selectedTime}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleConfirmBooking}
                  style={styles.confirmButton}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Confirm Appointment</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.confirmDisclaimer}>
                  By confirming, you agree to the facility's scheduling policies. 
                  You will receive a notification once the provider confirms your appointment.
                </Text>
              </View>
            )}

            {/* ───────── Step 6: Success / Confirmation Screen ───────── */}
            {step === "success" && bookingResult && (
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <CheckCircle size={48} color="#10b981" />
                </View>

                <Text style={styles.successTitle}>Appointment Booked!</Text>
                <Text style={styles.successSubtitle}>
                  Your appointment has been successfully scheduled. The clinic will confirm shortly.
                </Text>

                <View style={styles.successCard}>
                  <View style={styles.successRow}>
                    <CalendarCheck size={16} color="#6b7280" />
                    <Text style={styles.successLabel}>Reference ID</Text>
                  </View>
                  <Text style={styles.successRefId}>
                    {(bookingResult.data?.appointment_id || bookingResult.data?.id)
                      ? `#${String(bookingResult.data.appointment_id || bookingResult.data.id).slice(0, 8).toUpperCase()}`
                      : '#PENDING'}
                  </Text>

                  <View style={styles.confirmDivider} />

                  <View style={styles.successDetailRow}>
                    <Stethoscope size={14} color="#6b7280" />
                    <Text style={styles.successDetailText}>{selectedServiceName}</Text>
                  </View>
                  <View style={styles.successDetailRow}>
                    <User size={14} color="#6b7280" />
                    <Text style={styles.successDetailText}>{selectedProvider?.name}</Text>
                  </View>
                  <View style={styles.successDetailRow}>
                    <MapPin size={14} color="#6b7280" />
                    <Text style={styles.successDetailText}>{facilityName || 'Medical Facility'}</Text>
                  </View>
                  <View style={styles.successDetailRow}>
                    <Calendar size={14} color="#6b7280" />
                    <Text style={styles.successDetailText}>
                      {selectedDate ? formatDateFriendly(selectedDate) : ''}
                    </Text>
                  </View>
                  <View style={styles.successDetailRow}>
                    <Clock size={14} color="#6b7280" />
                    <Text style={styles.successDetailText}>{selectedTime}</Text>
                  </View>

                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>PENDING CONFIRMATION</Text>
                  </View>
                </View>

                <TouchableOpacity onPress={handleDone} style={styles.doneButton}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },

  // ── Progress Dots ──
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
  },
  progressDotActive: {
    backgroundColor: '#93c5fd',
  },
  progressDotDone: {
    backgroundColor: '#0ea5e9',
  },

  content: {
    padding: 16,
  },
  stepDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 16,
    lineHeight: 20,
  },

  // ── Service List ──
  optionsList: {
    gap: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
    flex: 1,
  },

  // ── Provider List ──
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 8,
  },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
  },
  providerSpecialty: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 20,
    fontStyle: 'italic',
  },

  // ── Calendar ──
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  calendarNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  calendarDayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: '#0ea5e9',
  },
  calendarDaySelected: {
    backgroundColor: '#0ea5e9',
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  calendarDayTodayText: {
    color: '#0ea5e9',
    fontWeight: '700',
  },
  calendarDaySelectedText: {
    color: '#fff',
    fontWeight: '700',
  },
  calendarDayDisabledText: {
    color: '#9ca3af',
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#6b7280',
  },

  // ── Time Grid ──
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeSlot: {
    width: '48%',
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  timeSlotDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#f3f4f6',
  },
  timeSlotSelected: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
  },
  timeIcon: {
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  timeTextDisabled: {
    color: '#d1d5db',
  },
  timeTextSelected: {
    color: '#fff',
  },
  bookedText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },

  // ── Confirmation Review ──
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  confirmIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDetail: {
    flex: 1,
  },
  confirmLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  confirmSubvalue: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 4,
  },
  confirmButton: {
    backgroundColor: '#0ea5e9',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmDisclaimer: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // ── Success Screen ──
  successContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  successCard: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    marginBottom: 24,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  successLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  successRefId: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  successDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  successDetailText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  statusBadge: {
    marginTop: 16,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    letterSpacing: 0.5,
  },
  doneButton: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
