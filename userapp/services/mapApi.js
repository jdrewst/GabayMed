import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import ProfileAPI from './profileApi';
import {
  inferPublicHospitalServices,
  normalizeSearchText,
  expandServiceKeywords,
} from '../lib/medical-services';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location?.origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)
  ) {
    return window.location.origin;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

// Fallback landmark lookup if DB lacks lat/long
const LOCAL_LANDMARKS = [
  { match: /pgh|philippine general hospital|taft|ermita/i, lat: 14.5784, lng: 120.9856 },
  { match: /uerm|aurora blvd|sta\.?\s*mesa|santa mesa|pup/i, lat: 14.6042, lng: 121.0204 },
  { match: /st\.?\s*luke.*bgc|taguig|bonifacio global/i, lat: 14.5549, lng: 121.0482 },
  { match: /st\.?\s*luke.*quezon|cathedral heights|e\.?\s*rodriguez/i, lat: 14.6227, lng: 121.0234 },
  { match: /makati med|makati/i, lat: 14.5591, lng: 121.0145 },
  { match: /medical city|ortigas|pasig/i, lat: 14.5896, lng: 121.0692 },
  { match: /asian hospital|alabang|muntinlupa/i, lat: 14.4139, lng: 121.0439 },
  { match: /chinese general|blumentritt|santa cruz/i, lat: 14.6219, lng: 120.9885 },
  { match: /ust|espana|españa|sampaloc/i, lat: 14.6105, lng: 120.9894 },
  { match: /manila doctors|united nations|un ave/i, lat: 14.5818, lng: 120.9830 },
  { match: /veterans|north ave|diliman|quezon city|\bqc\b/i, lat: 14.6488, lng: 121.0437 },
  { match: /cardinal santos|greenhills|san juan/i, lat: 14.6022, lng: 121.0442 },
  { match: /mandaluyong/i, lat: 14.5794, lng: 121.0359 },
  { match: /pasay/i, lat: 14.5378, lng: 121.0014 },
  { match: /paranaque|parañaque/i, lat: 14.4793, lng: 121.0198 },
  { match: /marikina/i, lat: 14.6507, lng: 121.1029 },
  { match: /caloocan/i, lat: 14.6571, lng: 120.9841 },
  { match: /cebu/i, lat: 10.3157, lng: 123.8854 },
  { match: /davao/i, lat: 7.1907, lng: 125.4553 },
];

// Curated Philippine public & specialty hospitals so public hospitals & specialty searches
// (cardiothoracic, OB-GYN, baby/pediatrics, blood bank, lung, kidney, ortho, mental health)
// work instantly even if OpenStreetMap Overpass is rate-limited.
const PH_PUBLIC_HOSPITALS = [
  {
    id: 'pub-phc',
    name: 'Philippine Heart Center',
    address: 'East Avenue, Diliman, Quezon City, Metro Manila',
    phone: '(02) 8925-2401',
    latitude: 14.6435,
    longitude: 121.0484,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'Vascular Surgery', 'ECG & Heart Diagnostics', 'Emergency & Trauma Care', 'Intensive Care Unit (ICU)', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Radiology & Imaging (X-Ray / CT / MRI)'],
  },
  {
    id: 'pub-lcp',
    name: 'Lung Center of the Philippines',
    address: 'Quezon Avenue, Diliman, Quezon City, Metro Manila',
    phone: '(02) 8924-6101',
    latitude: 14.6476,
    longitude: 121.0445,
    services: ['Pulmonology', 'Cardiothoracic Surgery', 'Sleep Medicine', 'Emergency & Trauma Care', 'Radiology & Imaging (X-Ray / CT / MRI)', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)'],
  },
  {
    id: 'pub-nkti',
    name: 'National Kidney and Transplant Institute (NKTI)',
    address: 'East Avenue, Diliman, Quezon City, Metro Manila',
    phone: '(02) 8981-0300',
    latitude: 14.6462,
    longitude: 121.0478,
    services: ['Nephrology & Dialysis', 'Urology', 'Blood Bank & Transfusion', 'Hematology', 'Laboratory & Blood Tests', 'General Surgery', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-pcmc',
    name: "Philippine Children's Medical Center (PCMC)",
    address: 'Quezon Avenue cor. Agham Road, Diliman, Quezon City',
    phone: '(02) 8588-9900',
    latitude: 14.6502,
    longitude: 121.0420,
    services: ['Pediatrics', 'Neonatology (NICU)', 'Vaccination & Immunization', 'OB-GYN (Obstetrics & Gynecology)', 'Emergency & Trauma Care', 'Cardiology', 'Neurology', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-fabella',
    name: 'Dr. Jose Fabella Memorial Hospital',
    address: 'Lope de Vega Street, Santa Cruz, Manila',
    phone: '(02) 8734-5561',
    latitude: 14.6078,
    longitude: 120.9822,
    services: ['OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Neonatology (NICU)', 'Fertility & Reproductive Health', 'Ultrasound & Sonography', 'Blood Bank & Transfusion', 'Vaccination & Immunization'],
  },
  {
    id: 'pub-pgh',
    name: 'Philippine General Hospital (UP-PGH)',
    address: 'Taft Avenue, Ermita, Manila, Metro Manila',
    phone: '(02) 8554-8400',
    latitude: 14.5784,
    longitude: 120.9856,
    services: ['General Check-up', 'Emergency & Trauma Care', 'Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)', 'Neurology', 'Orthopedics', 'Ophthalmology (Eye Care)', 'ENT (Ear, Nose & Throat)', 'General Surgery'],
  },
  {
    id: 'pub-prc-blood',
    name: 'Philippine Red Cross – National Blood Center',
    address: '37 EDSA cor. Boni Avenue, Mandaluyong City',
    phone: '(02) 8790-2300',
    latitude: 14.5746,
    longitude: 121.0481,
    services: ['Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Hematology', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-poc',
    name: 'Philippine Orthopedic Center',
    address: 'Maria Clara cor. Banawe Street, Quezon City',
    phone: '(02) 8711-4276',
    latitude: 14.6258,
    longitude: 121.0033,
    services: ['Orthopedics', 'Physical Therapy & Rehabilitation', 'Emergency & Trauma Care', 'Radiology & Imaging (X-Ray / CT / MRI)', 'General Surgery'],
  },
  {
    id: 'pub-ncmh',
    name: 'National Center for Mental Health',
    address: 'Nueve de Pebrero Street, Mandaluyong City',
    phone: '(02) 8531-9001',
    latitude: 14.5819,
    longitude: 121.0398,
    services: ['Psychiatry & Mental Health', 'Neurology', 'General Check-up', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-eamc',
    name: 'East Avenue Medical Center',
    address: 'East Avenue, Diliman, Quezon City, Metro Manila',
    phone: '(02) 8928-0611',
    latitude: 14.6421,
    longitude: 121.0493,
    services: ['Emergency & Trauma Care', 'General Check-up', 'Internal Medicine', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Ophthalmology (Eye Care)', 'Dermatology', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'General Surgery'],
  },
  {
    id: 'pub-slmc-qc',
    name: "St. Luke's Medical Center – Quezon City",
    address: '279 E. Rodriguez Sr. Avenue, Quezon City',
    phone: '(02) 8723-0101',
    latitude: 14.6227,
    longitude: 121.0234,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Neonatology (NICU)', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)', 'Neurology', 'Orthopedics', 'Ophthalmology (Eye Care)', 'Emergency & Trauma Care', 'Radiology & Imaging (X-Ray / CT / MRI)'],
  },
  {
    id: 'pub-slmc-bgc',
    name: "St. Luke's Medical Center – Global City (BGC)",
    address: 'Rizal Drive cor. 32nd Street, BGC, Taguig City',
    phone: '(02) 8789-7700',
    latitude: 14.5549,
    longitude: 121.0482,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Neonatology (NICU)', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)', 'Dermatology', 'Ophthalmology (Eye Care)', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-mmc',
    name: 'Makati Medical Center',
    address: '2 Amorsolo Street, Legazpi Village, Makati City',
    phone: '(02) 8888-8999',
    latitude: 14.5591,
    longitude: 121.0145,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Neurology', 'Orthopedics', 'Dermatology', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-tmc',
    name: 'The Medical City – Ortigas',
    address: 'Ortigas Avenue, Pasig City, Metro Manila',
    phone: '(02) 8988-1000',
    latitude: 14.5896,
    longitude: 121.0692,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)', 'Pulmonology', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-manila-doc',
    name: 'Manila Doctors Hospital',
    address: '667 United Nations Avenue, Ermita, Manila',
    phone: '(02) 8558-0888',
    latitude: 14.5818,
    longitude: 120.9830,
    services: ['General Check-up', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Ophthalmology (Eye Care)', 'Dentistry & Oral Surgery', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-ust',
    name: 'University of Santo Tomas Hospital',
    address: 'España Boulevard, Sampaloc, Manila',
    phone: '(02) 8731-3001',
    latitude: 14.6105,
    longitude: 120.9894,
    services: ['General Check-up', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'ENT (Ear, Nose & Throat)', 'Ophthalmology (Eye Care)', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-csmc',
    name: 'Cardinal Santos Medical Center',
    address: '10 Wilson Street, Greenhills West, San Juan City',
    phone: '(02) 8727-0001',
    latitude: 14.6022,
    longitude: 121.0442,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Neurology', 'Neurosurgery', 'Oncology (Cancer Care)', 'Blood Bank & Transfusion', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-qmmc',
    name: 'Quirino Memorial Medical Center',
    address: 'J.P. Rizal Street, Project 4, Quezon City',
    phone: '(02) 8421-2250',
    latitude: 14.6202,
    longitude: 121.0706,
    services: ['General Check-up', 'Emergency & Trauma Care', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'General Surgery'],
  },
  // Additional NCR Public Hospitals
  {
    id: 'pub-rmc',
    name: 'Rizal Medical Center',
    address: 'Pasig Boulevard, Bagong Ilog, Pasig City, Metro Manila',
    phone: '(02) 8865-8400',
    latitude: 14.5651,
    longitude: 121.0663,
    services: ['Emergency & Trauma Care', 'General Check-up', 'Internal Medicine', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'General Surgery', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-jrr',
    name: 'Jose R. Reyes Memorial Medical Center',
    address: 'Rizal Avenue, Santa Cruz, Manila',
    phone: '(02) 8711-9491',
    latitude: 14.6143,
    longitude: 120.9827,
    services: ['Emergency & Trauma Care', 'Dermatology', 'Ophthalmology (Eye Care)', 'General Surgery', 'Orthopedics', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-slh',
    name: 'San Lazaro Hospital',
    address: 'Quiricada Street, Santa Cruz, Manila',
    phone: '(02) 8309-9543',
    latitude: 14.6137,
    longitude: 120.9806,
    services: ['Infectious Disease', 'Emergency & Trauma Care', 'Vaccination & Immunization', 'Internal Medicine', 'Laboratory & Blood Tests', 'Pediatrics'],
  },
  {
    id: 'pub-armmc',
    name: 'Amang Rodriguez Memorial Medical Center',
    address: 'Sumulong Highway, Sto. Niño, Marikina City',
    phone: '(02) 8941-5854',
    latitude: 14.6363,
    longitude: 121.0978,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'General Surgery', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-vmc',
    name: 'Valenzuela Medical Center',
    address: 'Padrigal Street, Karuhatan, Valenzuela City',
    phone: '(02) 8294-6711',
    latitude: 14.6879,
    longitude: 120.9781,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Internal Medicine', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-lpgh',
    name: 'Las Piñas General Hospital and Satellite Trauma Center',
    address: 'Diego Cera Avenue, Pulang Lupa I, Las Piñas City',
    phone: '(02) 8873-0557',
    latitude: 14.4776,
    longitude: 120.9794,
    services: ['Emergency & Trauma Care', 'General Surgery', 'Orthopedics', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-asian',
    name: 'Asian Hospital and Medical Center',
    address: '2205 Civic Drive, Filinvest City, Alabang, Muntinlupa',
    phone: '(02) 8771-9000',
    latitude: 14.4139,
    longitude: 121.0439,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Oncology (Cancer Care)', 'Neurology', 'Blood Bank & Transfusion', 'Emergency & Trauma Care'],
  },
  // Cordillera Administrative Region (CAR)
  {
    id: 'pub-bghmc',
    name: 'Baguio General Hospital and Medical Center (BGHMC)',
    address: 'Governor Pack Road, Baguio City, Benguet',
    phone: '(074) 442-4216',
    latitude: 16.4017,
    longitude: 120.5957,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Neonatology (NICU)', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)', 'Orthopedics', 'General Surgery'],
  },
  {
    id: 'pub-ndch',
    name: 'Notre Dame de Chartres Hospital',
    address: '25 General Luna Road, Baguio City, Benguet',
    phone: '(074) 619-8530',
    latitude: 16.4143,
    longitude: 120.5993,
    services: ['General Check-up', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Emergency & Trauma Care', 'Laboratory & Blood Tests', 'Radiology & Imaging (X-Ray / CT / MRI)'],
  },
  {
    id: 'pub-slushmc',
    name: 'SLU Sacred Heart Medical Center',
    address: 'Assumption Road, Baguio City, Benguet',
    phone: '(074) 442-5701',
    latitude: 16.4168,
    longitude: 120.5982,
    services: ['General Check-up', 'Cardiology', 'Internal Medicine', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Nephrology & Dialysis', 'Emergency & Trauma Care'],
  },
  // Region I (Ilocos Region)
  {
    id: 'pub-itrmc',
    name: 'Ilocos Training and Regional Medical Center (ITRMC)',
    address: 'Parian, San Fernando City, La Union',
    phone: '(072) 607-6418',
    latitude: 16.5974,
    longitude: 120.3186,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery', 'Orthopedics', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-mmmhmc',
    name: 'Mariano Marcos Memorial Hospital and Medical Center',
    address: 'Brgy. 6 San Julian, Batac City, Ilocos Norte',
    phone: '(077) 600-8000',
    latitude: 18.0574,
    longitude: 120.5453,
    services: ['Emergency & Trauma Care', 'Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'Oncology (Cancer Care)', 'General Surgery'],
  },
  {
    id: 'pub-r1mc',
    name: 'Region 1 Medical Center',
    address: 'Arellano Street, Dagupan City, Pangasinan',
    phone: '(075) 515-8916',
    latitude: 16.0482,
    longitude: 120.3408,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Laboratory & Blood Tests', 'Nephrology & Dialysis'],
  },
  // Region II (Cagayan Valley)
  {
    id: 'pub-cvmc',
    name: 'Cagayan Valley Medical Center',
    address: 'Carig Sur, Tuguegarao City, Cagayan',
    phone: '(078) 304-1410',
    latitude: 17.6579,
    longitude: 121.7495,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery', 'Internal Medicine', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-r2tmc',
    name: 'Region II Trauma and Medical Center',
    address: 'Magsaysay, Bayombong, Nueva Vizcaya',
    phone: '(078) 805-3561',
    latitude: 16.4841,
    longitude: 121.1502,
    services: ['Emergency & Trauma Care', 'Orthopedics', 'General Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-simc',
    name: 'Southern Isabela Medical Center',
    address: 'Rosario, Santiago City, Isabela',
    phone: '(078) 305-2003',
    latitude: 16.6939,
    longitude: 121.5517,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Internal Medicine', 'Laboratory & Blood Tests', 'Blood Bank & Transfusion'],
  },
  // Region III (Central Luzon)
  {
    id: 'pub-jblmgh',
    name: 'Jose B. Lingad Memorial General Hospital',
    address: 'Dolores, City of San Fernando, Pampanga',
    phone: '(045) 961-3544',
    latitude: 15.0337,
    longitude: 120.6889,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Oncology (Cancer Care)', 'General Surgery', 'Nephrology & Dialysis'],
  },
  {
    id: 'pub-aufmc',
    name: 'Angeles University Foundation Medical Center',
    address: 'MacArthur Highway, Angeles City, Pampanga',
    phone: '(045) 625-2999',
    latitude: 15.1455,
    longitude: 120.5944,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Neurology', 'Orthopedics', 'Blood Bank & Transfusion', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-tmc-clark',
    name: 'The Medical City Clark',
    address: '100 Gatwick Gateway, Clark Global City, Pampanga',
    phone: '(045) 598-4000',
    latitude: 15.1823,
    longitude: 120.5316,
    services: ['Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Emergency & Trauma Care', 'Radiology & Imaging (X-Ray / CT / MRI)', 'Laboratory & Blood Tests', 'Oncology (Cancer Care)'],
  },
  {
    id: 'pub-bmc-bulacan',
    name: 'Bulacan Medical Center',
    address: 'Mojon, Malolos City, Bulacan',
    phone: '(044) 791-0630',
    latitude: 14.8559,
    longitude: 120.8184,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery'],
  },
  {
    id: 'pub-pjgmrmc',
    name: 'Dr. Paulino J. Garcia Memorial Research and Medical Center',
    address: 'Mabini Street, Cabanatuan City, Nueva Ecija',
    phone: '(044) 463-8888',
    latitude: 15.4898,
    longitude: 120.9678,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-bgh-bataan',
    name: 'Bataan General Hospital and Medical Center',
    address: 'Manahan Street, Tenejero, Balanga City, Bataan',
    phone: '(047) 237-9771',
    latitude: 14.6776,
    longitude: 120.5382,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Internal Medicine', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-tph',
    name: 'Tarlac Provincial Hospital',
    address: 'San Vicente, Tarlac City, Tarlac',
    phone: '(045) 982-1872',
    latitude: 15.4754,
    longitude: 120.5949,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'General Surgery', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-jlgmh',
    name: 'James L. Gordon Memorial Hospital',
    address: 'Rizal Avenue, New Asinan, Olongapo City, Zambales',
    phone: '(047) 222-4035',
    latitude: 14.8321,
    longitude: 120.2836,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'General Surgery', 'Blood Bank & Transfusion'],
  },
  // Region IV-A (CALABARZON)
  {
    id: 'pub-batmc',
    name: 'Batangas Medical Center (BatMC)',
    address: 'Kumintang Ibaba, Batangas City, Batangas',
    phone: '(043) 740-8303',
    latitude: 13.7707,
    longitude: 121.0642,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'Oncology (Cancer Care)', 'General Surgery'],
  },
  {
    id: 'pub-mmmc',
    name: 'Mary Mediatrix Medical Center',
    address: 'J.P. Laurel Highway, Lipa City, Batangas',
    phone: '(043) 773-6800',
    latitude: 13.9498,
    longitude: 121.1618,
    services: ['Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Neurology', 'Emergency & Trauma Care', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-dlsumc',
    name: 'De La Salle University Medical Center',
    address: 'Governor D. Mangubat Avenue, Dasmariñas City, Cavite',
    phone: '(046) 481-8000',
    latitude: 14.3279,
    longitude: 120.9450,
    services: ['Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Neonatology (NICU)', 'Oncology (Cancer Care)', 'Blood Bank & Transfusion', 'Emergency & Trauma Care'],
  },
  {
    id: 'pub-strh',
    name: 'Southern Tagalog Regional Hospital',
    address: 'Habay II, Bacoor City, Cavite',
    phone: '(046) 417-2520',
    latitude: 14.4472,
    longitude: 120.9502,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Internal Medicine', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-tmc-sl',
    name: 'The Medical City South Luzon',
    address: 'Greenfield City, Santa Rosa, Laguna',
    phone: '(049) 544-0120',
    latitude: 14.2462,
    longitude: 121.0598,
    services: ['Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Orthopedics', 'Emergency & Trauma Care', 'Radiology & Imaging (X-Ray / CT / MRI)', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-cmc-laguna',
    name: 'Calamba Medical Center',
    address: 'Crossing, Calamba City, Laguna',
    phone: '(049) 545-1740',
    latitude: 14.2059,
    longitude: 121.1563,
    services: ['General Check-up', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Nephrology & Dialysis', 'Emergency & Trauma Care', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-lmc',
    name: 'Laguna Medical Center',
    address: 'J. de Leon Street, Santa Cruz, Laguna',
    phone: '(049) 501-1895',
    latitude: 14.2775,
    longitude: 121.4153,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'General Surgery', 'Blood Bank & Transfusion'],
  },
  {
    id: 'pub-qmc-lucena',
    name: 'Quezon Medical Center',
    address: 'Quezon Avenue, Lucena City, Quezon',
    phone: '(042) 710-2413',
    latitude: 13.9372,
    longitude: 121.6174,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery'],
  },
  {
    id: 'pub-rph-antipolo',
    name: 'Rizal Provincial Hospital System – Antipolo Annex',
    address: 'C. Lawis Extension, San Isidro, Antipolo City, Rizal',
    phone: '(02) 8697-0286',
    latitude: 14.5876,
    longitude: 121.1764,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Laboratory & Blood Tests'],
  },
  // Region IV-B (MIMAROPA)
  {
    id: 'pub-omph',
    name: 'Oriental Mindoro Provincial Hospital',
    address: 'Ilaya, Calapan City, Oriental Mindoro',
    phone: '(043) 288-5241',
    latitude: 13.4126,
    longitude: 121.1795,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'General Surgery'],
  },
  {
    id: 'pub-onp',
    name: 'Ospital ng Palawan',
    address: '220 Malvar Street, Puerto Princesa City, Palawan',
    phone: '(048) 434-8339',
    latitude: 9.7407,
    longitude: 118.7354,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Internal Medicine', 'Blood Bank & Transfusion', 'General Surgery'],
  },
  // Region V (Bicol Region)
  {
    id: 'pub-bmc-naga',
    name: 'Bicol Medical Center',
    address: 'Concepcion Pequeña, Naga City, Camarines Sur',
    phone: '(054) 472-6125',
    latitude: 13.6218,
    longitude: 123.1948,
    services: ['Emergency & Trauma Care', 'Cardiology', 'Cardiothoracic Surgery', 'OB-GYN (Obstetrics & Gynecology)', 'Maternity & Birthing', 'Pediatrics', 'Oncology (Cancer Care)', 'Blood Bank & Transfusion', 'General Surgery'],
  },
  {
    id: 'pub-brhmc',
    name: 'Bicol Regional Hospital and Medical Center',
    address: 'Rizal Street, Daraga / Legazpi City, Albay',
    phone: '(052) 732-5555',
    latitude: 13.1494,
    longitude: 123.7156,
    services: ['Emergency & Trauma Care', 'Cardiology', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'Blood Bank & Transfusion', 'Nephrology & Dialysis', 'General Surgery', 'Laboratory & Blood Tests'],
  },
  {
    id: 'pub-sph',
    name: 'Sorsogon Provincial Hospital',
    address: 'Macabog, Sorsogon City, Sorsogon',
    phone: '(056) 211-1255',
    latitude: 12.9742,
    longitude: 124.0058,
    services: ['Emergency & Trauma Care', 'General Check-up', 'OB-GYN (Obstetrics & Gynecology)', 'Pediatrics', 'General Surgery', 'Laboratory & Blood Tests'],
  },
];

function parseServicesOffered(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s || '').trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(s => String(s || '').trim()).filter(Boolean);
    } catch {}
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function inferCoords(facility, index = 0) {
  const numLat = parseFloat(facility.lat ?? facility.latitude);
  const numLng = parseFloat(facility.long ?? facility.lng ?? facility.longitude);
  if (Number.isFinite(numLat) && Number.isFinite(numLng) && numLat !== 0 && numLng !== 0) {
    return { latitude: numLat, longitude: numLng };
  }
  const text = `${facility.address || facility.location || ''} ${facility.name || ''}`;
  const coordMatch = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/.exec(text);
  if (coordMatch) {
    return { latitude: parseFloat(coordMatch[1]), longitude: parseFloat(coordMatch[2]) };
  }
  for (const lm of LOCAL_LANDMARKS) {
    if (lm.match.test(text)) {
      return { latitude: lm.lat, longitude: lm.lng };
    }
  }
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 0.008 * ((index % 5) + 1);
  return {
    latitude: 14.5995 + Math.cos(angle) * radius,
    longitude: 120.9842 + Math.sin(angle) * radius,
  };
}

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

function isDuplicateOfExisting(candidate, existingList) {
  const candName = normalizeSearchText(candidate.name);
  return existingList.some(item => {
    const itemName = normalizeSearchText(item.name);
    if (candName && itemName && (candName === itemName || candName.includes(itemName) || itemName.includes(candName))) {
      return true;
    }
    if (
      Number.isFinite(candidate.latitude) &&
      Number.isFinite(candidate.longitude) &&
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
    ) {
      return getDistanceKm(candidate.latitude, candidate.longitude, item.latitude, item.longitude) < 0.22;
    }
    return false;
  });
}

let cachedFacilitiesResult = null;
let cachedOverpassPublic = null;

const DEFAULT_PH_USER_COORDS = {
  latitude: 14.5995,
  longitude: 120.9842,
};

function getWebBrowserPosition(timeoutMs = 7000) {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = val => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(timer);
          if (pos?.coords && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
            done({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          } else {
            done(null);
          }
        },
        () => {
          clearTimeout(timer);
          done(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs - 500, maximumAge: 60000 }
      );
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

const MapAPI = {
  clearFacilitiesCache() {
    cachedFacilitiesResult = null;
  },

  async requestUserLocation({ forceEnable = false } = {}) {
    try {
      const perms = await ProfileAPI.getPermissions();
      if (!forceEnable && perms.locationAllowed === false) {
        return { granted: false, disabledInApp: true, coords: null };
      }

      // On Web (e.g. Expo Web / mobile browser), use navigator.geolocation directly first
      if (Platform.OS === 'web') {
        const webCoords = await getWebBrowserPosition(7000);
        if (webCoords) {
          if (forceEnable) {
            await ProfileAPI.setPermissions({ locationAllowed: true });
          }
          return { granted: true, coords: webCoords };
        }
      }

      let perm = { status: 'undetermined', canAskAgain: true };
      try {
        perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' && (perm.canAskAgain !== false || forceEnable)) {
          perm = await Location.requestForegroundPermissionsAsync();
        }
      } catch {
        perm = { status: forceEnable ? 'granted' : 'denied' };
      }

      if (perm.status !== 'granted') {
        // When the user explicitly clicked "Allow" on the in-app Location popup (forceEnable = true)
        // on a desktop/web browser or emulator without GPS permission, provide a Metro Manila fallback
        // coordinate so "Directions from My Location" still draws and calculates the route reliably.
        if (forceEnable) {
          await ProfileAPI.setPermissions({ locationAllowed: true });
          return { granted: true, coords: { ...DEFAULT_PH_USER_COORDS }, isFallback: true };
        }
        return { granted: false, coords: null };
      }

      if (forceEnable) {
        await ProfileAPI.setPermissions({ locationAllowed: true });
      }

      let pos = null;
      try {
        pos = await Location.getLastKnownPositionAsync({});
      } catch {}

      if (!pos?.coords) {
        try {
          pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 6500)),
          ]);
        } catch {}
      }

      if (!pos?.coords && Platform.OS === 'web') {
        const webFallback = await getWebBrowserPosition(5000);
        if (webFallback) {
          return { granted: true, coords: webFallback };
        }
      }

      if (!pos?.coords) {
        if (forceEnable) {
          return { granted: true, coords: { ...DEFAULT_PH_USER_COORDS }, isFallback: true };
        }
        return { granted: true, coords: null };
      }

      return {
        granted: true,
        coords: {
          latitude: Number(pos.coords.latitude),
          longitude: Number(pos.coords.longitude),
        },
      };
    } catch (error) {
      console.warn('Location permission/fetch error:', error.message);
      if (forceEnable) {
        try { await ProfileAPI.setPermissions({ locationAllowed: true }); } catch {}
        return { granted: true, coords: { ...DEFAULT_PH_USER_COORDS }, isFallback: true };
      }
      return { granted: false, coords: null };
    }
  },

  /**
   * Fetches nearby public hospitals & clinics via OpenStreetMap Overpass API
   * and merges with our curated Philippine specialty hospitals directory.
   */
  async fetchPublicHospitals(centerCoords = null, radiusMeters = 7500) {
    const center =
      centerCoords &&
      centerCoords.latitude >= 4.5 &&
      centerCoords.latitude <= 21.5 &&
      centerCoords.longitude >= 116.0 &&
      centerCoords.longitude <= 127.0
        ? centerCoords
        : { latitude: 14.5995, longitude: 121.0112 };

    const curated = PH_PUBLIC_HOSPITALS.map(h => ({
      ...h,
      facilityId: null,
      branchId: null,
      type: 'public',
      title: h.name,
      location: h.address,
      isGabay: false,
      isPublic: true,
      imageUrl: null,
    }));

    if (cachedOverpassPublic) {
      return [...curated, ...cachedOverpassPublic];
    }

    try {
      const overpassQuery = `[out:json][timeout:8];(node["amenity"~"hospital|clinic"]["name"](around:${radiusMeters},${center.latitude},${center.longitude});way["amenity"~"hospital|clinic"]["name"](around:${radiusMeters},${center.latitude},${center.longitude}););out center 35;`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const osmItems = [];
        for (const el of json?.elements || []) {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          const name = el.tags?.name;
          if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

          const addrParts = [
            el.tags?.['addr:housenumber'],
            el.tags?.['addr:street'],
            el.tags?.['addr:suburb'] || el.tags?.['addr:barangay'],
            el.tags?.['addr:city'] || el.tags?.['addr:municipality'],
          ].filter(Boolean);

          const candidate = {
            id: `osm-${el.type}-${el.id}`,
            facilityId: null,
            branchId: null,
            type: 'public',
            title: name,
            name,
            address: addrParts.join(', ') || el.tags?.['addr:full'] || 'Public Healthcare Facility',
            location: addrParts.join(', ') || 'Public Healthcare Facility',
            phone: el.tags?.phone || el.tags?.['contact:phone'] || '',
            email: '',
            services: inferPublicHospitalServices(name, el.tags || {}),
            isGabay: false,
            isPublic: true,
            imageUrl: null,
            latitude: Number(lat),
            longitude: Number(lng),
          };
          if (!isDuplicateOfExisting(candidate, curated) && !isDuplicateOfExisting(candidate, osmItems)) {
            osmItems.push(candidate);
          }
        }
        cachedOverpassPublic = osmItems;
        return [...curated, ...osmItems];
      }
    } catch {}

    return curated;
  },

  /**
   * Live search for public hospitals/clinics via OpenStreetMap Nominatim
   * (supports searching by hospital name or specialty keywords like "cardiothoracic", "maternity", "blood bank").
   */
  async searchPublicHospitals(rawQuery, userCoords = null) {
    const q = String(rawQuery || '').trim();
    if (q.length < 3) return [];

    // Expand everyday specialty terms into a clean hospital search query for Nominatim
    const expanded = expandServiceKeywords(q);
    const hasHospitalWord = /hospital|clinic|center|centre|medical|blood|maternity|dental/i.test(q);
    const nominatimQuery = hasHospitalWord
      ? `${q} Philippines`
      : `${expanded[0] || q} hospital Philippines`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=ph&q=${encodeURIComponent(nominatimQuery)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GabayMed-PatientApp/2.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return [];

      const rows = await res.json();
      if (!Array.isArray(rows)) return [];

      return rows
        .filter(r => r.lat && r.lon && r.display_name)
        .map(r => {
          const lat = parseFloat(r.lat);
          const lng = parseFloat(r.lon);
          const shortName = r.name || r.display_name.split(',')[0].trim();
          const distKm = userCoords
            ? getDistanceKm(userCoords.latitude, userCoords.longitude, lat, lng)
            : null;
          return {
            id: `nom-${r.place_id}`,
            facilityId: null,
            branchId: null,
            type: 'public',
            title: shortName,
            name: shortName,
            address: r.display_name,
            location: r.display_name,
            phone: '',
            email: '',
            services: inferPublicHospitalServices(`${shortName} ${q}`, r.extratags || {}),
            isGabay: false,
            isPublic: true,
            imageUrl: null,
            latitude: lat,
            longitude: lng,
            distanceKm: distKm,
            distanceLabel: formatDistance(distKm),
          };
        });
    } catch {
      return [];
    }
  },

  /**
   * Fetches all Gabay Partner facilities & branches AND integrates public hospitals from
   * OpenStreetMap + Philippine specialty hospital directory so the map works as a complete public medical map.
   */
  async getFacilitiesLocations(userCoords = null, { includePublic = true } = {}) {
    if (cachedFacilitiesResult && cachedFacilitiesResult.length > 0) {
      const list = includePublic
        ? cachedFacilitiesResult
        : cachedFacilitiesResult.filter(f => f.isGabay);
      if (!userCoords) return list;
      return list
        .map(f => {
          const km = getDistanceKm(userCoords.latitude, userCoords.longitude, f.latitude, f.longitude);
          return { ...f, distanceKm: km, distanceLabel: formatDistance(km) };
        })
        .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }

    let rawList = [];

    // 1. Try backend endpoint `/api/facilities-map`
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`${API_URL}/api/facilities-map`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.facilities) && json.facilities.length > 0) {
          rawList = json.facilities;
        }
      }
    } catch {}

    // 2. Fallback: query `facilities` AND active `clinic_branches` directly from Supabase
    if (rawList.length === 0) {
      try {
        const [{ data: facData }, { data: branchData }] = await Promise.all([
          supabase.from('facilities').select('*'),
          supabase.from('clinic_branches').select('*').eq('is_active', true),
        ]);
        const facMap = new Map();
        const combined = [];

        if (Array.isArray(facData)) {
          facData.forEach((f, idx) => {
            facMap.set(f.facility_id, f);
            const c = inferCoords(f, idx);
            combined.push({
              id: `facility-${f.facility_id}`,
              facilityId: f.facility_id,
              branchId: null,
              type: 'facility',
              name: f.name || 'Healthcare Facility',
              abbreviation: f.abbreviation || '',
              address: f.location || f.address || 'Metro Manila, Philippines',
              phone: f.contact_num || '',
              email: f.email || '',
              services: parseServicesOffered(f.services_offered),
              isGabay: f.is_gabay !== false,
              imageUrl: f.image_url || null,
              latitude: c.latitude,
              longitude: c.longitude,
            });
          });
        }

        if (Array.isArray(branchData)) {
          branchData.forEach((b, j) => {
            const parent = facMap.get(b.facility_id);
            const branchName =
              parent?.name && !b.name?.toLowerCase().includes(parent.name.toLowerCase())
                ? `${parent.name} – ${b.name}`
                : b.name || 'Clinic Branch';
            const c = inferCoords(
              { ...b, name: b.name || branchName, location: b.address || parent?.location },
              (facData?.length || 0) + j + 1
            );
            const branchServices = parseServicesOffered(b.services_offered);
            combined.push({
              id: `branch-${b.branch_id}`,
              facilityId: b.facility_id,
              branchId: b.branch_id,
              type: 'branch',
              name: branchName,
              abbreviation: b.abbreviation || parent?.abbreviation || '',
              address: b.address || parent?.location || 'Metro Manila, Philippines',
              phone: b.contact_num || parent?.contact_num || '',
              email: b.email || parent?.email || '',
              services:
                branchServices.length > 0
                  ? branchServices
                  : parseServicesOffered(parent?.services_offered),
              isGabay: parent ? parent.is_gabay !== false : true,
              imageUrl: parent?.image_url || null,
              latitude: c.latitude,
              longitude: c.longitude,
            });
          });
        }

        rawList = combined;
      } catch (err) {
        console.error('MapAPI Supabase fallback error:', err.message);
      }
    }

    // 3. Deconflict identical coordinates for Gabay clinics
    const usedCoords = [];
    const gabayMapped = rawList.map((f, idx) => {
      const baseCoords = inferCoords(f, idx);
      let { latitude, longitude } = baseCoords;
      const collision = usedCoords.some(
        u => Math.abs(u.latitude - latitude) < 0.0002 && Math.abs(u.longitude - longitude) < 0.0002
      );
      if (collision) {
        const angle = ((idx + 1) * 137.5 * Math.PI) / 180;
        latitude += Math.cos(angle) * 0.0025;
        longitude += Math.sin(angle) * 0.0025;
      }
      usedCoords.push({ latitude, longitude });

      const distKm = userCoords
        ? getDistanceKm(userCoords.latitude, userCoords.longitude, latitude, longitude)
        : null;
      return {
        id: String(f.id ?? f.facilityId ?? idx),
        facilityId: f.facilityId ?? f.facility_id ?? f.id,
        branchId: f.branchId ?? f.branch_id ?? null,
        type: f.type || (f.branchId || f.branch_id ? 'branch' : 'facility'),
        title: f.name || f.title || 'Healthcare Facility',
        name: f.name || f.title || 'Healthcare Facility',
        abbreviation: f.abbreviation || '',
        address: f.address || f.location || 'Address not specified',
        location: f.address || f.location || 'Address not specified',
        phone: f.phone || f.contact_num || '',
        email: f.email || '',
        services: parseServicesOffered(f.services ?? f.services_offered),
        isGabay: f.isGabay !== false,
        isPublic: f.isGabay === false,
        imageUrl: f.imageUrl || null,
        latitude,
        longitude,
        distanceKm: distKm,
        distanceLabel: formatDistance(distKm),
      };
    });

    // 4. Integrate public hospitals (OpenStreetMap Overpass + curated PH specialty hospitals)
    let allMerged = [...gabayMapped];
    try {
      const publicHospitals = await this.fetchPublicHospitals(userCoords);
      for (const pub of publicHospitals) {
        if (!isDuplicateOfExisting(pub, allMerged)) {
          const distKm = userCoords
            ? getDistanceKm(userCoords.latitude, userCoords.longitude, pub.latitude, pub.longitude)
            : null;
          allMerged.push({
            ...pub,
            distanceKm: distKm,
            distanceLabel: formatDistance(distKm),
          });
        }
      }
    } catch {}

    if (allMerged.length > 0) {
      cachedFacilitiesResult = allMerged;
    }

    const finalResult = includePublic ? allMerged : allMerged.filter(f => f.isGabay);
    if (userCoords) {
      finalResult.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }
    return finalResult;
  },

  async getInAppRoute(origin, destination) {
    if (!origin || !destination) return null;
    const origLat = Number(origin.latitude ?? origin.lat);
    const origLng = Number(origin.longitude ?? origin.lng);
    const destLat = Number(destination.latitude ?? destination.lat);
    const destLng = Number(destination.longitude ?? destination.lng);

    if (!Number.isFinite(origLat) || !Number.isFinite(origLng) || !Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      return null;
    }

    const osrmEndpoints = [
      `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`,
    ];

    for (const url of osrmEndpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          const route = json?.routes?.[0];
          if (route?.geometry?.coordinates?.length) {
            const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({
              latitude: Number(lat),
              longitude: Number(lng),
            }));
            const rawSteps = route.legs?.[0]?.steps || [];
            const steps = rawSteps
              .filter(s => s.distance > 5 || s.maneuver?.type === 'arrive')
              .map((s, idx) => {
                const type = s.maneuver?.type || 'continue';
                const mod = s.maneuver?.modifier ? ` ${s.maneuver.modifier}` : '';
                const road = s.name ? ` onto ${s.name}` : '';
                let instruction = `Continue${road}`;
                if (type === 'depart') instruction = `Head${mod}${road}`;
                else if (type === 'arrive') instruction = `Arrive at ${destination.name || 'your destination'}`;
                else if (type === 'turn') instruction = `Turn${mod}${road}`;
                else if (type === 'roundabout') instruction = `Take the roundabout${road}`;
                else if (type === 'merge') instruction = `Merge${mod}${road}`;
                else if (type === 'fork') instruction = `Keep${mod} at the fork${road}`;
                return {
                  id: `${idx}-${s.name || type}`,
                  instruction,
                  distanceLabel:
                    s.distance < 1000
                      ? `${Math.round(s.distance)} m`
                      : `${(s.distance / 1000).toFixed(1)} km`,
                };
              });

            const distKm = route.distance / 1000;
            const durationMin = Math.max(1, Math.round(route.duration / 60));
            return {
              coordinates,
              distanceLabel: distKm < 1 ? `${Math.round(route.distance)} m` : `${distKm.toFixed(1)} km`,
              durationLabel: durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`,
              steps: steps.length > 0 ? steps : [
                {
                  id: 'step-direct',
                  instruction: `Drive toward ${destination.name || 'the selected facility'}`,
                  distanceLabel: distKm < 1 ? `${Math.round(route.distance)} m` : `${distKm.toFixed(1)} km`,
                },
                {
                  id: 'step-arrive',
                  instruction: `Arrive at ${destination.name || 'destination'}`,
                  distanceLabel: '0 m',
                },
              ],
            };
          }
        }
      } catch {}
    }

    const distKm = getDistanceKm(origLat, origLng, destLat, destLng);
    const estMinutes = Math.max(2, Math.round((distKm / 25) * 60));
    const midLat = (origLat + destLat) / 2;
    const midLng = (origLng + destLng) / 2;
    return {
      coordinates: [
        { latitude: origLat, longitude: origLng },
        { latitude: midLat, longitude: origLng },
        { latitude: midLat, longitude: midLng },
        { latitude: destLat, longitude: destLng },
      ],
      distanceLabel: formatDistance(distKm)?.replace(' away', '') || `${distKm.toFixed(1)} km`,
      durationLabel: `${estMinutes} min`,
      steps: [
        {
          id: 'step-depart',
          instruction: `Head toward ${destination.address || destination.name || 'destination'}`,
          distanceLabel: formatDistance(distKm * 0.5)?.replace(' away', '') || '',
        },
        {
          id: 'step-direct',
          instruction: `Continue toward ${destination.name || 'the selected facility'}`,
          distanceLabel: formatDistance(distKm * 0.5)?.replace(' away', '') || '',
        },
        {
          id: 'step-arrive',
          instruction: `Arrive at ${destination.name || 'destination'}`,
          distanceLabel: '0 m',
        },
      ],
    };
  },
};

export default MapAPI;
