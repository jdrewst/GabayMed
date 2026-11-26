// DRAFT legal copy taken from the design mockups. Have it reviewed before release.

export const TERMS_OF_SERVICE = `Welcome to GabayMed. These Terms of Service govern your access to and use of the GabayMed mobile application, web platform, and all related features and services. By accessing, registering for, or using GabayMed, you acknowledge that you have read, understood, and agreed to be bound by these Terms. If you do not agree with any part of these Terms, you must discontinue use of the Services immediately.

1. Purpose of the Service
GabayMed helps you find suitable healthcare facilities, view estimated costs, book appointments, and communicate with partner facilities. GabayMed does not provide medical diagnosis or treatment and is not a substitute for professional medical advice. In an emergency, call 911 or go to the nearest emergency room.

2. Your Account
You must provide accurate and complete information when you register and keep it up to date. You are responsible for keeping your password confidential and for all activity under your account. Tell us immediately if you suspect unauthorized access.

3. Cost Estimates
Cost estimates are based on available facility pricing and insurance information. Final bills may differ and are determined by the facility.

4. Acceptable Use
You agree not to misuse the Services, interfere with their operation, attempt to access other users' data, or use the Services for unlawful purposes.

5. Changes and Termination
We may update these Terms or the Services from time to time. We may suspend or close accounts that violate these Terms. Continued use after changes means you accept the updated Terms.

6. Contact
Questions about these Terms can be sent to support@gabaymed.com.`;

export const PRIVACY_POLICY = `GabayMed is committed to protecting your privacy and handling your personal data responsibly, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). This Privacy Policy explains how GabayMed collects, uses, stores, and shares information when you access or use the Services. By using GabayMed, you acknowledge and agree to the data practices described in this Policy.

1. Information We Collect
We collect your name, contact details (email address and mobile number), account credentials, and, when you provide them, date of birth, insurance details, and health-related information needed to arrange your care.

2. How We Use Your Information
We use your information to create and secure your account, help you find and book care, estimate costs, communicate with partner facilities on your behalf, and improve the Services.

3. Sharing
We share only the minimum information necessary with healthcare facilities you choose and with service providers who help us operate GabayMed. We do not sell your personal data.

4. Security and Retention
Your information is transmitted over encrypted connections and protected by access controls. We keep it only as long as needed for the purposes above or as required by law.

5. Your Rights
You may access, correct, or request deletion of your personal data, and withdraw consent, by contacting support@gabaymed.com.`;

export const CONSENTS = [
  {
    key: 'insurance_consent',
    title: 'Insurance Data Processing',
    icon: 'insurance',
    body: `By allowing GabayMed to process your PhilHealth or HMO information, the system can estimate your real-time healthcare costs. This includes computing coverage, deductions, and potential out-of-pocket expenses. Calculations are based on available insurance data and hospital pricing references.

Results are estimates and may differ from final billing statements. GabayMed does not authorize payments on your behalf. Your insurance data is processed securely and only for cost computation purposes. Information is not sold or shared with unauthorized third parties.`,
  },
  {
    key: 'data_sharing_consent',
    title: 'Hospital Data Sharing',
    icon: 'hospital',
    body: `By allowing automatic formatting and sharing of your digital medical forms, GabayMed can streamline hospital admissions and reduce manual paperwork. Your submitted information is converted into standardized formats accepted by partner hospitals.

Shared data may include personal details, medical history, and appointment-related information. Only the minimum necessary data is transmitted for each request, and only to the facility you choose. This does not replace hospital consent procedures. Information is shared only through secure, encrypted channels.`,
  },
];
