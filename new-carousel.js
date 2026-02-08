/* new-carousel.js */

function initGlowCarousel(carouselId) {
    const container = document.getElementById(carouselId);
    if (!container) {
        console.warn(`[GlowCarousel] Container with ID "${carouselId}" not found. Skipping initialization.`);
        return null;
    }

    const cards = container.querySelectorAll('.card');
    const leftArrow = container.querySelector('.nav-arrow.left');
    const rightArrow = container.querySelector('.nav-arrow.right');
    const dotsContainer = container.querySelector('.dots');
    
    if (cards.length === 0) {
        container.style.display = 'none'; // Hide if no slides
        console.log(`[GlowCarousel] No cards found in carousel "${carouselId}". Hiding container.`);
        return null;
    }

    let currentIndex = 0;
    let isAnimating = false;
    let mouseMoveTimeout;
    let isLightTheme = false; // Can be changed to true for light theme by default

    // --- Helper for Lazy Loading Background Images ---
    function loadCardBackgroundImage(cardElement) {
        const imageBgDiv = cardElement.querySelector('.card-image-bg');
        if (imageBgDiv && imageBgDiv.dataset.bgSrc && !imageBgDiv.style.backgroundImage) {
            // Only load if data-bg-src exists and background-image is not already set
            imageBgDiv.style.backgroundImage = `url('${imageBgDiv.dataset.bgSrc}')`;
            imageBgDiv.removeAttribute('data-bg-src'); // Remove attribute to mark as loaded
            console.log(`[GlowCarousel Lazy Load] Loaded background for card "${cardElement.querySelector('h4')?.textContent || 'No Title'}"`);
        }
    }

    // --- Dynamic Dot Generation ---
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        for (let i = 0; i < cards.length; i++) {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                updateCarousel(i);
            });
            dotsContainer.appendChild(dot);
        }
    }
    const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];

    // --- Utility Functions for Glow Effect ---
    const round = (v) => parseFloat(v.toFixed(3));
    const clamp = (v, min = 0, max = 100) => Math.min(Math.max(v, min), max);
    
    const centerOf = ($el) => { 
        const rect = $el.getBoundingClientRect(); 
        return [rect.width / 2, rect.height / 2]; 
    };
    
    const pointerPos = ($el, e) => { 
        const rect = $el.getBoundingClientRect(); 
        const x = e.clientX - rect.left; 
        const y = e.clientY - rect.top; 
        return { 
            pX: clamp((100 / rect.width) * x), 
            pY: clamp((100 / rect.height) * y), 
            x, y 
        }; 
    };
    
    const angleFrom = (dx, dy) => { 
        let angle = 0; 
        if (dx !== 0 || dy !== 0) { 
            angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; 
            if (angle < 0) angle += 360; 
        } 
        return angle; 
    };
    
    const distFromCenter = ($card, x, y) => { 
        const [cx, cy] = centerOf($card); 
        return [x - cx, y - cy]; 
    };
    
    const closeness = ($card, x, y) => { 
        const [cx, cy] = centerOf($card); 
        const [dx, dy] = distFromCenter($card, x, y); 
        let kx = Infinity, ky = Infinity; 
        if (dx !== 0) kx = cx / Math.abs(dx); 
        if (dy !== 0) ky = cy / Math.abs(dy); 
        return clamp(1 / Math.min(kx, ky), 0, 1); 
    };

    // --- Animation Function ---
    function animate(options) {
        const { duration = 1000, onUpdate = () => {}, onEnd = () => {} } = options;
        const start = performance.now();
        function frame() {
            const now = performance.now();
            const t = Math.min((now - start) / duration, 1);
            onUpdate(t);
            if (t < 1) requestAnimationFrame(frame);
            else onEnd();
        }
        requestAnimationFrame(frame);
    }

    // --- Glow Animation ---
    function playGlow($card) {
        if (!$card) return;
        $card.classList.add('animating');
        animate({
            duration: 1200,
            onUpdate: (t) => {
                const angle = 110 + (465 - 110) * t;
                $card.style.setProperty('--pointer-°', `${angle}deg`);
                $card.style.setProperty('--pointer-d', t * 100);
            },
            onEnd: () => setTimeout(() => $card.classList.remove('animating'), 200)
        });
    }

    // --- Pointer (Mouse) Movement Handler for Glow ---
    cards.forEach(card => {
        card.addEventListener("pointermove", (e) => {
            if (card.classList.contains('animating')) return;
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = setTimeout(() => {
                const pos = pointerPos(card, e);
                const [dx, dy] = distFromCenter(card, pos.x, pos.y);
                const angle = angleFrom(dx, dy);
                const edge = closeness(card, pos.x, pos.y);
                
                card.style.setProperty('--pointer-°', `${round(angle)}deg`);
                card.style.setProperty('--pointer-d', `${round(edge * 100)}`);
            }, 16);
        });
    });

    // --- Theme Toggle (Sun/Moon Icons) ---
    function toggleTheme() {
        isLightTheme = !isLightTheme;
        cards.forEach(card => card.classList.toggle('light-theme', isLightTheme));
        console.log(`[GlowCarousel] Theme toggled to ${isLightTheme ? 'light' : 'dark'}.`);
    }

    container.querySelectorAll('.sun, .moon').forEach(icon => {
        icon.addEventListener('click', (e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            toggleTheme(); 
        });
    });

    // --- Core Carousel Update Logic ---
    function updateCarousel(newIndex) {
        if (isAnimating) return;
        isAnimating = true;
        currentIndex = (newIndex + cards.length) % cards.length;
        console.log(`[GlowCarousel] Updating carousel to index: ${currentIndex}`);

        cards.forEach((card, i) => {
            const offset = (i - currentIndex + cards.length) % cards.length;
            
            card.classList.remove("center", "left-1", "left-2", "right-1", "right-2", "hidden");
            if (isLightTheme) card.classList.add('light-theme');

            if (offset === 0) card.classList.add("center");
            else if (offset === 1) card.classList.add("right-1");
            else if (offset === 2) card.classList.add("right-2");
            else if (offset === cards.length - 1) card.classList.add("left-1");
            else if (offset === cards.length - 2) card.classList.add("left-2");
            else card.classList.add("hidden");

            // --- Lazy Load Logic: Load images for visible and adjacent cards ---
            if (offset === 0 || offset === 1 || offset === cards.length - 1) { // center, right-1, left-1
                loadCardBackgroundImage(card);
            }
        });

        dots.forEach((dot, i) => {
            if (i === currentIndex) dot.classList.add("active");
            else dot.classList.remove("active");
        });

        setTimeout(() => { 
            playGlow(cards[currentIndex]); 
            isAnimating = false; 
        }, 300); // Small delay for smooth animation
    }

    // --- Navigation (Arrows) ---
    if (leftArrow) leftArrow.addEventListener("click", () => updateCarousel(currentIndex - 1));
    if (rightArrow) rightArrow.addEventListener("click", () => updateCarousel(currentIndex + 1));
    
    // --- Card Click and Link Handling ---
    // If a side card is clicked, it becomes centered. If the center card (which is a link) is clicked,
    // the browser naturally navigates.
    cards.forEach((card, i) => {
        card.addEventListener('click', (e) => {
            if (i !== currentIndex) {
                e.preventDefault(); // Prevent default link behavior if not the center card
                updateCarousel(i); // Center the clicked card
            }
            // If it's the center card and it's a link, the browser handles navigation naturally.
        });
    });

    // --- Keyboard Navigation ---
    const handleKey = (e) => {
        // Only respond to keydown if the carousel container is actually visible
        if (container.offsetParent === null) return;
        
        if (e.key === "ArrowLeft") {
            e.preventDefault(); // Prevent browser scroll
            updateCarousel(currentIndex - 1);
        } else if (e.key === "ArrowRight") {
            e.preventDefault(); // Prevent browser scroll
            updateCarousel(currentIndex + 1);
        }
    };
    document.addEventListener("keydown", handleKey);

    // --- Touch Swipe Navigation ---
    let touchStartX = 0, touchStartY = 0;
    container.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        // Optional: stop auto-slide on touch start if you have one
    }, { passive: true });
    
    container.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchStartX - touchEndX;
        const diffY = Math.abs(touchStartY - touchEndY);
        
        const swipeThreshold = 50; // Minimum horizontal swipe distance in pixels
        
        // Only consider swipe if horizontal movement is significantly more than vertical
        if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > diffY) {
            if (diffX > 0) updateCarousel(currentIndex + 1); // Swipe left (next card)
            else updateCarousel(currentIndex - 1); // Swipe right (previous card)
        }
        // Optional: restart auto-slide on touch end
    }, { passive: true });

    // --- Initial Setup ---
    updateCarousel(0); // Position cards initially
    // Explicitly load background for the initially visible cards after positioning
    cards.forEach((card, i) => {
        const offset = (i - 0 + cards.length) % cards.length; // 0 is initial currentIndex
        if (offset === 0 || offset === 1 || offset === cards.length - 1) {
            loadCardBackgroundImage(card);
        }
    });
    setTimeout(() => playGlow(cards[0]), 500); // Start glow animation on the first card

    // --- Cleanup function for SPA navigation ---
    return { 
        destroy: () => {
            document.removeEventListener("keydown", handleKey);
            // Remove other event listeners if necessary to prevent memory leaks
            // (e.g., from arrows, dots, touch, pointermove if they are not re-added by initGlowCarousel)
            console.log(`[GlowCarousel] Destroyed instance for ID: ${carouselId}.`);
        } 
    };
}

// !!! ВАЖНО: Делаем функцию глобальной, чтобы main.js мог её вызвать !!!
window.initGlowCarousel = initGlowCarousel;
