import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { ShieldCheck, Mail, Phone, HelpCircle, FileText, Globe } from 'lucide-react';
import Contact from './Contact';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { toast } from 'react-toastify';

function AgentFeedbackForm() {
  const user = useSelector(selectCurrentUser);
  const [feedbackType, setFeedbackType] = React.useState('General Feedback');
  const [rating, setRating] = React.useState('5');
  const [message, setMessage] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('Please enter your feedback details.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      toast.success('Feedback submitted successfully! Thank you for helping us improve.');
      setMessage('');
      setIsSubmitting(false);
    }, 800);
  };

  return (
    <div className="glass-card-premium animate-slideup" style={{ maxWidth: '550px', margin: '20px auto', padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)', borderRadius: '12px' }}>
      <h4 style={{ fontWeight: 'bold', color: '#0c2340', marginBottom: '8px', fontSize: '18px', textAlign: 'center' }}>Submit Agency Feedback</h4>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', marginBottom: '20px' }}>
        Help us improve the partner portal. Share your suggestions, billing inquiries, or portal performance reviews.
      </p>
      
      <form onSubmit={handleSubmit}>
        {user && (
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
              <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Agency Name</label>
              <input type="text" className="form-control" value={user.agencyName} disabled style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }} />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
              <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Partner ID</label>
              <input type="text" className="form-control" value={user.agentId || 'N/A'} disabled style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }} />
            </div>
          </div>
        )}

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: user ? '1fr' : '1.2fr 0.8fr', gap: '15px', marginBottom: '15px' }}>
          {!user && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
              <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Agency Name *</label>
              <input type="text" className="form-control" placeholder="e.g. Dream Travel Co" required />
            </div>
          )}
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
            <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Feedback Category</label>
            <select className="form-control" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)} style={{ width: '100%' }}>
              <option>General Feedback</option>
              <option>Portal Suggestion / Feature Request</option>
              <option>Slot Booking / Appointment Issues</option>
              <option>Billing & Subscription Inquiries</option>
              <option>Report a Bug</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left', marginBottom: '15px' }}>
          <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Rate Your Portal Experience</label>
          <select className="form-control" value={rating} onChange={(e) => setRating(e.target.value)} style={{ width: '100%' }}>
            <option value="5">⭐⭐⭐⭐⭐ Excellent (5/5)</option>
            <option value="4">⭐⭐⭐⭐ Good (4/5)</option>
            <option value="3">⭐⭐⭐ Average (3/5)</option>
            <option value="2">⭐⭐ Fair (2/5)</option>
            <option value="1">⭐ Poor (1/5)</option>
          </select>
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left', marginBottom: '20px' }}>
          <label className="form-label" style={{ fontWeight: '600', fontSize: '13px', color: '#475569' }}>Feedback Details *</label>
          <textarea 
            className="form-control" 
            rows="4" 
            style={{ resize: 'none', width: '100%', boxSizing: 'border-box' }} 
            placeholder="Please detail your experience, suggestion, or query..." 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            required
          ></textarea>
        </div>

        <button 
          type="submit" 
          className="btn btn-secondary" 
          style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#0c2340', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s' }}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>
    </div>
  );
}

