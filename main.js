// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4",
  authDomain: "razrabotka-b61bc.firebaseapp.com",
  projectId: "razrabotka-b61bc",
  storageBucket: "razrabotka-b61bc.firebasestorage.app",
  messagingSenderId: "394402564794",
  appId: "1:394402564794:web:f610ffb03e655c600c5083"
};

let db;
let siteData = {};
const initialSiteData = {
    home: { h1: "", subtitle: "", lang: "en", seoTitle: "Digital Craft", metaDescription: "Professional websites for small businesses" },
    services: [], portfolio: [], blog: [], contact: []
};

const mainContentEl = document.querySelector('main');
let floatingObserver, animateOnceObserver, animateAlwaysObserver;

// --- УТИЛИТА ДЛЯ ГЕНЕРАЦИИ ЯКОРЕЙ (SLUGS) ---
function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Заменяем пробелы на -
        .replace(/[^\w\-]+/g, '')       // Удаляем все не-словесные символы
        .replace(/\-\-+/g, '-')         // Заменяем несколько - на один -
        .replace(/^-+/, '')             // Убираем - в начале
        .replace(/-+$/, '');            // Убираем - в конце
}

// --- ANIMATION & OBSERVER LOGIC ---
function setupObservers() {
    if (floatingObserver) floatingObserver.disconnect();
    if (animateOnceObserver) animateOnceObserver.disconnect();
    if (animateAlwaysObserver) animateAlwaysObserver.disconnect();

    floatingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const target = entry.target;
            const isAboveViewport = entry.boundingClientRect.top < 0 && !entry.isIntersecting;
            if (entry.isIntersecting) {
                target.classList.add('is-visible');
                target.classList.remove('is-above');
            } else {
                target.classList.remove('is-visible');
                if (isAboveViewport) {
                    target.classList.add('is-above');
                } else {
                    target.classList.remove('is-above');
                }
            }
        });
    }, { threshold: 0, rootMargin: "-50px 0px -50px 0px" });

    animateOnceObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    animateAlwaysObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            } else {
                entry.target.classList.remove('is-visible');
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    
    document.querySelectorAll('.floating-item').forEach(el => floatingObserver.observe(el));
    document.querySelectorAll('.animate-on-scroll').forEach(el => animateOnceObserver.observe(el));
    document.querySelectorAll('.animate-always').forEach(el => animateAlwaysObserver.observe(el));
}


// --- SEO & DATA FUNCTIONS ---
function renderSeoTags(data) {
    document.querySelectorAll('meta[name="description"], meta[property^="og:"], script[type="application/ld+json"], link[rel="canonical"]').forEach(el => el.remove());
    document.title = data.seoTitle || "Digital Craft";
    document.documentElement.lang = data.lang || 'en';
    const createMeta = (attr, key, value) => {
        if (value) {
            const meta = document.createElement('meta');
            meta.setAttribute(attr, key);
            meta.content = value;
            document.head.appendChild(meta);
        }
    };
    createMeta('name', 'description', data.metaDescription);
    createMeta('property', 'og:title', data.ogTitle || data.seoTitle);
    createMeta('property', 'og:description', data.ogDescription || data.metaDescription);
    const mediaArray = data.media || [];
    const ogImage = data.ogImage || (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
    if (ogImage) createMeta('property', 'og:image', ogImage);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    const canonicalBaseUrl = 'https://digital-craft-tbilisi.site';
    let path = window.location.pathname;
    if (path.length > 1 && !path.endsWith('/')) {
        path += '/';
    }
    canonical.href = canonicalBaseUrl + path;
    document.head.appendChild(canonical);
    let schemaData = data.schemaJsonLd;
    if (typeof schemaData === 'string' && schemaData.trim()) {
        try {
            schemaData = JSON.parse(schemaData);
        } catch (e) {
            console.error('Failed to parse schemaJsonLd:', e);
            schemaData = null;
        }
    }
    if (schemaData && typeof schemaData === 'object' && Object.keys(schemaData).length > 0) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schemaData);
        document.head.appendChild(script);
    }
}

