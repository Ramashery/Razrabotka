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

// --- OBSERVERS ---
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
                if (isAboveViewport) target.classList.add('is-above');
                else target.classList.remove('is-above');
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
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
            else entry.target.classList.remove('is-visible');
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    
    document.querySelectorAll('.floating-item').forEach(el => floatingObserver.observe(el));
    document.querySelectorAll('.animate-on-scroll').forEach(el => animateOnceObserver.observe(el));
    document.querySelectorAll('.animate-always').forEach(el => animateAlwaysObserver.observe(el));
}

// --- SEO ---
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

// --- DATA LOADING ---
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
        return freshSiteData;
    } catch (error) {
        console.error("Error loading data from Firebase:", error);
        return {};
    }
}

// --- FORMAT CONTENT (With Carousel Logic) ---
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

            if (carouselItems.length === 0) return '';

            const carouselId = `glowCarousel-${groupKey}-${Math.floor(Math.random() * 9000) + 1000}`;
            
            const slidesHtml = carouselItems.map(item => {
                const isLink = item.linkUrl && item.linkUrl !== '#';
                const tag = isLink ? 'a' : 'div';
                const hrefAttr = isLink ? `href="${item.linkUrl}" target="_blank" rel="noopener noreferrer"` : '';
                
                return `
                <${tag} ${hrefAttr} class="card">
                    <div class="card-image-bg" style="background-image: url('${item.imageUrl || ''}');"></div>
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

// --- RENDERING HELPERS ---
function renderSection(key, title, items) {
    const section = document.getElementById(key);
    if (!section) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const itemsFromDb = items || siteData[key] || [];
    const langOrder = ['en', 'ka', 'uk', 'ru'];
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
                return `<a href="${itemUrl}" class="item-card ${index === 0 ? 'active' : ''}"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
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
                    return `<a href="${itemUrl}" class="item-card"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`;
                }).join('');
                return `<div class="desktop-grid-slide ${index === 0 ? 'active' : ''}">${cardsHTML}</div>`;
            }).join('');
            const dotsHTML = slides.length > 1 ? slides.map((_, index) => `<span class="desktop-slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : '';
            return `<div class="desktop-language-group"><h4 class="desktop-lang-title">${langNames[lang]}</h4><div class="desktop-carousel-container">${slidesHTML}</div>${slides.length > 1 ? `<div class="desktop-slider-nav">${dotsHTML}</div>` : ''}</div>`;
        }).join('');
        finalHtml = `<div class="desktop-grid-wrapper">${desktopGridsHTML}</div>`;
    }
    section.innerHTML = `<h2 class="animate-on-scroll is-visible">${title}</h2>${finalHtml}`;
};

// --- FIX 1: RESTORED QUIZ LOGIC ---
function calculateQuizResult() {
    const quizForm = document.getElementById('business-quiz');
    if (!quizForm) return;
    const selectedAnswers = quizForm.querySelectorAll('input[type="radio"]:checked');
    if (selectedAnswers.length < 8) { alert('Please answer all questions.'); return; }
    let scores = { landing: 0, website: 0, hybrid: 0 };
    selectedAnswers.forEach(answer => { scores[answer.value]++; });
    const resultDiv = document.getElementById('quiz-result');
    if (!resultDiv) return;
    let resultHTML = '', resultStyle = '';
    if (scores.hybrid >= 5 || (scores.hybrid >= scores.landing && scores.hybrid >= scores.website)) {
        resultHTML = `<h3>Your Result: Hybrid Approach</h3><p>Consider a phased approach...</p>`;
        resultStyle = 'background-color: rgba(255, 251, 230, 0.1); border-color: #ffe58f;';
    } else if (scores.landing >= 5 || scores.landing > scores.website) {
        resultHTML = `<h3>Your Result: Landing Page</h3><p>You need a focused landing page...</p>`;
        resultStyle = 'background-color: rgba(230, 247, 255, 0.1); border-color: #91d5ff;';
    } else {
        resultHTML = `<h3>Your Result: Multi-Page Website</h3><p>You need comprehensive development...</p>`;
        resultStyle = 'background-color: rgba(246, 255, 237, 0.1); border-color: #b7eb8f;';
    }
    resultDiv.innerHTML = resultHTML;
    resultDiv.style.cssText = resultStyle + ' margin-top: 20px; padding: 15px; border-width: 2px; border-style: solid; border-radius: 8px; display: block;';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- TOC LOGIC ---
let floatingTocToggleInitialized = false;
function initFloatingTocToggle() {
    if (floatingTocToggleInitialized) return; 
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const toggleBtn = document.getElementById('toc-toggle-btn');
    const contentPanel = document.getElementById('toc-content-panel');
    if (!floatingTocWrapper || !toggleBtn || !contentPanel) return;

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); 
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !isExpanded);
        contentPanel.setAttribute('aria-hidden', isExpanded);
        contentPanel.classList.toggle('is-visible', !isExpanded);
        toggleBtn.classList.toggle('is-active', !isExpanded);
    });

    // FIX 2: Close TOC when clicking a link inside it
    contentPanel.addEventListener('click', (event) => {
        if (event.target.tagName === 'A') {
             toggleBtn.setAttribute('aria-expanded', 'false');
             contentPanel.setAttribute('aria-hidden', 'true');
             contentPanel.classList.remove('is-visible');
             toggleBtn.classList.remove('is-active');
        }
    });

    document.addEventListener('click', (event) => {
        if (contentPanel.classList.contains('is-visible') && !floatingTocWrapper.contains(event.target)) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            contentPanel.setAttribute('aria-hidden', 'true');
            contentPanel.classList.remove('is-visible');
            toggleBtn.classList.remove('is-active');
        }
    });
    floatingTocToggleInitialized = true;
}

let glowCarouselInstances = [];
function initializeCarousel() {
    glowCarouselInstances = []; 
    const carouselRoots = document.querySelectorAll('.carousel-container');
    if (carouselRoots.length > 0) {
        carouselRoots.forEach(root => {
            if (root.id && typeof window.initGlowCarousel === 'function') {
                const instance = window.initGlowCarousel(root.id);
                if (instance) glowCarouselInstances.push(instance);
            }
        });
        console.log(`Carousel: Initialized ${glowCarouselInstances.length} instances.`);
    }
}

function renderDetailPage(collection, slug, lang) {
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang);
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const tocContentPanel = document.getElementById('toc-content-panel');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');

    if (!item) {
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

    const tocTitles = { 'en': 'Table of Contents', 'ru': 'Содержание', 'ka': 'სარჩევი', 'uk': 'Зміст' };
    const tocTitle = tocTitles[lang] || 'Table of Contents';

    if (rawContent.trim().startsWith('[TOC]')) {
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
            tocItems.forEach(item => {
                const className = item.level === 'h3' ? 'toc-level-h3' : '';
                tocListHtml += `<li class="${className}"><a href="#${item.slug}">${item.text}</a></li>`;
            });
            tocListHtml += '</ul>';
            tocHtmlContent = tocListHtml;
        }
        finalContentHtml = doc.body.innerHTML;
    } else {
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
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = ssrCarouselHtml;
        while (tempDiv.firstChild) mainContentEl.appendChild(tempDiv.firstChild);
    }

    initializeCarousel(); 
    document.getElementById('site-footer').style.display = 'none';
}

function renderRelatedPosts(currentCollection, currentSlug, currentLang) {
    if (!siteData.services || !siteData.blog) return;
    const pool = [...siteData.services.map(i => ({...i, collection: 'services'})), ...siteData.blog.map(i => ({...i, collection: 'blog'}))];
    const relatedItems = pool.filter(item => item.lang === currentLang && !(item.collection === currentCollection && item.urlSlug === currentSlug)).sort(() => 0.5 - Math.random()).slice(0, 6);
    if (relatedItems.length === 0) return;
    const itemsHTML = relatedItems.map(item => {
        const langPrefix = item.lang ? `/${item.lang}` : '';
        let itemUrl = `${langPrefix}/${item.collection}/${item.urlSlug}/`;
        const mediaArray = item.media || [];
        const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
        return `<a href="${itemUrl}" class="item-card animate-on-scroll"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
    }).join('');
    const relatedSection = document.createElement('section');
    relatedSection.id = 'related-posts';
    relatedSection.innerHTML = `<h2 class="animate-on-scroll">You Might Also Like</h2><div class="item-grid">${itemsHTML}</div>`;
    mainContentEl.appendChild(relatedSection);
}