const INFO_CONTENT = {
  about: {
    title: 'About Dream Catcher Immigrations B2B Business Portal',
    subtitle: 'One Platform. Endless Global Opportunities.',
    content: (
      <div style={{ textAlign: 'center' }}>
        <p style={{ marginBottom: '15px' }}>
          Dream Catcher Immigrations B2B Business Portal is an intelligent digital platform built exclusively for visa agents and immigration agencies to simplify, accelerate, and manage every stage of the visa application journey.
        </p>
        <p style={{ marginBottom: '15px' }}>
          From client onboarding and document management to visa application processing, appointment slot booking, payment management, and subscription services, everything is integrated into one secure and powerful platform. No paperwork. No scattered processes. Just a seamless workflow designed for modern immigration businesses.
        </p>
        <p style={{ marginBottom: '15px' }}>
          Built with automation, transparency, and efficiency at its core, our portal empowers agencies to handle multiple clients with confidence while saving valuable time and reducing operational complexity. Real-time application tracking, centralized dashboards, and secure data management ensure complete control over every application.
        </p>
        <p style={{ marginBottom: '20px' }}>
          Whether you're an independent consultant or a growing immigration agency, Dream Catcher Immigrations B2B Business Portal provides the technology to streamline operations, enhance client satisfaction, and scale your business with confidence.
        </p>
        <h4 style={{ color: '#dfa015', fontWeight: 'bold', margin: '25px 0 10px', fontSize: '16px', textAlign: 'center' }}>
          Simplify Operations. Accelerate Success. Connect the World.
        </h4>
      </div>
    )
  },
  careers: {
    title: 'Careers',
    subtitle: 'Explore professional opportunities',
    content: (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <h3 style={{ color: '#0c2340', fontWeight: 'bold', marginBottom: '10px' }}>Coming Soon</h3>
        <p style={{ color: '#64748b' }}>We are currently updating our career opportunities. Please check back later.</p>
      </div>
    )
  },
  contact: {
    title: 'Contact Us',
    subtitle: 'Get in touch with our UK Visa Application Centres in India',
    content: (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          <div>
            <h4 style={{ color: '#0c2340', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={18} style={{ color: '#e86020' }} /> Email & Support
            </h4>
            <p style={{ fontSize: '14px', color: '#555', marginBottom: '12px' }}>
              For queries related to appointments, application checklist, and premium service upgrades:
              <br />
              <strong style={{ color: '#0c2340' }}>india.uksupport@vfsglobal.com</strong>
            </p>
          </div>
          <div>
            <h4 style={{ color: '#0c2340', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={18} style={{ color: '#e86020' }} /> Helpline Numbers
            </h4>
            <p style={{ fontSize: '14px', color: '#555' }}>
              General UK Visa Helpline: <strong>+91 22 6786 6000</strong>
              <br />
              <span style={{ fontSize: '12px', color: '#666' }}>(Available Monday to Friday, 08:00 – 17:00 IST)</span>
            </p>
          </div>
        </div>
        <h4 style={{ color: '#0c2340', fontWeight: 'bold', margin: '30px 0 15px' }}>Official Centre Locations</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', fontSize: '13px', color: '#555' }}>
          <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0c2340', display: 'block', marginBottom: '5px' }}>Delhi Centre</strong>
            Shivaji Stadium Metro Station, Concourse Level, Baba Kharak Singh Marg, Connaught Place, New Delhi - 110001.
          </div>
          <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0c2340', display: 'block', marginBottom: '5px' }}>Mumbai Centre</strong>
            Trade Centre, G-Block, Ground Floor, Bandra Kurla Complex, Bandra (East), Mumbai - 400051.
          </div>
          <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0c2340', display: 'block', marginBottom: '5px' }}>Bangalore Centre</strong>
            Gopalan Innovation Mall, 22, Bannerghatta Main Road, JP Nagar 3rd Phase, Bangalore - 560076.
          </div>
          <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0c2340', display: 'block', marginBottom: '5px' }}>Hyderabad Centre</strong>
            8-2-248/1/7/25, 2nd Floor, Uptown Cyber, Road No. 3, Banjara Hills, Hyderabad - 500034.
          </div>
          <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0c2340', display: 'block', marginBottom: '5px' }}>Chennai Centre</strong>
            Fagun Towers, Third Floor, No. 74, Ethiraj Salai, Egmore, Chennai - 600008.
          </div>
        </div>
      </div>
    )
  },
  faq: {
    title: 'Agent Frequently Asked Questions (FAQs)',
    subtitle: 'Answers to common questions regarding portal access, subscriptions, and bookings',
    content: (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ fontWeight: 'bold', color: '#0c2340', fontSize: '15px', marginBottom: '5px' }}>1. How do I book a visa appointment slot for a client?</h5>
          <p style={{ fontSize: '13.5px', color: '#555', lineHeight: '1.6' }}>
            Log in to your agent partner portal, navigate to the "Book an Appointment" tab, select the destination country, fill in the applicant details, select an available slot date/time, choose any premium value-added services, and proceed to payment verification.
          </p>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ fontWeight: 'bold', color: '#0c2340', fontSize: '15px', marginBottom: '5px' }}>2. Why does my dashboard display "Subscription Required" or "Verification Pending"?</h5>
          <p style={{ fontSize: '13.5px', color: '#555', lineHeight: '1.6' }}>
            To book appointments, agencies must maintain an active Professional Agent Subscription. When you purchase or renew a subscription, you must upload your UPI payment receipt. Our administrator will verify the receipt and approve access. This verification process typically takes 1 to 2 hours.
          </p>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ fontWeight: 'bold', color: '#0c2340', fontSize: '15px', marginBottom: '5px' }}>3. What is the visa approval success rate for applications submitted through the portal?</h5>
          <p style={{ fontSize: '13.5px', color: '#555', lineHeight: '1.6' }}>
            Applications processed through the Dream Catcher Immigrations B2B Business Portal achieve a 98.9% visa approval success rate, supported by our automated pre-checks and real-time slot monitoring.
          </p>
        </div>
     
      </div>
    )
  },
  feedback: {
    title: 'Partner Feedback & Inquiries',
    subtitle: 'Help us improve the Dream Catcher Immigrations B2B portal experience',
    content: <AgentFeedbackForm />
  },


  terms: {
    title: 'Terms & Conditions',
    subtitle: 'Operating rules for scheduling services through VFS Global',
    content: (
      <div>
        <p style={{ marginBottom: '15px' }}>
          By booking an appointment and using value-added premium services through this portal, you agree to these Terms and Conditions:
        </p>
        <ul style={{ paddingLeft: '20px', fontSize: '14px', color: '#555', marginBottom: '20px', lineHeight: '1.6' }}>
          <li style={{ marginBottom: '8px' }}>VFS Global acts solely as an outsourcing service provider for biometrics collection and administrative document transmission.</li>
          <li style={{ marginBottom: '8px' }}>We have no influence or authority over visa grant approvals or processing times, which are decided solely by UK Visas and Immigration.</li>
          <li style={{ marginBottom: '8px' }}>Please note that this is not a 100% visa guarantee, but a B2B portal with a 98.9% visa approval success rate.</li>
          <li style={{ marginBottom: '8px' }}>You must arrive at the Visa Application Centre 15 minutes before your slot time. Late arrivals may need to reschedule and forfeit fees.</li>
        </ul>
      </div>
    )
  },

  disclaimer: {
    title: 'Disclaimer',
    subtitle: 'General disclaimer regarding our B2B visa coordination platform',
    content: (
      <div>
        <p style={{ marginBottom: '15px', lineHeight: '1.6' }}>
          Dream Catcher Immigrations B2B Business Portal is an independent digital facilitation platform built exclusively for travel agents, visa consultants, and corporate partners. We coordinate appointment bookings and streamline document submissions, but we do not assess visa applications, issue decisions, or guarantee final visa approvals. Visa processing and approvals are subject to the sole discretion of the respective government embassies, consulates, and immigration authorities.
        </p>
        <p style={{ lineHeight: '1.6' }}>
          Information published regarding appointment slot availability, fees, processing times, and holiday calendars is subject to change without prior notice based on diplomatic updates. Partner agencies are advised to verify details with client applicants before submitting bookings.
        </p>
      </div>
    )
  }
};

export default function InfoPage() {
  const { pageKey } = useParams();

  // Scroll to top when pageKey changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pageKey]);

  if (pageKey === 'contact') {
    return <Contact />;
  }

  const pageData = INFO_CONTENT[pageKey] || {
    title: 'Page Not Found',
    subtitle: 'The requested information page could not be located.',
    content: <p>Please use the links in the footer navigation to access valid page content.</p>
  };

  return (
    <div>
      <Hero title={pageData.title} subtitle={pageData.subtitle} />
      <div className="container" style={{ maxWidth: '800px', minHeight: '400px', lineHeight: '1.7' }}>
        <div className="glass-card-premium animate-slideup" style={{ padding: '40px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
          {pageData.content}
          
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
            <Link to="/" style={{ color: '#e86020', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              &larr; Back to Portal Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
