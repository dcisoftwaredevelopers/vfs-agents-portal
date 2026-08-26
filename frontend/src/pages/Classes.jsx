import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowRight, CheckCircle2, Facebook, Link2, Linkedin, Mail, MessageCircle, Share2, ShieldCheck, X, ExternalLink } from 'lucide-react';
import { selectCurrentUser } from '../features/auth/authSlice';
import { API_ROOT_URL } from '../config/api';

const CLASS_DATA = {
  german: {
    name: 'German Classes',
    shortName: 'German',
    flag: '🇩🇪',
    subtitle: 'Learn German. Explore Opportunities. Build Your Future.',
    description: 'Our German language courses help you speak with confidence and open doors to global opportunities.',
    image: 'https://images.unsplash.com/photo-1520175480921-4edfa2983e0f?auto=format&fit=crop&w=1200&q=85',
  },
  french: {
    name: 'French Classes',
    shortName: 'French',
    flag: '🇫🇷',
    subtitle: 'Learn French. Connect to the World.',
    description: 'Our French language courses help you master the language and culture with confidence.',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=85',
  },
};

const BENEFITS = ['Expert Trainers', 'Interactive Learning', 'Flexible Batches', 'Certification Support'];

function ShareModal({ course, meetingUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = meetingUrl || window.location.href;
  const shareText = `Explore ${course.name} at Dream Catcher Immigrations`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const openShare = (url) => window.open(url, '_blank', 'noopener,noreferrer,width=650,height=520');

  return (
    <div className="classes-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="classes-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(event) => event.stopPropagation()}>
        <div className="classes-modal-heading">
          <div><span>SHARE</span><h2 id="share-title">Share this class</h2></div>
          <button type="button" onClick={onClose} aria-label="Close share dialog"><X size={19} /></button>
        </div>
        <div className="classes-share-grid">
          <button type="button" onClick={copyLink}><span className="share-icon link"><Link2 size={20} /></span><b>{copied ? 'Copied!' : 'Copy Link'}</b></button>
          <button type="button" onClick={() => openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`)}><span className="share-icon whatsapp"><MessageCircle size={20} /></span><b>WhatsApp</b></button>
          <button type="button" onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)}><span className="share-icon facebook"><Facebook size={20} /></span><b>Facebook</b></button>
          <button type="button" onClick={() => openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`)}><span className="share-icon linkedin"><Linkedin size={20} /></span><b>LinkedIn</b></button>
          <button type="button" onClick={() => openShare(`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}`)}><span className="share-icon email"><Mail size={20} /></span><b>Email</b></button>
        </div>
        {copied && <p className="classes-copy-success"><CheckCircle2 size={15} /> Link copied successfully.</p>}
      </div>
    </div>
  );
}