async function loadData() { const freshSiteData = {}; try { const collections = ['services', 'portfolio', 'blog', 'contact']; const dataPromises = [ db.collection('home').doc('content').get(), ...collections.map(col => db.collection(col).get()) ]; const [homeDoc, ...snapshots] = await Promise.all(dataPromises); const processDocData = (data) => { if (data && typeof data.schemaJsonLd === 'string' && data.schemaJsonLd.trim().startsWith('{')) { try { data.schemaJsonLd = JSON.parse(data.schemaJsonLd); } catch (e) { data.schemaJsonLd = {}; } } return data; }; freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {}; collections.forEach((col, index) => { freshSiteData[col] = snapshots[index].docs.map(doc => ({ id: doc.id, ...processDocData(doc.data()) })); }); return freshSiteData; } catch (error) { console.error("Error loading data from Firebase:", error); return JSON.parse(JSON.stringify(initialSiteData)); } }


// --- RENDER FUNCTIONS ---
function formatContentHtml(content) {
    if (!content) return '';

    let processedContent = content.replace(/<pre(.*?)>([\s\S]*?)<\/pre>/gim, function(match, attrs, inner) {
        const codeMatch = inner.match(/^\s*<code(.*?)>([\s\S]*?)<\/code>\s*$/i);
        if (codeMatch) {
            const codeAttrs = codeMatch[1];
            const codeContent = codeMatch[2];
            const escapedContent = codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre${attrs}><code${codeAttrs}>${escapedContent}</code></pre>`;
        } else {
            const escapedInner = inner.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre${attrs}>${escapedInner}</pre>`;
        }
    });

    processedContent = processedContent.replace(/\r\n/g, '\n');
    const blocks = processedContent.split(/\n{2,}/);
    
    const html_parts = blocks.map(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return '';
        
        const youtubeRegex = /^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11}).*$/;
        const imageRegex = /^https?:\/\/[^<>"']+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$/i;
        
        const youtubeMatch = trimmedBlock.match(youtubeRegex);
        const imageMatch = trimmedBlock.match(imageRegex);
        
        if (/^<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)/i.test(trimmedBlock)) {
            return trimmedBlock;
        } else if (youtubeMatch && youtubeMatch[1]) {
            const videoId = youtubeMatch[1];
            return `<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else if (imageMatch) {
            return `<p style="margin: 1.5em 0;"><img src="${trimmedBlock}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>`;
        } else {
            return `<p>${trimmedBlock.replace(/\n/g, '<br>')}</p>`;
        }
    }).filter(Boolean);
    
    const groupedHtml = [];
    const GROUP_SIZE = 3;
    for (let i = 0; i < html_parts.length; i += GROUP_SIZE) {
        const group = html_parts.slice(i, i + GROUP_SIZE);
        if (group.length > 0) {
            groupedHtml.push(`<div class="content-group">${group.join('')}</div>`);
        }
    }
    
    return groupedHtml.join('\n');
}

function generateTocHtml(content) {
    const div = document.createElement('div');
    div.innerHTML = content;
    const headings = div.querySelectorAll('h2, h3');
    if (headings.length === 0) return null;

    const tocItems = [];
    headings.forEach((heading, index) => {
        const level = heading.tagName.toLowerCase();
        let text = heading.textContent;
        let id = heading.id || slugify(text);
        if (!heading.id) heading.id = id;

        const tocClass = level === 'h2' ? 'toc-level-h2' : 'toc-level-h3';
        tocItems.push(`<li class="${tocClass}"><a href="#${id}">${text}</a></li>`);
    });

    return `<ul>${tocItems.join('')}</ul>`;
}

