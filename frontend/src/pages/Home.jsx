import React from 'react';
import { Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { MapPin, Clock, ShieldAlert, Award, FileText, CheckCircle } from 'lucide-react';
import InstagramAnnouncementBar from './InstagramAnnouncementBar';

export default function Home() {
  return (
    <div>
      <InstagramAnnouncementBar />
      <Hero 
        title="Attend a Centre - Coimbatore" 
        subtitle="Official UK Visa Application Centre details and booking information" 
      />
      <div className="container">
        
        {/* Call to Action Bar */}
        <div style={{
          backgroundColor: '#f1f5f9',
          borderLeft: '4px solid #e86020',
          padding: '20px',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '40px'
        }}>
          <div style={{ flex: '1 1 500px' }}>
            <h2 style={{ fontSize: '18px', color: '#0c2340', fontWeight: 'bold', marginBottom: '5px' }}>
              Ready to submit your visa application?
            </h2>
            <p style={{ color: '#555', fontSize: '14px' }}>
              Ensure you have registered on GOV.UK, paid your application fees, and are ready to book your biometric appointment at the Coimbatore Centre.
            </p>
          </div>
          <div>
            <Link to="/book" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '16px' }}>
              Book Appointment Now
            </Link>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid-cols-3">
          
          Card 1: Address & Location
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <MapPin size={24} style={{ color: '#e86020' }} />
              <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Centre Address</h3>
            </div>
            <p style={{ fontWeight: '600', color: '#0c2340', marginBottom: '8px' }}>
              UK Visa Application Centre - Coimbatore
            </p>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6', marginBottom: '15px' }}>
              Caledon Square – Pricol Properties,<br />
              Door No. 348, 1st Floor, Avinashi Road,<br />
              HUDCO Colony, Peelamedu,<br />
              Coimbatore - 641004, Tamil Nadu, India
            </p>
            <div style={{ fontSize: '13px', color: '#666', borderTop: '1px solid #eee', paddingTop: '10px' }}>
              <strong>Accessibility:</strong> Wheelchair ramps, elevators, and accessible service counters are available inside the facility.
            </div>
          </div>

          {/* Card 2: Operating Hours */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <Clock size={24} style={{ color: '#e86020' }} />
              <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Operating Hours</h3>
            </div>
            <div className="details-list" style={{ fontSize: '14px' }}>
              <div className="details-item" style={{ flexDirection: 'column', marginBottom: '12px' }}>
                <span className="details-label" style={{ width: '100%' }}>Business/Submission Hours:</span>
                <span className="details-value">Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)</span>
              </div>
              <div className="details-item" style={{ flexDirection: 'column', marginBottom: '12px' }}>
                <span className="details-label" style={{ width: '100%' }}>Standard Passport Collection:</span>
                <span className="details-value">Monday to Friday: 08:00 – 15:00</span>
              </div>
              <div className="details-item" style={{ flexDirection: 'column' }}>
                <span className="details-label" style={{ width: '100%' }}>Prime Time Passport Collection:</span>
                <span className="details-value" style={{ color: '#e86020', fontWeight: '600' }}>
                  Monday to Friday: 16:00 – 18:00 (Additional service fee applies)
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Security & Access */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <ShieldAlert size={24} style={{ color: '#e86020' }} />
              <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Security Regulations</h3>
            </div>
            <ul style={{ fontSize: '13px', color: '#555', paddingLeft: '18px', lineHeight: '1.6' }}>
              <li style={{ marginBottom: '8px' }}>Only applicants are permitted inside (except for minor children under 18, elderly, or disabled individuals).</li>
              <li style={{ marginBottom: '8px' }}>Mobile phones, laptops, tablets, smartwatches, and cameras are strictly prohibited inside. Mobile phones must be switched off.</li>
              <li style={{ marginBottom: '8px' }}>Large bags, luggage, and backpacks cannot be taken inside. Storage lockers may be rented at the centre (limited availability).</li>
              <li>Sharp objects, sealed envelopes, and inflammable items are not allowed.</li>
            </ul>
          </div>

        </div>

        {/* Value-Added Services Section */}
        <div style={{ marginTop: '60px' }}>
          <h2 style={{ fontSize: '24px', color: '#0c2340', fontWeight: 'bold', marginBottom: '20px', borderBottom: '3px solid #e86020', paddingBottom: '8px', display: 'inline-block' }}>
            Value-Added Premium Services
          </h2>
          <p style={{ color: '#666', fontSize: '15px', marginBottom: '25px' }}>
            To make your application journey more convenient and comfortable at the Coimbatore Centre, you can opt for these optional services. You can select and pay for these during your booking flow.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
            
            {/* Service 1 */}
            <div style={{ display: 'flex', gap: '15px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
              <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '10px', borderRadius: '50%', height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Award size={24} />
              </div>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>Premium Lounge Service</h4>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
                  Enjoy personalized attention, dedicated submission counters, document scanning assistance, complimentary photocopies, and refreshments in a comfortable private lounge.
                </p>
                <span style={{ fontWeight: 'bold', color: '#e67e22' }}>INR 3,250</span>
              </div>
            </div>

            {/* Service 2 */}
            <div style={{ display: 'flex', gap: '15px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
              <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '10px', borderRadius: '50%', height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={24} />
              </div>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>Document Scanning Assistance</h4>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
                  Let our staff scan and upload your supporting documents to the official system, ensuring they meet the high resolution and formatting requirements of UKVI.
                </p>
                <span style={{ fontWeight: 'bold', color: '#e67e22' }}>INR 950</span>
              </div>
            </div>

            {/* Service 3 */}
            <div style={{ display: 'flex', gap: '15px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
              <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '10px', borderRadius: '50%', height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>Courier Return Service</h4>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
                  Have your processed passport and documents delivered securely to your doorstep or office, saving you another trip to the application centre.
                </p>
                <span style={{ fontWeight: 'bold', color: '#e67e22' }}>INR 650</span>
              </div>
            </div>

            {/* Service 4 */}
            <div style={{ display: 'flex', gap: '15px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
              <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '10px', borderRadius: '50%', height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>SMS Notification Service</h4>
                <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px' }}>
                  Receive automated text updates at key milestones: when your passport leaves the centre, arrives at the decision centre, and is returned.
                </p>
                <span style={{ fontWeight: 'bold', color: '#e67e22' }}>INR 250</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
