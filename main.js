// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4",
  authDomain: "razrabotka-b61bc.firebaseapp.com",
  projectId: "razrabotka-b61bc",
  storageBucket: "razrabotka-b61bc.firebasestorage.app",
  messagingSenderId: "394402564794",
  appId: "1:394402564794:web:f610ffb03e655c600c5083"
};

// Глобальные переменные
let db = null;
let isFirebaseInitialized = false;

// --- LOCAL DATA CACHE & INITIAL DATA ---
let siteData = {};
const initialSiteData = {
    home: { h1: "", subtitle: "", lang: "en", seoTitle: "Digital Craft", metaDescription: "Professional websites for small businesses", schemaJsonLd: {}, ogTitle: "", ogDescription: "", ogImage: "", backgroundHtml: "" },
    services: [], portfolio: [], blog: [], contact: []
};

// --- SEO & DATA FUNCTIONS ---
function renderSeoTags(data) {
    if (!data) return;
    // Удаляем старые мета-теги
    document.querySelectorAll('meta[name="description"], meta[property^="og:"], script[type="application/ld+json"], link[rel="canonical"]').forEach(el => el.remove());
    
    if (data.seoTitle && document.title !== data.seoTitle) {
        document.title = data.seoTitle;
    }
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
    
    const ogImage = data.ogImage || data.media?.find(url => !/youtube|vimeo/.test(url)) || '';
    if (ogImage) createMeta('property', 'og:image', ogImage);
    
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    const canonicalBaseUrl = 'https://digital-craft-tbilisi.site'; 
    let cleanPath = window.location.pathname;
    
    if (cleanPath.includes('seo-optimization-tbilisi')) {
        if (!cleanPath.endsWith('/')) cleanPath += '/';
    } else {
        if (cleanPath.length > 1 && cleanPath.endsWith('/')) { cleanPath = cleanPath.slice(0, -1); }
    }
    
    canonical.href = canonicalBaseUrl + cleanPath;
    document.head.appendChild(canonical);
    
    // Schema.org
    let schemaData = data.schemaJsonLd;
    if (typeof schemaData === 'string' && schemaData.trim()) {
        try { schemaData = JSON.parse(schemaData); } catch (e) { schemaData = null; }
    }
    
    if (!schemaData) schemaData = generateFallbackSchema(data);

    if (schemaData) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schemaData);
        document.head.appendChild(script);
    }
}

function generateFallbackSchema(data) {
    if (!data.h1 && !data.seoTitle && !data.title) return null;
    const baseUrl = 'https://digital-craft-tbilisi.site';
    let cleanPath = window.location.pathname;
    if (cleanPath.length > 1 && cleanPath.endsWith('/')) { cleanPath = cleanPath.slice(0, -1); }
    const schema = { "@context": "https://schema.org", "@type": "WebPage", "name": data.h1 || data.seoTitle || data.title || document.title, "url": baseUrl + cleanPath };
    if (data.metaDescription || data.description) { schema.description = data.metaDescription || data.description; }
    const image = data.ogImage || data.media?.find(url => !/youtube|vimeo/.test(url));
    if (image) { schema.image = image; }
    return schema;
}

// --- OPTIMIZED DATA LOADING ---
async function initFirebase() {
    if (isFirebaseInitialized) return;
    if (typeof firebase === 'undefined') return;
    
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        // Включаем кэширование для скорости при повторных визитах
        try { await db.enablePersistence(); } catch (err) { console.log("Persistence disabled"); }
        isFirebaseInitialized = true;
    } catch (e) {
        console.error("Firebase init error:", e);
    }
}

async function loadData() { 
    if (!isFirebaseInitialized) await initFirebase();
    if (!db) return JSON.parse(JSON.stringify(initialSiteData));

    const freshSiteData = {}; 
    try { 
        const collections = ['services', 'portfolio', 'blog', 'contact']; 
        // Загружаем Home отдельно, чтобы проверить существование
        const homeDoc = await db.collection('home').doc('content').get();
        
        const processDocData = (data) => { 
            if (data && typeof data.schemaJsonLd === 'string' && data.schemaJsonLd.trim().startsWith('{')) { 
                try { data.schemaJsonLd = JSON.parse(data.schemaJsonLd); } catch (e) { data.schemaJsonLd = {}; } 
            } 
            return data; 
        }; 
        
        freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {}; 
        
        // Грузим остальные коллекции
        const snapshots = await Promise.all(collections.map(col => db.collection(col).get()));
        collections.forEach((col, index) => { 
            freshSiteData[col] = snapshots[index].docs.map(doc => ({ id: doc.id, ...processDocData(doc.data()) })); 
        }); 
        return freshSiteData; 
    } catch (error) { 
        console.error("Error loading data:", error); 
        return JSON.parse(JSON.stringify(initialSiteData)); 
    } 
}

