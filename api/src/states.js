// The 50 states and DC, for the owner's sales targeting page (/admin/prospects/).
//
// fips: the federal state code the NCES data uses.
// standards: the name of the state's current K-12 math standards.
// basis: how the standards relate to the Common Core State Standards for Mathematics (CCSS):
//   'common-core'  adopted CCSS (sometimes under a state name) with little or no change, so CCSS codes apply
//   'adapted'      the state revised CCSS into its own document; topics line up by domain, codes may differ
//   'own'          the state wrote its own standards; skill-by-skill mapping needs its own crosswalk
// privacyLaw: a state student data privacy law that vendors are asked about, only where we are sure of it.
// note: anything else worth knowing before a pitch.
//
// Written from public state sources as of Nov 2026. States revise standards every few years, so the
// sales page tells the owner to check the state's education department site before sending a pitch.
export const STATES = [
  { code: 'AL', name: 'Alabama', fips: 1, standards: 'Alabama Course of Study: Mathematics', basis: 'own' },
  { code: 'AK', name: 'Alaska', fips: 2, standards: 'Alaska Mathematics Standards', basis: 'common-core' },
  { code: 'AZ', name: 'Arizona', fips: 4, standards: 'Arizona Mathematics Standards', basis: 'adapted' },
  { code: 'AR', name: 'Arkansas', fips: 5, standards: 'Arkansas Mathematics Standards', basis: 'adapted' },
  {
    code: 'CA',
    name: 'California',
    fips: 6,
    standards: 'California Common Core State Standards for Mathematics',
    basis: 'common-core',
    privacyLaw: "the Student Online Personal Information Protection Act (SOPIPA) and Education Code section 49073.1",
  },
  { code: 'CO', name: 'Colorado', fips: 8, standards: 'Colorado Academic Standards in Mathematics', basis: 'adapted', privacyLaw: 'the Student Data Transparency and Security Act' },
  { code: 'CT', name: 'Connecticut', fips: 9, standards: 'Connecticut Core Standards for Mathematics', basis: 'common-core', privacyLaw: "Connecticut's student data privacy law (C.G.S. sections 10-234aa to 10-234dd)" },
  { code: 'DE', name: 'Delaware', fips: 10, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  { code: 'DC', name: 'District of Columbia', fips: 11, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  { code: 'FL', name: 'Florida', fips: 12, standards: "Florida's B.E.S.T. Standards for Mathematics", basis: 'own' },
  { code: 'GA', name: 'Georgia', fips: 13, standards: "Georgia's K-12 Mathematics Standards", basis: 'own', privacyLaw: 'the Student Data Privacy, Accessibility, and Transparency Act' },
  { code: 'HI', name: 'Hawaii', fips: 15, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  { code: 'ID', name: 'Idaho', fips: 16, standards: 'Idaho Content Standards: Mathematics', basis: 'adapted' },
  { code: 'IL', name: 'Illinois', fips: 17, standards: 'Illinois Learning Standards for Mathematics', basis: 'common-core', privacyLaw: 'the Student Online Personal Protection Act (SOPPA)' },
  { code: 'IN', name: 'Indiana', fips: 18, standards: 'Indiana Academic Standards for Mathematics', basis: 'own' },
  { code: 'IA', name: 'Iowa', fips: 19, standards: 'Iowa Core Mathematics', basis: 'common-core' },
  { code: 'KS', name: 'Kansas', fips: 20, standards: 'Kansas Mathematics Standards', basis: 'adapted' },
  { code: 'KY', name: 'Kentucky', fips: 21, standards: 'Kentucky Academic Standards for Mathematics', basis: 'adapted' },
  { code: 'LA', name: 'Louisiana', fips: 22, standards: 'Louisiana Student Standards for Mathematics', basis: 'adapted' },
  { code: 'ME', name: 'Maine', fips: 23, standards: 'Maine Learning Results: Mathematics', basis: 'adapted' },
  { code: 'MD', name: 'Maryland', fips: 24, standards: 'Maryland College and Career Ready Standards for Mathematics', basis: 'common-core', privacyLaw: 'the Maryland Student Data Privacy Act' },
  { code: 'MA', name: 'Massachusetts', fips: 25, standards: 'Massachusetts Curriculum Framework for Mathematics', basis: 'adapted' },
  { code: 'MI', name: 'Michigan', fips: 26, standards: 'Michigan K-12 Standards: Mathematics', basis: 'common-core' },
  { code: 'MN', name: 'Minnesota', fips: 27, standards: 'Minnesota K-12 Academic Standards in Mathematics', basis: 'own' },
  { code: 'MS', name: 'Mississippi', fips: 28, standards: 'Mississippi College- and Career-Readiness Standards for Mathematics', basis: 'adapted' },
  { code: 'MO', name: 'Missouri', fips: 29, standards: 'Missouri Learning Standards: Mathematics', basis: 'adapted' },
  { code: 'MT', name: 'Montana', fips: 30, standards: 'Montana Common Core Standards for Mathematics', basis: 'common-core' },
  { code: 'NE', name: 'Nebraska', fips: 31, standards: "Nebraska's College and Career Ready Standards for Mathematics", basis: 'own' },
  { code: 'NV', name: 'Nevada', fips: 32, standards: 'Nevada Academic Content Standards for Mathematics', basis: 'common-core' },
  { code: 'NH', name: 'New Hampshire', fips: 33, standards: 'New Hampshire College and Career Ready Standards for Mathematics', basis: 'common-core' },
  { code: 'NJ', name: 'New Jersey', fips: 34, standards: 'New Jersey Student Learning Standards for Mathematics', basis: 'adapted' },
  { code: 'NM', name: 'New Mexico', fips: 35, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  {
    code: 'NY',
    name: 'New York',
    fips: 36,
    standards: 'New York State Next Generation Mathematics Learning Standards',
    basis: 'adapted',
    privacyLaw: "Education Law section 2-d and Part 121 of the Commissioner's regulations",
  },
  { code: 'NC', name: 'North Carolina', fips: 37, standards: 'North Carolina Standard Course of Study: Mathematics', basis: 'adapted' },
  { code: 'ND', name: 'North Dakota', fips: 38, standards: 'North Dakota Mathematics Content Standards', basis: 'adapted' },
  { code: 'OH', name: 'Ohio', fips: 39, standards: "Ohio's Learning Standards for Mathematics", basis: 'adapted' },
  { code: 'OK', name: 'Oklahoma', fips: 40, standards: 'Oklahoma Academic Standards for Mathematics', basis: 'own' },
  { code: 'OR', name: 'Oregon', fips: 41, standards: 'Oregon Mathematics Standards', basis: 'adapted' },
  { code: 'PA', name: 'Pennsylvania', fips: 42, standards: 'Pennsylvania Core Standards for Mathematics', basis: 'adapted' },
  { code: 'RI', name: 'Rhode Island', fips: 44, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  { code: 'SC', name: 'South Carolina', fips: 45, standards: 'South Carolina College- and Career-Ready Standards for Mathematics', basis: 'own' },
  {
    code: 'SD',
    name: 'South Dakota',
    fips: 46,
    standards: 'South Dakota Mathematics Standards',
    basis: 'adapted',
    note: 'The state board voted in May 2026 to move away from Common Core math, with new standards expected in July 2027.',
  },
  { code: 'TN', name: 'Tennessee', fips: 47, standards: 'Tennessee Academic Standards for Mathematics', basis: 'adapted' },
  { code: 'TX', name: 'Texas', fips: 48, standards: 'Texas Essential Knowledge and Skills (TEKS) for Mathematics', basis: 'own', privacyLaw: 'Texas Education Code chapter 32, subchapter D' },
  { code: 'UT', name: 'Utah', fips: 49, standards: 'Utah Core Standards for Mathematics', basis: 'adapted', privacyLaw: 'the Utah Student Data Protection Act' },
  { code: 'VT', name: 'Vermont', fips: 50, standards: 'Common Core State Standards for Mathematics', basis: 'common-core' },
  { code: 'VA', name: 'Virginia', fips: 51, standards: 'Virginia Mathematics Standards of Learning', basis: 'own', privacyLaw: 'Code of Virginia section 22.1-289.01' },
  {
    code: 'WA',
    name: 'Washington',
    fips: 53,
    standards: 'Washington State K-12 Learning Standards for Mathematics',
    basis: 'common-core',
    privacyLaw: 'the Student User Privacy in Education Rights Act (RCW 28A.604)',
  },
  { code: 'WV', name: 'West Virginia', fips: 54, standards: 'West Virginia College- and Career-Readiness Standards for Mathematics', basis: 'adapted' },
  { code: 'WI', name: 'Wisconsin', fips: 55, standards: 'Wisconsin Standards for Mathematics', basis: 'adapted' },
  { code: 'WY', name: 'Wyoming', fips: 56, standards: 'Wyoming Mathematics Content and Performance Standards', basis: 'adapted' },
];

export const STATE_BY_CODE = Object.fromEntries(STATES.map((s) => [s.code, s]));