function renderSection(sectionId, sectionHeading, items) { 
    const section = document.getElementById(sectionId); 
    const mobileContainer = section.querySelector('.mobile-sliders-container'); 
    const desktopWrapper = section.querySelector('.desktop-grid-wrapper'); 
    
    if (mobileContainer) mobileContainer.innerHTML = ''; 
    if (desktopWrapper) desktopWrapper.innerHTML = ''; 
    
    if (!items || !items.length) { 
        section.innerHTML = ''; 
        return; 
    } 
    
    if (sectionId === 'contact') { 
        const contactEl = items.find && items.find(x => x.lang === (siteData.home.lang || 'en')); 
        const subtitleHtml = contactEl && contactEl.subtitle ? `<div class="hero-subtitle-container"><p>${contactEl.subtitle}</p></div>` : ''; 
        const contentHtml = contactEl && contactEl.content 
            ? `<div class="hero-subtitle-container"><ul class="hero-contact-list">${contactEl.content.split('\n').map(line => { const t = line.trim(); return t ? `<li>${t}</li>` : ''; }).join('')}</ul></div>` 
            : ''; 
        section.innerHTML = `<div class="hero"><h1>${sectionHeading}</h1>${subtitleHtml}${contentHtml}</div>`; 
        return; 
    } 
    
    const langGroups = {}; 
    items.forEach(item => { 
        const lang = item.lang || 'en'; 
        if (!langGroups[lang]) langGroups[lang] = []; 
        langGroups[lang].push(item); 
    }); 
    
    const langArray = Object.entries(langGroups); 
    const MAX_ITEMS_PER_SLIDE = 6; 
    
    // MOBILE
    const mobileHtml = langArray.map(([lang, itemsInLang]) => { 
        const chunks = []; 
        for (let i = 0; i < itemsInLang.length; i += MAX_ITEMS_PER_SLIDE) { 
            chunks.push(itemsInLang.slice(i, i + MAX_ITEMS_PER_SLIDE)); 
        } 
        const slidesHtml = chunks.map((chunk, slideIndex) => { 
            const cardsHtml = chunk.map(it => { 
                const mediaUrl = (it.media && it.media.length) ? it.media[0] : ''; 
                const itemLink = `/${it.lang || 'en'}/${sectionId}/${it.urlSlug}/`; 
                return ` 
                    <a href="${itemLink}" class="item-card ${slideIndex === 0 ? 'active' : ''}"> 
                        <div class="item-card__image" style="background-image: url('${mediaUrl}');"></div> 
                        <div class="item-card__content"> 
                            <h3>${it.title || ''}</h3> 
                            ${it.subtitle ? `<div class="card-subtitle">${it.subtitle}</div>` : ''} 
                            <p>${it.description || ''}</p> 
                        </div> 
                    </a> 
                `; 
            }).join(''); 
            return cardsHtml; 
        }).join(''); 
        const dotsHtml = chunks.length > 1 
            ? `<div class="slider-nav">${chunks.map((_, i) => `<span class="slider-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}</div>` 
            : ''; 
        return ` 
            <div class="language-slider-block"> 
                <div class="lang-title">${lang.toUpperCase()}</div> 
                <div class="cross-fade-slider">${slidesHtml}</div> 
                ${dotsHtml} 
            </div> 
        `; 
    }).join(''); 
    
    if (mobileContainer) mobileContainer.innerHTML = mobileHtml; 
    
    // DESKTOP
    const desktopHtml = langArray.map(([lang, itemsInLang]) => { 
        const chunks = []; 
        for (let i = 0; i < itemsInLang.length; i += MAX_ITEMS_PER_SLIDE) { 
            chunks.push(itemsInLang.slice(i, i + MAX_ITEMS_PER_SLIDE)); 
        } 
        const slidesHtml = chunks.map((chunk, slideIndex) => { 
            const cardsHtml = chunk.map(it => { 
                const mediaUrl = (it.media && it.media.length) ? it.media[0] : ''; 
                const itemLink = `/${it.lang || 'en'}/${sectionId}/${it.urlSlug}/`; 
                return ` 
                    <a href="${itemLink}" class="item-card"> 
                        <div class="item-card__image" style="background-image: url('${mediaUrl}');"></div> 
                        <div class="item-card__content"> 
                            <h3>${it.title || ''}</h3> 
                            ${it.subtitle ? `<div class="card-subtitle">${it.subtitle}</div>` : ''} 
                            <p>${it.description || ''}</p> 
                        </div> 
                    </a> 
                `; 
            }).join(''); 
            return `<div class="desktop-grid-slide ${slideIndex === 0 ? 'active' : ''}">${cardsHtml}</div>`; 
        }).join(''); 
        const dotsHtml = chunks.length > 1 
            ? `<div class="desktop-slider-nav">${chunks.map((_, i) => `<span class="desktop-slider-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}</div>` 
            : ''; 
        return ` 
            <div class="desktop-language-group"> 
                <div class="desktop-lang-title">${lang.toUpperCase()}</div> 
                <div class="desktop-carousel-container">${slidesHtml}</div> 
                ${dotsHtml} 
            </div> 
        `; 
    }).join(''); 
    
    if (desktopWrapper) desktopWrapper.innerHTML = desktopHtml; 
}

function renderMenu() {
    const navMenu = document.querySelector('.nav-menu');
    if (!navMenu) return;
    const currentLang = siteData.home.lang || 'en';
    const itemsToShow = [
        { name: 'Home', href: `/${currentLang}/` },
        { name: 'Services', href: `/#services` },
        { name: 'Portfolio', href: `/#portfolio` },
        { name: 'Blog', href: `/#blog` },
        { name: 'Contact', href: `/#contact` }
    ];
    navMenu.innerHTML = itemsToShow.map(item => `<li><a href="${item.href}">${item.name}</a></li>`).join('');
}