// --- HYDRATION LOGIC FOR STATIC PAGES ---
function hydrateStaticPage(siteData) {
    const path = window.location.pathname;
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
    const match = path.match(detailPageRegex);

    if (!match) return;

    const [, lang, collection, slug] = match;
    const currentLang = lang || 'en';
    
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === currentLang);

    if (item) {
        applyCustomBackground(item);
        updateMetaTags(item);

        const mainImageEl = document.querySelector('.detail-main-image');
        if (mainImageEl && item.media && item.media.length > 0) {
            const freshImage = item.media.find(url => !/youtube|vimeo/.test(url));
            if (freshImage && mainImageEl.getAttribute('src') !== freshImage) {
                mainImageEl.style.opacity = '0'; 
                setTimeout(() => {
                    mainImageEl.src = freshImage;
                    mainImageEl.onload = () => { mainImageEl.style.opacity = '1'; };
                }, 200);
            }
        }
        
        const priceEl = document.querySelector('.detail-price');
        if (priceEl && item.price) {
             priceEl.textContent = item.price;
        }
    } else {
        applyCustomBackground(siteData.home);
    }
}

// --- ROUTER AND RENDER LOGIC ---
const mainContentEl = document.querySelector('main');
const defaultLang = 'en';

function formatContentHtml(content) { 
    if (!content) return ''; 
    let processedContent = content.replace(/\r\n/g, '\n'); 
    const blocks = processedContent.split(/\n{2,}/); 
    const html = blocks.map(block => { 
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
            return `<p style="margin: 1.5em 0;"><img src="${trimmedBlock}" alt="Embedded content" loading="lazy" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>`; 
        } else { 
            return `<p>${trimmedBlock.replace(/\n/g, '<br>')}</p>`; 
        } 
    }).join(''); 
    return html; 
}

let paragraphObserver, floatingObserver, homePageObserver;

function routeAndRender() { 
    if (typeof ym === 'function') { ym(103413242, 'hit', window.location.href); } 
    if (paragraphObserver) paragraphObserver.disconnect(); 
    if (floatingObserver) floatingObserver.disconnect(); 
    if (homePageObserver) homePageObserver.disconnect(); 
    
    const path = window.location.pathname; 
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/; 
    const match = path.match(detailPageRegex); 
    const footer = document.getElementById('site-footer'); 
    
    footer.style.display = 'none'; 
    
    if (match) { 
        mainContentEl.innerHTML = '';
        const [, lang, collection, slug] = match; 
        const currentLang = lang || defaultLang; 
        renderDetailPage(collection, slug, currentLang); 
    } else { 
        renderHomePage(); 
        footer.style.display = 'block'; 
    } 
};

function renderHomePage() { 
    const heroExists = document.getElementById('hero');
    
    if (!heroExists) {
        mainContentEl.innerHTML = `<section id="hero" class="hero"></section><section id="services"></section><section id="portfolio"></section><section id="blog"></section><section id="contact"></section>`; 
    }

    applyCustomBackground(); 
    updateMetaTags(); 
    
    renderHero(); 
    
    // Рендерим секции только если данные загружены
    if (siteData.services && siteData.services.length > 0) {
        renderSection('services', 'Our Services', siteData.services); 
        renderSection('portfolio', 'Our Work', siteData.portfolio); 
        renderSection('blog', 'Latest Insights', siteData.blog); 
        renderSection('contact', 'Get in Touch', siteData.contact); 
        
        initMobileSliders(); 
        initDesktopCarousels(); 
        initFloatingObservers(); 
        initHomePageObservers(); 
    }
};

