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
    services: [], portfolio: [], blog: [], contact: [], carouselItems: []
};

let ssrCarouselHtml = ''; 

const mainContentEl = document.querySelector('main');
let floatingObserver, animateOnceObserver, animateAlwaysObserver;

// --- TRANSLITERATION MAPS ---
const GEORGIAN_TRANSLIT_MAP = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i',
    'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's',
    'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts',
    'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h',
};

const CYRILLIC_TRANSLIT_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ґ': 'g', 'є': 'ye', 'і': 'i', 'ї': 'yi',
};

function slugify(text) {
    text = String(text).toLowerCase();
    let hasGeorgian = false;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        if (charCode >= 0x10D0 && charCode <= 0x10FF) { hasGeorgian = true; break; }
    }
    if (hasGeorgian) {
        let transliterated = '';
        for (let i = 0; i < text.length; i++) transliterated += GEORGIAN_TRANSLIT_MAP[text[i]] || text[i];
        text = transliterated;
    }
    let hasCyrillic = false;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        if (charCode >= 0x0400 && charCode <= 0x04FF) { hasCyrillic = true; break; }
    }
    if (hasCyrillic) {
        let transliterated = '';
        for (let i = 0; i < text.length; i++) transliterated += CYRILLIC_TRANSLIT_MAP[text[i]] || text[i];
        text = transliterated;
    }
    text = text.replace(/[^a-z0-9-]+/g, '-');
    text = text.replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
    return text;
}

// --- INTERSECTION OBSERVER SETUP (WITH LAZY LOADING) ---
function setupObservers() {
    // Disconnect existing observers to prevent re-observation
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
                if (isAboveViewport) target.classList.add('is-above');
                else target.classList.remove('is-above');
            }
        });
    }, { threshold: 0, rootMargin: "-50px 0px -50px 0px" });

    animateOnceObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                
                // --- LAZY LOADING LOGIC ---
                // Check if the target or its children have data-bg-src
                // This covers cases where animate-on-scroll is on the card itself
                const lazyImages = target.querySelectorAll('[data-bg-src]');
                lazyImages.forEach(img => {
                    img.style.backgroundImage = `url('${img.dataset.bgSrc}')`;
                    img.removeAttribute('data-bg-src');
                });

                // Also check if the target itself is the lazy element (less common in current setup but good for safety)
                if (target.hasAttribute('data-bg-src')) {
                    target.style.backgroundImage = `url('${target.dataset.bgSrc}')`;
                    target.removeAttribute('data-bg-src');
                }
                // --------------------------

                target.classList.add('is-visible');
                observer.unobserve(target); // Stop observing once visible
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px 50px 0px" }); // Added bottom margin to load images slightly before they appear

    animateAlwaysObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
            else entry.target.classList.remove('is-visible');
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    
    // Apply observers to elements
    document.querySelectorAll('.floating-item').forEach(el => floatingObserver.observe(el));
    document.querySelectorAll('.animate-on-scroll').forEach(el => animateOnceObserver.observe(el));
    document.querySelectorAll('.animate-always').forEach(el => animateAlwaysObserver.observe(el));
}

// --- SEO TAG RENDERING ---
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
    if (path.length > 1 && !path.endsWith('/')) path += '/'; 
    canonical.href = canonicalBaseUrl + path;
    document.head.appendChild(canonical);

    let schemaData = data.schemaJsonLd;
    if (typeof schemaData === 'string' && schemaData.trim()) {
        try { schemaData = JSON.parse(schemaData); } catch (e) { schemaData = null; }
    }
    if (schemaData && typeof schemaData === 'object' && Object.keys(schemaData).length > 0) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schemaData);
        document.head.appendChild(script);
    }
}

// --- DATA LOADING FROM FIREBASE ---
async function loadData() {
    const freshSiteData = {};
    try {
        const collections = ['services', 'portfolio', 'blog', 'contact', 'carouselItems'];
        const dataPromises = [
            db.collection('home').doc('content').get(),
            ...collections.map(col => {
                if (col === 'carouselItems') return db.collection(col).orderBy('order').get();
                return db.collection(col).get();
            })
        ];
        const [homeDoc, ...snapshots] = await Promise.all(dataPromises);

        const processDocData = (data) => {
            if (data && typeof data.schemaJsonLd === 'string' && data.schemaJsonLd.trim().startsWith('{')) {
                try { data.schemaJsonLd = JSON.parse(data.schemaJsonLd); } catch (e) { data.schemaJsonLd = {}; }
            }
            return data;
        };

        freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {};
        collections.forEach((col, index) => {
            freshSiteData[col] = snapshots[index].docs
                .map(doc => ({ id: doc.id, ...processDocData(doc.data()) }))
                .filter(item => item.status !== 'archived');
        });
        console.log("Firebase data loaded successfully.", freshSiteData);
        return freshSiteData;
    } catch (error) {
        console.error("Error loading data from Firebase:", error);
        return JSON.parse(JSON.stringify(initialSiteData));
    }
}