function applyCustomBackground(dataObj) {
    const iframe = document.getElementById('custom-background-iframe');
    if (!iframe) return;
    if (dataObj && dataObj.customBackgroundUrl && dataObj.customBackgroundUrl.trim()) {
        iframe.src = dataObj.customBackgroundUrl.trim();
        iframe.style.display = 'block';
        iframe.onload = () => iframe.classList.add('is-visible');
    } else {
        iframe.classList.remove('is-visible');
        setTimeout(() => {
            iframe.style.display = 'none';
            iframe.src = '';
        }, 800);
    }
}

function renderDetailPage(data) { 
    renderMenu();
    const rawContent = data.content || '';
    let finalContentHtml = formatContentHtml(rawContent);
    const tocHtml = generateTocHtml(finalContentHtml);
    const tocTitle = data.tocTitle || 'Table of Contents';
    const displayToc = data.tocHidden !== true && tocHtml;
    
    const floatingTocWrapper = `
        <div id="floating-toc-wrapper" class="floating-toc-wrapper" style="display: ${displayToc ? 'flex' : 'none'};">
            <button id="toc-toggle-btn" class="toc-toggle-btn" aria-expanded="false" aria-controls="toc-content-panel">
                ${tocTitle} <span class="toc-arrow"></span>
            </button>
            <div id="toc-content-panel" class="toc-content-panel" aria-hidden="true">
                ${tocHtml || ''}
            </div>
        </div>
    `;
    
    mainContentEl.innerHTML = `
        ${floatingTocWrapper}
        <section>
            <div class="detail-page-header">
                <h1>${data.h1 || data.title || ''}</h1>
                ${data.price ? `<div class="detail-price">${data.price}</div>` : ''}
            </div>
            <div class="detail-content">${finalContentHtml}</div>
        </section>
        <button id="scroll-to-top-btn" title="Наверх">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path fill="none" d="M0 0h24v24H0z"/>
                <path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/>
            </svg>
        </button>
    `;
    
    applyCustomBackground(data);
    renderSeoTags(data);
    document.querySelectorAll('h1, .detail-price').forEach(el => el.classList.add('animate-always'));
    document.querySelectorAll('.detail-content > .content-group').forEach(el => el.classList.add('floating-item'));
    document.querySelectorAll('#related-posts .item-card').forEach(el => el.classList.add('animate-on-scroll'));
    setupObservers();
    document.documentElement.style.setProperty('--main-visibility', 'visible');
    
    updateScrollButtonVisibility();
    
    // --- ВАЖНО: СКРОЛЛИМ НА ВЕРХ ПЕРЕД ПОКАЗОМ КОНТЕНТА ---
    window.scrollTo({
        top: 0,
        behavior: 'instant'
    });
}

function handleNavigation(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || link.protocol !== window.location.protocol || link.host !== window.location.host || e.metaKey || e.ctrlKey || e.shiftKey) { return; }
    
    const targetUrl = new URL(link.href);
    
    e.preventDefault();
    const menuToggle = document.querySelector('.menu-toggle');
    const navOverlay = document.querySelector('.nav-overlay');
    const isMenuOpen = document.body.classList.contains('nav-is-open');

    if (isMenuOpen) {
        document.body.classList.remove('nav-is-open');
        menuToggle.classList.remove('is-active');
        navOverlay.classList.remove('is-active');
    }

    const menuCloseDelay = isMenuOpen ? 450 : 0;

    const hash = targetUrl.hash;
    if (hash && targetUrl.pathname === window.location.pathname) {
        setTimeout(() => {
            
            // Проверяем, находится ли ссылка в TOC панели
            const isTocLink = link.closest('.toc-content-panel');
            const contentPanel = document.getElementById('toc-content-panel');
            const toggleBtn = document.getElementById('toc-toggle-btn');
            
            // Если ссылка в TOC, закрываем панель
            if (isTocLink && contentPanel && toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', 'false');
                contentPanel.setAttribute('aria-hidden', 'true');
                contentPanel.classList.remove('is-visible');
                toggleBtn.classList.remove('is-active');
            }
            
            // Используем нашу функцию для скролла с центрированием
            scrollToElementWithOffset(hash.substring(1));
        }, menuCloseDelay);
        return;
    }

    if (targetUrl.href === window.location.href) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    setTimeout(() => {
        mainContentEl.style.transition = 'opacity 0.4s ease-out';
        mainContentEl.classList.add('is-transitioning');
        
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href);
            mainContentEl.style.transition = 'none'; 
            routeAndRender(); 

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    mainContentEl.style.transition = 'opacity 0.6s ease-out';
                    mainContentEl.classList.remove('is-transitioning');
                });
            });
        }, 400);
    }, menuCloseDelay);
}


