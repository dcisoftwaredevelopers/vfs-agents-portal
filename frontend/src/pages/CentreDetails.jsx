import React from 'react';
import { Link, useParams } from 'react-router-dom';
import Hero from '../components/Hero';
import { MapPin, Clock, ShieldAlert, Award, FileText, CheckCircle } from 'lucide-react';

const CENTRE_DATA = {
  delhi: {
    city: 'delhi',
    displayName: 'Delhi',
    title: 'Attend a Centre ',
    centreName: 'UK Visa Application Centre ',
    address: [
      'Shivaji Stadium Metro Station, Concourse Level,',
      'Baba Kharak Singh Marg, Connaught Place,',
      'New Delhi - 110001, India'
    ],
    accessibility: 'Wheelchair ramps, elevators, and accessible service counters are available inside the facility.',
    submissionHours: 'Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)',
    collectionHours: 'Monday to Friday: 08:00 – 15:00',
    primeTimeCollectionHours: 'Monday to Friday: 16:00 – 18:00 (Additional service fee applies)'
  },
  mumbai: {
    city: 'mumbai',
    displayName: 'Mumbai',
    title: 'Attend a Centre - Mumbai',
    centreName: 'UK Visa Application Centre - Mumbai',
    address: [
      'Trade Centre, G-Block, Ground Floor,',
      'Bandra Kurla Complex, Bandra (East),',
      'Mumbai - 400051, India'
    ],
    accessibility: 'Step-free access, automated entry doors, and dedicated disabled assistance services are available.',
    submissionHours: 'Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)',
    collectionHours: 'Monday to Friday: 08:00 – 15:00',
    primeTimeCollectionHours: 'Monday to Friday: 16:00 – 18:00 (Additional service fee applies)'
  },
  bangalore: {
    city: 'bangalore',
    displayName: 'Bangalore',
    title: 'Attend a Centre - Bangalore',
    centreName: 'UK Visa Application Centre - Bangalore',
    address: [
      'Gopalan Innovation Mall, 22,',
      'Bannerghatta Main Road, JP Nagar 3rd Phase,',
      'Bangalore - 560076, India'
    ],
    accessibility: 'Mall-integrated lifts, wheelchair availability, and tactile flooring are provided.',
    submissionHours: 'Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)',
    collectionHours: 'Monday to Friday: 08:00 – 15:00',
    primeTimeCollectionHours: 'Monday to Friday: 16:00 – 18:00 (Additional service fee applies)'
  },
  hyderabad: {
    city: 'hyderabad',
    displayName: 'Hyderabad',
    title: 'Attend a Centre - Hyderabad',
    centreName: 'UK Visa Application Centre - Hyderabad',
    address: [
      '8-2-248/1/7/25, 2nd Floor, Uptown Cyber,',
      'Road No. 3, Banjara Hills,',
      'Hyderabad - 500034, India'
    ],
    accessibility: 'Elevator access, clear signage, and dedicated helper staff are available on-site.',
    submissionHours: 'Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)',
    collectionHours: 'Monday to Friday: 08:00 – 15:00',
    primeTimeCollectionHours: 'Monday to Friday: 16:00 – 18:00 (Additional service fee applies)'
  },
  chennai: {
    city: 'chennai',
    displayName: 'Chennai',
    title: 'Attend a Centre - Chennai',
    centreName: 'UK Visa Application Centre - Chennai',
    address: [
      'Fagun Towers, Third Floor, No. 74,',
      'Ethiraj Salai, Egmore,',
      'Chennai - 600008, India'
    ],
    accessibility: 'Ramp entrance, accessible toilets, and designated priority seating are available.',
    submissionHours: 'Monday to Friday: 08:00 – 14:00 (Pre-booked slots only)',
    collectionHours: 'Monday to Friday: 08:00 – 15:00',
    primeTimeCollectionHours: 'Monday to Friday: 16:00 – 18:00 (Additional service fee applies)'
  }
};

