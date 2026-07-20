const validator = require('validator');

// ---- shared regex helpers (was duplicated 3x before) ----
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/; // loose E.164-style check
const isValidPhone = (phone) => !!phone && PHONE_REGEX.test(String(phone).replace(/\s+/g, ''));

// GSTIN format: 2 digit state code + 10 char PAN + 1 entity code + 'Z' + 1 checksum char
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const isValidGst = (gst) => !!gst && GST_REGEX.test(gst.trim().toUpperCase());

const validateRegister = (req, res, next) => {
  const { name, lastName, email, password, mobile } = req.body;
  const errors = {};

  if (!name || name.trim().length < 1) {
    errors.name = 'First name must be at least 1 character long';
  }

  if (!lastName || lastName.trim().length < 1) {
    errors.lastName = 'Last name must be at least 1 character long';
  } else if (!/^[a-zA-Z\s'\-]+$/.test(lastName.trim())) {
    errors.lastName = 'Last name can only contain letters, spaces, hyphens, and apostrophes';
  }

  if (!email || !validator.isEmail(email.trim())) {
    errors.email = 'Please provide a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long';
  }

  if (!isValidPhone(mobile)) {
    errors.mobile = 'Please provide a valid mobile number (e.g. +91 9876543210)';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body; // email field holds either email or lastName in requests
  const errors = {};

  if (!email || email.trim().length < 2) {
    errors.email = 'Email or last name is required (minimum 2 characters)';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateBooking = (req, res, next) => {
  const { applicantDetails, bookingDate, bookingTime, paymentDetails } = req.body;
  const errors = {};

  // 1. Applicant details validation
  if (!applicantDetails) {
    errors.applicantDetails = 'Applicant details are required';
  } else {
    const list = Array.isArray(applicantDetails) ? applicantDetails : [applicantDetails];
    if (list.length === 0) {
      errors.applicantDetails = 'At least one applicant detail is required';
    } else {
      list.forEach((applicant, index) => {
        const prefix = Array.isArray(applicantDetails) ? `applicant_${index}_` : '';
        const { firstName, lastName, passportNumber, email, phone, dob, visaCategory, location, gender, nationality } = applicant;

        if (!firstName || firstName.trim().length < 1 || firstName.trim().length > 30 || !/^[A-Za-z\s'\-]+$/.test(firstName.trim())) {
          errors[`${prefix}firstName`] = 'First name must contain only letters, spaces, hyphens, or apostrophes and be 1 to 30 characters long';
        }

        if (!lastName || lastName.trim().length < 1 || lastName.trim().length > 30 || !/^[A-Za-z\s'\-]+$/.test(lastName.trim())) {
          errors[`${prefix}lastName`] = 'Last name must contain only letters, spaces, hyphens, or apostrophes and be 1 to 30 characters long';
        }

        if (!passportNumber || !/^[A-Z0-9]{8,9}$/.test(passportNumber.trim().toUpperCase())) {
          errors[`${prefix}passportNumber`] = 'Passport number must be 8 or 9 characters long and contain only letters and numbers';
        }

        if (!email || !validator.isEmail(email.trim())) {
          errors[`${prefix}email`] = 'Please provide a valid email address';
        }

        if (!isValidPhone(phone)) {
          errors[`${prefix}phone`] = 'Please provide a valid phone number (e.g. +91 9876543210)';
        }

        if (!dob || isNaN(Date.parse(dob))) {
          errors[`${prefix}dob`] = 'Please provide a valid date of birth';
        } else {
          const birthDate = new Date(dob);
          if (birthDate > new Date()) {
            errors[`${prefix}dob`] = 'Date of birth cannot be in the future';
          }
        }

        if (!visaCategory) {
          errors[`${prefix}visaCategory`] = 'Visa category is required';
        }

        if (!location) {
          errors[`${prefix}location`] = 'Application location is required';
        }

        if (!gender) {
          errors[`${prefix}gender`] = 'Gender is required';
        }

        if (!nationality) {
          errors[`${prefix}nationality`] = 'Current nationality is required';
        }

        if (!applicant.passportDocument) {
          errors[`${prefix}passportDocument`] = 'Passport document is required';
        } else {
          const docStr = applicant.passportDocument;
          const matches = docStr.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) {
            errors[`${prefix}passportDocument`] = 'Invalid document format. Only JPG, JPEG, PNG, and PDF are allowed.';
          } else {
            const mimeType = matches[1].toLowerCase();
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            if (!allowedMimeTypes.includes(mimeType)) {
              errors[`${prefix}passportDocument`] = 'Invalid file type. Only JPG, JPEG, PNG, and PDF are allowed.';
            }
            const sizeInBytes = Math.round((docStr.length * 3) / 4);
            if (sizeInBytes > 5 * 1024 * 1024) {
              errors[`${prefix}passportDocument`] = 'Passport document size must be less than 5 MB.';
            }
          }
        }
      });
    }
  }

  // 2. Date and time slot validation
  if (!bookingDate) {
    errors.bookingDate = 'Booking date is required';
  } else {
    const dateObj = new Date(bookingDate);
    if (isNaN(dateObj.getTime())) {
      errors.bookingDate = 'Please provide a valid booking date';
    }
    const day = dateObj.getDay();
    if (day === 0 || day === 6) {
      errors.bookingDate = 'Appointments are closed on weekends';
    }
  }

  if (!bookingTime) {
    errors.bookingTime = 'Booking time is required';
  }

  // 3. Payment proof validation — UPI QR + manual admin verification flow.
  // No card data (number/CVV/expiry) is collected anywhere, since payment
  // happens via UPI app scan outside this system — agent just uploads proof.
  if (!paymentDetails) {
    errors.paymentDetails = 'Payment details are required';
  } else {
    const { transactionId, paymentScreenshot, amount } = paymentDetails;

    // UPI transaction reference (UTR) is typically 12 digits, but some
    // apps (GPay/PhonePe/Paytm) show alphanumeric refs too — keep it
    // reasonably strict without being overly rigid.
    if (!transactionId || !/^[A-Za-z0-9]{6,25}$/.test(transactionId.trim())) {
      errors.transactionId = 'Please provide a valid UPI transaction / UTR number';
    }

    if (amount === undefined || amount === null || isNaN(amount) || Number(amount) <= 0) {
      errors.amount = 'A valid payment amount is required';
    }

    if (!paymentScreenshot) {
      errors.paymentScreenshot = 'Payment screenshot is required';
    } else {
      const matches = paymentScreenshot.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        errors.paymentScreenshot = 'Invalid screenshot format. Only JPG, JPEG, and PNG are allowed.';
      } else {
        const mimeType = matches[1].toLowerCase();
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedMimeTypes.includes(mimeType)) {
          errors.paymentScreenshot = 'Invalid file type. Only JPG, JPEG, and PNG are allowed.';
        }
        const sizeInBytes = Math.round((paymentScreenshot.length * 3) / 4);
        if (sizeInBytes > 5 * 1024 * 1024) {
          errors.paymentScreenshot = 'Screenshot size must be less than 5 MB.';
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateAgentRegister = (req, res, next) => {
  const { agencyName, ownerName, email, mobile, gstNumber, panNumber, aadharNumber, address, city, state, country } = req.body;
  const errors = {};

  if (!agencyName || agencyName.trim().length < 2) {
    errors.agencyName = 'Agency name must be at least 2 characters long';
  }

  if (!ownerName || ownerName.trim().length < 2) {
    errors.ownerName = 'Owner name must be at least 2 characters long';
  }

  if (!email || !validator.isEmail(email.trim())) {
    errors.email = 'Please provide a valid business email address';
  }

  if (!isValidPhone(mobile)) {
    errors.mobile = 'Please provide a valid mobile number (e.g. +91 9876543210)';
  }

  if (gstNumber && gstNumber.trim()) {
    if (!isValidGst(gstNumber)) {
      errors.gstNumber = 'Please provide a valid GST number (e.g. 22AAAAA0000A1Z5)';
    }
  }

  if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
    errors.panNumber = 'Please provide a valid 10-character PAN number (e.g. ABCDE1234F)';
  }

  if (!aadharNumber || !/^[0-9]{12}$/.test(aadharNumber.trim().replace(/\s+/g, ''))) {
    errors.aadharNumber = 'Aadhar number must be exactly 12 digits';
  }

  if (!address || address.trim().length < 5) {
    errors.address = 'Office Address must be at least 5 characters long';
  }

  if (!city || city.trim().length < 2) {
    errors.city = 'City is required';
  }

  if (!state || state.trim().length < 2) {
    errors.state = 'State is required';
  }

  if (!country || country.trim().length < 2) {
    errors.country = 'Country is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateBooking,
  validateAgentRegister,
};