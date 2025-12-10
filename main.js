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

// Global State
let isFirstLoad = true;
const mainContentEl = document.querySelector('main');
let floatingObserver, animateOnceObserver, animateAlwaysObserver;


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


// --- HYDRATION LOGIC (NO RE-RENDER) ---
function hydratePage(collection, slug, lang) {
    console.log("💧 Hydrating page logic...");

    // 1. Привязываем анимации к уже существующему контенту
    document.querySelectorAll('.detail-content > *').forEach(el => el.classList.add('floating-item'));
    document.querySelectorAll('.detail-price, #related-posts .item-card, .animated-container, .item-card').forEach(el => el.classList.add('animate-on-scroll'));
    document.querySelectorAll('h1, .hero-subtitle-container').forEach(el => el.classList.add('animate-always'));
    
    // Снимаем классы скрытия, если они вдруг остались от CSS (хотя CSS[data-static] должен был их убрать)
    document.querySelectorAll('.animate-always, .floating-item').forEach(el => el.classList.add('is-visible'));

    setupObservers();

    // 2. Если это Главная страница — запускаем логику слайдеров
    if (!collection) { 
        initMobileSliders();
        initDesktopCarousels();
        const footer = document.getElementById('site-footer');
        if (footer) footer.style.display = 'block';
    } 
    // 3. Если это Детальная страница
    else {
        const footer = document.getElementById('site-footer');
        if (footer) footer.style.display = 'none';
        
        // Фон подгружаем отложенно
        setTimeout(() => {
            // Данные еще могут не загрузиться, поэтому ждем их в initApp,
            // но если они есть, пробуем применить фон
            if (Object.keys(siteData).length > 1) {
                const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang);
                if (item) applyCustomBackground(item);
            }
        }, 1500);
    }
}


// --- SEO & DATA FUNCTIONS ---
function renderSeoTags(data) { 
    if (!data) return;
    document.querySelectorAll('meta[name="description"], meta[property^="og:"], script[type="application/ld+json"], link[rel="canonical"]').forEach(el => el.remove()); 
    document.title = data.seoTitle || "Digital Craft"; 
    document.documentElement.lang = data.lang || 'en'; 
    const createMeta = (attr, key, value) => { if (value) { const meta = document.createElement('meta'); meta.setAttribute(attr, key); meta.content = value; document.head.appendChild(meta); } }; 
    createMeta('name', 'description', data.metaDescription); 
    createMeta('property', 'og:title', data.ogTitle || data.seoTitle); 
    createMeta('property', 'og:description', data.ogDescription || data.metaDescription); 
    const ogImage = data.ogImage || data.media?.find(url => !/youtube|vimeo/.test(url)) || ''; 
    if (ogImage) createMeta('property', 'og:image', ogImage); 
    const canonical = document.createElement('link'); canonical.rel = 'canonical'; 
    const canonicalBaseUrl = 'https://digital-craft-tbilisi.site'; 
    let cleanPath = window.location.pathname; 
    if (cleanPath.includes('seo-optimization-tbilisi')) { if (!cleanPath.endsWith('/')) cleanPath += '/'; } else { if (cleanPath.length > 1 && cleanPath.endsWith('/')) { cleanPath = cleanPath.slice(0, -1); } } 
    canonical.href = canonicalBaseUrl + cleanPath; 
    document.head.appendChild(canonical); 
    let schemaData = data.schemaJsonLd; 
    if (typeof schemaData === 'string' && schemaData.trim()) { try { schemaData = JSON.parse(schemaData); } catch (e) { console.error('Failed to parse schemaJsonLd:', e); schemaData = null; } } 
    if (schemaData && typeof schemaData === 'object' && Object.keys(schemaData).length > 0) { const script = document.createElement('script'); script.type = 'application/ld+json'; script.textContent = JSON.stringify(schemaData); document.head.appendChild(script); } 
}