function renderDetailPage(collection, slug, lang) { 
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang); 
    if (!item) { 
        mainContentEl.innerHTML = `<section class="detail-page-header"><h1>404 - Not Found</h1><p>The page you were looking for does not exist.</p><a href="/">Go back home</a></section>`; 
        document.title = "404 Not Found | Digital Craft"; 
        applyCustomBackground(); 
        return; 
    } 
    document.documentElement.lang = lang; 
    applyCustomBackground(item); 
    updateMetaTags(item); 
    const formattedContent = formatContentHtml(item.mainContent); 
    const imgUrl = (item.media || []).find(url => !/youtube|vimeo/.test(url)) || '';
    
    mainContentEl.innerHTML = `<section><div class="detail-page-header"><h1 class="fade-in-up" style="animation-delay: 0.5s;">${item.h1 || ''}</h1>${item.price ? `<div class="detail-price fade-in-up" style="animation-delay: 0.7s;">${item.price}</div>` : ''}</div><img class="detail-main-image fade-in-up" src="${imgUrl}" alt="${item.mainImageAlt || item.title}" style="animation-delay: 0.6s;"><div class="detail-content">${formattedContent}</div></section>`; 
    renderRelatedPosts(collection, slug, lang); 
    initParagraphObservers(); 
}

function renderRelatedPosts(currentCollection, currentSlug, currentLang) { 
    const pool = [ ...siteData.services.map(i => ({ ...i, collection: 'services' })), ...siteData.blog.map(i => ({ ...i, collection: 'blog' })) ]; 
    const relatedItems = pool.filter(item => item.lang === currentLang && !(item.collection === currentCollection && item.urlSlug === currentSlug)).sort(() => 0.5 - Math.random()).slice(0, 3); 
    if (relatedItems.length === 0) return; 
    
    const itemsHTML = relatedItems.map(item => { 
        const langPrefix = item.lang ? `/${item.lang}` : ''; 
        let itemUrl = `${langPrefix}/${item.collection}/${item.urlSlug}`; 
        if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; }
        
        const imgUrl = (item.media || []).find(url => !/youtube|vimeo/.test(url)) || '';

        return `<a href="${itemUrl}" class="item-card floating-item"><div class="item-card__image"><img src="${imgUrl}" loading="lazy" alt="${item.title}" /></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>` 
    }).join(''); 
    
    const relatedSection = document.createElement('section'); 
    relatedSection.id = 'related-posts'; 
    relatedSection.innerHTML = `<h2 class="fade-in-up">You Might Also Like</h2><div class="item-grid">${itemsHTML}</div>`; 
    mainContentEl.appendChild(relatedSection); 
    initFloatingObservers(); 
}

function updateMetaTags(itemData = {}) { 
    const dataToRender = (itemData && Object.keys(itemData).length > 0) ? itemData : siteData.home; 
    renderSeoTags(dataToRender); 
}

function renderMenu() { 
    const menuEl = document.querySelector('.nav-menu'); 
    if (!menuEl) return; 
    const menuItems = [ { label: 'Home', href: '/#hero' }, { label: 'Services', href: '/#services' }, { label: 'Portfolio', href: '/#portfolio' }, { label: 'Blog', href: '/#blog' }, { label: 'Contact', href: '/#contact' } ]; 
    menuEl.innerHTML = menuItems.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join(''); 
}

function renderHero() { 
    const heroSection = document.getElementById('hero');
    if (!heroSection) return;

    // PERFORMANCE FIX: Если Hero уже есть (статический HTML), не перерисовываем его
    if (heroSection.childElementCount > 0) return;

    heroSection.innerHTML = `
        <h1>Web Development <br class="mobile-break"> & SEO in Tbilisi</h1>
        <div class="hero-subtitle-container" style="animation-delay: 0.3s;">
            <p>We create high-performance websites for Georgian businesses that attract clients and boost revenue. Modern design, cutting-edge technology, and measurable results.</p>
            <ul style="list-style: disc; padding-left: 20px; margin-top: 25px;">
                <li style="margin-bottom: 10px;">
                    <a href="https://wa.me/79119396075" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </li>
                <li style="margin-bottom: 10px;">
                    <a href="https://t.me/ramashery" target="_blank" rel="noopener noreferrer">Telegram</a>
                </li>
                <li style="margin-bottom: 10px;">
                    <a href="tel:+995591102653">+995 591 102 653</a>
                </li>
            </ul>
        </div>
    `;
};

