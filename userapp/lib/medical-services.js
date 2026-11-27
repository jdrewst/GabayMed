// Comprehensive medical services catalog + smart natural-language keyword matcher
// Used by Gabay 2.0 Mobile Maps, Browse Services, and Facility Search

export const MEDICAL_SERVICE_CATEGORIES = [
  {
    category: 'Primary & Emergency Care',
    services: [
      'General Check-up',
      'General Physician',
      'Family Medicine',
      'Internal Medicine',
      'Emergency & Trauma Care',
      'Urgent Care',
      'Intensive Care Unit (ICU)',
      'Vaccination & Immunization',
      'Preventive & Executive Check-up',
    ],
  },
  {
    category: 'Heart, Lung & Vascular',
    services: [
      'Cardiology',
      'Cardiothoracic Surgery',
      'Vascular Surgery',
      'Pulmonology',
      'Sleep Medicine',
    ],
  },
  {
    category: "Women's & Children's Health",
    services: [
      'OB-GYN (Obstetrics & Gynecology)',
      'Maternity & Birthing',
      'Pediatrics',
      'Neonatology (NICU)',
      'Fertility & Reproductive Health',
      'Breast Care & Mammography',
    ],
  },
  {
    category: 'Diagnostics, Lab & Blood Services',
    services: [
      'Laboratory & Blood Tests',
      'Blood Bank & Transfusion',
      'Hematology',
      'Radiology & Imaging (X-Ray / CT / MRI)',
      'Ultrasound & Sonography',
      'ECG & Heart Diagnostics',
      'Pathology & Biopsy',
    ],
  },
  {
    category: 'Surgery & Orthopedics',
    services: [
      'General Surgery',
      'Orthopedics',
      'Neurosurgery',
      'Plastic & Reconstructive Surgery',
      'Anesthesiology & Pain Management',
    ],
  },
  {
    category: 'Medical Specialties',
    services: [
      'Neurology',
      'Oncology (Cancer Care)',
      'Dermatology',
      'Gastroenterology',
      'Endocrinology & Diabetes Care',
      'Nephrology & Dialysis',
      'Urology',
      'Rheumatology',
      'Allergy & Immunology',
      'Infectious Disease',
      'Psychiatry & Mental Health',
      'Geriatrics',
    ],
  },
  {
    category: 'Eye, ENT & Dental',
    services: [
      'Ophthalmology (Eye Care)',
      'ENT (Ear, Nose & Throat)',
      'Dentistry & Oral Surgery',
    ],
  },
  {
    category: 'Rehabilitation & Support',
    services: [
      'Physical Therapy & Rehabilitation',
      'Occupational & Speech Therapy',
      'Nutrition & Dietetics',
      'Pharmacy',
    ],
  },
];

export const ALL_MEDICAL_SERVICES = MEDICAL_SERVICE_CATEGORIES.flatMap(g => g.services);

// Quick filter chips displayed on the mobile map
export const MAP_QUICK_SERVICE_FILTERS = [
  { id: 'Cardiology', label: 'Heart / Cardio', query: 'cardiology' },
  { id: 'OB-GYN', label: 'OB-GYN / Maternity', query: 'obgyn' },
  { id: 'Pediatrics', label: 'Baby / Pediatrics', query: 'baby' },
  { id: 'Blood', label: 'Blood & Lab', query: 'blood' },
  { id: 'Emergency', label: 'Emergency', query: 'emergency' },
  { id: 'Pulmonology', label: 'Lung / Pulmo', query: 'pulmonology' },
  { id: 'Orthopedics', label: 'Orthopedic', query: 'orthopedic' },
  { id: 'Dentistry', label: 'Dental', query: 'dental' },
  { id: 'Ophthalmology', label: 'Eye Care', query: 'eye' },
  { id: 'Dermatology', label: 'Skin / Derma', query: 'skin' },
  { id: 'Neurology', label: 'Brain / Neuro', query: 'neurology' },
  { id: 'Dialysis', label: 'Kidney / Dialysis', query: 'kidney' },
];

