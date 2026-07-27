import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Building2, Upload } from 'lucide-react';
import {
  selectCurrentUser,
  setCredentials,
  useCompleteProfileMutation,
} from '../features/auth/authSlice';

export default function CompleteProfile() {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [completeProfile, { isLoading }] = useCompleteProfileMutation();

  const [form, setForm] = useState({
    agencyName: user?.agencyName || '',
    ownerName: user?.ownerName || '',
    mobile: user?.mobile || '',
    gstNumber: user?.gstNumber || '',
    panNumber: user?.panNumber || '',
    aadharNumber: user?.aadharNumber || '',
    businessRegNumber: user?.businessRegNumber || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    country: user?.country || 'India',
  });
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!(user.needsProfileCompletion || user.status === 'ProfileIncomplete')) {
      navigate(user.role === 'SUPER_ADMIN' || user.role === 'admin' ? '/admin-dashboard' : '/agent-dashboard');
    }
  }, [user, navigate]);

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const nextErrors = {};
    const emailSafeMobile = form.mobile.replace(/\s+/g, '');

    if (!form.agencyName.trim() || form.agencyName.trim().length < 2) {
      nextErrors.agencyName = 'Agency name must be at least 2 characters';
    }
    if (!form.ownerName.trim() || form.ownerName.trim().length < 2) {
      nextErrors.ownerName = 'Owner name must be at least 2 characters';
    }
    if (!/^\+?[1-9]\d{1,14}$/.test(emailSafeMobile)) {
      nextErrors.mobile = 'Enter a valid mobile number (e.g. +91 9876543210)';
    }
    if (form.gstNumber.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber.trim().toUpperCase())) {
      nextErrors.gstNumber = 'Enter a valid GST number';
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber.trim().toUpperCase())) {
      nextErrors.panNumber = 'Enter a valid PAN number';
    }
    if (!/^\d{12}$/.test(form.aadharNumber.trim().replace(/\s+/g, ''))) {
      nextErrors.aadharNumber = 'Enter a valid 12-digit Aadhaar number';
    }
    if (!form.address.trim() || form.address.trim().length < 5) {
      nextErrors.address = 'Office address must be at least 5 characters';
    }
    if (!form.city.trim()) nextErrors.city = 'City is required';
    if (!form.state.trim()) nextErrors.state = 'State is required';
    if (!form.country.trim()) nextErrors.country = 'Country is required';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setApiError('Logo must be JPG, PNG, GIF, or WebP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setApiError('Logo must be less than 5MB');
      return;
    }

    setLogo(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
    setApiError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setApiError('');

    if (!validateForm()) return;

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'gstNumber' && !value.trim()) return;
      formData.append(key, value);
    });
    if (logo) {
      formData.append('logo', logo);
    }

    try {
      const data = await completeProfile(formData).unwrap();
      dispatch(setCredentials(data));
      navigate('/agent-dashboard');
      window.location.reload();
    } catch (err) {
      if (err?.data?.errors) {
        setErrors(err.data.errors);
        setApiError('Please fix the highlighted fields.');
      } else {
        setApiError(err?.data?.message || err?.error || 'Failed to complete profile.');
      }
    }
  };

  if (!user) return null;

  const fieldStyle = (name) => ({ borderColor: errors[name] ? '#ef4444' : '#cbd5e1' });

  return (
    <div className="container" style={{ maxWidth: '650px', marginTop: '30px', paddingBottom: '50px' }}>
      <div className="glass-card-premium animate-slideup" style={{ padding: '40px', borderTop: '5px solid #dfa015', borderRadius: '8px', boxShadow: '0 20px 40px rgba(12, 35, 64, 0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <Building2 size={40} style={{ color: '#0c2340', marginBottom: '10px' }} />
          <h2 style={{ color: '#0c2340', fontWeight: '800', fontSize: '26px', margin: 0 }}>
            Complete Your Profile
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '5px' }}>
            Add the required agency details to finish your Google registration.
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
            <Field label="Agency Name *" name="agencyName" value={form.agencyName} onChange={updateField} error={errors.agencyName} style={fieldStyle('agencyName')} />
            <Field label="Owner Name *" name="ownerName" value={form.ownerName} onChange={updateField} error={errors.ownerName} style={fieldStyle('ownerName')} />
            <Field label="Mobile Number *" name="mobile" value={form.mobile} onChange={updateField} error={errors.mobile} style={fieldStyle('mobile')} placeholder="+91 9876543210" />
            <Field label="Business Registration Number (Optional)" name="businessRegNumber" value={form.businessRegNumber} onChange={updateField} error={errors.businessRegNumber} />
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Tax & Legal Registrations
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <Field label="GST Number (Optional)" name="gstNumber" value={form.gstNumber} onChange={(name, value) => updateField(name, value.toUpperCase())} error={errors.gstNumber} style={fieldStyle('gstNumber')} placeholder="27AAAAA1111A1Z1" />
            <Field label="PAN Number *" name="panNumber" value={form.panNumber} onChange={(name, value) => updateField(name, value.toUpperCase())} error={errors.panNumber} style={fieldStyle('panNumber')} placeholder="ABCDE1234F" />
            <Field label="Aadhaar Number *" name="aadharNumber" value={form.aadharNumber} onChange={updateField} error={errors.aadharNumber} style={fieldStyle('aadharNumber')} placeholder="123456789012" />
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Office Address
          </h4>

          <Field label="Office Address *" name="address" value={form.address} onChange={updateField} error={errors.address} style={fieldStyle('address')} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <Field label="City *" name="city" value={form.city} onChange={updateField} error={errors.city} style={fieldStyle('city')} />
            <Field label="State *" name="state" value={form.state} onChange={updateField} error={errors.state} style={fieldStyle('state')} />
            <Field label="Country *" name="country" value={form.country} onChange={updateField} error={errors.country} style={fieldStyle('country')} />
          </div>

          <h4 style={{ color: '#0c2340', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '15px', marginTop: '30px', fontSize: '15px', fontWeight: '700' }}>
            Brand Logo
          </h4>

          <div className="form-group" style={{ marginBottom: '25px' }}>
            <label className="form-label">Company Logo (Optional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px dashed #cbd5e1', backgroundColor: '#f8fafc', color: '#64748b', cursor: 'pointer', padding: '8px 12px', fontSize: '13px' }}>
                <Upload size={16} /> Choose File
                <input type="file" onChange={handleLogoUpload} style={{ display: 'none' }} accept="image/*" />
              </label>
              {logoPreview && (
                <img src={logoPreview} alt="Preview" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#0c2340', color: '#ffffff' }}
            disabled={isLoading}
          >
            {isLoading ? 'Submitting Profile...' : 'Submit Profile for Verification'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, error, style = {}, placeholder = '' }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-control"
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        style={style}
        placeholder={placeholder}
      />
      {error && <span style={{ color: '#ef4444', fontSize: '11px' }}>{error}</span>}
    </div>
  );
}
