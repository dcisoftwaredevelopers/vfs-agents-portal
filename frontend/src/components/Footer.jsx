import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-col">
          <h4 className=''>About Us</h4>
          <ul className="footer-links">
            <li><Link to="/info/about">About Us</Link></li>
            <li><Link to="/info/careers">Careers</Link></li>
            <li><Link to="/info/contact">Contact Us</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Agent Support</h4>
          <ul className="footer-links">
            <li><Link to="/info/faq">Agent FAQs</Link></li>
            <li><Link to="/info/feedback">Agency Feedback</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Visa Services</h4>
          <ul className="footer-links">
            <li><Link to="/book">Book an Appointment</Link></li>
            <li><Link to="/track">Track Application</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Legal Information</h4>
          <ul className="footer-links">
            <li><Link to="/info/terms">Terms & Conditions</Link></li>
            <li><Link to="/info/disclaimer">Disclaimer</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <div>&copy; {new Date().getFullYear()} Dream Catcher Immigrations B2B Visa Booking Portal. All Rights Reserved.</div>
        
      </div>
    </footer>
  );
}