// --- HYDRATION LOGIC ---

function hydrateHomePageContent() {
    const preloadedDataEl = document.getElementById('preloaded-data');
    if (preloadedDataEl) {
        try {
            const preloadedSections = JSON.parse(preloadedDataEl.textContent);
            siteData.services = preloadedSections.services || [];
            siteData.portfolio = preloadedSections.portfolio || [];
            siteData.blog = preloadedSections.blog || [];
            siteData.contact = preloadedSections.contact || [];
            preloadedDataEl.remove();
        } catch (e) { console.error("Ошибка при парсинге предзагруженных данных:", e); }
    }
    applyCustomBackground(siteData.home);
    ['services', 'portfolio', 'blog', 'contact'].forEach(key => {
        renderSection(key, `Our ${key.charAt(0).toUpperCase() + key.slice(1)}`, siteData[key]);
    });
    initMobileSliders();
    initDesktopCarousels();
    document.querySelectorAll('#services .item-card, #portfolio .item-card, #blog .item-card, #contact .item-card, section h2').forEach(el => el.classList.add('animate-on-scroll'));
    setupObservers();
    const footer = document.getElementById('site-footer');
    if (footer) {
        footer.style.display = 'block';
        footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft. All rights reserved.`;
        footer.onclick = () => { window.location.href = '/admin.html'; };
    }

    const hash = window.location.hash;
    if (hash) {
        requestAnimationFrame(() => {
            scrollToElementWithOffset(hash.substring(1));
        });
    }
}

async function hydrateStaticPage() {
    renderMenu();
    document.querySelectorAll('h1, .detail-price').forEach(el => el.classList.add('animate-always', 'is-visible'));
    document.querySelectorAll('.detail-content > .content-group').forEach(el => el.classList.add('floating-item', 'is-visible'));
    document.querySelectorAll('#related-posts .item-card, #related-posts h2').forEach(el => el.classList.add('animate-on-scroll'));
    setupObservers();
    
    // Проверка кнопки при старте
    updateScrollButtonVisibility();

    try {
        siteData = await loadData();
        const path = window.location.pathname;
        const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
        const match = path.match(detailPageRegex);
        if (match) {
            const [, lang, collection, slug] = match;
            const itemLang = lang || 'en';
            const collectionData = siteData[collection] || [];
            const currentItem = collectionData.find && collectionData.find(d => d.urlSlug === slug && d.lang === itemLang);
            if (currentItem) {
                applyCustomBackground(currentItem);
                if (!document.getElementById('related-posts')) {
                    renderRelatedPosts(collection, slug, itemLang);
                }
                const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
                if (floatingTocWrapper && floatingTocWrapper.style.display !== 'none') {
                    initFloatingTocToggle();
                }
            }
        } else {
            hydrateHomePageContent();
        }
    } catch (error) {
        console.error("Background data load failed during hydration:", error);
    }
}

// --- INITIALIZATION ---
function initStaticEventListeners() { 
    document.body.addEventListener('click', handleNavigation); 
    window.addEventListener('popstate', () => routeAndRender(true)); 
    const menuToggle = document.querySelector('.menu-toggle'); 
    const navOverlay = document.querySelector('.nav-overlay'); 
    if (menuToggle && navOverlay) { 
        menuToggle.addEventListener('click', () => { 
            document.body.classList.toggle('nav-is-open'); 
            menuToggle.classList.toggle('is-active'); 
            navOverlay.classList.toggle('is-active'); 
        }); 
    }
    
    mainContentEl.addEventListener('click', function(event) {
        if (event.target.id === 'quiz-submit-button') { calculateQuizResult(); }
        if (event.target.closest('#scroll-to-top-btn')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

function updateScrollButtonVisibility() {
    const button = document.getElementById('scroll-to-top-btn');
    if (!button) return;
    
    if (window.scrollY > 300) {
        button.classList.add('visible');
    } else {
        button.classList.remove('visible');
    }
}

function initScrollListener() {
    window.addEventListener('scroll', updateScrollButtonVisibility, { passive: true });
}

async function initApp() { 
    firebase.initializeApp(firebaseConfig); 
    db = firebase.firestore(); 
    
    initStaticEventListeners();
    initScrollListener();

    const isStaticPage = document.body.dataset.staticPage === 'true'; 
    if (isStaticPage) { 
        hydrateStaticPage();
    } else { 
        try { 
            siteData = await loadData(); 
            renderMenu(); 
            routeAndRender(); 
        } catch (error) { 
            console.error("Failed to initialize app:", error); 
            mainContentEl.innerHTML = "<h1>Error loading site data. Please try again later.</h1>"; 
        } 
    } 
}
window.addEventListener('DOMContentLoaded', initApp);

function calculateQuizResult() {
    const form = document.getElementById('quiz-form');
    if (!form) return;
    const formData = new FormData(form);
    const scores = { website: 0, landing: 0 };
    formData.forEach((value, key) => {
        if (key === 'business-type') {
            if (value === 'service' || value === 'ecommerce' || value === 'content') scores.website += 2;
            if (value === 'campaign') scores.landing += 2;
        }
        if (key === 'target-action') {
            if (value === 'learn-more') scores.website += 2;
            if (value === 'contact' || value === 'signup') scores.landing += 2;
            if (value === 'buy-now') scores.landing += 3;
        }
        if (key === 'pages') {
            if (value === 'one') scores.landing += 3;
            if (value === 'many') scores.website += 3;
        }
        if (key === 'budget') {
            if (value === 'low') scores.landing += 1;
            if (value === 'high') scores.website += 2;
        }
        if (key === 'seo') {
            if (value === 'yes') scores.website += 2;
            if (value === 'no') scores.landing += 1;
        }
    });
    const resultDiv = document.getElementById('quiz-result');
    if (!resultDiv) return;
    let resultHTML, resultStyle;
    if (scores.website === scores.landing) {
        resultHTML = `<h3>Your Result: Both Could Work!</h3><p>You can start with a landing page ($500-$2,000) to test the market, or invest in a multi-page website ($3,000-$15,000+) for long-term growth. Need advice? Contact us for a free consultation in Tbilisi.</p>`;
        resultStyle = 'background-color: rgba(255, 251, 230, 0.1); border-color: #ffe58f;';
    } else if (scores.landing >= 5 || scores.landing > scores.website) {
        resultHTML = `<h3>Your Result: Landing Page</h3><p>You need a focused, conversion-optimized landing page. Perfect for campaigns, single offers, events, or testing new business ideas. Expected investment: $500-$2,000 for professional landing page design in Tbilisi.</p>`;
        resultStyle = 'background-color: rgba(230, 247, 255, 0.1); border-color: #91d5ff;';
    } else {
        resultHTML = `<h3>Your Result: Multi-Page Website</h3><p>You need comprehensive site development. Invest in a multi-page website to build brand credibility, rank in search engines, and support complex sales processes. Expected investment: $3,000-$15,000+ depending on features.</p>`;
        resultStyle = 'background-color: rgba(246, 255, 237, 0.1); border-color: #b7eb8f;';
    }
    resultDiv.innerHTML = resultHTML;
    resultDiv.style.cssText = resultStyle + ' margin-top: 20px; padding: 15px; border-width: 2px; border-style: solid; border-radius: 8px; display: block;';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function initDesktopCarousels() { document.querySelectorAll('.desktop-carousel-container').forEach(carousel => { const slides = carousel.querySelectorAll('.desktop-grid-slide'); const nav = carousel.nextElementSibling; if (!nav || !nav.matches('.desktop-slider-nav')) return; const dots = nav.querySelectorAll('.desktop-slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.desktop-slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); }); }
function initMobileSliders() { document.querySelectorAll('.language-slider-block').forEach(sliderBlock => { const slider = sliderBlock.querySelector('.cross-fade-slider'); const slides = slider.querySelectorAll('.item-card'); const nav = sliderBlock.querySelector('.slider-nav'); const dots = nav.querySelectorAll('.slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let touchStartX = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopAutoSlide(); }, { passive: true }); slider.addEventListener('touchend', e => { const touchEndX = e.changedTouches[0].screenX; const swipeThreshold = 40; if (touchEndX < touchStartX - swipeThreshold) { goToSlide(currentIndex + 1); } else if (touchEndX > touchStartX + swipeThreshold) { goToSlide(currentIndex - 1); } startAutoSlide(); }, { passive: true }); }); }

// --- ФУНКЦИЯ ДЛЯ СКРОЛЛА К ЭЛЕМЕНТУ С ЦЕНТРИРОВАНИЕМ ---
function scrollToElementWithOffset(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Получаем абсолютную позицию элемента на странице
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    
    // Получаем высоту viewport
    const viewportHeight = window.innerHeight;
    
    // Получаем высоту элемента
    const elementHeight = element.offsetHeight;
    
    // Рассчитываем позицию, чтобы элемент был в центре экрана
    // Центр viewport минус половина высоты элемента
    const offset = (viewportHeight / 2) - (elementHeight / 2);
    
    // Рассчитываем конечную позицию
    const targetPosition = elementTop - offset;
    
    // Плавный скролл
    window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
    });
}

// --- ROUTER & NAVIGATION LOGIC ---

async function navigateToHome() {
    try {
        const response = await fetch('/');
        if (!response.ok) throw new Error('Failed to fetch home page');
        const htmlText = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;
        const preloadedDataEl = tempDiv.querySelector('#preloaded-data');
        if (preloadedDataEl) {
            try {
                const preloadedSections = JSON.parse(preloadedDataEl.textContent);
                siteData.services = preloadedSections.services || [];
                siteData.portfolio = preloadedSections.portfolio || [];
                siteData.blog = preloadedSections.blog || [];
                siteData.contact = preloadedSections.contact || [];
            } catch (e) { console.error("Ошибка парсинга данных:", e); }
        }
        mainContentEl.innerHTML = tempDiv.querySelector('main').innerHTML;
        applyCustomBackground(siteData.home);
        renderSeoTags(siteData.home);
        
        ['services', 'portfolio', 'blog', 'contact'].forEach(key => {
            renderSection(key, `Our ${key.charAt(0).toUpperCase() + key.slice(1)}`, siteData[key]);
        });
        initMobileSliders();
        initDesktopCarousels();
        document.querySelectorAll('#services .item-card, #portfolio .item-card, #blog .item-card, #contact .item-card, section h2').forEach(el => el.classList.add('animate-on-scroll'));
        setupObservers();
        
        const footer = document.getElementById('site-footer');
        if (footer) {
            footer.style.display = 'block';
            footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft. All rights reserved.`;
            footer.onclick = () => { window.location.href = '/admin.html'; };
        }
        document.documentElement.style.setProperty('--main-visibility', 'visible');
        
        updateScrollButtonVisibility();
        
        window.scrollTo({ top: 0, behavior: 'instant' });
        
    } catch (error) {
        console.error("Failed to navigate home:", error);
        mainContentEl.innerHTML = "<h1>Error loading home page. Please try again later.</h1>";
    }
}

