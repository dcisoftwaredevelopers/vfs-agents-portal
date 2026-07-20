import React, { useState } from 'react';
import Hero from '../components/Hero';
import { Search, MapPin, Clock, CheckCircle, Truck } from 'lucide-react';
import { useLazyTrackApplicationQuery } from '../features/tracking/trackingApiSlice';

const formatTimeTo12Hr = (time24) => {
  if (!time24) return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  const hour = parseInt(parts[0], 10);
  const min = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const hourStr = hour12 < 10 ? `0${hour12}` : hour12;
  return `${hourStr}:${min} ${ampm}`;
};

const getStepIndex = (status) => {
  if (status === 'Processing') return 0;
  if (status === 'Delayed') return 1;
  if (status === 'Proceed') return 2;
  if (status === 'Delivered') return 3;
  return 0;
};

export default function TrackApplication() {
  const [referenceNumber, setReferenceNumber] = useState('');
  const [lastName, setLastName] = useState('');

  const [trackApplication, { data: trackingData, isFetching, error }] = useLazyTrackApplicationQuery();

  const handleTrack = (e) => {
    e.preventDefault();
    trackApplication({ referenceNumber: referenceNumber.trim(), lastName: lastName.trim() });
  };

  const currentStepIdx = trackingData ? getStepIndex(trackingData.applicationStatus) : 0;
  const errorMessage = error?.data?.message || (error ? 'Tracking failed. Please verify your reference number and spelling.' : '');

  return (
    <div>
      <Hero
        title="Track Your Application"
        subtitle="Retrieve real-time processing updates for your visa application"
      />

      <div className="container" style={{ maxWidth: '800px' }}>
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>

          <div className="glass-card-premium animate-slideup" style={{ padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
            <h3 style={{ marginBottom: '15px' }}>Enter Application Details</h3>
            {errorMessage && (
              <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleTrack} style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 0 }}>
                <label className="form-label">Reference Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. VFS-GBR-123456"
                  required
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 250px', marginBottom: 0 }}>
                <label className="form-label">Applicant Last Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter the applicant last name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <button type="submit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 24px' }} disabled={isFetching}>
                  <Search size={18} />
                  {isFetching ? 'Searching...' : 'Track'}
                </button>
              </div>
            </form>
          </div>

          {trackingData && (
            <div className="glass-card-premium animate-fadein" style={{ padding: '30px', marginTop: '20px', borderTop: '4px solid #e86020', borderLeft: '1px solid rgba(12, 35, 64, 0.08)', borderRight: '1px solid rgba(12, 35, 64, 0.08)', borderBottom: '1px solid rgba(12, 35, 64, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '30px' }}>
                <div>
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Application Status</h3>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    Reference: <strong style={{ color: '#0c2340' }}>{trackingData.referenceNumber}</strong>
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    backgroundColor:
                      trackingData.applicationStatus === 'Processing' ? '#ffe8cc' :
                      trackingData.applicationStatus === 'Proceed' ? '#dcfce7' :
                      trackingData.applicationStatus === 'Delivered' ? '#d0ebff' :
                      trackingData.applicationStatus === 'Delayed' ? '#ffe3e3' : '#f1f5f9',
                    color:
                      trackingData.applicationStatus === 'Processing' ? '#fd7e14' :
                      trackingData.applicationStatus === 'Proceed' ? '#15803d' :
                      trackingData.applicationStatus === 'Delivered' ? '#1c7ed6' :
                      trackingData.applicationStatus === 'Delayed' ? '#b91c1c' : '#0c2340',
                    padding: '6px 12px', borderRadius: '50px', fontSize: '14px', fontWeight: 'bold',
                  }}>
                    {trackingData.applicationStatus}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '50px', padding: '0 20px' }}>
                <div style={{ position: 'absolute', top: '20px', left: '40px', right: '40px', height: '4px', backgroundColor: '#e2e8f0', zIndex: 1 }}>
                  <div style={{ width: `${(currentStepIdx / 3) * 100}%`, height: '100%', backgroundColor: '#e86020', transition: 'width 0.4s' }} />
                </div>

                {[
                  { icon: MapPin, label: 'Processing', idx: 0 },
                  { icon: Clock, label: 'Delayed', idx: 1 },
                  { icon: CheckCircle, label: 'Proceed', idx: 2 },
                  { icon: Truck, label: 'Delivered', idx: 3 },
                ].map(({ icon: Icon, label, idx }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, position: 'relative', width: '80px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      backgroundColor: currentStepIdx >= idx ? '#e86020' : '#ffffff',
                      border: currentStepIdx >= idx ? '2px solid #e86020' : '2px solid #e2e8f0',
                      color: currentStepIdx >= idx ? '#ffffff' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={20} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '8px', textAlign: 'center', color: currentStepIdx >= idx ? '#0c2340' : '#666' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', borderTop: '1px solid #eee', paddingTop: '20px', fontSize: '14px' }}>
                <div><strong>Applicant:</strong> {trackingData.applicantName}</div>
                <div><strong>Visa Category:</strong> {trackingData.visaCategory}</div>
                <div><strong>Appointment Date:</strong> {trackingData.bookingDate ? new Date(trackingData.bookingDate).toLocaleDateString('en-GB') : 'N/A'}</div>
                <div><strong>Appointment Time:</strong> {formatTimeTo12Hr(trackingData.bookingTime)}</div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Last Status Update:</strong> {trackingData.updatedAt ? new Date(trackingData.updatedAt).toLocaleString('en-GB') : 'N/A'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}