function renderSection(key, title, items) { 
    const section = document.getElementById(key); 
    if (!section) return; 
    
    // Если секция уже отрисована, не трогаем её
    if (section.childElementCount > 0 && section.getAttribute('data-rendered') === 'true') return;

    const itemsFromDb = items || siteData[key] || []; 
    const langOrder = ['en', 'ka', 'ua', 'ru']; 
    const langNames = { en: 'English', ka: 'Georgian', ua: 'Ukrainian', ru: 'Russian' }; 
    const itemsByLang = {}; 
    itemsFromDb.forEach(item => { if (!itemsByLang[item.lang]) itemsByLang[item.lang] = []; itemsByLang[item.lang].push(item); }); 
    
    const desktopGridsHTML = langOrder.map(lang => { 
        const langItems = itemsByLang[lang]; if (!langItems || langItems.length === 0) return ''; 
        const slides = []; for (let i = 0; i < langItems.length; i += 3) { slides.push(langItems.slice(i, i + 3)); } 
        const slidesHTML = slides.map((slideItems, index) => { 
            const cardsHTML = slideItems.map(item => { 
                const langPrefix = item.lang ? `/${item.lang}` : ''; 
                let itemUrl = `${langPrefix}/${key}/${item.urlSlug}`; 
                if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; }
                
                const imgUrl = (item.media || []).find(url => !/youtube|vimeo/.test(url)) || '';

                return `<a href="${itemUrl}" class="item-card floating-item"><div class="item-card__image"><img src="${imgUrl}" loading="lazy" alt="${item.title}" /></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`; 
            }).join(''); 
            return `<div class="desktop-grid-slide ${index === 0 ? 'active' : ''}">${cardsHTML}</div>`; 
        }).join(''); 
        const dotsHTML = slides.length > 1 ? slides.map((_, index) => `<span class="desktop-slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : ''; return `<div class="desktop-language-group"><h4 class="desktop-lang-title">${langNames[lang]}</h4><div class="desktop-carousel-container">${slidesHTML}</div>${slides.length > 1 ? `<div class="desktop-slider-nav">${dotsHTML}</div>` : ''}</div>`; 
    }).join(''); 
    
    const desktopWrapper = `<div class="desktop-grid-wrapper">${desktopGridsHTML}</div>`; 
    
    const mobileSlidersHTML = langOrder.map(lang => { 
        const langItems = itemsByLang[lang]; if (!langItems || langItems.length === 0) return ''; 
        const slidesHTML = langItems.map((item, index) => { 
            const langPrefix = item.lang ? `/${item.lang}` : ''; 
            let itemUrl = `${langPrefix}/${key}/${item.urlSlug}`; 
            if (item.urlSlug === 'seo-optimization-tbilisi') { itemUrl += '/'; }

            const imgUrl = (item.media || []).find(url => !/youtube|vimeo/.test(url)) || '';

            return `<a href="${itemUrl}" class="item-card ${index === 0 ? 'active' : ''}"><div class="item-card__image"><img src="${imgUrl}" loading="lazy" alt="${item.title}" /></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>` 
        }).join(''); 
        const dotsHTML = langItems.length > 1 ? langItems.map((_, index) => `<span class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : ''; return `<div class="language-slider-block"><div class="cross-fade-slider">${slidesHTML}</div><div class="slider-nav">${dotsHTML}</div></div>`; 
    }).join(''); 
    const mobileContainer = `<div class="mobile-sliders-container">${mobileSlidersHTML}</div>`; 
    
    section.innerHTML = `<div class="animated-container"><h2>${title}</h2></div>${desktopWrapper}${mobileContainer}`; 
    section.setAttribute('data-rendered', 'true');
};