function renderMenu() { const menuEl = document.querySelector('.nav-menu'); if (!menuEl) return; const menuItems = [{ label: 'Home', href: '/' }, { label: 'Services', href: '/#services' }, { label: 'Portfolio', href: '/#portfolio' }, { label: 'Blog', href: '/#blog' }, { label: 'Contact', href: '/#contact' }]; menuEl.innerHTML = menuItems.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join(''); }

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
    }
}

function initDesktopCarousels() { document.querySelectorAll('.desktop-carousel-container').forEach(carousel => { const slides = carousel.querySelectorAll('.desktop-grid-slide'); const nav = carousel.nextElementSibling; if (!nav || !nav.matches('.desktop-slider-nav')) return; const dots = nav.querySelectorAll('.desktop-slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.desktop-slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); }); }
function initMobileSliders() { document.querySelectorAll('.language-slider-block').forEach(sliderBlock => { const slider = sliderBlock.querySelector('.cross-fade-slider'); const slides = slider.querySelectorAll('.item-card'); const nav = sliderBlock.querySelector('.slider-nav'); const dots = nav.querySelectorAll('.slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let touchStartX = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopAutoSlide(); }, { passive: true }); slider.addEventListener('touchend', e => { const touchEndX = e.changedTouches[0].screenX; const swipeThreshold = 40; if (touchEndX < touchStartX - swipeThreshold) goToSlide(currentIndex + 1); else if (touchEndX > touchStartX + swipeThreshold) goToSlide(currentIndex - 1); startAutoSlide(); }, { passive: true }); }); }

function scrollToElementWithOffset(elementId, offset = 120) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    const targetPosition = elementTop - offset;
    window.scrollTo({ top: targetPosition, behavior: 'smooth' });
}

async function navigateToHome(hash = '') {
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
        console.error("Navigation error:", error);
    } finally {
        const toc = document.getElementById('floating-toc-wrapper');
        if (toc) toc.style.display = 'none';
    }
}

async function routeAndRender(isPopState = false, hash = '') {
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
    const isMenuOpen = document.body.classList.contains('nav-is-open');
    if (isMenuOpen) {
        document.body.classList.remove('nav-is-open'); 
        document.querySelector('.menu-toggle').classList.remove('is-active'); 
        document.querySelector('.nav-overlay').classList.remove('is-active'); 
    }
    const delay = isMenuOpen ? 350 : 0;
    if (targetUrl.pathname === window.location.pathname && targetUrl.hash) {
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href);
            scrollToElementWithOffset(targetUrl.hash.substring(1), 120);
        }, delay);
        return;
    }
    if (targetUrl.href === window.location.href) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
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

function hydrateHomePageContent() {
    const preData = document.getElementById('preloaded-data');
    if (preData) {
        try {
            const data = JSON.parse(preData.textContent);
            ['services', 'portfolio', 'blog', 'contact'].forEach(k => {
                if (!siteData[k] || siteData[k].length === 0) siteData[k] = data[k] || [];
            });
            preData.remove();
        } catch (e) {}
    }
    applyCustomBackground(siteData.home);
    ['services', 'portfolio', 'blog', 'contact'].forEach(k => renderSection(k, `Our ${k.charAt(0).toUpperCase() + k.slice(1)}`, siteData[k]));
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

async function hydrateStaticPage() {
    renderMenu();
    updateScrollButtonVisibility();
    const ssr = document.getElementById('ssr-carousel-source');
    if (ssr) { ssrCarouselHtml = ssr.innerHTML; ssr.remove(); }
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
    } catch (error) {}
}

function initStaticEventListeners() { 
    document.body.addEventListener('click', handleNavigation); 
    window.addEventListener('popstate', () => routeAndRender(true)); 
    
    // FIX 3: Close menu when clicking outside (on .nav-overlay)
    const overlay = document.querySelector('.nav-overlay');
    const mt = document.querySelector('.menu-toggle'); 
    
    if (mt) { 
        mt.addEventListener('click', () => { 
            document.body.classList.toggle('nav-is-open'); 
            mt.classList.toggle('is-active'); 
            overlay.classList.toggle('is-active'); 
        }); 
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { // Only if clicked directly on overlay, not links
                document.body.classList.remove('nav-is-open'); 
                mt.classList.remove('is-active'); 
                overlay.classList.remove('is-active'); 
            }
        });
    }

    mainContentEl.addEventListener('click', (e) => {
        // FIX 1: Event listener for quiz button
        if (e.target.id === 'quiz-submit-button') calculateQuizResult();
        if (e.target.closest('#scroll-to-top-btn')) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function updateScrollButtonVisibility() {
    const b = document.getElementById('scroll-to-top-btn');
    if (b) window.scrollY > 300 ? b.classList.add('visible') : b.classList.remove('visible');
}

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
}
window.addEventListener('DOMContentLoaded', initApp);
