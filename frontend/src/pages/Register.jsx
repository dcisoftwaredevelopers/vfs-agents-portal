import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, User, Mail, Phone, MapPin, ShieldCheck, FileText, Lock, Eye, EyeOff, Upload } from 'lucide-react';
import { API_BASE_URL } from '../features/apiSlice';

export default function Register() {
  const [agencyName, setAgencyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [businessRegNumber, setBusinessRegNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [referralCode, setReferralCode] = useState('');
  const [logo, setLogo] = useState(null); // Store File object
  const [logoPreview, setLogoPreview] = useState(''); // For preview
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if logged in
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('userInfo'));
    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        navigate('/admin-dashboard');
      } else {
        navigate('/agent-dashboard');
      }
    }
  }, [navigate]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setApiError('Logo must be JPG, PNG, GIF, or WebP');
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setApiError('Logo must be less than 5MB');
        return;
      }

      // Store file object and preview
      setLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
      setApiError(''); // Clear errors
      console.log('Logo file selected:', file.name, file.size, 'bytes');
    }
  };

  const validateForm = () => {
    const tempErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!agencyName.trim() || agencyName.length < 2) {
      tempErrors.agencyName = 'Agency name must be at least 2 characters';
    }
    if (!ownerName.trim() || ownerName.length < 2) {
      tempErrors.ownerName = 'Owner name must be at least 2 characters';
    }
    if (!emailRegex.test(email)) {
      tempErrors.email = 'Please enter a valid email address';
    }
    if (!mobile.trim() || !/^\+?[1-9]\d{1,14}$/.test(mobile.replace(/\s+/g, ''))) {
      tempErrors.mobile = 'Enter a valid mobile number (e.g. +91 9876543210)';
    }
    if (referralCode.trim() && !/^[A-Z0-9-]{6,20}$/.test(referralCode.trim())) {
      tempErrors.referralCode = 'Referral code must contain only letters, numbers and dashes.';
    }
    if (gstNumber.trim() && gstNumber.length !== 15) {
      tempErrors.gstNumber = 'GST Number must be exactly 15 characters when provided';
    }
    if (!panNumber.trim() || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
      tempErrors.panNumber = 'Enter a valid 10-character PAN number (e.g. ABCDE1234F)';
    }
    if (!aadharNumber.trim() || !/^\d{12}$/.test(aadharNumber.trim().replace(/\s+/g, ''))) {
      tempErrors.aadharNumber = 'Enter a valid 12-digit Aadhaar number';
    }
    if (!address.trim() || address.length < 5) {
      tempErrors.address = 'Office Address must be at least 5 characters';
    }
    if (!city.trim()) tempErrors.city = 'City is required';
    if (!state.trim()) tempErrors.state = 'State is required';
    if (!country.trim()) tempErrors.country = 'Country is required';

    if (!password) {
      tempErrors.password = 'Password is required';
    } else if (password.length < 8) {
      tempErrors.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      tempErrors.confirmPassword = 'Passwords do not match';
    }
    if (!agreeTerms) {
      tempErrors.agreeTerms = 'You must agree to the Terms & Conditions';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) return;
    setLoading(true);

    try {
      setLoading(true);
      
      // Create FormData to send file
      const formData = new FormData();
      formData.append('agencyName', agencyName);
      formData.append('ownerName', ownerName);
      formData.append('email', email);
      formData.append('mobile', mobile);
      formData.append('referralCode', referralCode.trim());
      if (gstNumber.trim()) {
        formData.append('gstNumber', gstNumber.trim());
      }
      formData.append('panNumber', panNumber);
      formData.append('aadharNumber', aadharNumber.trim());
      formData.append('businessRegNumber', businessRegNumber);
      formData.append('address', address);
      formData.append('city', city);
      formData.append('state', state);
      formData.append('country', country);
      formData.append('password', password);
      
      // Add logo file if selected
      if (logo) {
        formData.append('logo', logo);
        console.log('Appending logo file to FormData:', logo.name);
      }

      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        body: formData // Send FormData instead of JSON
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors);
          throw new Error('Please fix registration errors.');
        }
        throw new Error(data.message || 'Registration failed');
      }

      localStorage.setItem('userInfo', JSON.stringify(data));
      navigate('/agent-dashboard');
      window.location.reload();
    } catch (err) {
      setApiError(err.message || 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '650px', marginTop: '30px', paddingBottom: '50px' }}>
      <div className="glass-card-premium animate-slideup" style={{ padding: '40px', borderTop: '5px solid #dfa015', borderLeft: '1px solid rgba(12, 35, 64, 0.05)', borderRight: '1px solid rgba(12, 35, 64, 0.05)', borderBottom: '1px solid rgba(12, 35, 64, 0.05)', borderRadius: '8px', boxShadow: '0 20px 40px rgba(12, 35, 64, 0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Building2 size={40} style={{ color: '#0c2340', marginBottom: '10px' }} />
          <h2 style={{ color: '#0c2340', fontWeight: '800', fontSize: '26px', margin: 0 }}>
            Register Agent
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '5px' }}>
            Become a partner agent to book visa appointments for your clients.
          </p>
        </div>

        {apiError && (
          <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          
          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', fontSize: '15px', fontWeight: '700' }}>
            Agency & Owner Information
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Agency Name *</label>
              <input 
                type="text" 
                className="form-control" 
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                style={{ borderColor: errors.agencyName ? '#ef4444' : '#cbd5e1' }}
                required 
              />
              {errors.agencyName && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.agencyName}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Owner Name *</label>
              <input 
                type="text" 
                className="form-control" 
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                style={{ borderColor: errors.ownerName ? '#ef4444' : '#cbd5e1' }}
                required 
              />
              {errors.ownerName && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.ownerName}</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Business Email *</label>
              <input 
                type="email" 
                className="form-control" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ borderColor: errors.email ? '#ef4444' : '#cbd5e1' }}
                required 
              />
              {errors.email && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.email}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Mobile Number *</label>
              <input 
                type="text" 
                className="form-control" 
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                style={{ borderColor: errors.mobile ? '#ef4444' : '#cbd5e1' }}
                placeholder="+91 9876543210"
                required 
              />
              {errors.mobile && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.mobile}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Referral Code (Optional)</label>
              <input
                type="text"
                className="form-control"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                style={{ borderColor: errors.referralCode ? '#ef4444' : '#cbd5e1' }}
                placeholder="Enter referral code"
              />
              {errors.referralCode && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.referralCode}</span>}
            </div>
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Tax & Legal Registrations
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">GST Number (Optional)</label>
              <input 
                type="text" 
                className="form-control" 
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                style={{ borderColor: errors.gstNumber ? '#ef4444' : '#cbd5e1' }}
                placeholder="27AAAAA1111A1Z1"
              />
              {errors.gstNumber && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.gstNumber}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">PAN Number *</label>
              <input 
                type="text" 
                className="form-control" 
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                style={{ borderColor: errors.panNumber ? '#ef4444' : '#cbd5e1' }}
                placeholder="ABCDE1234F"
                required 
              />
              {errors.panNumber && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.panNumber}</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Aadhaar Number *</label>
              <input 
                type="text" 
                className="form-control" 
                value={aadharNumber}
                onChange={(e) => setAadharNumber(e.target.value)}
                style={{ borderColor: errors.aadharNumber ? '#ef4444' : '#cbd5e1' }}
                placeholder="e.g. 123456789012"
                required 
              />
              {errors.aadharNumber && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.aadharNumber}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Business Registration Number (Optional)</label>
              <input 
                type="text" 
                className="form-control" 
                value={businessRegNumber}
                onChange={(e) => setBusinessRegNumber(e.target.value)}
                placeholder="Corporate ID or License No."
              />
            </div>
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Office Address Details
          </h4>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">Office Address *</label>
            <input 
              type="text" 
              className="form-control" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ borderColor: errors.address ? '#ef4444' : '#cbd5e1' }}
              placeholder="Suite, building, street address"
              required 
            />
            {errors.address && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.address}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">City *</label>
              <input 
                type="text" 
                className="form-control" 
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ borderColor: errors.city ? '#ef4444' : '#cbd5e1' }}
                required 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">State *</label>
              <input 
                type="text" 
                className="form-control" 
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={{ borderColor: errors.state ? '#ef4444' : '#cbd5e1' }}
                required 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Country *</label>
              <input 
                type="text" 
                className="form-control" 
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ borderColor: errors.country ? '#ef4444' : '#cbd5e1' }}
                required 
              />
            </div>
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Brand Logo & Credentials
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Company Logo (Optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label className="btn" style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  border: '1px dashed #cbd5e1', 
                  backgroundColor: '#f8fafc',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  fontSize: '13px'
                }}>
                  <Upload size={16} /> Choose File
                  <input type="file" onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
                </label>
                {logoPreview && (
                  <img src={logoPreview} alt="Preview" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
              <label className="form-label">Password *</label>
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="form-control" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ borderColor: errors.password ? '#ef4444' : '#cbd5e1' }}
                required 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '10px', top: '35px', background: 'none', border: 'none', color: '#64748b' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {errors.password && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.password}</span>}
            </div>

            <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
              <label className="form-label">Confirm Password *</label>
              <input 
                type={showConfirmPassword ? 'text' : 'password'} 
                className="form-control" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ borderColor: errors.confirmPassword ? '#ef4444' : '#cbd5e1' }}
                required 
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: '10px', top: '35px', background: 'none', border: 'none', color: '#64748b' }}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {errors.confirmPassword && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.confirmPassword}</span>}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '25px' }}>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: '#555', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              I agree to the Terms & Conditions and B2B SaaS usage policies.
            </label>
            {errors.agreeTerms && <span style={{ color: '#ef4444', fontSize: '11px', display: 'block' }}>{errors.agreeTerms}</span>}
          </div> 

          <button 
            type="submit" 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#0c2340', color: '#ffffff' }}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="premium-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#ffffff' }}></span>
                Creating Agent Account...
              </span>
            ) : 'Register Agent'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '14px', color: '#666' }}>
          Already registered? <Link to="/login" style={{ color: '#dfa015', fontWeight: '600' }}>Agent Sign-In</Link>
        </div>
      </div>
    </div>
  );
}