// Maps everyday patient terms (and common typos) to canonical clinical service keywords
const SERVICE_SYNONYM_GROUPS = [
  {
    triggers: ['cardiothoracic', 'cardiothorasic', 'cardio thoracic', 'heart surgery', 'open heart', 'bypass', 'thoracic'],
    targets: ['cardiothoracic surgery', 'cardiology', 'cardiologist', 'heart', 'vascular surgery', 'ecg'],
  },
  {
    triggers: ['cardio', 'cardiology', 'cardiologist', 'heart', 'chest pain', 'hypertension', 'ecg', 'ekg', 'echo'],
    targets: ['cardiology', 'cardiologist', 'cardiothoracic surgery', 'ecg & heart diagnostics', 'heart'],
  },
  {
    triggers: ['obgyn', 'ob gyn', 'ob-gyn', 'ob', 'gyne', 'gynecology', 'gynecologist', 'obstetrics', 'maternity', 'pregnant', 'pregnancy', 'prenatal', 'birthing', 'lying in', 'ultrasound'],
    targets: ['ob-gyn', 'obstetrics', 'gynecology', 'maternity', 'birthing', 'fertility', 'ultrasound', 'women'],
  },
  {
    triggers: ['baby', 'babies', 'infant', 'newborn', 'child', 'children', 'kids', 'pedia', 'pediatric', 'pediatrics', 'pediatrician', 'nicu', 'neonatal', 'neonatology'],
    targets: ['pediatrics', 'pediatrician', 'neonatology', 'nicu', 'maternity', 'ob-gyn', 'vaccination', 'children'],
  },
  {
    triggers: ['blood', 'cbc', 'blood test', 'blood bank', 'transfusion', 'plasma', 'platelet', 'hematology', 'hematologist', 'lab', 'laboratory', 'urinalysis', 'fecalysis'],
    targets: ['blood bank', 'transfusion', 'laboratory', 'blood tests', 'hematology', 'hematologist', 'pathology'],
  },
  {
    triggers: ['lung', 'lungs', 'pulmo', 'pulmonology', 'pulmonologist', 'asthma', 'cough', 'tb', 'tuberculosis', 'respiratory', 'breathing', 'pneumonia'],
    targets: ['pulmonology', 'pulmonologist', 'lung', 'respiratory', 'sleep medicine'],
  },
  {
    triggers: ['brain', 'neuro', 'neurology', 'neurologist', 'neurosurgery', 'stroke', 'seizure', 'migraine', 'nerve', 'headache'],
    targets: ['neurology', 'neurologist', 'neurosurgery'],
  },
  {
    triggers: ['mental', 'psych', 'psychiatry', 'psychiatric', 'psychiatrist', 'psychology', 'anxiety', 'depression', 'therapy', 'counseling'],
    targets: ['psychiatry', 'psychiatric', 'mental health'],
  },
  {
    triggers: ['bone', 'bones', 'ortho', 'orthopedic', 'orthopedics', 'fracture', 'joint', 'knee', 'spine', 'arthritis', 'sports injury'],
    targets: ['orthopedics', 'orthopedic', 'physical therapy', 'rehabilitation', 'rheumatology'],
  },
  {
    triggers: ['skin', 'derma', 'dermatology', 'dermatologist', 'acne', 'rash', 'eczema', 'allergy'],
    targets: ['dermatology', 'dermatologist', 'allergy & immunology'],
  },
  {
    triggers: ['eye', 'eyes', 'vision', 'ophtha', 'ophthalmology', 'ophthalmologist', 'cataract', 'lasik', 'optical'],
    targets: ['ophthalmology', 'ophthalmologist', 'eye care'],
  },
  {
    triggers: ['ent', 'ear', 'nose', 'throat', 'sinus', 'hearing', 'tonsils'],
    targets: ['ent', 'ent specialist', 'ear, nose & throat'],
  },
  {
    triggers: ['dental', 'dentist', 'dentistry', 'tooth', 'teeth', 'braces', 'oral', 'molar', 'cleaning'],
    targets: ['dentistry', 'dentist', 'oral surgery'],
  },
  {
    triggers: ['kidney', 'renal', 'dialysis', 'nephro', 'nephrology', 'uti', 'urology', 'urologist'],
    targets: ['nephrology', 'dialysis', 'urology', 'kidney'],
  },
  {
    triggers: ['cancer', 'onco', 'oncology', 'oncologist', 'chemo', 'chemotherapy', 'tumor', 'radiation', 'biopsy'],
    targets: ['oncology', 'cancer care', 'pathology', 'breast care'],
  },
  {
    triggers: ['stomach', 'gastro', 'gastroenterology', 'liver', 'endoscopy', 'colonoscopy', 'ulcer', 'acid'],
    targets: ['gastroenterology', 'internal medicine'],
  },
  {
    triggers: ['diabetes', 'thyroid', 'endo', 'endocrinology', 'sugar', 'hormone'],
    targets: ['endocrinology', 'diabetes care', 'internal medicine'],
  },
  {
    triggers: ['xray', 'x-ray', 'x ray', 'mri', 'ct', 'ct scan', 'scan', 'imaging', 'radiology', 'mammogram'],
    targets: ['radiology', 'imaging', 'ultrasound', 'breast care'],
  },
  {
    triggers: ['emergency', 'er', 'urgent', 'trauma', 'accident', 'ambulance', 'icu', '24/7'],
    targets: ['emergency', 'trauma care', 'urgent care', 'intensive care', 'icu'],
  },
  {
    triggers: ['vaccine', 'vaccination', 'immunization', 'flu shot', 'anti rabies', 'rabies', 'tetanus'],
    targets: ['vaccination', 'immunization', 'general check-up', 'pediatrics'],
  },
  {
    triggers: ['rehab', 'rehabilitation', 'pt', 'physical therapy', 'massage', 'speech therapy'],
    targets: ['physical therapy', 'rehabilitation', 'occupational & speech therapy'],
  },
  {
    triggers: ['checkup', 'check up', 'check-up', 'general', 'doctor', 'physician', 'fever', 'consultation', 'clinic'],
    targets: ['general check-up', 'general physician', 'family medicine', 'internal medicine'],
  },
];

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = above;
    }
  }
  return prev[b.length];
}