// --- CONTENT FORMATTING (CLIENT-SIDE) ---
function formatContentHtml(content, siteData = null, lang = 'en') {
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
        
        const carouselMatch = trimmedBlock.match(/^\[CAROUSEL:([\w-]+)\]$/);
        const youtubeRegex = /^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11}).*$/;
        const imageRegex = /^https?:\/\/[^<>"']+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$/i;
        const youtubeMatch = trimmedBlock.match(youtubeRegex);
        const imageMatch = trimmedBlock.match(imageRegex);
        
        if (carouselMatch && siteData) {
            const groupKey = carouselMatch[1];
            const carouselItems = (siteData.carouselItems || []).filter(
                item => item.groupKey === groupKey && item.lang === lang
            );

            if (carouselItems.length === 0) {
                console.warn(`[formatContentHtml] No carousel items found for groupKey: "${groupKey}" and lang: "${lang}". Returning empty string.`);
                return '';
            }

            const carouselId = `glowCarousel-${groupKey}-${Math.floor(Math.random() * 9000) + 1000}`;
            
            const slidesHtml = carouselItems.map(item => {
                const isLink = item.linkUrl && item.linkUrl !== '#';
                const tag = isLink ? 'a' : 'div';
                const hrefAttr = isLink ? `href="${item.linkUrl}" target="_blank" rel="noopener noreferrer"` : '';
                
                return `
                <${tag} ${hrefAttr} class="card">
                    <div class="card-image-bg" data-bg-src="${item.imageUrl || ''}"></div>
                    <div class="card-inner-content">
                        <h4>${item.title || ''}</h4>
                        ${item.role ? `<div class="card-subtitle">${item.role}</div>` : ''}
                        <div class="card-desc">
                            ${item.content || ''}
                        </div>
                    </div>
                </${tag}>
            `;
            }).join('');

            return `
            <div class="carousel-container" id="${carouselId}">
                <button class="nav-arrow left">‹</button>
                <div class="carousel-track">${slidesHtml}</div>
                <button class="nav-arrow right">›</button>
                <div class="dots"></div>
            </div>
            `;
            
        } else if (/^<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)/i.test(trimmedBlock)) {
            return trimmedBlock;
        } else if (youtubeMatch && youtubeMatch[1]) {
            return `<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/${youtubeMatch[1]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else if (imageMatch) {
            loading="lazy"
            return `<p style="margin: 1.5em 0;"><img src="${trimmedBlock}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>`;
        } else {
            return `<p>${trimmedBlock.replace(/\n/g, '<br>')}</p>`;
        }
    }).filter(Boolean);
    
    const groupedHtml = [];
    const GROUP_SIZE = 3;
    let temp_group = [];
    
    html_parts.forEach(part => {
        if (part.includes('carousel-container')) {
            if (temp_group.length > 0) {
                groupedHtml.push(`<div class="content-group">${temp_group.join('')}</div>`);
                temp_group = [];
            }
            groupedHtml.push(part);
        } else {
            temp_group.push(part);
            if (temp_group.length >= GROUP_SIZE) {
                groupedHtml.push(`<div class="content-group">${temp_group.join('')}</div>`);
                temp_group = [];
            }
        }
    });
    if (temp_group.length > 0) groupedHtml.push(`<div class="content-group">${temp_group.join('')}</div>`);
    
    return groupedHtml.join('\n');
}

// --- HOMEPAGE SECTION RENDERING ---
const langNames = { en: 'English', ka: 'Georgian', ru: 'Russian', uk: 'Ukrainian' };

