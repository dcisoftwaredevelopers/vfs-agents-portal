import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { MapPin, Phone, Mail } from 'lucide-react';
import { API_ROOT_URL } from '../config/api';
import './Contact.css';

const Contact = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    country: '',   
    visaType: '',
    message: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateForm = () => {
    // 1. Full Name validation
    if (!formData.name.trim()) {
      toast.error('Please enter your Full Name.');
      return false;
    }
    if (formData.name.trim().length < 2) {
      toast.error('Full Name must be at least 2 characters long.');
      return false;
    }

    // 2. Phone Number validation
    if (!formData.phone.trim()) {
      toast.error('Please enter your Phone Number.');
      return false;
    }
    // Remove space, hyphen, plus sign to validate digits length
    const digitsOnly = formData.phone.replace(/[\s+-]/g, '');
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(digitsOnly)) {
      toast.error('Please enter a valid Phone Number (10 to 15 digits).');
      return false;
    }

    // 3. Email Address validation
    if (!formData.email.trim()) {
      toast.error('Please enter your Email Address.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      toast.error('Please enter a valid Email Address.');
      return false;
    }

    // 4. Interested Country validation
    if (!formData.country) {
      toast.error('Please select an Interested Country.');
      return false;
    }

    // 5. Visa Type validation
    if (!formData.visaType) {
      toast.error('Please select a Visa Type.');
      return false;
    }

    // 6. Message validation
    if (!formData.message.trim()) {
      toast.error('Please enter your message.');
      return false;
    }
    if (formData.message.trim().length < 10) {
      toast.error('Your message must be at least 10 characters long.');
      return false;
    }

    return true;
  };

  const sendEmail = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_ROOT_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to submit consultation request.');
      toast.success(data.message || 'Consultation request submitted successfully!');
      setFormData({ name: '', phone: '', email: '', country: '', visaType: '', message: '' });
    } catch (error) {
      console.error('Contact submission failed:', error);
      toast.error(error.message || 'Failed to submit consultation request. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <div className="contact-header">
        <div className="container">
          <h1 className="page-title">Get In <span className="text-gold">Touch</span></h1>
          <p className="page-subtitle">Ready to start your global journey? Schedule a free consultation with our experts today.</p>
        </div>
      </div>

      <section className="contact-section">
        <div className="container">
          <div className="contact-grid">
            
            <div className="contact-info glass-card">
              <h2 className="info-title">Contact Information</h2>
              <p className="info-desc">Reach out to us directly or visit our global headquarters. We are here to help you every step of the way.</p>
              
              <ul className="info-list">
                <li>
                  <div className="icon-wrapper"><MapPin size={24} /></div>
                  <div>
                    <h4>Office Address</h4>
                    <p>Dream Catcher Immigrations, 3rd Floor,<br/>K Towers, Avinashi Main Road,<br/>Coimbatore – 641004</p>
                  </div>
                </li>
                <li>
                  <div className="icon-wrapper"><Phone size={24} /></div>
                  <div>
                    <h4>Phone Number</h4>
                    <p><a href="tel:+919047047512" style={{color:'inherit',textDecoration:'none'}}>+91 90470 47512</a></p>
                  </div>
                </li>
                <li>
                  <div className="icon-wrapper"><Mail size={24} /></div>
                  <div>
                    <h4>Email Address</h4>
                    <p><a href="mailto:info@dreamcatcherimmigrations.com" style={{color:'inherit',textDecoration:'none'}}>info@dreamcatcherimmigrations.com</a></p>
                  </div>
                </li>
              </ul>

              <div className="contact-social">
                <h4>Follow Us</h4>
                <div className="social-links">
                  <a href="https://www.facebook.com/profile.php?id=61590012154304" className="social-link"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg></a>
                  <a href="https://x.com/DreamCatch5053" className="social-link"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg></a>
                  <a href="https://www.instagram.com/dream_catcher_immigrations/" className="social-link"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>
                  <a href="#" className="social-link"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></a>
                </div>
              </div>

              <div className="map-container mt-4">
                <iframe 
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3916.2654953227183!2d77.00241317507689!3d11.017522389138!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba857e998d5d32b%3A0xb2e5eb1b6a413e8d!2sAvinashi%20Rd%2C%20Coimbatore%2C%20Tamil%20Nadu!5e0!3m2!1sen!2sin!4v1716285600000!5m2!1sen!2sin" 
                  width="100%" 
                  height="200" 
                  style={{border: 0, borderRadius: '12px'}} 
                  allowFullScreen="" 
                  loading="lazy" 
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Dream Catcher Immigrations - Coimbatore"
                ></iframe>
              </div>
            </div>

            <div className="contact-form-wrapper glass-card">
              <h2 className="info-title mb-4">Schedule Consultation</h2>
              <form onSubmit={sendEmail} className="contact-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input 
                      type="text" 
                      name="name" 
                      value={formData.name} 
                      onChange={handleChange} 
                      placeholder="john"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input 
                      type="tel" 
                      name="phone" 
                      value={formData.phone} 
                      onChange={handleChange} 
                      placeholder="+91 98765 43210"
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input 
                      type="email" 
                      name="email" 
                      value={formData.email} 
                      onChange={handleChange} 
                      placeholder="john@gmail.com"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Interested Country</label>
                    <select name="country" value={formData.country} onChange={handleChange} className="form-input">
                      <option value="">Select Country</option>
                      <option value="Canada">Canada</option>
                      <option value="Australia">Australia</option>
                      <option value="UK">United Kingdom</option>
                      <option value="USA">United States</option>
                      <option value="Germany">Germany</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Visa Type *</label>
                  <select name="visaType" value={formData.visaType} onChange={handleChange} className="form-input">
                    <option value="">Select Visa Type</option>
                    <option value="Work Visa">Work Visa</option>
                    <option value="Study Visa">Study Visa</option>
                    <option value="PR">Permanent Residency</option>
                    <option value="Tourist Visa">Tourist Visa</option>
                    <option value="Business Visa">Business Visa</option>
                    <option value="Freelance Visa">Freelance Visa</option>
                    <option value="Temporary Visa">Temporary Visa</option>
                    <option value="E-visa">E-visa</option>
                    <option value="On Arrival">On Arrival</option>
                    <option value="Dependent">Dependent Visa</option>
                    <option value="Transit">Transit Visa</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Your Message</label>
                  <textarea 
                    name="message" 
                    value={formData.message} 
                    onChange={handleChange} 
                    placeholder="Tell us about your requirements..."
                    className="form-input textarea"
                    rows="4"
                  ></textarea>
                </div>

                <button type="submit" className="btn-primary w-100 submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="btn-spinner"></span>
                  ) : (
                    "Schedule Consultation"
                  )}
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