function fuzzyTokenMatch(queryToken, candidateText) {
  if (!queryToken) return true;
  if (candidateText.includes(queryToken)) return true;
  if (queryToken.length < 4) return false;
  const words = candidateText.split(' ');
  const maxDist = queryToken.length >= 8 ? 2 : 1;
  return words.some(w => w.length >= 4 && editDistance(queryToken, w) <= maxDist);
}

/**
 * Expands a user's natural-language query (e.g. "baby", "obgyn", "cardiothorasic", "blood")
 * into all related clinical service keywords.
 */
export function expandServiceKeywords(query) {
  const norm = normalizeSearchText(query);
  if (!norm) return [];
  const expanded = new Set([norm]);
  const tokens = norm.split(' ').filter(Boolean);

  for (const group of SERVICE_SYNONYM_GROUPS) {
    const matched = group.triggers.some(trigger => {
      const nt = normalizeSearchText(trigger);
      if (norm.includes(nt) || nt.includes(norm)) return true;
      return tokens.some(tok => tok.length >= 4 && fuzzyTokenMatch(tok, nt));
    });
    if (matched) {
      group.targets.forEach(t => expanded.add(normalizeSearchText(t)));
    }
  }

  return Array.from(expanded);
}

/**
 * Returns true if a facility/hospital matches a user's search query by:
 * - hospital / clinic / branch name
 * - address / city / location
 * - offered services (with smart natural-language synonyms & typo tolerance)
 */