export default function CentreDetails() {
  const { city } = useParams();
  const rawCity = city ? city.toLowerCase() : 'Applicants';
  
  // Normalise variations like "hyderbad" to "hyderabad"
  let matchedCity = rawCity;
  if (rawCity === 'hyderbad') {
    matchedCity = 'hyderabad';
  }

  const activeCentre = CENTRE_DATA[matchedCity] || CENTRE_DATA['Applicants'];

  return (
    <div>
      <Hero 
        title={activeCentre.title} 
        subtitle={`Official UK Visa Application Centre details and booking information for ${activeCentre.displayName}`} 
      />
      <div className="container">

        {/* Dynamic Location Quick Selector Tabs */}
        <div style={{
          display: 'none',
          justifyContent: 'center',
          gap: '12px',
          marginBottom: '35px',
          flexWrap: 'wrap',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '20px'
        }}>
          {Object.values(CENTRE_DATA).map((centre) => (
            <Link
              key={centre.city}
              to={`/attend-centre/${centre.city}`}
              style={{
                padding: '10px 22px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '14px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                backgroundColor: activeCentre.city === centre.city ? '#0c2340' : '#f8fafc',
                color: activeCentre.city === centre.city ? '#ffffff' : '#475569',
                border: activeCentre.city === centre.city ? '2px solid #0c2340' : '2px solid #cbd5e1',
                boxShadow: activeCentre.city === centre.city ? '0 4px 10px rgba(12, 35, 64, 0.2)' : 'none'
              }}
            >
              {centre.displayName}
            </Link>
          ))}
        </div>
        
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
              Ensure you have registered on GOV.UK, paid your application fees, and are ready to book your biometric appointment at the {activeCentre.displayName} Centre.
            </p>
          </div>
          <div>
            <Link to="/book" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '16px' }}>
              Book Appointment Now
            </Link>
          </div>
        </div>

        {/* Main Layout Grid */}
        <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '20px' }}>
          
          {/* Left Column - Main Info & Services */}
          <div style={{ flex: '2 1 650px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
            
            
             {/* Info Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          











              

              {/* Card 2: Operating Hours */}
              <div className="card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <Clock size={24} style={{ color: '#e86020' }} />
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Operating Hours</h3>
                </div>
                <div className="details-list" style={{ fontSize: '14px' }}>
                  <div className="details-item" style={{ flexDirection: 'column', marginBottom: '12px', alignItems: 'flex-start' }}>
                    <span className="details-label" style={{ width: '100%', textAlign: 'left' }}>Business/Submission Hours:</span>
                    <span className="details-value" style={{ textAlign: 'left' }}>{activeCentre.submissionHours}</span>
                  </div>
                  <div className="details-item" style={{ flexDirection: 'column', marginBottom: '12px', alignItems: 'flex-start' }}>
                    <span className="details-label" style={{ width: '100%', textAlign: 'left' }}>Standard Passport Collection:</span>
                    <span className="details-value" style={{ textAlign: 'left' }}>{activeCentre.collectionHours}</span>
                  </div>
                  <div className="details-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span className="details-label" style={{ width: '100%', textAlign: 'left' }}>Prime Time Passport Collection:</span>
                    <span className="details-value" style={{ color: '#e86020', fontWeight: '600', textAlign: 'left' }}>
                      {activeCentre.primeTimeCollectionHours}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Security & Access */}
              <div className="card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <ShieldAlert size={24} style={{ color: '#e86020' }} />
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Security Regulations</h3>
                </div>
                <ul style={{ fontSize: '13px', color: '#555', paddingLeft: '18px', lineHeight: '1.6', textAlign: 'left' }}>
                  <li style={{ marginBottom: '8px' }}>Only applicants are permitted inside (except for minor children under 18, elderly, or disabled individuals).</li>
                  <li style={{ marginBottom: '8px' }}>Mobile phones, laptops, tablets, smartwatches, and cameras are strictly prohibited inside. Mobile phones must be switched off.</li>
                  <li style={{ marginBottom: '8px' }}>Large bags, luggage, and backpacks cannot be taken inside. Storage lockers may be rented at the centre (limited availability).</li>
                  <li>Sharp objects, sealed envelopes, and inflammable items are not allowed.</li>
                </ul>
              </div>
            </div>

            {/* Value-Added Services Section */}
            <div>
              <h2 style={{ fontSize: '24px', color: '#0c2340', fontWeight: 'bold', marginBottom: '20px', borderBottom: '3px solid #e86020', paddingBottom: '8px', display: 'inline-block', textAlign: 'left' }}>
                Value-Added Premium Services
              </h2>
              <p style={{ color: '#666', fontSize: '15px', marginBottom: '25px', textAlign: 'left' }}>
                To make your application journey more convenient and comfortable at the {activeCentre.displayName} Centre, you can opt for these optional services. You can select and pay for these during your booking flow.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                {/* Service 1 */}
                <div style={{ display: 'flex', gap: '15px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
                  <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '10px', borderRadius: '50%', height: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Award size={24} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
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
                  <div style={{ textAlign: 'left' }}>
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
                  <div style={{ textAlign: 'left' }}>
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
                  <div style={{ textAlign: 'left' }}>
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

          {/* Right Column - Sidebar (News & Banner) */}
          <div style={{ flex: '1 1 300px', minWidth: '300px', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* News Section */}
            <div className="card" style={{ padding: '24px', textAlign: 'left', margin: 0 }}>
              <h2 style={{ fontSize: '24px', color: '#0c2340', fontWeight: 'bold', margin: '0 0 20px 0', border: 'none', padding: 0 }}>
                News
              </h2>
              
              {/* News Item 1 */}
              <div style={{ marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
                <div style={{ fontSize: '12px', color: '#718096', marginBottom: '6px' }}>17 March 2026</div>
                <h4 style={{ fontSize: '14px', color: '#0c2340', fontWeight: 'bold', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                  Australian Biometric Collection Centre(s) – Service Fees Update
                </h4>
                <a href="#" style={{ fontSize: '13px', color: '#e86020', fontWeight: '600', textDecoration: 'underline' }} onClick={(e) => e.preventDefault()}>
                  Continue reading →
                </a>
              </div>

              {/* News Item 2 */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: '#718096', marginBottom: '6px' }}>27 September 2024</div>
                <h4 style={{ fontSize: '14px', color: '#0c2340', fontWeight: 'bold', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                  Australian Biometric Collection Centre, Algeria, Security Regulations Update
                </h4>
                <a href="#" style={{ fontSize: '13px', color: '#e86020', fontWeight: '600', textDecoration: 'underline' }} onClick={(e) => e.preventDefault()}>
                  Continue reading →
                </a>
              </div>
            </div>

            {/* Travel Insurance Promotional Banner */}
            <div style={{ borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <a href="#" onClick={(e) => e.preventDefault()} style={{ display: 'block' }}>
                <img 
                  src="/travel_insurance.jpg" 
                  alt="Secure your overseas trip with Travel Medical Insurance" 
                  style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
              </a>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
