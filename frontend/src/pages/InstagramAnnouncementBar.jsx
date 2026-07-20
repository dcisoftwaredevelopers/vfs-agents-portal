import React, { useEffect, useState } from 'react';
import './InstagramAnnouncementBar.css';

const InstagramIcon = ({ size = 16, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const announcementItems = [
  {
    text: '📢 See Our Latest Instagram Post',
    showInstagramIcon: true,
  },
  {
    text: 'Visa Updates',
  },
  {
    text: 'Success Stories',
  },
  {
    text: 'Immigration News',
  },
  {
    text: 'Special Offers',
  },
];

const InstagramAnnouncementBar = () => {
  const [navbarHeight, setNavbarHeight] = useState(119);

  const instagramUrl =
    'https://www.instagram.com/dream_catcher_immigrations?igsh=MWJ1Y2c5d3J4eHptbg==';
  useEffect(() => {
    const navbar = document.querySelector('.navbar');

    if (!navbar) return undefined;

    const updateNavbarHeight = () => {
      setNavbarHeight(navbar.getBoundingClientRect().height);
    };

    updateNavbarHeight();

    let resizeObserver;

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateNavbarHeight);
      resizeObserver.observe(navbar);
    }

    window.addEventListener('resize', updateNavbarHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateNavbarHeight);
    };
  }, []);

  const renderAnnouncementItems = (groupKey) => (
    <div
      className="announcement-marquee-content"
      aria-hidden={groupKey === 'duplicate'}
    >
      {[...announcementItems, ...announcementItems].map((item, index) => (
        <React.Fragment key={`${groupKey}-${item.text}-${index}`}>
          <span className="marquee-item">
            {item.showInstagramIcon && (
              <InstagramIcon
                size={16}
                className="instagram-icon"
              />
            )}

            <span>{item.text}</span>
          </span>

          <span className="separator" aria-hidden="true">
            •
          </span>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <aside
      id="instagram-announcement-bar"
      className="instagram-announcement-bar"
      style={{ top: `${navbarHeight}px` }}
      aria-label="Latest Instagram announcements"
    >
      <div className="announcement-marquee-wrapper">
        <div className="announcement-marquee-track">
          {renderAnnouncementItems('primary')}
          {renderAnnouncementItems('duplicate')}
        </div>
      </div>

      <div className="announcement-btn-container">
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="announcement-cta"
          aria-label="View our latest Instagram post"
        >
          LIVE
        </a>
      </div>
    </aside>
  );
};

export default InstagramAnnouncementBar;