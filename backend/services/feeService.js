const COUNTRY_APPOINTMENT_FEES = {
  DE: 2146,
  CH: 3100,
  IT: 631,
  PT: 3513,
  NL: 1870,
  AT: 2524,
  SK: 3319,
  CZ: 2220,
  HU: 2133,
  FI: 2232,
  GE: 1500,
  LV: 2987,
  LB: 1920,
  LT: 1980,
  MD: 1350,
  ME: 2821,
  PL: 1026,
  SI: 2767
};

const DEFAULT_APPOINTMENT_FEE = 6000;
const STANDARD_SERVICES = [
  { name: 'Flight Ticket', price: 1500 },
  { name: 'Hotel Booking', price: 1500 },
  // { name: 'Application Form', price: 1000 },
  { name: 'Service Charges', price: 500 }
];

// Server-side price catalog, derived from STANDARD_SERVICES so there is a
// single place to change prices. Never trust a price sent by the client —
// only the service *name* is used to look up the price here.
const SERVICE_CATALOG = STANDARD_SERVICES.reduce((map, service) => {
  map[service.name] = service.price;
  return map;
}, {});

function getAppointmentFee(countryCode, centerName = '') {
  const code = (countryCode || '').toUpperCase();
  const name = (centerName || '').toUpperCase();

  if (code === 'MT') {
    return name.includes('SHORT STAY') ? 4935 : DEFAULT_APPOINTMENT_FEE;
  }

  const fee = COUNTRY_APPOINTMENT_FEES[code];
  if (fee === undefined) return DEFAULT_APPOINTMENT_FEE;
  if (fee <= 5000) return fee + 2000;
  if (fee <= 10000) return fee + 1500;
  return fee + 1000;
}

// SECURITY: previously took `service.price` directly from client input
// (Number(service.price)), which let anyone book at an arbitrary price via
// the legacy /booking/create endpoint. Now only `service.name` from the
// client is used, and the price is always looked up server-side.
function normaliseServices(servicesSelected) {
  const requestedNames = (servicesSelected || [])
    .map(service => service && service.name)
    .filter(name => SERVICE_CATALOG[name] !== undefined); // unknown names are dropped, never trusted

  const uniqueNames = [...new Set(requestedNames)]; // de-dupe so a repeated name can't be charged twice

  const resolvedServices = uniqueNames.map(name => ({
    name,
    price: SERVICE_CATALOG[name] // ALWAYS server catalog price, never client-supplied
  }));

  return resolvedServices.length ? resolvedServices : STANDARD_SERVICES;
}

function buildPricing(applicantCount, services, appointmentFeePerApplicant) {
  const count = Math.max(1, Number(applicantCount) || 1);
  const scaledServicesSelected = services.map(service => ({
    name: service.name,
    price: Number(service.price) * count
  }));
  const selectedServicesTotal = scaledServicesSelected.reduce((sum, service) => sum + service.price, 0);
  const appointmentFee = appointmentFeePerApplicant * count;
  const gstAmount = 0;

  return {
    scaledServicesSelected,
    selectedServicesTotal,
    appointmentFee,
    gstAmount,
    calculatedTotal: appointmentFee + selectedServicesTotal + gstAmount
  };
}

exports.buildLockPricing = (applicantCount, countryCode, centerName) => {
  return buildPricing(applicantCount, STANDARD_SERVICES, getAppointmentFee(countryCode, centerName));
};

exports.buildCreatePricing = (applicantCount, servicesSelected = []) => {
  return buildPricing(applicantCount, normaliseServices(servicesSelected), DEFAULT_APPOINTMENT_FEE);
};

exports.calculateFreeApplicationDiscount = (totalAmount, applicantCount) => {
  const count = Math.max(1, Number(applicantCount) || 1);
  return Math.round(Number(totalAmount || 0) / count);
};

exports.getAppointmentFee = getAppointmentFee;