async function navigateToDetailPage(collection, slug, itemLang) {
    try {
        const response = await fetch(`/${itemLang}/${collection}/${slug}/`);
        if (!response.ok) throw new Error('Failed to fetch detail page');
        const htmlText = await response.text();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;
        const detailMain = tempDiv.querySelector('main');
        if (detailMain) mainContentEl.innerHTML = detailMain.innerHTML;
        renderMenu();
        const itemsInCollection = siteData[collection] || [];
        const itemData = itemsInCollection.find && itemsInCollection.find(d => d.urlSlug === slug && d.lang === itemLang);
        if (itemData) {
            applyCustomBackground(itemData);
            renderSeoTags(itemData);
        }
        if (!document.getElementById('related-posts')) {
            renderRelatedPosts(collection, slug, itemLang);
        }
        document.querySelectorAll('h1, .detail-price').forEach(el => el.classList.add('animate-always'));
        document.querySelectorAll('.detail-content > .content-group').forEach(el => el.classList.add('floating-item'));
        document.querySelectorAll('#related-posts .item-card, #related-posts h2').forEach(el => el.classList.add('animate-on-scroll'));
        setupObservers();
        
        const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
        if (floatingTocWrapper && floatingTocWrapper.style.display !== 'none') {
            initFloatingTocToggle();
        }
        
        document.documentElement.style.setProperty('--main-visibility', 'visible');
        
        updateScrollButtonVisibility();
        
        window.scrollTo({ top: 0, behavior: 'instant' });
        
    } catch (error) {
        console.error("Failed to navigate to detail:", error);
        mainContentEl.innerHTML = "<h1>Page not found</h1>";
    }
}

