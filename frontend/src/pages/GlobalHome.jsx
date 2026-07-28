import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, ShieldCheck, Building2, User, KeyRound, ArrowRight, Star, HelpCircle, CheckCircle2, Zap, FolderOpen, Receipt } from 'lucide-react';
import InstagramAnnouncementBar from './InstagramAnnouncementBar';

const COUNTRY_VISA_GUIDES = {
  Australia: {
    flag: '🇦🇺',
    process: 'Complete eligibility assessment, submit application online, pay fees, provide biometrics, and await decision.',
    documents: ['Valid Passport', 'Passport Photos', 'Application Form', 'Bank Statements', 'Employment Proof', 'Income Tax Returns', 'Travel Itinerary']
  },
  Canada: {
    flag: '🇨🇦',
    process: 'Check eligibility, fill online application, upload documents, pay visa fees, submit biometrics, and await processing.',
    documents: ['Valid Passport', 'Passport Photos', 'Bank Statements', 'Employment Letter', 'Salary Slips', 'Tax Returns', 'Proof of Funds', 'Itinerary']
  },
  Schengen: {
    flag: '🇪🇺',
    process: 'Apply at embassy/center of main destination or first entry country. Enables travel across Schengen countries.',
    documents: ['Passport', 'Visa Form', 'Photos', 'Travel Insurance', 'Flight Reservation', 'Hotel Booking', 'Bank Statements', 'Employment Proof']
  },
  UK: {
    flag: '🇬🇧',
    process: 'Submit online application, upload supporting documents, pay visa fee, attend biometric appointment, and await decision.',
    documents: ['Passport', 'Passport Photos', 'Bank Statements', 'Employment Letter', 'Salary Slips', 'Travel Plan', 'Accommodation Details']
  },
  USA: {
    flag: '🇺🇸',
    process: 'Complete DS-160 form online, pay visa fee, schedule & attend biometric appointment and visa interview.',
    documents: ['Passport', 'DS-160 Confirmation', 'Appointment Letter', 'Passport Photo', 'Bank Statements', 'Employment Proof', 'Travel Itinerary']
  },
  China: {
    flag: '🇨🇳',
    process: 'Fill application online, submit documents through Chinese Visa Center, provide biometrics, and await approval.',
    documents: ['Passport', 'Visa Form', 'Photos', 'Bank Statements', 'Flight Tickets', 'Hotel Booking', 'Employment Proof']
  },
  Russia: {
    flag: '🇷🇺',
    process: 'Complete visa application online, get official Visa Support/Invitation, submit at Russian Visa Center/Embassy.',
    documents: ['Passport', 'Visa Form', 'Passport Photo', 'Invitation Letter', 'Bank Statements', 'Travel Insurance', 'Flight/Hotel Booking']
  },
  'South Korea': {
    flag: '🇰🇷',
    process: 'Complete application, submit with required documents to Korean Visa Application Center or Embassy.',
    documents: ['Passport', 'Passport Photos', 'Bank Statements', 'Employment Letter', 'Travel Itinerary', 'Hotel Booking', 'Flight Reservation']
  }
};

const COUNTRY_SELECTOR_ITEMS = [
  { name: 'Australia', flagCode: 'au', tabKey: 'Australia', alt: 'Flag of Australia' },
  { name: 'Canada', flagCode: 'ca', tabKey: 'Canada', alt: 'Flag of Canada' },
  { name: 'China', flagCode: 'cn', tabKey: 'China', alt: 'Flag of China' },
  { name: 'Russia', flagCode: 'ru', tabKey: 'Russia', alt: 'Flag of Russia' },
  { name: 'Schengen', flagCode: 'eu', tabKey: 'Schengen', alt: 'Flag of the European Union' },
  { name: 'South Korea', flagCode: 'kr', tabKey: 'South Korea', alt: 'Flag of South Korea' },
  { name: 'United Kingdom', flagCode: 'gb', tabKey: 'UK', alt: 'Flag of the United Kingdom' },
  { name: 'United States', flagCode: 'us', tabKey: 'USA', alt: 'Flag of the United States' },
];