export default function Classes() {
  const { className = 'german' } = useParams();
  const user = useSelector(selectCurrentUser);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState('loading');
  const [weeklyLinks, setWeeklyLinks] = useState([]);
  const [weeklyLinkState, setWeeklyLinkState] = useState('loading');
  const course = CLASS_DATA[className] || CLASS_DATA.german;

  useEffect(() => {
    let isMounted = true;
    const verifySubscription = async () => {
      if (!user || user.status !== 'Active') {
        setSubscriptionState('blocked');
        return;
      }
      try {
        const response = await fetch(`${API_ROOT_URL}/subscription/history`, { credentials: 'include' });
        const subscriptions = response.ok ? await response.json() : [];
        const activeSubscription = subscriptions.find((subscription) => (
          subscription.subscriptionStatus === 'Active' &&
          subscription.paymentStatus === 'Paid' &&
          (!subscription.expiryDate || new Date(subscription.expiryDate).getTime() > Date.now())
        ));
        if (isMounted) setSubscriptionState(activeSubscription ? 'active' : 'blocked');
      } catch {
        if (isMounted) setSubscriptionState('blocked');
      }
    };
    verifySubscription();
    return () => { isMounted = false; };
  }, [user]);

  useEffect(() => {
    if (subscriptionState !== 'active') return undefined;
    let isMounted = true;
    fetch(`${API_ROOT_URL}/class-links/${course.shortName.toLowerCase()}/current`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to fetch weekly class link.');
        if (isMounted) {
          setWeeklyLinks(Array.isArray(data.links) ? data.links : data.link ? [data.link] : []);
          setWeeklyLinkState('ready');
        }
      })
      .catch(() => {
        if (isMounted) setWeeklyLinkState('ready');
      });
    return () => { isMounted = false; };
  }, [course.shortName, subscriptionState]);

  if (subscriptionState === 'loading') {
    return <main className="classes-gated-page"><div className="classes-gated-card"><span className="classes-eyebrow">SECURE AGENT ACCESS</span><h1>Checking subscription</h1><p>Verifying your active portal access.</p></div></main>;
  }

  if (subscriptionState !== 'active') {
    return (
      <main className="classes-gated-page">
        <div className="classes-gated-card">
          <span className="classes-gated-icon"><ShieldCheck size={28} /></span>
          <span className="classes-eyebrow">AGENT ACCESS</span>
          <h1>Subscription required</h1>
          <p>Active agent subscription access is required to view our {course.shortName} Classes program.</p>
          <Link to="/agent-dashboard" className="classes-primary-button">View subscription <ArrowRight size={17} /></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="classes-page">
      <div className="classes-breadcrumb"><Link to="/agent-dashboard">Agent Portal</Link><span>/</span><span>Classes</span><span>/</span><strong>{course.name}</strong></div>
      <section className="classes-hero">
        <div className="classes-hero-copy">
          <span className="classes-eyebrow">LANGUAGE PROGRAMS <span>{course.flag}</span></span>
          <h1>{course.name}</h1>
          <p className="classes-hero-subtitle">{course.subtitle}</p>
          <p className="classes-hero-description">{course.description}</p>
          <div className="classes-benefits">{BENEFITS.map((benefit) => <span key={benefit}><CheckCircle2 size={16} />{benefit}</span>)}</div>
          <div className="classes-hero-actions"><Link to="/info/contact" className="classes-primary-button">Enquire Now <ArrowRight size={17} /></Link><button type="button" className="classes-secondary-button" onClick={() => setIsShareOpen(true)}><Share2 size={16} /> Share</button></div>
        </div>
        <div className="classes-hero-image"><img src={course.image} alt={`${course.name} landmark`} /><div className="classes-image-caption">Build confidence for your next global opportunity.</div></div>
      </section>
      <section className="classes-facts" aria-label="Course highlights"><div><strong>A1 - C2</strong><span>Levels</span></div><div><strong>3 - 12 Months</strong><span>Duration</span></div><div><strong>Offline / Online</strong><span>Mode</span></div><div><strong>Supported</strong><span>Certification</span></div></section>
      <section className="classes-weekly-link">
        <div><span className="classes-eyebrow">THIS WEEK'S LIVE CLASSES</span><h2>{weeklyLinks.length ? `${weeklyLinks.length} live class${weeklyLinks.length === 1 ? '' : 'es'} this week` : 'Weekly class links'}</h2><p>{weeklyLinks.length ? 'Choose a batch below to join or share its Google Meet link.' : weeklyLinkState === 'loading' ? 'Checking this week\'s schedule...' : 'The admin has not published a link for this week yet.'}</p></div>
        {weeklyLinks.length > 0 && <div className="classes-weekly-list">{weeklyLinks.map((link) => <div className="classes-weekly-item" key={link._id}><div><strong>{link.title}</strong><span>{link.schedule}</span></div><div className="classes-weekly-actions"><a href={link.meetingUrl} target="_blank" rel="noreferrer" className="classes-primary-button">Join <ExternalLink size={15} /></a><button type="button" className="classes-secondary-button" onClick={() => setIsShareOpen(link)}><Share2 size={15} /> Share</button></div></div>)}</div>}
      </section>
      <section className="classes-next-step"><div><span className="classes-eyebrow">YOUR NEXT STEP</span><h2>Turn language into opportunity.</h2><p>Speak with our program team and find the right batch for your goals.</p></div><Link to="/info/contact" className="classes-primary-button">Start a conversation <ArrowRight size={17} /></Link></section>
      {isShareOpen && <ShareModal course={course} meetingUrl={isShareOpen.meetingUrl} onClose={() => setIsShareOpen(false)} />}
    </main>
  );
}
