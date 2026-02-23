// Intersection Observer for Fade-up animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px"
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // Optional: unobserve if you want it to animate only once
            // observer.unobserve(entry.target); 
        }
    });
}, observerOptions);

document.querySelectorAll('.fade-up').forEach(el => {
    observer.observe(el);
});


// Reusable Scroll Animation Function (Apple-like Sticky + Shrink)
function applyStickyAnimation(containerSelector, targetSelector) {
    const container = document.querySelector(containerSelector);
    const target = document.querySelector(targetSelector);

    if (!container || !target) return;

    // 간단한 ease (애플처럼 초반은 천천히, 중반 가속, 끝에서 감속)
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    let ticking = false;

    const update = () => {
        const rect = container.getBoundingClientRect();
        const vh = window.innerHeight;

        // 컨테이너 안으로 들어온 거리 (컨테이너 top이 0을 지나 위로 올라갈수록 증가)
        const navH = document.querySelector('.global-nav')?.offsetHeight || 0;
        const scrolledInto = -(rect.top - navH);

        // 애니메이션이 진행될 스크롤 구간 길이(뷰포트 기준). 
        // 1.5vh ~ 2vh 구간 동안 애니메이션 완료, 그 이후는 정지 상태로 보여줌
        const duration = 1.5 * vh;

        // 0~1로 정규화
        let t = scrolledInto / duration;

        // Lock Logic: t가 1을 넘어가면 애니메이션 종료 상태로 고정
        if (t < 0) t = 0;
        if (t > 1) t = 1;

        // easing 적용
        const p = easeOutCubic(t);

        // 애플 스타일: 'Shrink-to-Fit' (큰 이미지 -> 화면에 맞게 축소)
        const startScale = 3.0;
        const endScale = 1.0;

        const scale = startScale + (endScale - startScale) * p;

        // opacity: 항상 1
        const opacity = 1;

        // Panning Effect (Top -> Center)
        // startScale이 3.0이면 이미지가 커져서 위아래가 잘림.
        // Top이 보이려면 이미지를 아래로 내려야 함 (translateY > 0).
        // 정확히 얼마나 내려야 Top이 보일까?
        // 이미지 높이가 대략 vh이고, scale이 3.0이면 실제 높이는 3vh.
        // 화면 높이는 1vh. 위아래로 1vh씩 잘림.
        // 따라서 1vh (window.innerHeight) 만큼 내리면 Top이 화면 상단에 옴.

        const startY = (startScale - 1) * vh / 2; // (3-1)/2 * vh = 100vh
        const endY = 0;
        const translateY = startY + (endY - startY) * p;

        target.style.opacity = opacity;
        target.style.transform = `translateY(${translateY}px) scale(${scale})`;

        ticking = false;
    };

    window.addEventListener(
        'scroll',
        () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        },
        { passive: true }
    );

    // 최초 1회 세팅(새로고침 직후 위치 반영)
    update();
}

// Apply animations
applyStickyAnimation('.hero-sticky-container', '#hero-showcase');
applyStickyAnimation('.sub-sticky-container', '#sub-showcase');



// --- NEW: Hero Silhouette Effect ---
window.addEventListener('scroll', () => {
    const heroImg = document.querySelector('.silhouette-effect');
    if (!heroImg) return;

    // As we scroll down, increase brightness and reset contrast/shadow
    const scrollY = window.scrollY;
    // We want the effect to clear out within the first 500px of scrolling
    let progress = Math.min(scrollY / 500, 1);

    // Base: filter: brightness(0) contrast(1.2) drop-shadow(0 0 10px rgba(255,255,255,0.05));
    // Final: filter: brightness(1) contrast(1) drop-shadow(0 0 0px rgba(255,255,255,0));
    const brightness = progress;
    const contrast = 1.2 - (0.2 * progress);
    const dropShadowAlpha = 0.05 * (1 - progress);

    heroImg.style.filter = `brightness(${brightness}) contrast(${contrast}) drop-shadow(0 0 10px rgba(255,255,255,${dropShadowAlpha}))`;
});