export default function GlobalHome() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('userInfo'));
  const [activeCountryTab, setActiveCountryTab] = React.useState('UK');

  const handleGetStarted = () => {
    if (user) {
      navigate('/agent-dashboard');
    } else {
      navigate('/register');
    }
  };

  return (
    <div style={{ fontFamily: "'Outfit', 'Inter', sans-serif", color: '#0c2340', backgroundColor: '#ffffff' }}>
      <InstagramAnnouncementBar />
      
      {/* Premium Hero Section */}
      <section className="hero-grand">
        {/* Decorative Background Elements */}
        
        {/* Center Globe / Flight Paths */}
        <div className="animate-slow-rotate" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginWidth: '600px',
          marginHeight: '600px',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          pointerEvents: 'none',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transformOrigin: 'center center'
        }}>
          <svg width="600" height="600" viewBox="0 0 600 600" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="300" cy="300" r="280" strokeDasharray="5 5" />
            <ellipse cx="300" cy="300" rx="200" ry="280" />
            <ellipse cx="300" cy="300" rx="100" ry="280" />
            <line x1="300" y1="20" x2="300" y2="580" />
            <line x1="20" y1="300" x2="580" y2="300" />
            <path d="M50 300 C 50 100, 550 100, 550 300 C 550 500, 50 500, 50 300" stroke="rgba(223,160,21,0.08)" strokeWidth="2" />
            <path d="M100 150 C 200 400, 400 400, 500 150" stroke="rgba(223,160,21,0.06)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="200" cy="270" r="4" fill="rgba(223,160,21,0.15)" />
            <circle cx="450" cy="210" r="3" fill="rgba(255,255,255,0.1)" />
            <circle cx="300" cy="450" r="4.5" fill="rgba(223,160,21,0.15)" />
          </svg>
        </div>

        {/* Left Radar Vector */}
        <div className="animate-slow-drift" style={{
          position: 'absolute',
          bottom: '-30px',
          left: '-40px',
          pointerEvents: 'none',
          zIndex: 1,
          opacity: 0.8
        }}>
          <svg width="240" height="240" viewBox="0 0 240 240" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1.5">
            <circle cx="120" cy="120" r="100" stroke="rgba(223,160,21,0.06)" strokeDasharray="4 4" />
            <circle cx="120" cy="120" r="70" stroke="rgba(255,255,255,0.03)" />
            <circle cx="120" cy="120" r="40" stroke="rgba(223,160,21,0.06)" strokeDasharray="2 2" />
            <line x1="120" y1="20" x2="120" y2="220" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
            <line x1="20" y1="120" x2="220" y2="120" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
            <path d="M120 120 L210 70" stroke="rgba(223,160,21,0.08)" strokeWidth="2" />
          </svg>
        </div>

        {/* Right Dot Grid Vector */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          pointerEvents: 'none',
          zIndex: 1
        }}>
          <svg width="160" height="160" fill="none">
            <defs>
              <pattern id="dot-grid-hero" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="2" fill="rgba(255,255,255,0.05)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid-hero)" />
          </svg>
        </div>

        <div className="animate-slideup" style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2, padding: '0 20px' }}>
          {/* Left Content Column */}
          <div style={{ maxWidth: '680px', textAlign: 'left' }}>
            <span style={{ 
              backgroundColor: 'rgba(223, 160, 21, 0.2)', 
              color: '#dfa015', 
              padding: '6px 16px', 
              borderRadius: '20px', 
              fontSize: '13px', 
              fontWeight: '700', 
              textTransform: 'uppercase', 
              letterSpacing: '1px',
              marginBottom: '20px',
              display: 'inline-block'
            }}>
              Exclusive B2B SaaS Visa Booking Portal
            </span>
            <h1 style={{ fontSize: '48px', fontWeight: '800', lineHeight: '1.25', marginBottom: '25px', color: '#ffffff', letterSpacing: '-0.5px' }}>
              Scale Your Visa Agency With <span className="text-gradient-gold">Dream Catcher Portal</span>
            </h1>
            <p style={{ fontSize: '18px', color: '#f1f5f9', marginBottom: '40px', lineHeight: '1.7' }}>
              Real-time slot monitoring and VFS itinerary support. Exclusively for travel agencies, visa consultants, and immigration experts.
            </p>
   
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <button 
                onClick={handleGetStarted} 
                className="btn btn-gold-gradient shine-effect animate-pulse-glow" 
                style={{
                  padding: '16px 36px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Register Your Agency
              </button>
              <Link 
                to="/login" 
                className="btn btn-glass-outline shine-effect" 
                style={{
                  padding: '16px 36px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Agent Sign-In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SaaS Feature Highlights */}
      <section className="container animate-slideup" style={{ padding: '80px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0c2340', marginBottom: '15px' }}>
            Powerful Agency Booking Engine
          </h2>
          <p style={{ color: '#64748b', fontSize: '16px', maxWidth: '600px', margin: '0 auto' }}>
            Everything your visa consultancy needs to manage and scale operations.
          </p>
        </div>

        <div className="grid-cols-3" style={{ gap: '30px' }}>
          <div className="home-feature-card slot-card">
            <div className="home-feature-icon-wrapper">
              <Zap size={28} />
            </div>
            <h3>Real-time Slot Monitoring</h3>
            <p>
              Query and view real-time visa slot availability across centers instantly. Keep tabs on capacity.
            </p>
          </div>

          <div className="home-feature-card files-card">
            <div className="home-feature-icon-wrapper">
              <FolderOpen size={28} />
            </div>
            <h3>Centralized Client Files</h3>
            <p>
              Upload passports and documents, log internal notes, and track all customer applications in a single secure environment.
            </p>
          </div>

          <div className="home-feature-card tax-card">
            <div className="home-feature-icon-wrapper">
              <Receipt size={28} />
            </div>
            <h3>Automated Tax Invoices</h3>
            <p>
              Provide your GST number at signup to automatically receive valid PDF tax invoices for input tax credits.
            </p>
          </div>
        </div>
      </section>

      {/* Subscription Benefits & Stats */}
      <section id="benefits" className="animate-slideup" style={{ backgroundColor: '#f8fafc', padding: '80px 20px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div className="container">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '50px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 450px' }}>
              <span style={{ color: '#dfa015', fontWeight: '700', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Subscription Benefits
              </span>
              <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0c2340', marginTop: '10px', marginBottom: '20px', lineHeight: '1.3' }}>
                Why Leading Agencies Choose Our Portal
              </h2>
              <p style={{ color: '#64748b', fontSize: '15px', lineHeight: '1.7', marginBottom: '25px' }}>
                We provide a professional, enterprise-level booking portal built on high reliability. Our agents save hours of manual slot-searching every day.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="benefit-item">
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  <span style={{ fontSize: '14px', color: '#334155' }}><strong>98.9% Visa Approval:</strong> Proven high success rate for submitted applications.</span>
                </div>
                <div className="benefit-item">
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  <span style={{ fontSize: '14px', color: '#334155' }}><strong>Transparency:</strong> Fully clear fee structures and application updates.</span>
                </div>
                <div className="benefit-item">
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  <span style={{ fontSize: '14px', color: '#334155' }}><strong>Documentation Support:</strong> Expert checklists and verification.</span>
                </div>
                <div className="benefit-item">
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  <span style={{ fontSize: '14px', color: '#334155' }}><strong>Real-time Processing:</strong> Instant updates on status and processing pipeline.</span>
                </div>
                <div className="benefit-item">
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                  <span style={{ fontSize: '14px', color: '#334155' }}><strong>Access Control:</strong> Automated 30-day billing cycle locks.</span>
                </div>
              </div>
            </div>
            
            <div className="animate-float" style={{ flex: '1 1 350px', display: 'flex', justifyContent: 'center' }}>
              <img 
                src="/benefits_illustration.png" 
                alt="Visa Booking Portal Benefits" 
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto', 
                  borderRadius: '12px', 
                  boxShadow: '0 20px 40px rgba(12, 35, 64, 0.1)',
                  border: '1px solid rgba(12, 35, 64, 0.05)'
                }} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container animate-slideup" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ marginBottom: '50px' }}>
          <span style={{ color: '#dfa015', fontWeight: '700', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Transparent Pricing
          </span>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0c2340', marginTop: '10px' }}>
            Professional Agent Subscription Plan
          </h2>
        </div>

        <div 
          className="glass-card-premium"
          style={{
            maxWidth: '460px',
            margin: '0 auto',
            border: '2px solid #dfa015',
            boxShadow: '0 25px 50px -12px rgba(223, 160, 21, 0.25)',
            padding: '40px 30px',
            position: 'relative'
          }}
        >
          <span style={{
            position: 'absolute',
            top: '-15px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#dfa015',
            color: '#0c2340',
            padding: '4px 16px',
            fontSize: '11px',
            fontWeight: '800',
            textTransform: 'uppercase',
            borderRadius: '12px'
          }}>
            Most Popular
          </span>
          
          <h3 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '10px', border: 'none', padding: 0 }}>Professional Plan</h3>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>Best for active visa processing centers</p>
          
          <div style={{
            display: 'inline-block',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: '#15803d',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '700',
            marginBottom: '15px'
          }}>
            🎯 98.9% Visa Approval Success Rate
          </div>

          <div style={{ margin: '20px 0 30px' }}>
            <span style={{ fontSize: '42px', fontWeight: '800', color: '#0c2340' }}>₹10,000</span>
            <span style={{ color: '#64748b', fontSize: '16px' }}> + GST / Month</span>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>Total Billed: ₹11,800 (₹10,000 base + 18% GST)</div>
          </div>

          <button 
            onClick={handleGetStarted} 
            className="btn btn-navy-gradient shine-effect" 
            style={{
              width: '100%',
              padding: '14px',
              fontWeight: '700',
              borderRadius: '8px',
              marginBottom: '30px',
              fontSize: '15px'
            }}
          >
            Subscribe & Start Booking
          </button>

          <ul style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '15px', paddingLeft: 0, listStyle: 'none' }}>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px', fontWeight: '600' }}>
              <span style={{ color: '#10b981' }}>✔</span> 98.9% Visa Approval Success Rate
            </li>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#10b981' }}>✔</span> Unlimited Slot Searches
            </li>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#10b981' }}>✔</span> Priority Slot Reservation Locking
            </li>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#10b981' }}>✔</span> Central Agent Client Manager
            </li>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#10b981' }}>✔</span> Fast Document Upload & Tracking
            </li>
            <li style={{ fontSize: '13px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#10b981' }}>✔</span> Downloadable GST Invoices
            </li>
          </ul>
        </div>
      </section>


      {/* Country Visa Guide Section */}
      <section className="animate-slideup" style={{ backgroundColor: '#f8fafc', padding: '80px 20px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div className="container" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span style={{ color: '#dfa015', fontWeight: '700', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quick Reference
            </span>
            <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0c2340', marginTop: '10px' }}>
              Country-Specific Visa Requirements
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', marginTop: '10px' }}>
              Select a country to view a simplified application process and standard document checklist.
            </p>
          </div>

          <style>{`
            .country-selector-row {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 14px;
              margin-bottom: 35px;
            }
            .country-selector-card {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              gap: 10px;
              width: 100%;
              min-height: 56px;
              padding: 12px 14px;
              background-color: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 999px;
              box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
              cursor: pointer;
              transition: transform 300ms ease, box-shadow 300ms ease, border-color 300ms ease, background-color 300ms ease;
              text-align: left;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .country-selector-card:hover,
            .country-selector-card:focus-visible,
            .country-selector-card.active {
              transform: translateY(-4px);
              border-color: #dfa015;
              background-color: #fff8e8;
              box-shadow: 0 16px 30px rgba(223, 160, 21, 0.16);
            }
            .country-selector-card:focus-visible {
              outline: none;
              box-shadow: 0 0 0 3px rgba(223, 160, 21, 0.25), 0 16px 30px rgba(223, 160, 21, 0.16);
            }
            .country-selector-flag {
              width: 42px;
              height: 42px;
              border-radius: 50%;
              object-fit: cover;
              border: 2px solid #ffffff;
              box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12);
              transition: transform 300ms ease;
              flex-shrink: 0;
            }
            .country-selector-card:hover .country-selector-flag,
            .country-selector-card:focus-visible .country-selector-flag,
            .country-selector-card.active .country-selector-flag {
              transform: scale(1.08);
            }
            .country-selector-name {
              font-size: 13px;
              font-weight: 700;
              color: #0c2340;
              line-height: 1.2;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            @media (max-width: 1024px) {
              .country-selector-row {
                grid-template-columns: repeat(4, minmax(0, 1fr));
              }
              .country-selector-flag {
                width: 38px;
                height: 38px;
              }
              .country-selector-card {
                min-height: 52px;
                padding: 10px 12px;
              }
            }
            @media (max-width: 768px) {
              .country-selector-row {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
            @media (max-width: 480px) {
              .country-selector-row {
                grid-template-columns: 1fr;
              }
              .country-selector-flag {
                width: 34px;
                height: 34px;
              }
            }
          `}</style>

          <div className="country-selector-row" role="list" aria-label="Select a country">
            {COUNTRY_SELECTOR_ITEMS.map((country) => {
              const isActive = activeCountryTab === country.tabKey;
              return (
                <button
                  key={country.tabKey}
                  type="button"
                  className={`country-selector-card${isActive ? ' active' : ''}`}
                  onClick={() => setActiveCountryTab(country.tabKey)}
                  aria-pressed={isActive}
                >
                  <img
                    src={`https://flagcdn.com/w80/${country.flagCode}.png`}
                    alt={country.alt}
                    className="country-selector-flag"
                    loading="lazy"
                  />
                  <span className="country-selector-name">{country.name}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Card */}
          <div 
            className="glass-card-premium animate-fadein"
            style={{ 
              padding: '35px', 
              border: '1px solid rgba(12, 35, 64, 0.08)',
              boxShadow: '0 15px 30px rgba(12, 35, 64, 0.05)'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: '800', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> Application Process
                </h4>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.7', margin: 0 }}>
                  {COUNTRY_VISA_GUIDES[activeCountryTab].process}
                </p>
              </div>
              <div>
                <h4 style={{ color: '#0c2340', fontWeight: '800', fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📂</span> Standard Document Checklist
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {COUNTRY_VISA_GUIDES[activeCountryTab].documents.map((doc, idx) => (
                    <span 
                      key={idx} 
                      style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        color: '#0c2340', 
                        backgroundColor: '#f1f5f9', 
                        padding: '6px 12px', 
                        borderRadius: '20px',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      {doc}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="container animate-slideup" style={{ padding: '80px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#0c2340', marginBottom: '10px' }}>Frequently Asked Questions</h2>
          <p style={{ color: '#64748b', fontSize: '15px' }}>Partner onboarding process and quick answers to common queries</p>
        </div>

        {/* Timeline Scroll Progress */}
        <div className="timeline-scroll" style={{ marginBottom: '60px' }}>
          <div className="timeline-track-line animate-expand-horizontally"></div>
          <div className="timeline-nodes">
            <div className="timeline-node-item">
              <div className="timeline-circle">1</div>
              <div className="timeline-title">Register Account</div>
              <div className="timeline-desc">Provide your agency profile details and register in seconds.</div>
            </div>
            <div className="timeline-node-item">
              <div className="timeline-circle">2</div>
              <div className="timeline-title">Admin Review</div>
              <div className="timeline-desc">Our backend team reviews and approves your partner access.</div>
            </div>
            <div className="timeline-node-item">
              <div className="timeline-circle">3</div>
              <div className="timeline-title">Pay Subscription</div>
              <div className="timeline-desc">Submit UPI proof of payment to activate standard features.</div>
            </div>
            <div className="timeline-node-item">
              <div className="timeline-circle">4</div>
              <div className="timeline-title">Start Booking</div>
              <div className="timeline-desc">Unlock 24/7 slot monitoring and start booking client dates.</div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0c2340', marginBottom: '8px' }}>Who is this portal for?</h4>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
              This portal is exclusively designed for B2B visa consultants, immigration companies, and travel agencies who book and manage UK visa applications for their clients.
            </p>
          </div>
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0c2340', marginBottom: '8px' }}>How long is the subscription valid and how does renewal work?</h4>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
              The subscription is valid for exactly 30 days from activation. You can renew before expiration to extend your validity. If you renew after expiration, the new 30 days start from the day of renewal.
            </p>
          </div>
          <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0c2340', marginBottom: '8px' }}>What happens when my subscription expires?</h4>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
              You will still be able to log in, view dashboard statistics, download GST invoices, and track your previous bookings. However, you will not be able to monitor slots or book new appointments.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