export function matchesFacilityQuery(facility, rawQuery) {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return true;

  const haystack = normalizeSearchText(
    [
      facility.name,
      facility.title,
      facility.address,
      facility.location,
      facility.specialty,
      ...(Array.isArray(facility.services) ? facility.services : []),
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (haystack.includes(normQuery)) return true;

  // Check expanded service synonyms (e.g., "baby" -> pediatrics/nicu/maternity, "blood" -> blood bank/lab)
  const expandedKeywords = expandServiceKeywords(normQuery);
  if (expandedKeywords.some(kw => kw !== normQuery && haystack.includes(kw))) {
    return true;
  }

  // Token-level fuzzy match (handles typos like "cardiothorasic hospital")
  const ignoreWords = new Set(['hospital', 'clinic', 'center', 'centre', 'medical', 'near', 'me', 'in', 'the', 'for', 'of']);
  const meaningfulTokens = normQuery.split(' ').filter(t => t && !ignoreWords.has(t));
  const tokensToCheck = meaningfulTokens.length > 0 ? meaningfulTokens : normQuery.split(' ').filter(Boolean);

  return tokensToCheck.every(tok => {
    if (fuzzyTokenMatch(tok, haystack)) return true;
    const tokExpanded = expandServiceKeywords(tok);
    return tokExpanded.some(kw => haystack.includes(kw));
  });
}

/**
 * Infers likely medical services for a public OpenStreetMap hospital/clinic based on its name & OSM tags
 * so public hospitals can also be discovered when searching by specialty/service.
 */
export function inferPublicHospitalServices(name = '', tags = {}) {
  const text = normalizeSearchText(
    [name, tags['healthcare:speciality'], tags.specialty, tags.amenity, tags.healthcare, tags.description]
      .filter(Boolean)
      .join(' ')
  );
  const inferred = new Set();

  if (/hospital|medical center|medical centre|general hospital|doctors/.test(text)) {
    inferred.add('General Check-up');
    inferred.add('General Physician');
    inferred.add('Emergency & Trauma Care');
    inferred.add('Internal Medicine');
    inferred.add('Laboratory & Blood Tests');
    inferred.add('Radiology & Imaging (X-Ray / CT / MRI)');
  }
  if (/heart|cardio|thoracic|vascular/.test(text)) {
    inferred.add('Cardiology');
    inferred.add('Cardiothoracic Surgery');
    inferred.add('ECG & Heart Diagnostics');
    inferred.add('Vascular Surgery');
  }
  if (/lung|pulmo|chest|respiratory|tb/.test(text)) {
    inferred.add('Pulmonology');
  }
  if (/child|children|pedia|baby|infant|maternal|maternity|women|lying|birthing|obgyn|obstetric|gynec/.test(text)) {
    inferred.add('OB-GYN (Obstetrics & Gynecology)');
    inferred.add('Maternity & Birthing');
    inferred.add('Pediatrics');
    inferred.add('Neonatology (NICU)');
  }
  if (/kidney|renal|transplant|dialysis|urology/.test(text)) {
    inferred.add('Nephrology & Dialysis');
    inferred.add('Urology');
  }
  if (/blood|red cross|hematolog|lab|diagnostic|hi-precision|hi precision/.test(text)) {
    inferred.add('Blood Bank & Transfusion');
    inferred.add('Laboratory & Blood Tests');
    inferred.add('Hematology');
  }
  if (/eye|optical|ophthalm|vision/.test(text)) {
    inferred.add('Ophthalmology (Eye Care)');
  }
  if (/dental|dentist|tooth|oral/.test(text)) {
    inferred.add('Dentistry & Oral Surgery');
  }
  if (/ortho|bone|spine/.test(text)) {
    inferred.add('Orthopedics');
    inferred.add('Physical Therapy & Rehabilitation');
  }
  if (/skin|derma/.test(text)) {
    inferred.add('Dermatology');
  }
  if (/mental|psych/.test(text)) {
    inferred.add('Psychiatry & Mental Health');
  }
  if (/cancer|onco/.test(text)) {
    inferred.add('Oncology (Cancer Care)');
  }
  if (/neuro|brain|stroke/.test(text)) {
    inferred.add('Neurology');
    inferred.add('Neurosurgery');
  }
  if (/ent|ear|nose|throat/.test(text)) {
    inferred.add('ENT (Ear, Nose & Throat)');
  }
  if (inferred.size === 0) {
    inferred.add('General Check-up');
    inferred.add('General Physician');
  }

  // General tertiary hospitals in the Philippines typically offer OB-GYN, Pediatrics, Cardiology, Blood Bank, Surgery
  if (/general hospital|medical center|medical centre|st\.?\s*luke|makati med|medical city|ust hospital|chinese general|manila doctors|asian hospital|cardinal santos|capitol medical|delos santos|east avenue|veterans|uerm/.test(text)) {
    inferred.add('Cardiology');
    inferred.add('OB-GYN (Obstetrics & Gynecology)');
    inferred.add('Maternity & Birthing');
    inferred.add('Pediatrics');
    inferred.add('Blood Bank & Transfusion');
    inferred.add('General Surgery');
    inferred.add('Orthopedics');
    inferred.add('Pulmonology');
    inferred.add('Neurology');
  }

  return Array.from(inferred);
}