// --- NEW: Showcase Tab Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const showcasePanels = document.querySelectorAll('.showcase-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            showcasePanels.forEach(p => p.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            const targetId = `tab-${btn.dataset.target}`;
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // --- NEW: Fullscreen Preview Modal Logic ---
    const previewModal = document.getElementById('preview-modal');
    const previewBtns = document.querySelectorAll('.btn-preview');
    const closePreviewBtn = document.querySelector('.preview-close-btn');
    const previewPanes = document.querySelectorAll('.preview-pane');

    // PDF.js State
    let pdfDoc = null;
    let pageNum = 1;
    let pageIsRendering = false;
    let pageNumIsPending = null;
    const scale = 1.5; // 해상도 스케일
    const canvas = document.getElementById('pdf-render-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    // PDF 렌더링 함수
    const renderPage = (num) => {
        if (!pdfDoc || !canvas) return;
        pageIsRendering = true;

        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({ scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderCtx = {
                canvasContext: ctx,
                viewport: viewport
            };

            page.render(renderCtx).promise.then(() => {
                pageIsRendering = false;
                if (pageNumIsPending !== null) {
                    renderPage(pageNumIsPending);
                    pageNumIsPending = null;
                }
            });

            document.getElementById('page-num-display').textContent = `${num} / ${pdfDoc.numPages}`;
        });
    };

    const queueRenderPage = (num) => {
        if (pageIsRendering) {
            pageNumIsPending = num;
        } else {
            renderPage(num);
        }
    };

    const onPrevPage = () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    };

    const onNextPage = () => {
        if (pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    };

    // 컨트롤 이벤트 리스너 연결
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', onPrevPage);
    if (nextBtn) nextBtn.addEventListener('click', onNextPage);

    const openPreview = (type) => {
        if (!previewModal) return;

        // Hide all panes
        previewPanes.forEach(pane => pane.classList.remove('active'));

        // Show selected pane
        const targetPane = document.getElementById(`preview-${type}`);
        if (targetPane) {
            targetPane.classList.add('active');
        }

        // Show modal
        previewModal.style.display = 'flex';
        // Small delay to allow display flex to apply before opacity transition
        setTimeout(() => {
            previewModal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling

            // Inception일 경우 PDF.js 로드 시작
            if (type === 'inception' && !pdfDoc) {
                const pdfjsOptions = {
                    url: 'GRIP_inception.pdf',
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                    cMapPacked: true
                };
                window.pdfjsLib.getDocument(pdfjsOptions).promise.then(pdfDoc_ => {
                    pdfDoc = pdfDoc_;
                    renderPage(pageNum);
                }).catch(err => {
                    console.error("PDF Load Error: ", err);
                    document.getElementById('page-num-display').textContent = "문서를 불러올 수 없습니다.";
                });
            }
        }, 10);
    };

    const closePreview = () => {
        if (!previewModal) return;
        previewModal.classList.remove('show');
        setTimeout(() => {
            previewModal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }, 300); // match css transition
    };

    previewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const type = btn.dataset.previewType;
            openPreview(type);
        });
    });

    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', closePreview);
    }

    // Close on backdrop click
    if (previewModal) {
        previewModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                closePreview();
            }
        });
    }

    // Close on ESC key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePreview();
        }
    });

});

// Auto-Scroll Logic (Snap to Next Section)
let isAutoScrolling = false;
let lastScrollY = window.scrollY;

// Custom Smooth Scroll Function
function smoothScrollTo(endY, duration) {
    const startY = window.scrollY;
    const distance = endY - startY;
    let startTime = null;

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);

        // Easing function (easeInOutCubic)
        const ease = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        window.scrollTo(0, startY + (distance * ease));

        if (timeElapsed < duration) {
            requestAnimationFrame(animation);
        } else {
            isAutoScrolling = false; // Reset flag after animation
        }
    }

    requestAnimationFrame(animation);
}