function renderSection(key, title, items) {
    const section = document.getElementById(key);
    if (!section) {
        console.warn(`[renderSection] Section #${key} not found.`);
        return;
    }
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const itemsFromDb = items || siteData[key] || [];
    const langOrder = ['en', 'ka', 'ru', 'uk']; 

    const itemsByLang = {};
    itemsFromDb.forEach(item => {
        const lang = item.lang || 'en';
        if (!itemsByLang[lang]) itemsByLang[lang] = [];
        itemsByLang[lang].push(item);
    });

    let finalHtml;
    if (isMobile) {
        const mobileSlidersHTML = langOrder.map(lang => {
            const langItems = itemsByLang[lang];
            if (!langItems || langItems.length === 0) return '';
            const slidesHTML = langItems.map((item, index) => {
                const langPrefix = item.lang ? `/${item.lang}` : '';
                let itemUrl = `${langPrefix}/${key}/${item.urlSlug}/`;
                const mediaArray = item.media || [];
                const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
                // Lazy Load: data-bg-src
                return `<a href="${itemUrl}" class="item-card ${index === 0 ? 'active' : ''}"><div class="item-card__image" data-bg-src="${imageUrl}"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
            }).join('');
            const dotsHTML = langItems.length > 1 ? langItems.map((_, index) => `<span class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : '';
            return `<div class="language-slider-block"><div class="cross-fade-slider">${slidesHTML}</div><div class="slider-nav">${dotsHTML}</div></div>`;
        }).join('');
        finalHtml = `<div class="mobile-sliders-container">${mobileSlidersHTML}</div>`;
    } else {
        const desktopGridsHTML = langOrder.map(lang => {
            const langItems = itemsByLang[lang];
            if (!langItems || langItems.length === 0) return '';
            
            const slides = [];
            for (let i = 0; i < langItems.length; i += 3) slides.push(langItems.slice(i, i + 3));

            const slidesHTML = slides.map((slideItems, index) => {
                const cardsHTML = slideItems.map(item => {
                    const langPrefix = item.lang ? `/${item.lang}` : '';
                    let itemUrl = `${langPrefix}/${key}/${item.urlSlug}/`;
                    const mediaArray = item.media || [];
                    const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
                    // Lazy Load: data-bg-src
                    return `<a href="${itemUrl}" class="item-card"><div class="item-card__image" data-bg-src="${imageUrl}"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`;
                }).join('');
                return `<div class="desktop-grid-slide ${index === 0 ? 'active' : ''}">${cardsHTML}</div>`;
            }).join('');
            
            const dotsHTML = slides.length > 1 ? slides.map((_, index) => `<span class="desktop-slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : '';
            
            return `<div class="desktop-language-group"><h4 class="desktop-lang-title">${langNames[lang]}</h4><div class="desktop-carousel-container">${slidesHTML}</div>${slides.length > 1 ? `<div class="desktop-slider-nav">${dotsHTML}</div>` : ''}</div>`;
        }).join('');
        finalHtml = `<div class="desktop-grid-wrapper">${desktopGridsHTML}</div>`;
    }
    section.innerHTML = `<h2 class="animate-on-scroll is-visible">${title}</h2>${finalHtml}`;
}

// --- FLOATING TOC TOGGLE LOGIC ---
let floatingTocToggleInitialized = false;
function initFloatingTocToggle() {
    if (floatingTocToggleInitialized) return; 

    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const toggleBtn = document.getElementById('toc-toggle-btn');
    const contentPanel = document.getElementById('toc-content-panel');

    if (!floatingTocWrapper || !toggleBtn || !contentPanel) return;

    const closeToc = () => {
        toggleBtn.setAttribute('aria-expanded', 'false');
        contentPanel.setAttribute('aria-hidden', 'true');
        contentPanel.classList.remove('is-visible');
        toggleBtn.classList.remove('is-active');
    };

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); 
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            closeToc();
        } else {
            toggleBtn.setAttribute('aria-expanded', 'true');
            contentPanel.setAttribute('aria-hidden', 'false');
            contentPanel.classList.add('is-visible');
            toggleBtn.classList.add('is-active');
        }
    });

    document.addEventListener('click', (event) => {
        if (contentPanel.classList.contains('is-visible') && !floatingTocWrapper.contains(event.target)) {
            closeToc();
        }
    });

    contentPanel.addEventListener('click', (event) => {
        if (event.target.closest('a')) {
            setTimeout(closeToc, 100); 
        }
    });

    floatingTocToggleInitialized = true;
}

// --- GLOW CAROUSEL INITIALIZATION (FOR DETAIL PAGES) ---
let glowCarouselInstances = [];
function initializeCarousel() {
    glowCarouselInstances.forEach(instance => instance.destroy());
    glowCarouselInstances = []; 

    const carouselRoots = document.querySelectorAll('.carousel-container');
    if (carouselRoots.length > 0) {
        carouselRoots.forEach(root => {
            if (root.id && typeof window.initGlowCarousel === 'function') {
                console.log(`[initializeCarousel] Initializing glow carousel with ID: ${root.id}`);
                const instance = window.initGlowCarousel(root.id);
                if (instance) glowCarouselInstances.push(instance);
            } else {
                console.warn(`[initializeCarousel] Skipping carousel for root ID: ${root.id}. Either ID is missing or window.initGlowCarousel is not a function.`);
            }
        });
        console.log(`[initializeCarousel] Total ${glowCarouselInstances.length} glow carousel instances initialized.`);
    } else {
        console.log("[initializeCarousel] No glow carousel roots found.");
    }
}

// --- DETAIL PAGE RENDERING ---
function renderDetailPage(collection, slug, lang) {
    console.log(`[renderDetailPage] Rendering detail page for: ${collection}/${slug} in ${lang}`);
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang);
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const tocContentPanel = document.getElementById('toc-content-panel');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');

    if (!item) {
        console.error(`[renderDetailPage] Item not found for ${collection}/${slug} in ${lang}. Displaying 404.`);
        mainContentEl.innerHTML = `<section class="detail-page-header"><h1>404 - Not Found</h1><p>The page you were looking for does not exist.</p><a href="/">Go back home</a></section>`;
        if (floatingTocWrapper) floatingTocWrapper.style.display = 'none';
        initializeCarousel(); 
        return;
    }
    renderSeoTags(item);
    applyCustomBackground(item);

    const rawContent = item.mainContent || '';
    let tocHtmlContent = ''; 
    let finalContentHtml = '';

    const tocTitles = { 'en': 'Table of Contents', 'ru': 'Table of Contents', 'ka': 'Table of Contents', 'uk': 'Table of Contents' };
    const tocTitle = tocTitles[lang] || 'Table of Contents';

    if (rawContent.trim().startsWith('[TOC]')) {
        console.log("[renderDetailPage] TOC marker found. Generating Table of Contents.");
        const contentWithoutTocMarker = rawContent.replace('[TOC]', '', 1).trim();
        const contentHtml = formatContentHtml(contentWithoutTocMarker, siteData, lang);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentHtml, 'text/html');
        const tocItems = [];
        
        doc.querySelectorAll('h2, h3').forEach(header => {
            const headerText = header.innerText.trim();
            if (headerText) {
                const headerSlug = slugify(headerText);
                header.id = headerSlug; 
                tocItems.push({ level: header.tagName.toLowerCase(), text: headerText, slug: headerSlug });
            }
        });
        
        if (tocItems.length > 0) {
            let tocListHtml = '<ul>';
            tocItems.forEach(tocItem => {
                const className = tocItem.level === 'h3' ? 'toc-level-h3' : '';
                tocListHtml += `<li class="${className}"><a href="#${tocItem.slug}">${tocItem.text}</a></li>`;
            });
            tocListHtml += '</ul>';
            tocHtmlContent = tocListHtml;
        } else {
            console.log("[renderDetailPage] No H2/H3 headers found for TOC.");
        }
        finalContentHtml = doc.body.innerHTML; 
    } else {
        console.log("[renderDetailPage] No TOC marker found. Formatting content without TOC generation.");
        finalContentHtml = formatContentHtml(rawContent, siteData, lang);
    }

    mainContentEl.innerHTML = `
        <section>
            <div class="detail-page-header">
                <h1 class="animate-always is-visible">${item.h1 || item.title || ''}</h1>
                ${item.price ? `<div class="detail-price animate-on-scroll"><span>${item.price}</span></div>` : ''} 
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

    document.querySelectorAll('.detail-content > .content-group').forEach(el => el.classList.add('floating-item'));

    if (floatingTocWrapper && tocContentPanel && tocToggleBtn) {
        if (tocHtmlContent) {
            tocToggleBtn.innerHTML = `${tocTitle} <span class="toc-arrow"></span>`;
            tocContentPanel.innerHTML = tocHtmlContent; 
            floatingTocWrapper.style.display = 'flex'; 
            tocToggleBtn.setAttribute('aria-expanded', 'false');
            tocContentPanel.setAttribute('aria-hidden', 'true');
            tocContentPanel.classList.remove('is-visible');
            tocToggleBtn.classList.remove('is-active');
            initFloatingTocToggle(); 
        } else {
            floatingTocWrapper.style.display = 'none'; 
            tocContentPanel.innerHTML = ''; 
        }
    }

    renderRelatedPosts(collection, slug, lang); 

    if (ssrCarouselHtml) {
        console.warn("[renderDetailPage] ssrCarouselHtml found on detail page. This should ideally be empty.");
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = ssrCarouselHtml;
        while (tempDiv.firstChild) mainContentEl.appendChild(tempDiv.firstChild);
    }

    initializeCarousel(); 
    document.getElementById('site-footer').style.display = 'none'; 
}

// --- RELATED POSTS RENDERING ---
function renderRelatedPosts(currentCollection, currentSlug, currentLang) {
    if (!siteData.services || !siteData.blog) {
        console.log("[renderRelatedPosts] No services or blog data to render related posts.");
        return;
    }
    const pool = [
        ...siteData.services.map(i => ({...i, collection: 'services'})),
        ...siteData.blog.map(i => ({...i, collection: 'blog'}))
    ];
    const relatedItems = pool.filter(item => item.lang === currentLang && !(item.collection === currentCollection && item.urlSlug === currentSlug))
                             .sort(() => 0.5 - Math.random())
                             .slice(0, 6);

    if (relatedItems.length === 0) {
        console.log("[renderRelatedPosts] No related posts found.");
        return;
    }

    const itemsHTML = relatedItems.map(item => {
        const langPrefix = item.lang ? `/${item.lang}` : '';
        let itemUrl = `${langPrefix}/${item.collection}/${item.urlSlug}/`;
        const mediaArray = item.media || [];
        const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
        // Lazy Load: data-bg-src
        return `<a href="${itemUrl}" class="item-card animate-on-scroll"><div class="item-card__image" data-bg-src="${imageUrl}"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
    }).join('');

    const relatedSection = document.createElement('section');
    relatedSection.id = 'related-posts';
    relatedSection.innerHTML = `<h2 class="animate-on-scroll">You Might Also Like</h2><div class="item-grid">${itemsHTML}</div>`;
    mainContentEl.appendChild(relatedSection);
}

// --- NAVIGATION MENU RENDERING ---
function renderMenu() { 
    const menuEl = document.querySelector('.nav-menu'); 
    if (!menuEl) return; 
    const menuItems = [
        { label: 'Home', href: '/' }, 
        { label: 'Services', href: '/#services' }, 
        { label: 'Portfolio', href: '/#portfolio' }, 
        { label: 'Blog', href: '/#blog' }, 
        { label: 'Contact', href: '/#contact' }
    ]; 
    menuEl.innerHTML = menuItems.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join(''); 
}

// --- CUSTOM BACKGROUND LOGIC ---
function applyCustomBackground(item) {
    const iframe = document.getElementById('custom-background-iframe');
    if (!iframe) return;
    const homeBgHtml = (siteData.home && siteData.home.backgroundHtml) || '';
    const itemBgHtml = (item && item.backgroundHtml) || '';
    const customCode = itemBgHtml || homeBgHtml || '';
    if (customCode && customCode.trim() !== "") {
        if (iframe.srcdoc === customCode && iframe.style.display === 'block') return; 
        iframe.classList.remove('is-visible');
        iframe.onload = () => {
            iframe.classList.add('is-visible');
            iframe.onload = null; 
        };
        iframe.style.display = 'block';
        iframe.srcdoc = customCode;
    } else {
        iframe.classList.remove('is-visible');
        iframe.style.display = 'none'; 
        iframe.srcdoc = ''; 
    }
}

// --- QUIZ LOGIC ---
function calculateQuizResult() {
    console.log("[Quiz] Calculating quiz result...");
    const quizForm = document.getElementById('business-quiz');
    if (!quizForm) { console.error('[Quiz] Quiz form not found!'); return; }
    
    const selectedAnswers = quizForm.querySelectorAll('input[type="radio"]:checked');
    if (selectedAnswers.length < 8) { 
        alert('Please answer all 8 questions to get your result.'); 
        return; 
    }

    let scores = { landing: 0, website: 0, hybrid: 0 };
    selectedAnswers.forEach(answer => { scores[answer.value]++; });

    const resultDiv = document.getElementById('quiz-result');
    if (!resultDiv) { console.error('[Quiz] Quiz result container not found!'); return; }

    let resultHTML = '', resultStyle = '';

    if (scores.hybrid >= 5 || (scores.hybrid >= scores.landing && scores.hybrid >= scores.website)) {
        resultHTML = `<h3>Your Result: Hybrid Approach</h3><p>Consider a phased approach: start with a core website (5-8 pages) and add campaign-specific landing pages as needed. This balances long-term brand building with short-term conversion optimization.</p>`;
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
    console.log("[Quiz] Quiz result displayed.");
}

// --- HOMEPAGE DESKTOP CAROUSEL INITIALIZATION ---
function initDesktopCarousels() {
    console.log("[initDesktopCarousels] Starting initialization for desktop carousels.");
    document.querySelectorAll('.desktop-carousel-container').forEach(carousel => {
        const slides = carousel.querySelectorAll('.desktop-grid-slide');
        const nav = carousel.nextElementSibling; 
        const languageGroupTitle = carousel.closest('.desktop-language-group')?.querySelector('h4')?.textContent || 'Unknown Language';
        
        if (!nav || !nav.matches('.desktop-slider-nav')) {
            console.warn(`[initDesktopCarousels] No valid navigation found for ${languageGroupTitle} carousel. Skipping.`);
            return;
        }
        
        const dots = nav.querySelectorAll('.desktop-slider-dot');
        if (slides.length <= 1) {
            console.log(`[initDesktopCarousels] ${languageGroupTitle} carousel has 1 or less slides. Skipping auto-sliding logic.`);
            return;
        }

        let currentIndex = 0;
        let autoSlideInterval;

        function goToSlide(index) {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex));
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
            console.log(`[initDesktopCarousels] ${languageGroupTitle} - Going to slide: ${currentIndex}`);
        }

        function startAutoSlide() {
            stopAutoSlide(); 
            autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); 
            console.log(`[initDesktopCarousels] ${languageGroupTitle} - Auto-slide started.`);
        }

        function stopAutoSlide() {
            clearInterval(autoSlideInterval);
            console.log(`[initDesktopCarousels] ${languageGroupTitle} - Auto-slide stopped.`);
        }

        goToSlide(0); 
        startAutoSlide(); 

        nav.addEventListener('click', e => {
            if (e.target.matches('.desktop-slider-dot')) {
                stopAutoSlide();
                goToSlide(parseInt(e.target.dataset.index));
                startAutoSlide(); 
            }
        });
        console.log(`[initDesktopCarousels] ${languageGroupTitle} carousel initialized with ${slides.length} slides.`);
    });
}

// --- HOMEPAGE MOBILE SLIDER INITIALIZATION ---
function initMobileSliders() {
    console.log("[initMobileSliders] Starting initialization for mobile sliders.");
    document.querySelectorAll('.language-slider-block').forEach(sliderBlock => {
        const slider = sliderBlock.querySelector('.cross-fade-slider');
        const slides = slider.querySelectorAll('.item-card');
        const nav = sliderBlock.querySelector('.slider-nav');
        const dots = nav.querySelectorAll('.slider-dot');
        
        const languageName = sliderBlock.closest('section')?.querySelector('h2')?.textContent || 'Unknown Section';
        
        if (slides.length <= 1) {
            console.log(`[initMobileSliders] ${languageName} mobile slider has 1 or less slides. Skipping auto-sliding logic.`);
            return;
        }

        let currentIndex = 0;
        let touchStartX = 0;
        let touchStartY = 0; 
        let autoSlideInterval;

        function goToSlide(index) {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex));
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
            console.log(`[initMobileSliders] ${languageName} - Going to slide: ${currentIndex}`);
        }

        function startAutoSlide() {
            stopAutoSlide(); 
            autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); 
            console.log(`[initMobileSliders] ${languageName} - Auto-slide started.`);
        }

        function stopAutoSlide() {
            clearInterval(autoSlideInterval);
            console.log(`[initMobileSliders] ${languageName} - Auto-slide stopped.`);
        }

        goToSlide(0); 
        startAutoSlide(); 

        nav.addEventListener('click', e => {
            if (e.target.matches('.slider-dot')) {
                stopAutoSlide();
                goToSlide(parseInt(e.target.dataset.index));
                startAutoSlide(); 
            }
        });

        slider.addEventListener('touchstart', e => { 
            touchStartX = e.changedTouches[0].screenX; 
            touchStartY = e.changedTouches[0].screenY;
            stopAutoSlide(); 
        }, { passive: true });

        slider.addEventListener('touchend', e => { 
            const touchEndX = e.changedTouches[0].screenX; 
            const touchEndY = e.changedTouches[0].screenY;
            const diffX = touchStartX - touchEndX;
            const diffY = Math.abs(touchStartY - touchEndY); 

            const swipeThreshold = 50; 
            
            if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > diffY) {
                if (diffX > 0) goToSlide(currentIndex + 1); 
                else goToSlide(currentIndex - 1); 
            }
            startAutoSlide(); 
        }, { passive: true });
        console.log(`[initMobileSliders] ${languageName} mobile slider initialized with ${slides.length} slides.`);
    });
}

// --- SCROLL TO ELEMENT WITH OFFSET ---
function scrollToElementWithOffset(elementId, offset = 120) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`[scrollToElementWithOffset] Element with ID '${elementId}' not found.`);
        return;
    }
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    const targetPosition = elementTop - offset;
    window.scrollTo({ top: targetPosition, behavior: 'smooth' });
}

// --- NAVIGATION LOGIC ---
async function navigateToHome(hash = '') {
    console.log(`[navigateToHome] Navigating to homepage with hash: ${hash}`);
    try {
        const response = await fetch('/'); 
        if (!response.ok) throw new Error('Failed to fetch home page');
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const newMain = doc.querySelector('main');
        if (newMain) {
            mainContentEl.innerHTML = newMain.innerHTML;
            mainContentEl.classList.remove('loading');
            document.title = doc.querySelector('title')?.textContent || 'Digital Craft';
            document.documentElement.lang = doc.documentElement.lang || 'en'; 
        }
        applyCustomBackground(siteData.home);
        hydrateHomePageContent(); 
        initializeCarousel(); 
        requestAnimationFrame(() => {
            const h1 = document.querySelector('.hero h1');
            const sub = document.querySelector('.hero-subtitle-container');
            if (h1) h1.classList.add('is-visible'); 
            if (sub) sub.classList.add('is-visible'); 
        });
        if (hash) setTimeout(() => { scrollToElementWithOffset(hash.substring(1), 120); }, 100);
    } catch (error) {
        console.error("[navigateToHome] Navigation error:", error);
    } finally {
        const toc = document.getElementById('floating-toc-wrapper');
        if (toc) toc.style.display = 'none'; 
    }
}

async function routeAndRender(isPopState = false, hash = '') {
    console.log(`[routeAndRender] Path: ${window.location.pathname}, PopState: ${isPopState}, Hash: ${hash}`);
    if (typeof ym === 'function' && !isPopState) ym(103413242, 'hit', window.location.href);
    
    const path = window.location.pathname;
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
    const match = path.match(detailPageRegex);

    if (match) {
        const [, lang, col, slug] = match;
        renderDetailPage(col, slug, lang || 'en');
    } else {
        await navigateToHome(hash || window.location.hash);
    }
    
    requestAnimationFrame(() => setupObservers()); 
    document.documentElement.style.setProperty('--main-visibility', 'visible');
    updateScrollButtonVisibility();
    if (!hash && !window.location.hash) window.scrollTo({ top: 0, behavior: 'instant' }); 
}

function handleNavigation(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || link.protocol !== window.location.protocol || link.host !== window.location.host || e.metaKey || e.ctrlKey || e.shiftKey) return;
    
    const targetUrl = new URL(link.href);
    e.preventDefault(); 

    const menuToggle = document.querySelector('.menu-toggle'); 
    const navOverlay = document.querySelector('.nav-overlay');
    const isMenuOpen = document.body.classList.contains('nav-is-open');

    if (isMenuOpen) {
        document.body.classList.remove('nav-is-open'); 
        if (menuToggle) menuToggle.classList.remove('is-active'); 
        if (navOverlay) navOverlay.classList.remove('is-active'); 
    }
    const delay = isMenuOpen ? 350 : 0; 

    if (targetUrl.pathname === window.location.pathname && targetUrl.hash) {
        console.log(`[handleNavigation] Same-page anchor navigation to: ${targetUrl.hash}`);
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href);
            scrollToElementWithOffset(targetUrl.hash.substring(1), 120);
        }, delay);
        return;
    }

    if (targetUrl.href === window.location.href) { 
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
        return; 
    }

    setTimeout(() => {
        mainContentEl.classList.add('is-transitioning'); 
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href); 
            routeAndRender(false, targetUrl.hash); 
            requestAnimationFrame(() => {
                requestAnimationFrame(() => mainContentEl.classList.remove('is-transitioning')); 
            });
        }, 400); 
    }, delay);
}

// --- HOMEPAGE CONTENT HYDRATION ---
function hydrateHomePageContent() {
    console.log("[hydrateHomePageContent] Hydrating homepage dynamic sections.");
    const preData = document.getElementById('preloaded-data');
    if (preData) {
        try {
            const data = JSON.parse(preData.textContent);
            ['services', 'portfolio', 'blog', 'contact'].forEach(k => {
                if (!siteData[k] || siteData[k].length === 0) siteData[k] = data[k] || [];
            });
            preData.remove(); 
        } catch (e) {
            console.error("[hydrateHomePageContent] Error parsing preloaded data:", e);
        }
    }
    applyCustomBackground(siteData.home);
    ['services', 'portfolio', 'blog', 'contact'].forEach(k => renderSection(k, `Our ${k.charAt(0).toUpperCase() + k.slice(1)}`, siteData[k]));
    
    // Add animate-on-scroll class to cards to ensure lazy loader picks them up
    document.querySelectorAll('.item-card').forEach(el => el.classList.add('animate-on-scroll'));

    initMobileSliders();
    initDesktopCarousels();
    initializeCarousel(); 
    
    const footer = document.getElementById('site-footer');
    if (footer) {
        footer.style.display = 'block';
        footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft.`;
        footer.onclick = () => { window.location.href = '/admin.html'; }; 
    }
}

// --- STATIC PAGE HYDRATION (FIRST LOAD) ---
async function hydrateStaticPage() {
    console.log("[hydrateStaticPage] Initial page load hydration.");
    renderMenu();
    updateScrollButtonVisibility();

    const ssr = document.getElementById('ssr-carousel-source');
    if (ssr) { 
        ssrCarouselHtml = ssr.innerHTML; 
        console.log("[hydrateStaticPage] SSR carousel HTML captured.");
        ssr.remove(); 
    } else {
        console.log("[hydrateStaticPage] No SSR carousel source found.");
    }

    try {
        siteData = await loadData(); 
        const match = window.location.pathname.match(/^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/);
        if (match) {
            const [, lang, col, slug] = match;
            const item = siteData[col]?.find(d => d.urlSlug === slug && d.lang === (lang || 'en'));
            if (item) {
                applyCustomBackground(item);
                if (!document.getElementById('related-posts')) renderRelatedPosts(col, slug, lang || 'en');
            }
        } else {
            hydrateHomePageContent(); 
        }
        initializeCarousel(); 
    } catch (error) {
        console.error("[hydrateStaticPage] Error during static page hydration:", error);
    }
}

// --- INITIAL EVENT LISTENERS ---
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

        navOverlay.addEventListener('click', (e) => {
            if (e.target === navOverlay) { 
                document.body.classList.remove('nav-is-open'); 
                menuToggle.classList.remove('is-active'); 
                navOverlay.classList.remove('is-active'); 
            }
        });
    }

    mainContentEl.addEventListener('click', (e) => {
        if (e.target.closest('#scroll-to-top-btn')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (e.target.id === 'quiz-submit-button') {
            calculateQuizResult();
        }
    });
}

// --- SCROLL TO TOP BUTTON VISIBILITY ---
function updateScrollButtonVisibility() {
    const b = document.getElementById('scroll-to-top-btn');
    if (b) {
        window.scrollY > 300 ? b.classList.add('visible') : b.classList.remove('visible');
    }
}

// --- APP INITIALIZATION ---
async function initApp() { 
    firebase.initializeApp(firebaseConfig); 
    db = firebase.firestore(); 

    initStaticEventListeners();
    window.addEventListener('scroll', updateScrollButtonVisibility, { passive: true }); 
    
    if (document.body.dataset.staticPage === 'true') { 
        await hydrateStaticPage(); 
        routeAndRender(false, window.location.hash); 
    } else { 
        siteData = await loadData(); 
        renderMenu(); 
        await routeAndRender(); 
    } 
    console.log("App initialized.");
}

window.addEventListener('DOMContentLoaded', initApp);