function initDesktopCarousels() { 
    document.querySelectorAll('.desktop-carousel-container').forEach(carousel => { 
        const slides = carousel.querySelectorAll('.desktop-grid-slide'); 
        const nav = carousel.nextElementSibling; 
        if (!nav || !nav.matches('.desktop-slider-nav')) return; 
        const dots = nav.querySelectorAll('.desktop-slider-dot'); 
        const updateCarouselHeight = () => { 
            const activeSlide = carousel.querySelector('.desktop-grid-slide.active'); 
            if (activeSlide) { carousel.style.height = `${activeSlide.offsetHeight}px`; } 
        }; 
        if (slides.length <= 1) { setTimeout(updateCarouselHeight, 100); return; } 
        let currentIndex = 0; let autoSlideInterval; 
        function goToSlide(index) { 
            currentIndex = (index + slides.length) % slides.length; 
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); 
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); 
            updateCarouselHeight(); 
        } 
        function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); } 
        function stopAutoSlide() { clearInterval(autoSlideInterval); } 
        updateCarouselHeight(); startAutoSlide(); 
        nav.addEventListener('click', e => { if (e.target.matches('.desktop-slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); 
    }); 
}

function initMobileSliders() { 
    document.querySelectorAll('.language-slider-block').forEach(sliderBlock => { 
        const slider = sliderBlock.querySelector('.cross-fade-slider'); 
        const slides = slider.querySelectorAll('.item-card'); 
        const nav = sliderBlock.querySelector('.slider-nav'); 
        const dots = nav.querySelectorAll('.slider-dot'); 
        const updateSliderHeight = () => { 
            const activeSlide = slider.querySelector('.item-card.active'); 
            if (activeSlide) { slider.style.height = `${activeSlide.offsetHeight}px`; } 
        }; 
        if (slides.length <= 1) { setTimeout(updateSliderHeight, 100); return; } 
        let currentIndex = 0; let touchStartX = 0; let autoSlideInterval; 
        function goToSlide(index) { 
            currentIndex = (index + slides.length) % slides.length; 
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); 
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); 
            updateSliderHeight(); 
        } 
        function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); } 
        function stopAutoSlide() { clearInterval(autoSlideInterval); } 
        updateSliderHeight(); startAutoSlide(); 
        nav.addEventListener('click', e => { if (e.target.matches('.slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); 
        slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopAutoSlide(); }, { passive: true }); 
        slider.addEventListener('touchend', e => { 
            const touchEndX = e.changedTouches[0].screenX; 
            const swipeThreshold = 40; 
            if (touchEndX < touchStartX - swipeThreshold) { goToSlide(currentIndex + 1); } 
            else if (touchEndX > touchStartX + swipeThreshold) { goToSlide(currentIndex - 1); } 
            startAutoSlide(); 
        }, { passive: true }); 
    }); 
}

function createFloatingObserver() { 
    return new IntersectionObserver((entries) => { 
        entries.forEach(entry => { 
            const target = entry.target; 
            const isAboveViewport = entry.boundingClientRect.top < 0; 
            if (entry.isIntersecting) { target.classList.add('is-visible'); target.classList.remove('is-above'); } 
            else { target.classList.remove('is-visible'); if (isAboveViewport) { target.classList.add('is-above'); } else { target.classList.remove('is-above'); } } 
        }); 
    }, { threshold: 0, rootMargin: "-50px 0px -50px 0px" }); 
}

function initParagraphObservers() { 
    if (paragraphObserver) paragraphObserver.disconnect(); 
    paragraphObserver = createFloatingObserver(); 
    document.querySelectorAll(".detail-content p, .detail-content li, .detail-content div.embedded-video, .detail-content p > img, #related-posts .item-card").forEach(el => { 
        const targetEl = el.tagName === 'IMG' ? el.parentElement : el; 
        if (!targetEl.classList.contains('floating-item')) { targetEl.classList.add('floating-item'); } 
        paragraphObserver.observe(targetEl); 
    }); 
}

function initFloatingObservers() { 
    if (floatingObserver) floatingObserver.disconnect(); 
    floatingObserver = createFloatingObserver(); 
    document.querySelectorAll(".item-card.floating-item").forEach(el => { floatingObserver.observe(el); }); 
}

function initHomePageObservers() { 
    if (homePageObserver) homePageObserver.disconnect(); 
    homePageObserver = new IntersectionObserver((entries) => { 
        entries.forEach(entry => { 
            const animatedElements = entry.target.id === 'hero' ? entry.target.querySelectorAll('h1, .hero-subtitle-container') : entry.target.querySelectorAll('.animated-container'); 
            if (entry.isIntersecting) { 
                animatedElements.forEach((el, index) => { 
                    el.classList.add('fade-in-up'); 
                }); 
            } else { 
                animatedElements.forEach(el => { el.classList.remove('fade-in-up'); }); 
            } 
        }); 
    }, { threshold: 0.1 }); 
    document.querySelectorAll('#hero, #services, #portfolio, #blog, #contact, #related-posts').forEach(section => { if(section) homePageObserver.observe(section); }); 
}