function handleAutoScroll() {
    // Disable auto-scrolling on mobile devices for native touch behavior
    if (window.innerWidth <= 768) return;

    if (isAutoScrolling) return;

    const currentScrollY = window.scrollY;
    const direction = currentScrollY > lastScrollY ? 'down' : 'up';
    lastScrollY = currentScrollY;

    // Only trigger on downward scroll
    if (direction !== 'down') return;

    const subStickyContainer = document.querySelector('.sub-sticky-container');
    const heroStickyContainer = document.querySelector('.hero-sticky-container');

    if (!subStickyContainer || !heroStickyContainer) return;

    const vh = window.innerHeight;

    // Target 1: End of Workbook Text Animation (Text fully visible/shrunk)
    const target1 = subStickyContainer.offsetTop + (0.5 * vh);

    // Target 2: End of Hero Image Animation (Image fully visible/shrunk)
    const target2 = heroStickyContainer.offsetTop + (0.5 * vh);

    // Duration for slow scroll (ms)
    // Faster on mobile to avoid frustration
    const scrollDuration = window.innerWidth < 768 ? 800 : 2000;

    // Trigger 1: Top -> Target 1
    // Condition: User is at top (scrolled < 100px) and scrolls down a bit (> 10px from last stop?)
    // Simplified: If currentScrollY is small (> 50) and far from Target 1.
    if (currentScrollY > 50 && currentScrollY < target1 - 100) {
        isAutoScrolling = true;
        smoothScrollTo(target1, scrollDuration);
        return;
    }

    // Trigger 2: Target 1 -> Target 2
    // If currentScrollY is > Target 1 + 50 AND far from Target 2.
    if (currentScrollY > target1 + 50 && currentScrollY < target2 - 100) {
        isAutoScrolling = true;
        smoothScrollTo(target2, scrollDuration);
        return;
    }

    // Manifesto Targets
    const manifestoContainer = document.querySelector('.manifesto-container');
    if (manifestoContainer) {
        const manStart = manifestoContainer.offsetTop;
        const manHeight = manifestoContainer.offsetHeight;
        const manScrollable = manHeight - vh; // 300vh usually

        // Snap Points (Percentages matched to CSS logic)
        // Line 1 (0-20%): Aim for 10%
        const target3 = manStart + (manScrollable * 0.10);

        // Line 2 (20-45%): Aim for 32.5%
        const target4 = manStart + (manScrollable * 0.325);

        // Line 3 (45-70%): Aim for 57.5%
        const target5 = manStart + (manScrollable * 0.575);

        // Line 4 (70-100%): Aim for 85%
        const target6 = manStart + (manScrollable * 0.85);

        const buffer = 100; // Buffer zone

        // Trigger 3: Target 2 -> Target 3 (Manifesto Line 1)
        if (currentScrollY > target2 + 50 && currentScrollY < target3 - buffer) {
            isAutoScrolling = true;
            smoothScrollTo(target3, scrollDuration);
            return;
        }

        // Trigger 4: Line 1 -> Line 2
        // If we are past Line 1 target but before Line 2
        if (currentScrollY > target3 + buffer && currentScrollY < target4 - buffer) {
            isAutoScrolling = true;
            smoothScrollTo(target4, scrollDuration);
            return;
        }

        // Trigger 5: Line 2 -> Line 3
        if (currentScrollY > target4 + buffer && currentScrollY < target5 - buffer) {
            isAutoScrolling = true;
            smoothScrollTo(target5, scrollDuration);
            return;
        }

        // Trigger 6: Line 3 -> Line 4
        if (currentScrollY > target5 + buffer && currentScrollY < target6 - buffer) {
            isAutoScrolling = true;
            smoothScrollTo(target6, scrollDuration);
            return;
        }
    }
}

// Throttle scroll event for performance
let scrollTimeout;
// Manifesto Scroll Animation
const manifestoContainer = document.querySelector('.manifesto-container');
const manifestoLines = document.querySelectorAll('.manifesto-line');

function handleManifestoScroll() {
    if (!manifestoContainer) return;

    const rect = manifestoContainer.getBoundingClientRect();
    const vh = window.innerHeight;
    const containerHeight = manifestoContainer.offsetHeight; // 400vh usually

    // Calculate progress: 0 when top enters viewport, 1 when bottom leaves viewport?
    // Actually we want pinning behavior.
    // The container is relative, sticky is inside.
    // Progress = how far we scrolled into the container relative to its scrollable height.

    // Start animation when container top hits 0.
    // End animation when container bottom hits window height (unpin).

    // Scrollable Logic:
    // We have 4 lines to show.
    // Container is 400vh. Window is 100vh.
    // Scrollable distance = 300vh.

    const startY = manifestoContainer.offsetTop;
    const endY = startY + containerHeight - vh;
    const scrollY = window.scrollY;

    if (scrollY < startY - vh || scrollY > endY + vh) return; // Optimize

    // Normalize progress 0 to 1 within the stickiness
    let progress = (scrollY - startY) / (containerHeight - vh);

    // Clamp
    progress = Math.max(0, Math.min(1, progress));

    // We have 4 items. 
    // Show Item 1: 0.0 - 0.25
    // Show Item 2: 0.25 - 0.50
    // Show Item 3: 0.50 - 0.75
    // Show Item 4: 0.75 - 1.0

    // Intervals logic adjusted for 300vh/400vh
    // Item 1: 0.00 - 0.25
    // Item 2: 0.25 - 0.50
    // Item 3: 0.50 - 0.75
    // Item 4: 0.75 - 1.00

    // Let's hide all, show current.
    manifestoLines.forEach(line => line.classList.remove('active'));

    if (progress < 0.25) {
        manifestoLines[0].classList.add('active');
    } else if (progress < 0.50) {
        manifestoLines[1].classList.add('active');
    } else if (progress < 0.75) {
        manifestoLines[2].classList.add('active');
    } else {
        manifestoLines[3].classList.add('active');
    }
}

// Attach to scroll
window.addEventListener('scroll', handleManifestoScroll, { passive: true });
window.addEventListener('scroll', () => {
    if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
            handleAutoScroll();
            scrollTimeout = null;
        }, 50);
    }
}, { passive: true });