function routeAndRender(isPopState = false) {
    const path = window.location.pathname;
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
    const match = path.match(detailPageRegex);
    if (match) {
        const [, lang, collection, slug] = match;
        const itemLang = lang || 'en';
        const itemsInCollection = siteData[collection] || [];
        const itemData = itemsInCollection.find && itemsInCollection.find(d => d.urlSlug === slug && d.lang === itemLang);
        if (itemData) {
            if (isPopState) {
                navigateToDetailPage(collection, slug, itemLang);
            } else {
                renderDetailPage(itemData);
                if (!document.getElementById('related-posts')) {
                    renderRelatedPosts(collection, slug, itemLang);
                }
                const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
                if (floatingTocWrapper && floatingTocWrapper.style.display !== 'none') {
                    initFloatingTocToggle();
                }
            }
        } else {
            if (isPopState) {
                navigateToDetailPage(collection, slug, itemLang);
            } else {
                mainContentEl.innerHTML = `<h1>Page not found</h1><p>The requested ${collection} item "${slug}" does not exist.</p>`;
                document.documentElement.style.setProperty('--main-visibility', 'visible');
            }
        }
    } else {
        if (isPopState) {
            navigateToHome();
        } else {
            const heroEl = document.querySelector('.hero h1');
            if (heroEl) {
                heroEl.textContent = siteData.home.h1 || '';
            }
            const heroSubtitleEl = document.querySelector('.hero-subtitle-container');
            if (heroSubtitleEl) {
                heroSubtitleEl.innerHTML = siteData.home.subtitle ? `<p>${siteData.home.subtitle}</p>` : '';
            }
            applyCustomBackground(siteData.home);
            renderSeoTags(siteData.home);
            ['services', 'portfolio', 'blog', 'contact'].forEach(key => {
                renderSection(key, `Our ${key.charAt(0).toUpperCase() + key.slice(1)}`, siteData[key]);
            });
            initMobileSliders();
            initDesktopCarousels();
            document.querySelectorAll('#services .item-card, #portfolio .item-card, #blog .item-card, #contact .item-card, section h2').forEach(el => el.classList.add('animate-on-scroll'));
            setupObservers();
            const footer = document.getElementById('site-footer');
            if (footer) {
                footer.style.display = 'block';
                footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft. All rights reserved.`;
                footer.onclick = () => { window.location.href = '/admin.html'; };
            }
            document.documentElement.style.setProperty('--main-visibility', 'visible');
            
            updateScrollButtonVisibility();
        }
    }
    const hash = window.location.hash;
    if (hash) {
        requestAnimationFrame(() => {
            scrollToElementWithOffset(hash.substring(1));
        });
    }
}

function renderRelatedPosts(collection, currentSlug, itemLang) {
    const allItems = siteData[collection] || [];
    const relatedItems = allItems.filter(it => it.urlSlug !== currentSlug && it.lang === itemLang).slice(0, 3);
    if (relatedItems.length === 0) return;
    const relatedCardsHtml = relatedItems.map(it => {
        const mediaUrl = (it.media && it.media.length) ? it.media[0] : '';
        const itemLink = `/${it.lang || 'en'}/${collection}/${it.urlSlug}/`;
        return `
            <a href="${itemLink}" class="item-card">
                <div class="item-card__image" style="background-image: url('${mediaUrl}');"></div>
                <div class="item-card__content">
                    <h3>${it.title || ''}</h3>
                    ${it.subtitle ? `<div class="card-subtitle">${it.subtitle}</div>` : ''}
                    <p>${it.description || ''}</p>
                </div>
            </a>
        `;
    }).join('');
    const relatedSection = `
        <section id="related-posts">
            <h2>You Might Also Like</h2>
            <div class="item-grid">${relatedCardsHtml}</div>
        </section>
    `;
    const scrollBtn = document.getElementById('scroll-to-top-btn');
    if (scrollBtn) {
        scrollBtn.insertAdjacentHTML('beforebegin', relatedSection);
    } else {
        mainContentEl.insertAdjacentHTML('beforeend', relatedSection);
    }
    document.querySelectorAll('#related-posts .item-card, #related-posts h2').forEach(el => el.classList.add('animate-on-scroll'));
    setupObservers();
}

function initFloatingTocToggle() {
    const toggleBtn = document.getElementById('toc-toggle-btn');
    const contentPanel = document.getElementById('toc-content-panel');
    if (!toggleBtn || !contentPanel) return;
    
    toggleBtn.addEventListener('click', function() {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        
        if (isExpanded) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            contentPanel.setAttribute('aria-hidden', 'true');
            contentPanel.classList.remove('is-visible');
            toggleBtn.classList.remove('is-active');
        } else {
            toggleBtn.setAttribute('aria-expanded', 'true');
            contentPanel.setAttribute('aria-hidden', 'false');
            contentPanel.classList.add('is-visible');
            toggleBtn.classList.add('is-active');
        }
    });
}