async function loadData() { 
    const freshSiteData = {}; 
    try { 
        const collections = ['services', 'portfolio', 'blog', 'contact']; 
        const dataPromises = [ db.collection('home').doc('content').get(), ...collections.map(col => db.collection(col).get()) ]; 
        const [homeDoc, ...snapshots] = await Promise.all(dataPromises); 
        const processDocData = (data) => { if (data && typeof data.schemaJsonLd === 'string' && data.schemaJsonLd.trim().startsWith('{')) { try { data.schemaJsonLd = JSON.parse(data.schemaJsonLd); } catch (e) { data.schemaJsonLd = {}; } } return data; }; 
        freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {}; 
        collections.forEach((col, index) => { freshSiteData[col] = snapshots[index].docs.map(doc => ({ id: doc.id, ...processDocData(doc.data()) })); }); 
        return freshSiteData; 
    } catch (error) { 
        console.error("Error loading data from Firebase:", error); 
        return JSON.parse(JSON.stringify(initialSiteData)); 
    } 
}


// --- RENDER FUNCTIONS ---
function formatContentHtml(content) { if (!content) return ''; let processedContent = content.replace(/\r\n/g, '\n'); const blocks = processedContent.split(/\n{2,}/); const html = blocks.map(block => { const trimmedBlock = block.trim(); if (!trimmedBlock) return ''; const youtubeRegex = /^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11}).*$/; const imageRegex = /^https?:\/\/[^<>"']+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$/i; const youtubeMatch = trimmedBlock.match(youtubeRegex); const imageMatch = trimmedBlock.match(imageRegex); if (/^<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)/i.test(trimmedBlock)) { return trimmedBlock; } else if (youtubeMatch && youtubeMatch[1]) { const videoId = youtubeMatch[1]; return `<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`; } else if (imageMatch) { return `<p style="margin: 1.5em 0;"><img src="${trimmedBlock}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>`; } else { return `<p>${trimmedBlock.replace(/\n/g, '<br>')}</p>`; } }).join(''); return html; }
function renderSection(key, title, items) { const section = document.getElementById(key); if (!section) return; const itemsFromDb = items || siteData[key] || []; const langOrder = ['en', 'ka', 'ua', 'ru']; const langNames = { en: 'English', ka: 'Georgian', ua: 'Ukrainian', ru: 'Russian' }; const itemsByLang = {}; itemsFromDb.forEach(item => { if (!itemsByLang[item.lang]) itemsByLang[item.lang] = []; itemsByLang[item.lang].push(item); }); const desktopGridsHTML = langOrder.map(lang => { const langItems = itemsByLang[lang]; if (!langItems || langItems.length === 0) return ''; const slides = []; for (let i = 0; i < langItems.length; i += 3) { slides.push(langItems.slice(i, i + 3)); } const slidesHTML = slides.map((slideItems, index) => { const cardsHTML = slideItems.map(item => { const langPrefix = item.lang ? `/${item.lang}` : ''; let itemUrl = `${langPrefix}/${key}/${item.urlSlug}`; if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; } return `<a href="${itemUrl}" class="item-card"><div class="item-card__image" style="background-image: url('${(item.media || []).find(url => !/youtube|vimeo/.test(url)) || ''}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`; }).join(''); return `<div class="desktop-grid-slide ${index === 0 ? 'active' : ''}">${cardsHTML}</div>`; }).join(''); const dotsHTML = slides.length > 1 ? slides.map((_, index) => `<span class="desktop-slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : ''; return `<div class="desktop-language-group"><h4 class="desktop-lang-title">${langNames[lang]}</h4><div class="desktop-carousel-container">${slidesHTML}</div>${slides.length > 1 ? `<div class="desktop-slider-nav">${dotsHTML}</div>` : ''}</div>`; }).join(''); const desktopWrapper = `<div class="desktop-grid-wrapper">${desktopGridsHTML}</div>`; const mobileSlidersHTML = langOrder.map(lang => { const langItems = itemsByLang[lang]; if (!langItems || langItems.length === 0) return ''; const slidesHTML = langItems.map((item, index) => { const langPrefix = item.lang ? `/${item.lang}` : ''; let itemUrl = `${langPrefix}/${key}/${item.urlSlug}`; if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; } return `<a href="${itemUrl}" class="item-card ${index === 0 ? 'active' : ''}"><div class="item-card__image" style="background-image: url('${(item.media || []).find(url => !/youtube|vimeo/.test(url)) || ''}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>` }).join(''); const dotsHTML = langItems.length > 1 ? langItems.map((_, index) => `<span class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : ''; return `<div class="language-slider-block"><div class="cross-fade-slider">${slidesHTML}</div><div class="slider-nav">${dotsHTML}</div></div>`; }).join(''); const mobileContainer = `<div class="mobile-sliders-container">${mobileSlidersHTML}</div>`; section.innerHTML = `<div class="animated-container"><h2>${title}</h2></div>${desktopWrapper}${mobileContainer}`; };

function renderHomePage() { 
    mainContentEl.innerHTML = `<section id="hero" class="hero"><h1 class="animate-always">Web Development & SEO in Tbilisi</h1><div class="hero-subtitle-container animate-always"><p>We create high-performance websites for Georgian businesses that attract clients and boost revenue. Modern design, cutting-edge technology, and measurable results.</p><ul class="hero-contact-list"><li><a href="https://wa.me/79119396075" target="_blank" rel="noopener noreferrer">WhatsApp</a></li><li><a href="https://t.me/ramashery" target="_blank" rel="noopener noreferrer">Telegram</a></li><li><a href="tel:+995591102653">+995 591 102 653</a></li></ul></div></section><section id="services"></section><section id="portfolio"></section><section id="blog"></section><section id="contact"></section>`; 
    renderSeoTags(siteData.home); 
    applyCustomBackground(siteData.home); 
    ['services', 'portfolio', 'blog', 'contact'].forEach(key => renderSection(key, `Our ${key.charAt(0).toUpperCase() + key.slice(1)}`, siteData[key])); 
    initMobileSliders(); 
    initDesktopCarousels(); 
    document.getElementById('site-footer').style.display = 'block'; 
}

function renderDetailPage(collection, slug, lang) { 
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang); 
    if (!item) { mainContentEl.innerHTML = `<section class="detail-page-header"><h1>404 - Not Found</h1><p>The page you were looking for does not exist.</p><a href="/">Go back home</a></section>`; return; } 
    renderSeoTags(item); 
    applyCustomBackground(item); 
    const formattedContent = formatContentHtml(item.mainContent); 
    mainContentEl.innerHTML = `<section><div class="detail-page-header"><h1 class="animate-always">${item.h1 || ''}</h1>${item.price ? `<div class="detail-price">${item.price}</div>` : ''}</div><div class="detail-content">${formattedContent}</div></section>`; 
    renderRelatedPosts(collection, slug, lang); 
    document.getElementById('site-footer').style.display = 'none'; 
}

function renderRelatedPosts(currentCollection, currentSlug, currentLang) { 
    // Если секция уже есть (например, в статике), чистим её или оставляем
    // В данном случае, статика обычно не имеет этого блока заполненным, поэтому добавляем.
    const existingRelated = document.getElementById('related-posts');
    if (existingRelated) existingRelated.remove();

    const pool = [ ...siteData.services.map(i => ({ ...i, collection: 'services' })), ...siteData.blog.map(i => ({ ...i, collection: 'blog' })) ]; 
    const relatedItems = pool.filter(item => item.lang === currentLang && !(item.collection === currentCollection && item.urlSlug === currentSlug)).sort(() => 0.5 - Math.random()).slice(0, 3); 
    if (relatedItems.length === 0) return; 
    const itemsHTML = relatedItems.map(item => { const langPrefix = item.lang ? `/${item.lang}` : ''; let itemUrl = `${langPrefix}/${item.collection}/${item.urlSlug}`; if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; } return `<a href="${itemUrl}" class="item-card"><div class="item-card__image" style="background-image: url('${(item.media || []).find(url => !/youtube|vimeo/.test(url)) || ''}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>` }).join(''); 
    const relatedSection = document.createElement('section'); 
    relatedSection.id = 'related-posts'; 
    relatedSection.innerHTML = `<h2 class="animated-container">You Might Also Like</h2><div class="item-grid">${itemsHTML}</div>`; 
    mainContentEl.appendChild(relatedSection); 
}

function renderMenu() { 
    const menuEl = document.querySelector('.nav-menu'); 
    if (!menuEl) return; 
    const menuItems = [{ label: 'Home', href: '/' }, { label: 'Services', href: '/#services' }, { label: 'Portfolio', href: '/#portfolio' }, { label: 'Blog', href: '/#blog' }, { label: 'Contact', href: '/#contact' }]; 
    menuEl.innerHTML = menuItems.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join(''); 
}

function applyCustomBackground(item = null) { 
    const iframe = document.getElementById('custom-background-iframe'); 
    const customCode = item?.backgroundHtml || siteData.home?.backgroundHtml || ''; 
    if (customCode && customCode.trim() !== "") { if (iframe.style.display !== 'block') iframe.style.display = 'block'; if (iframe.srcdoc !== customCode) iframe.srcdoc = customCode; } else { if (iframe.style.display !== 'none') iframe.style.display = 'none'; iframe.srcdoc = ''; } 
}

function initDesktopCarousels() { 
    document.querySelectorAll('.desktop-carousel-container').forEach(carousel => { 
        const slides = carousel.querySelectorAll('.desktop-grid-slide'); 
        const nav = carousel.nextElementSibling; 
        if (!nav || !nav.matches('.desktop-slider-nav')) return; 
        const dots = nav.querySelectorAll('.desktop-slider-dot'); 
        if (slides.length <= 1) return; 
        let currentIndex = 0; let autoSlideInterval; 
        function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } 
        function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); } 
        function stopAutoSlide() { clearInterval(autoSlideInterval); } 
        goToSlide(0); startAutoSlide(); 
        nav.addEventListener('click', e => { if (e.target.matches('.desktop-slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); 
    }); 
}

function initMobileSliders() { 
    document.querySelectorAll('.language-slider-block').forEach(sliderBlock => { 
        const slider = sliderBlock.querySelector('.cross-fade-slider'); 
        const slides = slider.querySelectorAll('.item-card'); 
        const nav = sliderBlock.querySelector('.slider-nav'); 
        const dots = nav.querySelectorAll('.slider-dot'); 
        if (slides.length <= 1) return; 
        let currentIndex = 0; let touchStartX = 0; let autoSlideInterval; 
        function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } 
        function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); } 
        function stopAutoSlide() { clearInterval(autoSlideInterval); } 
        goToSlide(0); startAutoSlide(); 
        nav.addEventListener('click', e => { if (e.target.matches('.slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); 
        slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopAutoSlide(); }, { passive: true }); 
        slider.addEventListener('touchend', e => { const touchEndX = e.changedTouches[0].screenX; const swipeThreshold = 40; if (touchEndX < touchStartX - swipeThreshold) { goToSlide(currentIndex + 1); } else if (touchEndX > touchStartX + swipeThreshold) { goToSlide(currentIndex - 1); } startAutoSlide(); }, { passive: true }); 
    }); 
}


// --- ROUTER & NAVIGATION LOGIC ---
function routeAndRender(isPopState = false) {
    if (typeof ym === 'function' && !isPopState) {
        ym(103413242, 'hit', window.location.href);
    }
    const path = window.location.pathname;
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
    const match = path.match(detailPageRegex);
    
    // Parse URL params
    let lang = 'en';
    let collection = null;
    let slug = null;

    if (match) {
        [, lang, collection, slug] = match;
        lang = lang || 'en';
    } else {
        const langMatch = path.match(/^\/([a-z]{2})\/?$/);
        lang = langMatch ? langMatch[1] : 'en';
    }

    const isStaticPage = document.body.dataset.staticPage === "true";

    // СЦЕНАРИЙ 1: ГИДРАТАЦИЯ (Статика, первый вход)
    if (isFirstLoad && isStaticPage) {
        hydratePage(collection, slug, lang);
    } 
    // СЦЕНАРИЙ 2: СПА НАВИГАЦИЯ
    else {
        if (match) {
            renderDetailPage(collection, slug, lang);
        } else {
            // Проверка на разделы типа /#services
            if (path === '/' || path.match(/^\/[a-z]{2}\/?$/)) {
                 renderHomePage();
            }
        }
        
        // Навешиваем классы анимации для нового контента
        document.querySelectorAll('.detail-content > *').forEach(el => el.classList.add('floating-item'));
        document.querySelectorAll('.detail-price, #related-posts .item-card, .animated-container, .item-card').forEach(el => el.classList.add('animate-on-scroll'));
        
        setupObservers();
    }
    
    isFirstLoad = false;
}

function handleNavigation(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || link.protocol !== window.location.protocol || link.host !== window.location.host || e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
    }

    e.preventDefault();
    
    const targetUrl = new URL(link.href);
    const menuToggle = document.querySelector('.menu-toggle');
    const navOverlay = document.querySelector('.nav-overlay');
    const isMenuOpen = document.body.classList.contains('nav-is-open');

    if (isMenuOpen) {
        document.body.classList.remove('nav-is-open');
        menuToggle.classList.remove('is-active');
        navOverlay.classList.remove('is-active');
    }

    if (targetUrl.hash) {
        const menuCloseDelay = isMenuOpen ? 350 : 0;
        setTimeout(() => {
            if (targetUrl.pathname === window.location.pathname) {
                const targetElement = document.getElementById(targetUrl.hash.substring(1));
                if (targetElement) {
                    window.history.pushState({}, '', targetUrl.href);
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
                return;
            }
            mainContentEl.style.transition = 'opacity 0.4s ease-in-out, transform 0.4s ease-in-out';
            mainContentEl.classList.add('is-transitioning');
            setTimeout(() => {
                window.history.pushState({}, '', targetUrl.pathname);
                mainContentEl.style.transition = 'none';
                routeAndRender();
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        mainContentEl.style.transition = 'opacity 0.4s ease-in-out, transform 0.4s ease-in-out';
                        mainContentEl.classList.remove('is-transitioning');
                        window.history.replaceState({}, '', targetUrl.href);
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                const targetElement = document.getElementById(targetUrl.hash.substring(1));
                                if (targetElement) {
                                    setTimeout(() => { targetElement.scrollIntoView({ behavior: 'smooth' }); }, 50);
                                } else {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }
                            });
                        });
                    });
                });
            }, 400);
        }, menuCloseDelay);
        return;
    }

    if (targetUrl.href === window.location.href) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const transitionDelay = isMenuOpen ? 250 : 0;
    setTimeout(() => {
        mainContentEl.style.transition = 'opacity 0.4s ease-in-out, transform 0.4s ease-in-out';
        mainContentEl.classList.add('is-transitioning');
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href);
            mainContentEl.style.transition = 'none';
            routeAndRender();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    mainContentEl.style.transition = 'opacity 0.4s ease-in-out, transform 0.4s ease-in-out';
                    mainContentEl.classList.remove('is-transitioning');
                });
            });
            window.scrollTo({ top: 0, behavior: 'auto' });
        }, 400);
    }, transitionDelay);
}