function handleNavigation(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || link.protocol !== window.location.protocol || link.host !== window.location.host || e.metaKey || e.ctrlKey || e.shiftKey) { return; }
    const linkUrl = new URL(link.href);
    if (linkUrl.pathname === '/' && linkUrl.hash) {
        e.preventDefault();
        const targetElementId = linkUrl.hash.substring(1);
        const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
        const isOnHomePage = !detailPageRegex.test(window.location.pathname);
        if (isOnHomePage) { document.getElementById(targetElementId)?.scrollIntoView({ behavior: 'smooth' }); } 
        else {
            window.history.pushState({}, '', linkUrl.pathname + linkUrl.hash);
            routeAndRender(); 
            setTimeout(() => { document.getElementById(targetElementId)?.scrollIntoView({ behavior: 'smooth' }); }, 150);
        }
        const menuToggle = document.querySelector('.menu-toggle');
        const navOverlay = document.querySelector('.nav-overlay');
        if (document.body.classList.contains('nav-is-open')) { document.body.classList.remove('nav-is-open'); menuToggle.classList.remove('is-active'); navOverlay.classList.remove('is-active'); }
        return;
    }
    if (linkUrl.href === window.location.href) { e.preventDefault(); return; }
    e.preventDefault();
    window.history.pushState({}, '', linkUrl.pathname + linkUrl.search + linkUrl.hash);
    routeAndRender();
    window.scrollTo(0, 0);
};

function initStaticEventListeners() { 
    document.body.addEventListener('click', handleNavigation); 
    window.addEventListener('popstate', routeAndRender); 
    let resizeTimer; 
    window.addEventListener('resize', () => { 
        clearTimeout(resizeTimer); 
        resizeTimer = setTimeout(() => { 
            document.querySelectorAll('.cross-fade-slider, .desktop-carousel-container').forEach(slider => { 
                const activeSlide = slider.querySelector('.item-card.active, .desktop-grid-slide.active'); 
                if (activeSlide) { slider.style.height = `${activeSlide.offsetHeight}px`; } 
            }); 
        }, 200); 
    }); 
    const menuToggle = document.querySelector('.menu-toggle'); 
    const navOverlay = document.querySelector('.nav-overlay'); 
    menuToggle.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        document.body.classList.toggle('nav-is-open'); 
        menuToggle.classList.toggle('is-active'); 
        navOverlay.classList.toggle('is-active'); 
    }); 
    navOverlay.addEventListener('click', (e) => { 
        const link = e.target.closest('a'); 
        if (link || e.target === navOverlay) { 
            document.body.classList.remove('nav-is-open'); 
            menuToggle.classList.remove('is-active'); 
            navOverlay.classList.remove('is-active'); 
        } 
    }); 
    const footer = document.getElementById('site-footer'); 
    footer.innerHTML = `© 2025 Digital Craft. All rights reserved.`; 
    footer.addEventListener('click', () => { window.location.href = '/admin.html'; }); 
}

function applyCustomBackground(item = null) { 
    const iframe = document.getElementById('custom-background-iframe'); 
    const customCode = item?.backgroundHtml || siteData.home?.backgroundHtml || ''; 
    if (customCode.trim() !== "") { 
        iframe.style.display = 'block'; 
        iframe.srcdoc = customCode; 
    } else { 
        iframe.style.display = 'none'; 
        iframe.srcdoc = ''; 
    } 
}

// --- MAIN APP INITIALIZATION (PERFORMANCE FIX) ---
function initApp() {
    // 1. Инициализируем слушатели событий (меню) сразу же
    initStaticEventListeners();
    
    // 2. PERFORMANCE: Мгновенно скрываем лоадер, чтобы показать статический Hero
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');

    // 3. Рендерим меню (оно легкое)
    renderMenu();

    // 4. Проверяем, это статическая страница (SEO) или главная?
    const isStaticPage = document.body.hasAttribute('data-static-page');

    if (isStaticPage) {
        // Для SEO страниц грузим данные сразу, чтобы гидратация прошла быстро
        loadData().then((freshSiteData) => {
            siteData = freshSiteData;
            hydrateStaticPage(freshSiteData);
            initFloatingObservers();
            initParagraphObservers(); 
            initMobileSliders();
            initDesktopCarousels();
            
            const path = window.location.pathname;
            const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
            const match = path.match(detailPageRegex);
            if (match) {
                 const [, lang, collection, slug] = match;
                 renderRelatedPosts(collection, slug, lang || 'en');
            }
        });
    } else {
        // 5. ГЛАВНАЯ СТРАНИЦА: Откладываем загрузку данных на 3 секунды
        // Это дает браузеру время отрисовать Hero и успокоить CPU
        setTimeout(() => {
            console.log("Starting lazy data load...");
            loadData().then((freshSiteData) => {
                siteData = freshSiteData;
                // Обновляем UI (добавляем секции под Hero)
                routeAndRender(); 
                console.log("Data loaded and UI updated silently.");
            }).catch(error => {
                console.error("Failed to load initial data:", error);
            });
        }, 3000);
    }
}

window.addEventListener('DOMContentLoaded', initApp);