import React, { createContext, useState, useEffect } from 'react';
import enTranslations from '../locales/en.json';
import { API_BASE_URL } from '../config/api';

const apiFetch = (url, options = {}) => window.fetch(url, { credentials: 'include', ...options });

export const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(() => {
    const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const savedLang = (adminInfo?.preferredLanguage) || (userInfo?.preferredLanguage);
    return savedLang ? savedLang : 'en';
  });

  const [loadedTranslations, setLoadedTranslations] = useState({
    en: enTranslations
  });

  // Keep local storage synced if userInfo/adminInfo changes in other contexts
  useEffect(() => {
    const syncLangFromLocal = () => {
      const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const savedLang = (adminInfo?.preferredLanguage) || (userInfo?.preferredLanguage);
      if (savedLang && savedLang !== currentLanguage) {
        setCurrentLanguage(savedLang);
      }
    };
    
    window.addEventListener('storage', syncLangFromLocal);
    return () => window.removeEventListener('storage', syncLangFromLocal);
  }, [currentLanguage]);

  // Lazy-load translation files on language change
  useEffect(() => {
    if (currentLanguage === 'en') return;
    if (loadedTranslations[currentLanguage]) return;

    // Dynamically import the JSON file based on currentLanguage
    import(`../locales/${currentLanguage}.json`)
      .then((module) => {
        setLoadedTranslations((prev) => ({
          ...prev,
          [currentLanguage]: module.default
        }));
      })
      .catch((err) => {
        console.warn(`Failed to lazy load translation file for ${currentLanguage}, falling back to English:`, err);
      });
  }, [currentLanguage, loadedTranslations]);

  useEffect(() => {
    const cookieString = document.cookie;
    const hasGoogleTrans = cookieString.includes('googtrans=');
    if (currentLanguage === 'en' && hasGoogleTrans) {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.reload();
    } else if (currentLanguage !== 'en' && !cookieString.includes(`googtrans=/en/${currentLanguage}`)) {
      document.cookie = `googtrans=/en/${currentLanguage}; path=/; SameSite=Lax`;
      document.cookie = `googtrans=/en/${currentLanguage}; path=/`;
      window.location.reload();
    }
  }, [currentLanguage]);

  // Detect if Google Translate "Show original" was clicked
  useEffect(() => {
    if (currentLanguage === 'en') return;

    let isGoogleTranslateActive = false;
    const htmlEl = document.documentElement;

    // Check if translation class is already present
    if (htmlEl.classList.contains('translated-ltr') || htmlEl.classList.contains('translated-rtl')) {
      isGoogleTranslateActive = true;
    }

    // Observe changes to the html element's class list
    const observer = new MutationObserver(() => {
      const hasClass = htmlEl.classList.contains('translated-ltr') || htmlEl.classList.contains('translated-rtl');
      if (hasClass) {
        isGoogleTranslateActive = true;
      } else if (isGoogleTranslateActive && !hasClass) {
        // The class was present, but now it's gone. This means the user clicked "Show original"
        changeLanguage('en');
      }
    });

    observer.observe(htmlEl, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Periodically poll the googtrans cookie to detect if it has been cleared
    const cookieInterval = setInterval(() => {
      const cookieString = document.cookie;
      const expectedCookieValue = `googtrans=/en/${currentLanguage}`;
      if (!cookieString.includes(expectedCookieValue)) {
        // Cookie is gone or changed, indicating translation was reverted or cleared
        changeLanguage('en');
      }
    }, 1000);

    return () => {
      observer.disconnect();
      clearInterval(cookieInterval);
    };
  }, [currentLanguage]);

  const t = (key) => {
    const keys = key.split('.');
    
    // 1. Try to fetch from lazy-loaded active language resource
    let translation = loadedTranslations[currentLanguage];
    if (translation) {
      for (const k of keys) {
        translation = translation?.[k];
      }
    }
    
    // 2. Fallback to English (master translation resource)
    if (!translation) {
      translation = loadedTranslations['en'];
      if (translation) {
        for (const k of keys) {
          translation = translation?.[k];
        }
      }
    }
    
    return translation || key;
  };

  const changeLanguage = async (langCode) => {
    setCurrentLanguage(langCode);
    
    // Set Google Translate Cookie
    const setTranslateCookie = (code) => {
      document.cookie = `googtrans=/en/${code}; path=/; SameSite=Lax`;
      document.cookie = `googtrans=/en/${code}; path=/`;
    };
    
    if (langCode === 'en') {
      setTranslateCookie('en');
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    } else {
      setTranslateCookie(langCode);
    }
    
    // Update local storage for active sessions
    const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    
    if (adminInfo) {
      adminInfo.preferredLanguage = langCode;
      localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
    }
    if (userInfo) {
      userInfo.preferredLanguage = langCode;
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
    }

    // Sync preference with database in the background if logged in
    const activeUser = adminInfo || userInfo;
    if (activeUser?._id) {
      try {
        await apiFetch(`${API_BASE_URL}/api/auth/profile/language`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ language: langCode })
        });
      } catch (err) {
        console.error('Failed to sync language preference with backend:', err);
      }
    }

    // Reload page to apply translation changes
    window.location.reload();
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};