// --- INITIALIZATION ---
function initStaticEventListeners() {
    document.body.addEventListener('click', handleNavigation);
    window.addEventListener('popstate', () => routeAndRender(true));
    
    const menuToggle = document.querySelector('.menu-toggle');
    const navOverlay = document.querySelector('.nav-overlay');
    menuToggle.addEventListener('click', () => {
        document.body.classList.toggle('nav-is-open');
        menuToggle.classList.toggle('is-active');
        navOverlay.classList.toggle('is-active');
    });
    
    const footer = document.getElementById('site-footer');
    if(footer) {
        footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft. All rights reserved.`;
        footer.addEventListener('click', () => { window.location.href = '/admin.html'; });
    }
}

async function initApp() {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    initStaticEventListeners();
    
    // Проверка статики
    const isStatic = document.body.dataset.staticPage === "true";

    // 1. Если статика — запускаем роутер СРАЗУ для гидратации (не ждем DB)
    if (isStatic) {
        // Убираем лоадер и открываем main (дублируем CSS логику на всякий случай)
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');
        mainContentEl.classList.remove('loading');
        
        routeAndRender(); 
    }

    try {
        // 2. Грузим данные
        siteData = await loadData();
        renderMenu();
        
        // 3. Если статика — догружаем Related Posts и фон, так как данные пришли
        if (isStatic) {
            // Парсим URL чтобы понять, какую статью догружать
            const path = window.location.pathname;
            const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
            const match = path.match(detailPageRegex);
            
            if (match) {
                const [, lang, collection, slug] = match;
                renderRelatedPosts(collection, slug, lang || 'en');
                // Обновляем обсервер для новых элементов
                setupObservers();
                
                // Пробуем фон (повторно, если таймер из hydratePage не успел)
                const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === (lang || 'en'));
                if (item) applyCustomBackground(item);
            } else {
                 // Главная страница
                 applyCustomBackground(siteData.home);
            }
        } 
        // 4. Если SPA (вход на пустую страницу) — рендерим с нуля
        else {
            routeAndRender();
            mainContentEl.classList.remove('loading');
            const loader = document.getElementById('loader');
            if(loader) loader.classList.add('hidden');
        }
        
    } catch (error) {
        console.error("Failed to initialize app:", error);
        if (!isStatic) {
            mainContentEl.innerHTML = "<h1>Error loading site data. Please try again later.</h1>";
            mainContentEl.classList.remove('loading');
        }
    }
}

window.addEventListener('DOMContentLoaded', initApp);